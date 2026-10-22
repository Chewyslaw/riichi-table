// Riichi Table server: serves the client and runs online rooms over WebSockets.
// The server is authoritative for online games: it owns the full state and
// sends each player only what they are allowed to see (see viewFor).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { newGame, startGame, apply, legalActions, viewFor } from '../shared/game.js';
import { chooseBotAction } from '../shared/bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const BOT_DELAY_MS = +(process.env.BOT_DELAY_MS || 900);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = url.pathname === '/' ? '/public/index.html' : url.pathname;
  if (!p.startsWith('/shared/')) p = '/public' + (p.startsWith('/public/') ? p.slice(7) : p);
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA-ish fallback: any unknown path serves the app (so /?room=CODE and /ROOM work)
      fs.readFile(path.join(ROOT, 'public/index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- Rooms ----------

const rooms = new Map();
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
  room.players.forEach((p, seat) => {
    if (p.bot || !p.ws) return;
    if (room.state) {
      const view = viewFor(room.state, seat);
      // Only the host advances hands online, to avoid double presses.
      if (room.state.phase === 'result' && p.id !== room.host) view.actions = [];
      view.names = room.players.map((q) => q.name);
      view.host = room.host;
      view.playerId = p.id;
      view.code = room.code;
      view.connected = room.players.map((q) => q.bot || q.connected);
      send(p.ws, { t: 'view', view });
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
    if (!p || !p.bot) continue;
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

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let room = null;
  let me = null;

  const error = (msg) => send(ws, { t: 'error', msg });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return error('bad message'); }
    try {
      switch (msg.t) {
        case 'create': {
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
          const code = String(msg.code || '').toUpperCase().trim();
          const r = rooms.get(code);
          if (!r) return error('No room with code ' + code);
          if (r.state) return error('That game has already started');
          if (r.players.length >= 4) return error('That room is full');
          room = r;
          me = { id: randomBytes(8).toString('hex'), name: cleanName(msg.name), ws, bot: false, connected: true };
          room.players.push(me);
          send(ws, { t: 'joined', code: room.code, playerId: me.id, seat: room.players.length - 1 });
          broadcast(room);
          break;
        }
        case 'rejoin': {
          const r = rooms.get(String(msg.code || '').toUpperCase());
          if (!r) return error('That room no longer exists');
          const p = r.players.find((q) => q.id === msg.playerId);
          if (!p) return error('You are not in that room');
          room = r; me = p; me.ws = ws; me.connected = true;
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
    if (!room.state) {
      room.players = room.players.filter((p) => p !== me);
      if (room.host === me.id) room.host = room.players.find((p) => !p.bot)?.id || null;
      if (!room.players.some((p) => !p.bot)) rooms.delete(room.code);
    }
    if (rooms.has(room.code)) broadcast(room);
  });
});

function cleanName(n) {
  const s = String(n || '').trim().slice(0, 16);
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
  const cutoff = Date.now() - 12 * 3600 * 1000;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff && !room.players.some((p) => p.connected && !p.bot)) rooms.delete(code);
  }
}, 600000);

server.listen(PORT, () => {
  console.log(`Riichi Table listening on http://localhost:${PORT}`);
});
