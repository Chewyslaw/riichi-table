// Riichi Table server: serves the client and runs online rooms over WebSockets.
// The server is authoritative for online games: it owns the full state and
// sends each player only what they are allowed to see (see viewFor).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { newGame, startGame, apply, legalActions, viewFor } from '../shared/game.js';
import { chooseBotAction } from '../shared/bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const BOT_DELAY_MS = +(process.env.BOT_DELAY_MS || 900);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

// Security headers on every response. Scripts come only from this origin; fonts from Google Fonts;
// inline styles are needed for the SVG/HTML the client generates. No framing, no sniffing, no referrer leaks.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};
const PUBLIC_DIRS = ['/public/', '/shared/'];

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SECURITY_HEADERS); return res.end(); }
  // behind a TLS-terminating proxy (Render, Fly, …), send plain-http visitors to https
  const proto = req.headers['x-forwarded-proto'];
  if (proto === 'http' && process.env.FORCE_HTTPS !== '0') {
    res.writeHead(301, { ...SECURITY_HEADERS, Location: `https://${req.headers.host}${req.url}` });
    return res.end();
  }
  if (req.url === '/healthz') { res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' }); return res.end('ok'); }
  const url = new URL(req.url, 'http://localhost');
  let p = url.pathname === '/' ? '/public/index.html' : url.pathname;
  if (!p.startsWith('/shared/')) p = '/public' + (p.startsWith('/public/') ? p.slice(7) : p);
  const file = path.normalize(path.join(ROOT, p));
  const rel = '/' + path.relative(ROOT, file).split(path.sep).join('/');
  if (!file.startsWith(ROOT) || !PUBLIC_DIRS.some((d) => rel.startsWith(d))) { res.writeHead(403, SECURITY_HEADERS); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA-ish fallback: any unknown path serves the app (so /?room=CODE and /ROOM work)
      fs.readFile(path.join(ROOT, 'public/index.html'), (e2, html) => {
        if (e2) { res.writeHead(404, SECURITY_HEADERS); return res.end('Not found'); }
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- Rooms ----------

const rooms = new Map();

// ---------- Sealed snapshots: games survive restarts and sleeps ----------
// Room state lives in memory. So that a redeploy or an idle-shutdown of the host never kills a game,
// every update also carries an encrypted snapshot of the whole room, which each client keeps in
// localStorage. When a player comes back and the room is gone, their client hands the snapshot back
// and the room is rebuilt. The snapshot is AES-256-GCM sealed with ROOM_SECRET so nobody can read
// hidden hands out of it or forge one. Set ROOM_SECRET to a stable value in production.
const SECRET = process.env.ROOM_SECRET || randomBytes(32).toString('hex');
if (!process.env.ROOM_SECRET) console.warn('ROOM_SECRET is not set: saved games will not survive a restart of this process.');
const KEY = createHash('sha256').update(SECRET).digest();
function seal(room) {
  const body = JSON.stringify({
    v: 1, code: room.code, host: room.host, rules: room.rules, botDelay: room.botDelay, createdAt: room.createdAt, at: Date.now(),
    players: room.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot, auto: !!p.auto })),
    state: room.state,
  });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}
function unseal(b64) {
  const buf = Buffer.from(String(b64), 'base64');
  if (buf.length < 29) throw new Error('bad snapshot');
  const decipher = createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  const body = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  return JSON.parse(body);
}
function restoreRoom(snap) {
  const room = {
    code: snap.code, createdAt: snap.createdAt || Date.now(), lastActivity: Date.now(), host: snap.host,
    players: snap.players.map((p) => ({ id: p.id, name: p.name, ws: null, bot: !!p.bot, connected: !!p.bot, auto: !!p.auto })),
    rules: snap.rules || {}, state: snap.state, botTimer: null, botDelay: snap.botDelay || BOT_DELAY_MS,
  };
  if (room.state) room.state.log.push('Game restored from a saved snapshot.');
  rooms.set(room.code, room);
  return room;
}
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  let code;
  do {
    code = '';
    const bytes = randomBytes(5);
    for (let i = 0; i < 5; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  } while (rooms.has(code));
  return code;
}

function makeRoom(hostName, rules) {
  const room = {
    code: makeCode(),
    createdAt: Date.now(),
    lastActivity: Date.now(),
    host: null,
    players: [], // { id, name, ws, bot, connected }
    rules: rules || {},
    state: null,
    botTimer: null,
    botDelay: BOT_DELAY_MS,
  };
  rooms.set(room.code, room);
  return room;
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function lobbyInfo(room) {
  return {
    t: 'lobby',
    code: room.code,
    host: room.host,
    started: !!room.state,
    players: room.players.map((p, i) => ({ id: p.id, name: p.name, seat: i, bot: p.bot, connected: p.connected })),
    rules: room.rules,
  };
}

function broadcast(room) {
  const snapshot = room.state ? seal(room) : null;
  room.players.forEach((p, seat) => {
    if (p.bot || !p.ws) return;
    if (room.state) {
      const view = viewFor(room.state, seat);
      // Only the host advances hands online, to avoid double presses.
      if (room.state.phase === 'result' && p.id !== room.host) view.actions = [];
      view.names = room.players.map((q) => q.name);
      view.playerIds = room.players.map((q) => q.id);
      view.host = room.host;
      view.playerId = p.id;
      view.code = room.code;
      view.connected = room.players.map((q) => q.bot || q.connected);
      view.auto = room.players.map((q) => !!q.auto); // seats a bot is playing for while the person is away
      send(p.ws, { t: 'view', view, snapshot });
    } else {
      send(p.ws, lobbyInfo(room));
    }
  });
}

function scheduleBots(room) {
  if (room.botTimer || !room.state || room.state.phase === 'over') return;
  const s = room.state;
  let seatToAct = -1;
  for (let seat = 0; seat < 4; seat++) {
    const p = room.players[seat];
    if (!p || !(p.bot || p.auto)) continue;
    if (s.phase === 'result') continue; // humans press "next"
    if (legalActions(s, seat).length) { seatToAct = seat; break; }
  }
  if (seatToAct < 0) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    try {
      const a = chooseBotAction(room.state, seatToAct);
      if (a) room.state = apply(room.state, a, seatToAct);
    } catch (e) {
      console.error('bot error', e);
    }
    broadcast(room);
    scheduleBots(room);
  }, room.botDelay);
}

function startRoomGame(room) {
  while (room.players.length < 4) {
    room.players.push({ id: 'bot-' + randomBytes(4).toString('hex'), name: 'Bot ' + (room.players.length + 1), ws: null, bot: true, connected: true });
  }
  room.state = startGame(newGame({ names: room.players.map((p) => p.name), rules: room.rules }));
  broadcast(room);
  scheduleBots(room);
}

const MAX_ROOMS = +(process.env.MAX_ROOMS || 200);
const wss = new WebSocketServer({
  server,
  maxPayload: 262144, // a restore message carries a sealed room snapshot (tens of KB); everything else is a few hundred bytes
  verifyClient: ({ req }) => {
    // only accept sockets opened by our own page (browsers always send Origin for WebSockets)
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!origin || !host) return false;
    try { return new URL(origin).host === host; } catch { return false; }
  },
});

// drop idle/dead sockets
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', (ws) => {
  let room = null;
  let me = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const error = (msg) => send(ws, { t: 'error', msg });

  // per-connection rate limit: 20 messages per second burst, refilling continuously
  let tokens = 20, lastRefill = Date.now(), badJoins = 0;

  ws.on('message', (raw) => {
    const now = Date.now();
    tokens = Math.min(20, tokens + (now - lastRefill) / 50); lastRefill = now;
    if (tokens < 1) { if (tokens < -10) ws.terminate(); tokens -= 1; return; }
    tokens -= 1;
    let msg;
    try { msg = JSON.parse(raw); } catch { return error('bad message'); }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return error('bad message');
    try {
      switch (msg.t) {
        case 'create': {
          if (room) return error('You are already in a room');
          if (rooms.size >= MAX_ROOMS) return error('The server is full right now — try again in a little while');
          const name = cleanName(msg.name);
          room = makeRoom(name, sanitizeRules(msg.rules));
          me = { id: randomBytes(8).toString('hex'), name, ws, bot: false, connected: true };
          room.players.push(me);
          room.host = me.id;
          send(ws, { t: 'joined', code: room.code, playerId: me.id, seat: 0 });
          broadcast(room);
          break;
        }
        case 'join': {
          if (room) return error('You are already in a room');
          const code = String(msg.code || '').toUpperCase().trim().slice(0, 8);
          const r = rooms.get(code);
          if (!r) {
            // guessing codes gets slow fast, and the socket is dropped after a handful of misses
            if (++badJoins >= 8) { ws.terminate(); return; }
            return error('No room with code ' + code);
          }
          if (r.state) {
            // the game is on: offer the seats of people who are not connected, so someone can pick their game back up from another device
            const seats = r.players.map((p, i) => ({ seat: i, name: p.name, id: p.id, open: !p.bot && !p.connected })).filter((x) => x.open).map(({ seat, name, id }) => ({ seat, name, id }));
            return send(ws, { t: 'claimable', code: r.code, seats });
          }
          if (r.players.length >= 4) return error('That room is full');
          room = r;
          me = { id: randomBytes(8).toString('hex'), name: cleanName(msg.name), ws, bot: false, connected: true };
          room.players.push(me);
          send(ws, { t: 'joined', code: room.code, playerId: me.id, seat: room.players.length - 1 });
          broadcast(room);
          break;
        }
        case 'claim': {
          // take over a disconnected seat in a running game (same as rejoin, but from a device without the stored id)
          const r = rooms.get(String(msg.code || '').toUpperCase());
          if (!r || !r.state) return error('That room is not running');
          const p = r.players.find((q) => q.id === msg.playerId);
          if (!p || p.bot) return error('That seat is not available');
          if (p.connected) return error(`${p.name} is still connected`);
          room = r; me = p; me.ws = ws; me.connected = true;
          if (me.auto) { me.auto = false; room.state.log.push(`${me.name} is back and takes over from the bot.`); }
          else room.state.log.push(`${me.name} reconnected.`);
          send(ws, { t: 'joined', code: room.code, playerId: me.id, seat: room.players.indexOf(me) });
          broadcast(room);
          break;
        }
        case 'restore': {
          // a client whose room vanished (restart, sleep) hands back its sealed snapshot
          let snap;
          try { snap = unseal(msg.snapshot); } catch { return error('That saved game could not be read'); }
          if (!snap || snap.v !== 1 || !snap.code || !Array.isArray(snap.players)) return error('That saved game could not be read');
          let r = rooms.get(snap.code);
          if (!r) {
            if (rooms.size >= MAX_ROOMS) return error('The server is full right now — try again in a little while');
            r = restoreRoom(snap);
          }
          const p = r.players.find((q) => q.id === msg.playerId && !q.bot);
          if (!p) return error('You are not in that room');
          if (p.connected && p.ws && p.ws !== ws) return error(`${p.name} is already connected`);
          room = r; me = p; me.ws = ws; me.connected = true;
          if (me.auto) { me.auto = false; if (room.state) room.state.log.push(`${me.name} is back and takes over from the bot.`); }
          send(ws, { t: 'joined', code: room.code, playerId: me.id, seat: room.players.indexOf(me), restored: true });
          broadcast(room);
          scheduleBots(room);
          break;
        }
        case 'rejoin': {
          const r = rooms.get(String(msg.code || '').toUpperCase());
          if (!r) return error('That room no longer exists');
          const p = r.players.find((q) => q.id === msg.playerId);
          if (!p) return error('You are not in that room');
          room = r; me = p; me.ws = ws; me.connected = true;
          if (me.auto) {
            // the person is back: hand control straight back to them
            me.auto = false;
            if (room.state) room.state.log.push(`${me.name} is back and takes over from the bot.`);
          } else if (room.state) room.state.log.push(`${me.name} reconnected.`);
          send(ws, { t: 'joined', code: room.code, playerId: me.id, seat: room.players.indexOf(me) });
          broadcast(room);
          break;
        }
        case 'addBot': {
          if (!room || me.id !== room.host || room.state) return;
          if (room.players.length >= 4) return;
          room.players.push({ id: 'bot-' + randomBytes(4).toString('hex'), name: 'Bot ' + (room.players.length + 1), ws: null, bot: true, connected: true });
          broadcast(room);
          break;
        }
        case 'autopilot': {
          // host lets a bot play for someone who is away (or takes it back); the seat stays theirs and they can return any time
          if (!room || me.id !== room.host || !room.state) return;
          const target = room.players.find((p) => p.id === msg.playerId && !p.bot && p.id !== me.id);
          if (!target) return;
          const on = !!msg.on;
          if (on && target.connected) return error(`${target.name} is online — they can play for themselves`);
          if (target.auto === on) return;
          target.auto = on;
          room.state.log.push(on ? `${me.name} lets a bot play for ${target.name} while they are away.` : `${me.name} hands control back to ${target.name}.`);
          broadcast(room);
          scheduleBots(room);
          break;
        }
        case 'kick': {
          if (!room || me.id !== room.host || room.state) return;
          const target = room.players.find((p) => p.id === msg.playerId && p.id !== me.id);
          if (!target) return;
          room.players = room.players.filter((p) => p !== target);
          if (!target.bot && target.ws) { send(target.ws, { t: 'kicked' }); try { target.ws.close(); } catch { /* ignore */ } }
          broadcast(room);
          break;
        }
        case 'removeBot': {
          if (!room || me.id !== room.host || room.state) return;
          const i = room.players.findIndex((p) => p.bot);
          if (i >= 0) room.players.splice(i, 1);
          broadcast(room);
          break;
        }
        case 'start': {
          if (!room || me.id !== room.host || room.state) return;
          startRoomGame(room);
          break;
        }
        case 'action': {
          if (!room || !room.state) return;
          room.lastActivity = Date.now();
          if (!msg.action || typeof msg.action !== 'object' || typeof msg.action.type !== 'string') return error('bad action');
          const seat = room.players.indexOf(me);
          if (room.state.phase === 'result' && me.id !== room.host) return error('Waiting for the host to continue');
          room.state = apply(room.state, msg.action, seat);
          broadcast(room);
          scheduleBots(room);
          break;
        }
        case 'leave': {
          if (!room) return;
          if (!room.state) {
            room.players = room.players.filter((p) => p !== me);
            if (room.host === me.id) room.host = room.players.find((p) => !p.bot)?.id || null;
            if (!room.players.some((p) => !p.bot)) rooms.delete(room.code);
            else broadcast(room);
          } else {
            me.connected = false;
            broadcast(room);
          }
          room = null; me = null;
          break;
        }
        case 'settings': {
          // the host's animation speed sets the bots' pacing for the room
          if (!room || me.id !== room.host) return;
          const f = { off: 0, fast: 0.5, normal: 1, slow: 1.8 }[msg.speed];
          if (f != null) room.botDelay = Math.max(200, Math.round(BOT_DELAY_MS * f));
          break;
        }
        case 'ping': send(ws, { t: 'pong' }); break;
        default: error('unknown message ' + msg.t);
      }
    } catch (e) {
      error(e.message);
    }
  });

  ws.on('close', () => {
    if (!room || !me) return;
    me.connected = false;
    me.ws = null;
    if (room.state) room.state.log.push(`${me.name} disconnected${me.auto ? '' : ' — waiting for them to come back'}.`);
    if (!room.state) {
      room.players = room.players.filter((p) => p !== me);
      if (room.host === me.id) room.host = room.players.find((p) => !p.bot)?.id || null;
      if (!room.players.some((p) => !p.bot)) rooms.delete(room.code);
    }
    if (rooms.has(room.code)) { broadcast(room); scheduleBots(room); }
  });
});

function cleanName(n) {
  // printable characters only (the client escapes names before rendering; this keeps logs and other clients clean too)
  const s = String(n || '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return s || 'Player';
}

function sanitizeRules(r) {
  if (!r || typeof r !== 'object') return {};
  const out = {};
  if (typeof r.hanchan === 'boolean') out.hanchan = r.hanchan;
  if (typeof r.aka === 'boolean') out.aka = r.aka;
  if (typeof r.kuitan === 'boolean') out.kuitan = r.kuitan;
  if (typeof r.multipleRon === 'boolean') out.multipleRon = r.multipleRon;
  return out;
}

// Drop rooms idle for 12 hours.
setInterval(() => {
  for (const [code, room] of rooms) {
    const keepFor = room.state ? 24 * 3600 * 1000 : 12 * 3600 * 1000;
    if (room.lastActivity < Date.now() - keepFor && !room.players.some((p) => p.connected && !p.bot)) rooms.delete(code);
  }
}, 600000);

server.listen(PORT, () => {
  console.log(`Riichi Table listening on http://localhost:${PORT}`);
});
