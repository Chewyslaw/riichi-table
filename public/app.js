import { newGame, startGame, apply, viewFor, legalActions, WINDS } from '../shared/game.js';
import { chooseBotAction } from '../shared/bot.js';
import { kindOf, kindName, sortTiles, isRedFive, doraOf, countsOf } from '../shared/tiles.js';
import { waits as computeWaits } from '../shared/hand.js';
import { tileHtml, kindHtml, compassSvg, plaqueSvg, diceSvg, stickSvg, sticksFor, SHARED_DEFS } from './tiles.js';
document.body.insertAdjacentHTML('afterbegin', SHARED_DEFS);
import { rulesHtml, yakuHtml, tilesHtml, yakuSlug } from './help.js';
import { adviseHand } from '../shared/advice.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['home', 'local-setup', 'lobby', 'game'];
const WIND_CHAR = { 27: '東', 28: '南', 29: '西', 30: '北' };
// Animation speed setting: scales tile animations, callouts, the result delay and bot pacing.
const SPEEDS = { off: 0, fast: 0.5, normal: 1, slow: 1.8 };
const SPEED_LABELS = { off: 'Off', fast: 'Fast', normal: 'Normal', slow: 'Slow' };
let speed = SPEEDS[localStorage.getItem('rt-speed')] != null ? localStorage.getItem('rt-speed') : 'normal';
const sf = () => SPEEDS[speed];
const botDelay = () => Math.max(200, Math.round(900 * sf()));

function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- state
let mode = null;            // 'online' | 'local'
let ws = null, wsRetry = 0, restoring = false;
let roomCode = null, playerId = null;
let lobby = null;
let local = null;           // { state, humans: bool[], shownSeat, pending:boolean }
let view = null;
const ui = { riichiMode: false, optionsFor: null, logOpen: false, handoffSeat: null, lastSeenHand: -1, peek: false, resultShownFor: null, selected: null, hover: null, review: null };
let prevView = null;

// ---------------------------------------------------------------- home
$('hero').innerHTML = [27, 33, 0].map((k) => kindHtml(k)).join('');
$('name').value = localStorage.getItem('rt-name') || '';
$('name').addEventListener('input', () => localStorage.setItem('rt-name', $('name').value));

function myName() {
  const n = $('name').value.trim();
  return n || 'Player';
}
// Rule toggles live in the Settings screen and are remembered on this device; they are
// sent when a room is created or a pass-and-play game starts.
const RULE_DEFS = [
  { key: 'hanchan', label: 'Hanchan', desc: 'Play the East and South rounds. Off: a shorter East-only game.', link: ['game', 'rules'] },
  { key: 'aka', label: 'Red fives', desc: 'One red five in each suit, worth a dora each.', link: ['dora', 'rules'] },
  { key: 'kuitan', label: 'Open tanyao', desc: 'All simples counts as a yaku even after calling tiles.', link: ['tanyao', 'yaku'] },
  { key: 'multipleRon', label: 'Double / triple ron', desc: 'Everyone who can ron a discard wins. Off: head bump — only the player next in turn after the discarder wins.', link: ['win', 'rules'] },
];
const DEFAULT_PREF_RULES = { hanchan: true, aka: true, kuitan: true, multipleRon: true };
let rulePref = (() => {
  try { return Object.assign({}, DEFAULT_PREF_RULES, JSON.parse(localStorage.getItem('rt-rules') || '{}')); }
  catch { return { ...DEFAULT_PREF_RULES }; }
})();
function rules() { return { ...rulePref }; }
function rulesSummary(r) {
  r = Object.assign({}, DEFAULT_PREF_RULES, r || {});
  return [r.hanchan ? 'Hanchan' : 'East only', r.aka ? 'Red fives' : 'No red fives', r.kuitan ? 'Open tanyao' : 'Closed tanyao only', r.multipleRon ? 'Double ron' : 'Head bump'].join(' · ');
}
function renderRuleSummaries() {
  const home = $('home-rules-summary');
  if (home) home.textContent = rulesSummary(rulePref);
  const lob = $('lobby-rules-summary');
  if (lob && lobby) lob.textContent = rulesSummary(lobby.rules);
}

$('btn-create').onclick = () => { $('home-error').textContent = ''; connect(() => send({ t: 'create', name: myName(), rules: rules() })); };
$('btn-join').onclick = () => joinRoom($('join-code').value);
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('join-code').value); });
$('btn-local').onclick = () => { show('local-setup'); $('local-names').querySelector('input').value ||= myName(); };
$('btn-local-back').onclick = () => show('home');
$('btn-local-start').onclick = () => {
  const names = [...$('local-names').querySelectorAll('input')].map((i) => i.value.trim());
  startLocal(names);
};
$('btn-resume').onclick = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('rt-local'));
    if (saved && saved.state) { local = saved; local.shownSeat = -1; mode = 'local'; show('game'); localTick(); }
  } catch { /* ignore */ }
};
if (localStorage.getItem('rt-local')) $('btn-resume').classList.remove('hidden');

function joinRoom(code) {
  code = String(code || '').trim().toUpperCase();
  if (code.length < 4) { $('home-error').textContent = 'Enter the 5-character room code.'; return; }
  $('home-error').textContent = '';
  connect(() => send({ t: 'join', code, name: myName() }));
}

// Join via link: /?room=CODE or /CODE
{
  const params = new URLSearchParams(location.search);
  const fromPath = location.pathname.replace(/^\//, '').toUpperCase();
  const code = params.get('room') || (/^[A-Z0-9]{5}$/.test(fromPath) ? fromPath : null);
  const saved = JSON.parse(sessionStorage.getItem('rt-room') || 'null');
  const remembered = code ? localStorage.getItem('rt-room-' + code) : null;
  if (saved && saved.code && saved.playerId && (!code || saved.code === code)) {
    roomCode = saved.code; playerId = saved.playerId;
    connect(() => send(rejoinMsg()));
  } else if (code && remembered) {
    // this device played in that room before: pick the seat back up
    roomCode = code; playerId = remembered;
    connect(() => send(rejoinMsg()));
  } else if (code) {
    $('join-code').value = code;
    if ($('name').value) joinRoom(code);
  }
}

// ---------------------------------------------------------------- online
/** The rejoin message: the room code, our seat id, and this browser's sealed copy of the game so a server that
 *  slept or restarted can rebuild the room straight away (and pick up our copy if it is newer than its own). */
function rejoinMsg() {
  let snapshot = null;
  try { snapshot = roomCode ? localStorage.getItem('rt-snap-' + roomCode) : null; } catch { /* ignore */ }
  return { t: 'rejoin', code: roomCode, playerId, snapshot };
}
function connect(onOpen) {
  if (ws && ws.readyState === WebSocket.OPEN) { onOpen && onOpen(); return; }
  if (ws && ws.readyState === WebSocket.CONNECTING) {
    // a socket is already on its way: wait for it instead of opening a second one (two sockets for one
    // player meant the server could be talking to the one this page no longer listens to)
    const prev = ws.onopen;
    ws.onopen = (e) => { prev && prev(e); onOpen && onOpen(); };
    return;
  }
  if (ws) { try { ws.onclose = null; ws.close(); } catch { /* ignore */ } }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(`${proto}://${location.host}`);
  ws = sock;
  sock.onopen = () => { wsRetry = 0; setConn('Connected'); onOpen && onOpen(); };
  sock.onmessage = (e) => { if (ws === sock) handle(JSON.parse(e.data)); };
  sock.onclose = () => {
    if (ws !== sock) return; // superseded; the newer socket owns the reconnect
    setConn('Reconnecting…');
    if (roomCode && playerId) {
      const delay = Math.min(8000, 500 * 2 ** wsRetry++);
      // while the tab is hidden, don't keep poking a sleeping server: reconnect when the person comes back to the page
      setTimeout(() => { if (ws !== sock) return; if (document.visibilityState === 'hidden') { pendingReconnect = true; return; } connect(() => send(rejoinMsg())); }, delay);
    }
  };
  sock.onerror = () => { if (ws === sock && mode !== 'online') $('home-error').textContent = 'Could not reach the server.'; };
}
function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg)); return; }
  // the socket is gone: say so, and reconnect right away instead of swallowing the action
  if (mode === 'online') { setConn('Reconnecting…'); $('status').textContent = 'Connection lost — reconnecting…'; connect(() => send(rejoinMsg())); }
}
// Keep a free host awake only while someone is actually looking at a game: a tab in the background lets the
// server sleep (the game is safe in every player's saved copy), and wakes it again when the person comes back.
let pendingReconnect = false;
setInterval(() => {
  if (mode !== 'online' || document.visibilityState !== 'visible') return;
  fetch('/healthz', { cache: 'no-store' }).catch(() => {});
  if (ws && ws.readyState === WebSocket.OPEN) send({ t: 'ping' });
}, 240000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || mode !== 'online' || !roomCode || !playerId) return;
  if (pendingReconnect || !ws || ws.readyState !== WebSocket.OPEN) { pendingReconnect = false; wsRetry = 0; connect(() => send(rejoinMsg())); }
  else send({ t: 'sync' });
});
function setConn(t) { const el = $('conn-label'); el.textContent = mode === 'online' ? t : ''; el.classList.toggle('off', t !== 'Connected'); }

function handle(msg) {
  switch (msg.t) {
    case 'joined':
      mode = 'online';
      restoring = false;
      roomCode = msg.code; playerId = msg.playerId;
      sessionStorage.setItem('rt-room', JSON.stringify({ code: roomCode, playerId }));
      try { localStorage.setItem('rt-room-' + roomCode, playerId); } catch { /* ignore */ }
      history.replaceState(null, '', `/?room=${roomCode}`);
      break;
    case 'lobby':
      lobby = msg; view = null;
      renderLobby();
      show('lobby');
      if ($('rule-toggles')) openSettings(); // settings open while the host changed a rule: refresh it
      break;
    case 'view':
      view = msg.view;
      if (msg.snapshot && roomCode) { try { localStorage.setItem('rt-snap-' + roomCode, msg.snapshot); } catch { /* ignore */ } }
      show('game');
      render();
      break;
    case 'claimable': {
      // the game has started: offer the seats of players who are away
      const box = $('home-error');
      if (!msg.seats.length) { box.textContent = 'That game has already started and every seat is taken.'; break; }
      box.innerHTML = `<span>That game is in progress. Pick up a seat:</span><span class="claims">${msg.seats.map((s) => `<button class="small" data-id="${esc(s.id)}">Rejoin as ${esc(s.name)}</button>`).join('')}</span>`;
      box.querySelectorAll('button').forEach((b) => { b.onclick = () => { roomCode = msg.code; playerId = b.dataset.id; send({ t: 'claim', code: msg.code, playerId: b.dataset.id }); }; });
      break;
    }
    case 'kicked': {
      sessionStorage.removeItem('rt-room'); roomCode = playerId = null; mode = null; view = null; lobby = null;
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      history.replaceState(null, '', '/');
      show('home');
      $('home-error').textContent = 'The host removed you from the room.';
      break;
    }
    case 'error': {
      if (msg.resync && mode === 'online') { send({ t: 'sync' }); }
      if (roomCode && playerId && (/no longer exists|No room with code/i).test(msg.msg)) {
        const snap = localStorage.getItem('rt-snap-' + roomCode);
        if (snap && !restoring) {
          restoring = true;
          setConn('Restoring game…');
          send({ t: 'restore', snapshot: snap, playerId });
          break;
        }
      }
      restoring = false;
      const screen = SCREENS.find((s) => !$(s).classList.contains('hidden'));
      const el = screen === 'lobby' ? $('lobby-error') : screen === 'game' ? $('status') : $('home-error');
      el.textContent = msg.msg;
      if (screen === 'home' && (/no room|no longer|not in that|not available|not running/i).test(msg.msg)) {
        if (roomCode) { try { localStorage.removeItem('rt-room-' + roomCode); } catch { /* ignore */ } }
        sessionStorage.removeItem('rt-room'); roomCode = playerId = null;
      }
      break;
    }
  }
}

function renderLobby() {
  $('lobby-code').innerHTML = [...lobby.code].map((c) => `<span>${esc(c)}</span>`).join('');
  const link = `${location.origin}/?room=${lobby.code}`;
  $('lobby-link').value = link;
  const isHost = lobby.host === playerId;
  const seats = [0, 1, 2, 3].map((i) => {
    const p = lobby.players[i];
    const wind = WIND_CHAR[27 + i];
    if (!p) {
      return `<li class="empty"><span class="seat">${wind}</span><span style="flex:1">Waiting for a friend…</span>${isHost ? `<button class="add-bot">Add bot</button>` : ''}</li>`;
    }
    const tags = [p.id === lobby.host ? 'Host · dealer first' : '', p.bot ? 'Bot' : '', !p.connected ? 'Offline' : ''].filter(Boolean).join(' · ');
    const kick = isHost && p.id !== playerId ? `<button class="kick" data-id="${esc(p.id)}" title="${p.bot ? 'Remove this bot' : 'Remove ' + esc(p.name) + ' from the room'}" aria-label="Remove">✕</button>` : '';
    return `<li><span class="seat${p.id === lobby.host ? ' host' : ''}">${wind}</span><span class="who"><b>${esc(p.name)}${p.id === playerId ? ' <span>(you)</span>' : ''}</b><small>${tags || 'Ready'}</small></span><span class="dot${p.connected ? '' : ' off'}"></span>${kick}</li>`;
  });
  $('lobby-players').innerHTML = seats.join('');
  $('lobby-players').querySelectorAll('.add-bot').forEach((b) => (b.onclick = () => send({ t: 'addBot' })));
  $('lobby-players').querySelectorAll('.kick').forEach((b) => (b.onclick = () => send({ t: 'kick', playerId: b.dataset.id })));
  $('lobby-count').textContent = `${lobby.players.length} of 4 filled`;
  renderRuleSummaries();
  $('btn-removebot').classList.toggle('hidden', !isHost || !lobby.players.some((p) => p.bot));
  $('btn-start').classList.toggle('hidden', !isHost);
  $('lobby-hint').textContent = isHost
    ? (lobby.players.length < 4 ? 'Empty seats are filled by bots when you start.' : 'All seats filled. Start when ready.')
    : 'Waiting for the host to start the game…';
  $('lobby-error').textContent = '';
  $('btn-share').classList.toggle('hidden', !navigator.share);
}
$('btn-copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('lobby-link').value); $('btn-copy').textContent = 'Copied!'; setTimeout(() => ($('btn-copy').textContent = 'Copy link'), 1500); }
  catch { prompt('Copy this link', $('lobby-link').value); }
};
$('btn-share').onclick = () => { navigator.share && navigator.share({ title: 'Riichi Table', text: `Join my mahjong room ${lobby.code}`, url: $('lobby-link').value }).catch(() => {}); };
$('btn-removebot').onclick = () => send({ t: 'removeBot' });
$('btn-start').onclick = () => { send({ t: 'settings', speed }); send({ t: 'start' }); };
$('btn-leave').onclick = () => leaveAll();

function leaveAll() {
  if (mode === 'online') { send({ t: 'leave' }); sessionStorage.removeItem('rt-room'); roomCode = playerId = null; if (ws) { ws.onclose = null; ws.close(); ws = null; } }
  mode = null; view = null; local = null; lobby = null;
  history.replaceState(null, '', '/');
  show('home');
  if (localStorage.getItem('rt-local')) $('btn-resume').classList.remove('hidden');
}

// ---------------------------------------------------------------- local (pass-and-play)
function startLocal(names) {
  const humans = names.map((n) => !!n);
  if (!humans.some(Boolean)) { humans[0] = true; names[0] = 'You'; }
  const filled = names.map((n, i) => n || `Bot ${i + 1}`);
  const state = startGame(newGame({ names: filled, rules: rules() }));
  local = { state, humans, shownSeat: -1 };
  mode = 'local';
  ui.lastSeenHand = -1;
  show('game');
  localTick();
}

function saveLocal() {
  try { localStorage.setItem('rt-local', JSON.stringify({ state: local.state, humans: local.humans })); } catch { /* ignore */ }
}

let localTimer = null;
function localTick() {
  if (!local) return;
  clearTimeout(localTimer); localTimer = null;
  const s = local.state;
  const humanCount = local.humans.filter(Boolean).length;
  if (s.phase === 'over') { view = viewFor(s, firstHuman()); render(); return; }
  if (s.phase === 'result') {
    local.shownSeat = -1;
    view = viewFor(s, firstHuman()); render(); saveLocal(); return;
  }
  // bots first (they answer calls instantly, play with a short delay)
  for (let seat = 0; seat < 4; seat++) {
    if (local.humans[seat]) continue;
    if (!legalActions(s, seat).length) continue;
    const act = () => {
      const a = chooseBotAction(local.state, seat);
      if (a) local.state = apply(local.state, a, seat);
      localTick();
    };
    if (s.phase === 'call') { act(); return; }
    // show the table (from the current human's seat, or a neutral view) while bots move
    const spectatorSeat = humanCount === 1 ? firstHuman() : (local.shownSeat >= 0 ? local.shownSeat : -1);
    view = viewFor(s, spectatorSeat); render();
    localTimer = setTimeout(act, botDelay());
    return;
  }
  // a human must act
  const seat = [0, 1, 2, 3].find((i) => local.humans[i] && legalActions(s, i).length);
  if (seat === undefined) return;
  if (humanCount > 1 && seat !== local.shownSeat) {
    ui.handoffSeat = seat;
    view = viewFor(s, -1); render();
    return;
  }
  local.shownSeat = seat;
  view = viewFor(s, seat); render(); saveLocal();
}
const firstHuman = () => local.humans.findIndex(Boolean);

function sendAction(a) {
  ui.riichiMode = false; ui.optionsFor = null; ui.selected = null;
  if (mode === 'online') { send({ t: 'action', action: a }); return; }
  try { local.state = apply(local.state, a, view.seat); } catch (e) { $('status').textContent = e.message; return; }
  if (a.type === 'next') { local.shownSeat = -1; localStorage.removeItem('rt-local'); }
  localTick();
}

// ---------------------------------------------------------------- render
$('btn-log').onclick = () => { ui.logOpen = !ui.logOpen; $('log').classList.toggle('hidden', !ui.logOpen); $('log').scrollTop = $('log').scrollHeight; };
$('btn-quit').onclick = () => { if (confirm('Leave this game?')) { if (mode === 'local') localStorage.removeItem('rt-local'); leaveAll(); } };

/** The view of a finished hand being reviewed from the log, built on the live view (names, seat, rules). */
function reviewView(v) {
  const h = v.history && ui.review != null ? v.history.find((x) => x.handNo === ui.review) : null;
  if (!h) { ui.review = null; return null; }
  const me = v.seat >= 0 ? h.players[v.seat] : null;
  return {
    ...v, phase: 'result', turn: -1, round: h.round, dealer: h.dealer, dice: h.dice, wallCount: h.wallCount,
    doraIndicators: h.doraIndicators, lastDiscard: h.lastDiscard, result: h.result, players: h.players, handNo: h.handNo,
    me: me ? { hand: me.hand || [], drawn: me.drawn, riichi: me.riichi, waits: [], shanten: -1, furiten: false } : null,
    actions: [], waitingOn: [], review: true,
  };
}

function render() {
  if (!view) return;
  const rv = ui.review != null ? reviewView(view) : null;
  const v = rv || view;
  const before = rv ? null : snapshotTiles();
  $('room-label').innerHTML = mode === 'online' ? `Room <b>${esc(roomCode)}</b>` : 'Pass-and-play';
  setConn(ws && ws.readyState === WebSocket.OPEN ? 'Connected' : (mode === 'online' ? 'Reconnecting…' : ''));
  renderTable(v);
  renderHand(v);
  renderActions(v);
  renderStatus(v);
  renderSide(v);
  if (!rv) maybeAutoDiscard(v);
  renderLog(view);
  renderOverlay(v);
  if (rv) return; // no tile animation or announcements against a reviewed board; the live view stays in prevView
  animateTiles(before, v);
  announceCalls(prevView, v);
  announceHand(prevView, v);
  prevView = v;
}

// The log: hand headers, and the result lines of finished hands are links that open that hand again.
// Result lines are matched to v.history by hand: the log is split at the "— East 1 —" headers, and the
// segments that contain a result line are paired, from the end, with the recorded hands (plus the current
// result, if the hand just ended).
const RESULT_LINE = /wins by (TSUMO|RON)|^Exhaustive draw|^Abortive draw/;
function renderLog(v) {
  const lines = v.log;
  const segments = []; // { lines: [index...], hasResult }
  let cur = null;
  lines.forEach((l, i) => {
    if (l.startsWith('—') || !cur) { cur = { idx: [], result: [] }; segments.push(cur); }
    cur.idx.push(i);
    if (RESULT_LINE.test(l)) cur.result.push(i);
  });
  const withResult = segments.filter((sg) => sg.result.length);
  const targets = [...(v.history || []).map((h) => h.handNo)];
  if (v.phase === 'result' && v.result && !targets.includes(v.handNo)) targets.push(v.handNo);
  const handOf = new Map(); // line index → handNo
  for (let k = 1; k <= Math.min(withResult.length, targets.length); k++) {
    const sg = withResult[withResult.length - k], hn = targets[targets.length - k];
    for (const i of sg.result) handOf.set(i, hn);
  }
  const current = v.phase === 'result' ? v.handNo : null;
  $('log').innerHTML = lines.map((l, i) => {
    const hn = handOf.get(i);
    if (hn == null) return `<div${l.startsWith('—') ? ' class="hand-start"' : ''}>${esc(l)}</div>`;
    const active = (ui.review == null && hn === current) || ui.review === hn;
    return `<div class="result-line${active ? ' active' : ''}"><a href="#review" data-hand="${hn}" title="Show this hand's board and result">${esc(l)}</a></div>`;
  }).join('');
  $('log').querySelectorAll('a[data-hand]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      const hn = +a.dataset.hand;
      ui.peek = false; ui.selected = null; ui.optionsFor = null; ui.riichiMode = false;
      ui.review = hn === (view.phase === 'result' ? view.handNo : null) ? null : hn;
      render();
    };
  });
  if (ui.review == null) $('log').scrollTop = $('log').scrollHeight;
}
function endReview() { ui.review = null; ui.peek = false; render(); }

// ---------------------------------------------------------------- call announcements
// Compare with the previous view: a new meld, a new riichi, or a win shows a big callout on that
// player's side of the table ("PON!", "RIICHI!", "RON!") so nobody misses what just happened.
const CALL_WORDS = { chi: 'CHI', pon: 'PON', kan: 'KAN', ankan: 'KAN', kakan: 'KAN' };
const WIND_KANJI = ['東', '南', '西', '北'];
/** The last scheduled hand of the game (South 4 in a hanchan, East 4 east-only, West 4 in the extra round). */
function isAllLast(v) {
  const lastWind = v.rules && v.rules.hanchan === false ? 0 : 1;
  return v.round.wind >= lastWind && v.round.hand === 4;
}
/** A table-wide announcement in the middle of the felt: a new round wind, or "all last". */
function showBanner({ title, sub, kind }) {
  const el = document.createElement('div');
  el.className = `banner ${kind || ''}`;
  el.innerHTML = `<span class="title">${title}</span>${sub ? `<span class="sub">${sub}</span>` : ''}`;
  $('table').appendChild(el);
  const hold = Math.max(900, 2400 * sf());
  setTimeout(() => el.classList.add('out'), hold);
  setTimeout(() => el.remove(), hold + 600);
}
/** At the start of a hand, announce a change of round wind and the last hand of the game. */
function announceHand(prev, v) {
  if (!prev || prev.handNo === v.handNo || v.phase === 'over') return;
  const windChanged = prev.round.wind !== v.round.wind;
  const allLast = isAllLast(v);
  const wasAllLast = isAllLast(prev);
  const roundLabel = `${WINDS[v.round.wind]} ${v.round.hand}${v.round.honba ? ` · ${v.round.honba} honba` : ''}`;
  if (windChanged && allLast) showBanner({ title: 'All last', sub: `${WIND_KANJI[v.round.wind]} ${WINDS[v.round.wind]} round — ${roundLabel}, the final hand`, kind: 'alllast' });
  else if (windChanged) showBanner({ title: `${WIND_KANJI[v.round.wind]} ${WINDS[v.round.wind]} round`, sub: `The round wind is now ${WIND_KANJI[v.round.wind]} — a triplet of it is a yakuhai`, kind: 'wind' });
  else if (allLast) showBanner({ title: 'All last', sub: `${roundLabel} — ${wasAllLast ? 'the dealer keeps the seat: still the final hand' : 'the final hand of the game'}`, kind: 'alllast' });
}
function announceCalls(prev, v) {
  if (!prev || prev.handNo !== v.handNo || prev.seat !== v.seat) return;
  const calls = [];
  v.players.forEach((p, i) => {
    const q = prev.players[i];
    if (p.melds.length > q.melds.length) calls.push({ seat: i, word: CALL_WORDS[p.melds[p.melds.length - 1].type] || 'CALL', kind: 'meld' });
    else if (p.melds.length === q.melds.length && p.melds.some((m, k) => m.type === 'kakan' && q.melds[k] && q.melds[k].type === 'pon')) calls.push({ seat: i, word: 'KAN', kind: 'meld' });
    if (p.riichi && !q.riichi) calls.push({ seat: i, word: 'RIICHI', kind: 'riichi' });
  });
  if (v.phase === 'result' && prev.phase !== 'result' && v.result) {
    if (v.result.type === 'win') for (const w of v.result.wins) calls.push({ seat: w.seat, word: w.tsumo ? 'TSUMO' : 'RON', kind: 'win' });
    if (v.result.type === 'abort') calls.push({ seat: v.result.by ?? v.turn, word: 'DRAW', kind: 'draw' });
  }
  for (const c of calls) showCallout(c, v);
  // flash the newest meld
  if (calls.some((c) => c.kind === 'meld')) {
    for (const c of calls.filter((x) => x.kind === 'meld')) {
      const block = document.querySelector(`#table .pblock[data-seat="${c.seat}"]`);
      const melds = block ? block.querySelectorAll('.meld') : [];
      const target = melds.length ? melds[melds.length - 1] : null;
      if (target) target.classList.add('new');
    }
  }
}

function showCallout({ seat, word, kind }, v) {
  const mySeat = v.seat >= 0 ? v.seat : 0;
  const rel = (seat - mySeat + 4) % 4;
  const el = document.createElement('div');
  el.className = `callout rel${rel} ${kind}`;
  el.innerHTML = `<span class="who">${esc(v.players[seat].name)}</span><span class="word">${word}!</span>`;
  $('table').appendChild(el);
  const hold = Math.max(500, (kind === 'win' ? 1500 : 1100) * sf());
  setTimeout(() => el.classList.add('out'), hold);
  setTimeout(() => el.remove(), hold + 500);
}

// ---------------------------------------------------------------- tile animation (FLIP)
// Every face-up tile carries data-tile (its instance id), so after a re-render we can find where each
// tile was and slide it to where it is now: discards fly from a hand to the pond, called tiles slide
// from the pond into a meld, drawn tiles arrive from the wall, and the hand re-sorts smoothly.
const ANIM = { get move() { return 420 * sf(); }, get pop() { return 260 * sf(); } };
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function blockAngle(el) {
  const b = el.closest('.pblock');
  if (!b) return 0;
  if (b.classList.contains('rel1')) return -90;
  if (b.classList.contains('rel2')) return 180;
  if (b.classList.contains('rel3')) return 90;
  return 0;
}

function snapshotTiles() {
  // the DOM on screen belongs to prevView (view already holds the update being rendered)
  const pv = prevView;
  const snap = { tiles: new Map(), inMeld: new Set(), inPond: new Set(), hands: {}, sticks: new Set(), center: null, handNo: pv && pv.handNo, seat: pv && pv.seat, phase: pv && pv.phase };
  if (!pv || $('game').classList.contains('hidden')) return snap;
  for (const el of document.querySelectorAll('#table [data-tile], #hand-area [data-tile]')) {
    const key = el.dataset.tile;
    const inMeld = !!el.closest('.meld') || el.classList.contains('wintile');
    if (snap.tiles.has(key) && !inMeld) continue; // a called discard still shows dimmed in the pond; the meld copy is the live one
    snap.tiles.set(key, el.getBoundingClientRect());
    if (inMeld) snap.inMeld.add(key);
    if (el.closest('.pond')) snap.inPond.add(key);
  }
  for (const b of document.querySelectorAll('#table .pblock')) {
    const h = b.querySelector('.hand');
    if (h) snap.hands[b.dataset.seat] = h.getBoundingClientRect();
  }
  const mine = $('hand-area');
  if (pv.seat >= 0 && mine) snap.hands[pv.seat] = mine.getBoundingClientRect();
  const c = document.querySelector('#table .center');
  if (c) snap.center = c.getBoundingClientRect();
  for (const el of document.querySelectorAll('#table .slotstick')) snap.sticks.add(el.dataset.stick);
  return snap;
}

/** Throw the two dice. Returns how long the throw takes (the deal waits for it). */
function throwDice(v) {
  const compass = $('table').querySelector('.center .compass');
  if (!compass || !v.dice || reduceMotion || sf() === 0) return 0;
  const dur = 1150 * sf();
  const table = $('table');
  const tr = table.getBoundingClientRect(), cr = compass.getBoundingClientRect();
  const k = cr.width / 240; // svg units → px
  // where the compass draws its two dice (centres, in svg units) and their resting tilt
  const spots = [{ x: 151.2, y: 170.2, rot: -8 }, { x: 176.2, y: 164.2, rot: 11 }];
  const size = 13 * 1.45 * k;
  const S = tr.width;
  // thrown from the dealer's edge toward the middle
  const rel = (v.dealer - (v.seat >= 0 ? v.seat : 0) + 4) % 4;
  const from = [[0, 1], [1, 0], [0, -1], [-1, 0]][rel];
  compass.classList.add('rolling');
  const flyers = spots.map((sp, i) => {
    const el = document.createElement('div');
    el.className = 'die-fly';
    el.style.width = el.style.height = size + 'px';
    const fx = cr.left - tr.left + sp.x * k - size / 2, fy = cr.top - tr.top + sp.y * k - size / 2;
    el.style.left = fx + 'px'; el.style.top = fy + 'px';
    el.innerHTML = diceSvg(1 + Math.floor(Math.random() * 6));
    table.appendChild(el);
    const sx = from[0] * S * 0.46 + (i ? 14 : -10) * k, sy = from[1] * S * 0.46 + (i ? -8 : 6) * k;
    const spin = (i ? -1 : 1) * (900 + Math.random() * 360);
    const bounce = { x: -from[0] * 14 * k + (i ? 6 : -6) * k, y: -from[1] * 14 * k + (i ? -5 : 4) * k };
    el.animate([
      { transform: `translate(${sx}px, ${sy}px) rotate(0deg) scale(1.1)`, opacity: 0, filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.4))', offset: 0 },
      { opacity: 1, offset: 0.06 },
      { transform: `translate(${sx * 0.45}px, ${sy * 0.45}px) rotate(${spin * 0.45}deg) scale(2.8)`, filter: 'drop-shadow(0 26px 14px rgba(0,0,0,.35))', offset: 0.38 },
      { transform: `translate(${bounce.x}px, ${bounce.y}px) rotate(${spin * 0.8}deg) scale(1.15)`, filter: 'drop-shadow(0 3px 3px rgba(0,0,0,.45))', offset: 0.72 },
      { transform: `translate(${bounce.x * 0.3}px, ${bounce.y * 0.3 - 8 * k}px) rotate(${spin * 0.92}deg) scale(1.35)`, filter: 'drop-shadow(0 8px 6px rgba(0,0,0,.35))', offset: 0.84 },
      { transform: `translate(0, 0) rotate(${spin + sp.rot}deg) scale(1)`, filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.45))', offset: 1 },
    ], { duration: dur, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
    return el;
  });
  // faces tumble while the dice are in the air, then show the real roll just before they settle
  const t0 = performance.now();
  const faceTick = () => {
    const t = (performance.now() - t0) / dur;
    if (t >= 0.8) { flyers.forEach((f, i) => { f.innerHTML = diceSvg(v.dice[i]); }); return; }
    flyers.forEach((f) => { f.innerHTML = diceSvg(1 + Math.floor(Math.random() * 6)); });
    setTimeout(faceTick, 55 + t * 120);
  };
  faceTick();
  setTimeout(() => {
    flyers.forEach((f) => f.remove());
    const c = $('table').querySelector('.center .compass');
    if (c) { c.classList.remove('rolling'); c.classList.add('landed'); setTimeout(() => c.classList.remove('landed'), 1200); }
  }, dur);
  return dur;
}

/** The deal: the dealer's dice are thrown from their side of the table, tumble through the air and land on
 *  the compass; the matching wall number lights up; then every hand flies in from the wall. */
function animateDeal(before, v) {
  const diceTime = throwDice(v);
  if (!before.center) return;
  const tiles = [...document.querySelectorAll('#table .hand .tile, #hand-area .tile')];
  tiles.forEach((el, i) => {
    const now = el.getBoundingClientRect();
    if (!now.width) return;
    const dx = (before.center.left + before.center.width / 2) - (now.left + now.width / 2);
    const dy = (before.center.top + before.center.height / 2) - (now.top + now.height / 2);
    const a = (blockAngle(el) * Math.PI) / 180;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    const base = getComputedStyle(el).transform;
    const final = base === 'none' ? '' : base;
    el.animate([
      { transform: `translate(${lx}px, ${ly}px) scale(0.6) ${final}`, opacity: 0 },
      { transform: `translate(0, 0) scale(1) ${final}`, opacity: 1 },
    ], { duration: ANIM.move, delay: diceTime + (i % 14) * 22 * sf(), easing: 'cubic-bezier(.22,.9,.3,1)', fill: 'backwards' });
  });
}

/** A riichi stick slides from the player's hand into the compass slot on their side. */
function animateSticks(before, v) {
  for (const el of document.querySelectorAll('#table .slotstick')) {
    if (before.sticks.has(el.dataset.stick)) continue;
    const seat = +el.dataset.stick;
    const from = before.hands[seat];
    if (!from) continue;
    const now = el.getBoundingClientRect();
    const dx = (from.left + from.width / 2) - (now.left + now.width / 2);
    const dy = (from.top + from.height / 2) - (now.top + now.height / 2);
    const base = getComputedStyle(el).transform;
    const final = base === 'none' ? '' : base;
    el.animate([
      { transform: `translate(${dx}px, ${dy}px) ${final}`, opacity: 0.6 },
      { transform: `translate(0, 0) ${final}`, opacity: 1 },
    ], { duration: ANIM.move * 1.3, easing: 'cubic-bezier(.22,.9,.3,1)', fill: 'backwards' });
    el.animate([{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], { duration: 600 * sf(), delay: ANIM.move * 1.3, fill: 'backwards' });
  }
}

function animateTiles(before, v) {
  if (reduceMotion || sf() === 0 || !before.tiles) return;
  // a new hand or a different perspective: no travel animation, just let it appear
  if (before.handNo !== v.handNo || before.seat !== v.seat) return;
  if (before.phase === 'roll' && v.phase !== 'roll') { animateDeal(before, v); return; }
  animateSticks(before, v);
  const seen = new Set();
  // melds first (mine included) so the dimmed copy of a called tile left in the pond is never the one animated
  // separate queries, concatenated: querySelectorAll with a selector list returns DOCUMENT order, and the dimmed
  // pond copy of a called tile comes before the meld copy in the DOM — the meld copy must be the one we animate
  const els = [
    ...document.querySelectorAll('#table .meld [data-tile]'),
    ...document.querySelectorAll('.wintile[data-tile]'),
    ...document.querySelectorAll('#table [data-tile], #hand-area [data-tile], #table [data-drawn]'),
  ];
  // Did a discard land in this update? Then the next player's draw waits for it to settle.
  const newDiscard = [...document.querySelectorAll('#table .pond [data-tile]')].some((el) => !before.inPond.has(el.dataset.tile));
  const drawDelay = newDiscard ? ANIM.move * 0.9 : 0;
  for (const el of els) {
    const key = el.dataset.tile != null ? el.dataset.tile : 'drawn-' + el.dataset.drawn;
    if (seen.has(key)) continue;
    seen.add(key);
    if (el.closest('.center')) continue;
    // tiles already sitting in a meld only shift with layout; never re-animate them
    if ((el.closest('.meld') || el.classList.contains('wintile')) && before.inMeld.has(key)) continue;
    const now = el.getBoundingClientRect();
    if (!now.width) continue;
    let from = before.tiles.get(key);
    let pop = false, isDraw = false;
    if (!from) {
      // a tile that was hidden until now: discards and meld tiles come from that player's hand, draws from the wall
      const block = el.closest('.pblock');
      const seat = block ? +block.dataset.seat : v.seat;
      if (el.closest('.pond') || el.closest('.meld')) from = before.hands[seat];
      else { from = before.center; isDraw = !el.classList.contains('wintile'); } // my drawn tile / an opponent's drawn tile
      pop = true;
      if (!from) continue;
    }
    const dx = (from.left + from.width / 2) - (now.left + now.width / 2);
    const dy = (from.top + from.height / 2) - (now.top + now.height / 2);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !pop) continue;
    // the element lives inside a rotated block: express the screen-space delta in its local frame
    const a = (blockAngle(el) * Math.PI) / 180;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    const scale = pop ? 1 : Math.sqrt((from.width * from.height) / (now.width * now.height)) || 1;
    const base = getComputedStyle(el).transform;
    const final = base === 'none' ? '' : base;
    el.style.willChange = 'transform';
    el.style.zIndex = '5';
    const anim = el.animate(
      [
        { transform: `translate(${lx}px, ${ly}px) scale(${scale}) ${final}`, opacity: isDraw ? 0 : pop ? 0.4 : 1 },
        { transform: `translate(0, 0) scale(1) ${final}`, opacity: 1 },
      ],
      // a draw starts only once the discard before it has settled (fill: backwards keeps it invisible until then)
      { duration: ANIM.move, delay: isDraw ? drawDelay : 0, easing: 'cubic-bezier(.22,.9,.3,1)', fill: 'backwards' },
    );
    anim.onfinish = () => { el.style.willChange = ''; el.style.zIndex = ''; };
  }
  // the newest discard gets a settle "pop" so the eye lands on it
  const last = v.lastDiscard && document.querySelector(`#table .pblock[data-seat="${v.lastDiscard.seat}"] .pond [data-tile="${v.lastDiscard.tile}"]`);
  if (last && !before.tiles.has(String(v.lastDiscard.tile))) {
    last.animate([{ filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: ANIM.pop, delay: ANIM.move, fill: 'backwards' });
  }
}

function renderTable(v) {
  const mySeat = v.seat >= 0 ? v.seat : 0;
  const reveal = v.phase === 'result' || v.phase === 'over';
  const res = v.phase === 'result' ? v.result : null;
  let html = '';
  for (let i = 0; i < 4; i++) {
    const p = v.players[i];
    const rel = (i - mySeat + 4) % 4;
    const lastSeat = v.lastDiscard && v.lastDiscard.seat === i && (v.phase === 'call');
    // after a win: who won, on which tile, and who dealt in
    const win = res && res.type === 'win' ? res.wins.find((w) => w.seat === i) : null;
    const dealtIn = res && res.type === 'win' ? res.wins.find((w) => !w.tsumo && w.from === i) : null;
    const pondTiles = p.discards.map((d, j) => tileHtml(d.tile, {
      rotated: d.riichi, data: { tile: d.tile }, classes: [d.called ? 'called' : '', d.tsumogiri ? 'tsumogiri' : '', (lastSeat && j === p.discards.length - 1) ? 'last' : '',
        (dealtIn && j === p.discards.length - 1 && d.tile === dealtIn.winTile) ? 'dealt-in' : ''].filter(Boolean),
    }));
    // rows of six, like a real pond; a sideways riichi tile widens its row instead of overlapping
    let pond = '';
    for (let r = 0; r < Math.max(3, Math.ceil(pondTiles.length / 6)); r++) pond += `<div class="prow-line">${pondTiles.slice(r * 6, r * 6 + 6).join('')}</div>`;
    let hand = '';
    if (i !== v.seat) {
      if (p.hand) {
        hand = sortTiles(p.hand).map((t) => tileHtml(t, { data: { tile: t } })).join('');
        if (win && !win.tsumo) hand += tileHtml(win.winTile, { classes: ['drawn', 'wintile'], data: { tile: win.winTile }, title: 'Winning tile (ron)' });
        else if (p.drawn != null) hand += tileHtml(p.drawn, { classes: ['drawn', win ? 'wintile' : ''], data: { tile: p.drawn }, title: win ? 'Winning tile (tsumo)' : '' });
      } else {
        const n = p.handCount;
        // a player holding a freshly drawn tile has 14 tiles counting each meld as three (kans included) — true after a kan's replacement draw too
        const drawnIdx = n + p.melds.length * 3 === 14 ? n - 1 : -1;
        hand = Array.from({ length: n }, (_, j) => tileHtml(null, { faceDown: true, classes: [j === drawnIdx ? 'drawn' : ''], data: j === drawnIdx ? { drawn: i } : null })).join('');
      }
    }
    const melds = p.melds.map((m) => meldHtml(m, i)).join(''); // in the corner to the player's right, stacked
    const offline = v.auto && v.auto[i] ? '<span class="autoplay" title="A bot is playing this seat until they return">bot playing</span>' : (v.connected && !v.connected[i] ? '<span class="offline">offline</span>' : '');
    const isTurn = (v.phase === 'action' && v.turn === i) || (v.phase === 'call' && v.waitingOn.includes(i));
    let chip = '';
    if (win) chip = `<span class="chip win">${win.tsumo ? 'TSUMO' : 'RON'} · ${win.score.yakuman ? win.score.limit : win.score.han + ' han'}</span>`;
    else if (dealtIn) chip = '<span class="chip lose">dealt in</span>';
    else if (res && res.type === 'draw') chip = `<span class="chip ${res.tenpai[i] ? 'tenpai' : 'noten'}">${res.tenpai[i] ? 'tenpai' : 'noten'}</span>`;
    html += `<div class="pblock rel${rel}${isTurn ? ' active' : ''}${win ? ' winner' : ''}${dealtIn ? ' dealt' : ''}" data-seat="${i}">
      <div class="pond">${pond}</div>
      <div class="prow"><div class="hand" style="width: calc(var(--tw) * ${(14.3 - 3 * p.melds.length).toFixed(1)} + ${13 - 3 * p.melds.length}px)">${hand}</div><div class="melds">${melds}</div></div>
      <div class="pname">${isTurn ? '<span class="turn"></span>' : ''}<span class="wind${v.dealer === i ? ' dealer' : ''}">${WIND_CHAR[p.seatWind]}</span><span>${esc(p.name)}</span><span class="score">${p.score}</span>${p.riichi ? '<span class="riichi">RIICHI</span>' : ''}${chip}${offline}</div>
    </div>`;
  }
  // the round bar shows the indicators; hovering one reveals and highlights the dora it points to
  const dora = v.doraIndicators.map((t) => `<span class="ind" data-dora="${doraOf(kindOf(t))}">${tileHtml(t, { classes: ['indicator'] })}<span class="dora-pop">${kindHtml(doraOf(kindOf(t)), ['dora-tile'])}<span class="dora-cap">dora</span></span></span>`).join('');
  const dealerRel = (v.dealer - mySeat + 4) % 4;
  const diceSum = v.dice ? v.dice[0] + v.dice[1] : 0;
  const honbaSticks = v.round.honba ? Array.from({ length: Math.min(v.round.honba, 6) }, () => stickSvg(100)).join('') : '';
  const carry = v.round.riichiSticks - v.players.filter((p) => p.riichi).length; // sticks carried over from earlier hands
  const potSticks = carry > 0 ? Array.from({ length: Math.min(carry, 6) }, () => stickSvg(1000)).join('') : '';
  const slotSticks = v.players.map((p, i) => p.riichi ? `<div class="slotstick rel${(i - mySeat + 4) % 4}" data-stick="${i}" title="${esc(p.name)}'s riichi stick">${stickSvg(1000)}</div>` : '').join('');
  html += `<div class="center">${compassSvg({ dealerRel, diceSum, dice: v.dice })}${slotSticks}</div>`;
  // round info lives above the table, off the felt
  $('roundbar').innerHTML = `<span class="plaque-wrap">${plaqueSvg(v.round.wind)}</span><span class="round">${esc(v.round.name.replace(/ \(.*\)$/, ''))}</span>${isAllLast(v) && v.phase !== 'over' ? `<span class="alllast" title="The last scheduled hand of the game">All last</span>` : ''}
    <span class="sep"></span><span class="lbl">${ruleLink('dora', 'Dora indicator')}</span><span class="dora">${dora}</span>
    <span class="sep"></span><span class="wall">${v.wallCount} tiles left</span>
    ${honbaSticks ? `<span class="sep"></span><span class="sticks" title="${v.round.honba} honba"><span class="lbl">Honba</span>${honbaSticks}${v.round.honba > 6 ? `<span>×${v.round.honba}</span>` : ''}</span>` : ''}
    ${potSticks ? `<span class="sep"></span><span class="sticks" title="${carry} riichi sticks carried over"><span class="lbl">Pot</span>${potSticks}${carry > 6 ? `<span>×${carry}</span>` : ''}</span>` : ''}`;
  $('table').innerHTML = html;
  void reveal;
}

function meldHtml(m, owner) {
  const tiles = m.type === 'ankan'
    ? [tileHtml(null, { faceDown: true }), tileHtml(m.tiles[1], { data: { tile: m.tiles[1] } }), tileHtml(m.tiles[2], { data: { tile: m.tiles[2] } }), tileHtml(null, { faceDown: true })]
    : (() => {
      // show called tile rotated; place it on the side it came from (left = kamicha, middle = toimen, right = shimocha)
      const rest = m.tiles.filter((t) => t !== m.called && t !== m.added);
      const parts = rest.map((t) => tileHtml(t, { data: { tile: t } }));
      // the called tile lies sideways; an added-kan tile stacks on top of it
      const calledTile = tileHtml(m.called, { classes: ['called'], data: { tile: m.called } });
      const called = m.added != null ? `<span class="cstack">${tileHtml(m.added, { classes: ['called', 'added'], data: { tile: m.added } })}${calledTile}</span>` : calledTile;
      const relFrom = m.from == null ? 0 : (m.from - owner + 4) % 4;
      if (relFrom === 3) parts.unshift(called);        // from the left player
      else if (relFrom === 2) parts.splice(1, 0, called); // from across
      else parts.push(called);                         // from the right player
      return parts;
    })();
  return `<div class="meld">${tiles.join('')}</div>`;
}
const meldHtmlFor = (seat, m) => meldHtml(m, seat);

let autoKey = null;
/** In riichi you must discard the tile you drew unless it wins (or makes a closed kan): do it for the player. */
function maybeAutoDiscard(v) {
  if (v.seat < 0 || v.phase !== 'action' || v.turn !== v.seat || !v.me || !v.me.riichi || v.me.drawn == null) return;
  const types = v.actions.map((a) => a.type);
  if (types.includes('tsumo') || types.includes('ankan')) return;
  const key = `${v.handNo}:${v.wallCount}:${v.me.drawn}`;
  if (autoKey === key) return;
  autoKey = key;
  const drawn = v.me.drawn;
  setTimeout(() => {
    if (view === v && view.phase === 'action' && view.turn === view.seat && view.me && view.me.drawn === drawn) sendAction({ type: 'discard', tile: drawn });
  }, Math.max(350, 900 * sf()));
}

/** The waits the hand would have after discarding `tile` (empty = that discard does not reach tenpai).
 *  Also says whether that tenpai would be furiten (a wait already in the player's own pond). */
function afterDiscard(v, tile) {
  const me = v.me;
  if (!me || v.seat < 0) return { waits: [], furiten: false };
  const all = [...me.hand, ...(me.drawn != null ? [me.drawn] : [])];
  const i = all.indexOf(tile);
  if (i < 0 || all.length % 3 !== 2) return { waits: [], furiten: false };
  const rest = all.slice(); rest.splice(i, 1);
  const w = computeWaits(countsOf(rest.map(kindOf)), v.players[v.seat].melds.length);
  const pond = new Set(v.players[v.seat].discards.map((d) => kindOf(d.tile)));
  return { waits: w, furiten: w.some((k) => pond.has(k)) };
}

/** Would taking this call leave the hand in furiten? After a pon/chi the player discards one of the
 *  remaining tiles; after a kan they draw and discard. We look at every discard that reaches tenpai:
 *  if all of them wait on a tile already in the player's pond, the call locks them into furiten. */
function callFuriten(v, action) {
  const me = v.me;
  if (!me || v.seat < 0 || v.phase !== 'call' || !v.lastDiscard) return null;
  const p = v.players[v.seat];
  const pond = new Set(p.discards.map((d) => kindOf(d.tile)));
  const called = kindOf(v.lastDiscard.tile);
  let rest = me.hand.slice();
  if (action.type === 'kan') { let n = 3; rest = rest.filter((t) => (kindOf(t) === called && n-- > 0) ? false : true); }
  else for (const t of action.tiles) { const i = rest.indexOf(t); if (i >= 0) rest.splice(i, 1); }
  const melds = p.melds.length + 1;
  const kinds = rest.map(kindOf);
  const results = []; // one per distinct discard (or the hand itself after a kan): { tenpai, furiten }
  if (action.type === 'kan') {
    const w = computeWaits(countsOf(kinds), melds);
    if (w.length) results.push({ waits: w, furiten: w.some((k) => pond.has(k)) });
  } else {
    for (const k of new Set(kinds)) {
      const c = countsOf(kinds); c[k]--;
      const w = computeWaits(c, melds);
      if (w.length) results.push({ waits: w, furiten: w.some((x) => pond.has(x)) });
    }
  }
  if (!results.length) return { reach: false, locked: false };
  const locked = results.every((r) => r.furiten);
  const waits = [...new Set(results.flatMap((r) => r.waits))];
  return { reach: true, locked, waits, inPond: waits.filter((k) => pond.has(k)) };
}

function renderHand(v) {
  const area = $('hand-area');
  if (v.seat < 0) { area.innerHTML = '<span class="note" style="color:var(--muted)">Bots are playing…</span>'; return; }
  const me = v.me;
  const acts = v.actions;
  const discard = acts.find((a) => a.type === 'discard');
  const riichi = acts.find((a) => a.type === 'riichi');
  const legalTiles = new Set(ui.riichiMode && riichi ? riichi.tiles : (discard ? discard.tiles : []));
  if (ui.riichiMode && riichi) {
    // riichi tiles are deduped by kind; allow any tile of the same kind+red
    for (const t of [...me.hand, ...(me.drawn != null ? [me.drawn] : [])]) {
      if (riichi.tiles.some((r) => kindOf(r) === kindOf(t) && isRedFive(r) === isRedFive(t))) legalTiles.add(t);
    }
  }
  const canDiscard = legalTiles.size > 0 && (v.phase === 'action' && v.turn === v.seat);
  // a tile whose discard reaches tenpai gets a small marker; hovering or selecting it shows the waits in the status line
  const reach = (t) => canDiscard && legalTiles.has(t) && afterDiscard(v, t).waits.length ? 'to-tenpai' : '';
  const tiles = sortTiles(me.hand).map((t) => tileHtml(t, { classes: [canDiscard ? (legalTiles.has(t) ? 'legal' : 'illegal') : '', reach(t)], data: { tile: t }, title: kindName(kindOf(t)) }));
  const myWin = v.phase === 'result' && v.result && v.result.type === 'win' ? v.result.wins.find((w) => w.seat === v.seat) : null;
  if (myWin && !myWin.tsumo) tiles.push(tileHtml(myWin.winTile, { classes: ['drawn', 'wintile'], data: { tile: myWin.winTile }, title: 'Winning tile (ron)' }));
  else if (me.drawn != null) tiles.push(tileHtml(me.drawn, { classes: ['drawn', myWin ? 'wintile' : '', canDiscard ? (legalTiles.has(me.drawn) ? 'legal' : 'illegal') : '', reach(me.drawn)], data: { tile: me.drawn }, title: myWin ? 'Winning tile (tsumo)' : kindName(kindOf(me.drawn)) }));
  const p = v.players[v.seat];
  area.innerHTML = `<div class="myhand">${tiles.join('')}</div>`;
  area.classList.toggle('my-turn', canDiscard);
  if (!canDiscard) { ui.selected = null; ui.hover = null; }
  if (canDiscard) {
    // first tap selects (lifts) a tile; a second tap on the same tile discards it; tapping elsewhere just moves the selection
    const sel = area.querySelector(`.tile.legal[data-tile="${ui.selected}"]`);
    if (sel) sel.classList.add('selected'); else ui.selected = null;
    area.querySelectorAll('.tile.legal').forEach((el) => {
      el.onclick = () => {
        const t = +el.dataset.tile;
        if (ui.selected === t) {
          ui.selected = null;
          if (ui.riichiMode) sendAction({ type: 'riichi', tile: t });
          else sendAction({ type: 'discard', tile: t });
          return;
        }
        ui.selected = t;
        area.querySelectorAll('.tile.selected').forEach((x) => x.classList.remove('selected'));
        el.classList.add('selected');
        renderStatus(view);
      };
      // mouse: previewing a discard's waits on hover (touch devices use the first tap instead)
      el.onmouseenter = () => { ui.hover = +el.dataset.tile; renderStatus(view); };
      el.onmouseleave = () => { if (ui.hover === +el.dataset.tile) { ui.hover = null; renderStatus(view); } };
    });
  }
}

function renderActions(v) {
  const bar = $('action-bar');
  const acts = v.seat >= 0 ? v.actions : [];
  const b = [];
  const has = (t) => acts.find((a) => a.type === t);
  if (has('roll')) b.push(`<button class="riichi" data-a="roll">🎲 Roll the dice</button>`);
  if (has('tsumo')) b.push(`<button class="win" data-a="tsumo">Tsumo</button>`);
  if (has('ron')) b.push(`<button class="win" data-a="ron">Ron</button>`);
  if (has('riichi')) b.push(`<button class="riichi${ui.riichiMode ? ' active' : ''}${v.me && v.me.furiten ? ' caution' : ''}" data-a="riichi-mode" title="${v.me && v.me.furiten ? 'You are furiten — a riichi here can only win by tsumo' : 'Declare riichi'}">Riichi${v.me && v.me.furiten ? ' ⚠' : ''}</button>`);
  // a call that can only leave the hand furiten is flagged on its button (and explained in the status line)
  const callBtn = (type, label) => {
    const list = acts.filter((x) => x.type === type);
    const locked = list.length && list.every((x) => { const f = callFuriten(v, x); return f && f.locked; });
    return `<button class="call${locked ? ' caution' : ''}" data-a="${type}" title="${locked ? 'This call would leave you furiten' : ''}">${label}${locked ? ' ⚠' : ''}</button>`;
  };
  if (has('pon')) b.push(callBtn('pon', 'Pon'));
  if (has('chi')) b.push(callBtn('chi', 'Chi'));
  if (has('kan')) b.push(callBtn('kan', 'Kan'));
  if (has('ankan')) b.push(`<button class="call" data-a="ankan">Closed kan</button>`);
  if (has('kakan')) b.push(`<button class="call" data-a="kakan">Add kan</button>`);
  if (has('kyuushu')) b.push(`<button data-a="kyuushu" title="Abortive draw: nine different terminals and honors on your first turn">Nine terminals: redeal</button>`);
  if (has('pass')) b.push(`<button data-a="pass">Pass</button>`);
  let options = '';
  if (ui.optionsFor) {
    const list = acts.filter((a) => a.type === ui.optionsFor);
    if (ui.optionsFor === 'pon' || ui.optionsFor === 'chi') {
      options = `<div class="options">${list.map((a, i) => { const f = callFuriten(v, a); return `<span class="opt${f && f.locked ? ' caution' : ''}" data-i="${i}" title="${f && f.locked ? 'Leaves you furiten' : ''}">${a.tiles.map((t) => tileHtml(t)).join('')}${tileHtml(v.lastDiscard.tile, { classes: ['called'] })}${f && f.locked ? '<em class="optwarn">⚠ furiten</em>' : ''}</span>`; }).join('')}</div>`;
    } else {
      options = `<div class="options">${list[0].kinds.map((k) => `<span class="opt" data-k="${k}">${kindHtml(k)}</span>`).join('')}</div>`;
    }
  }
  bar.innerHTML = b.join('') + options;
  bar.querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      const a = btn.dataset.a;
      if (a === 'riichi-mode') { ui.riichiMode = !ui.riichiMode; ui.optionsFor = null; render(); return; }
      if (a === 'pon' || a === 'chi') {
        const list = acts.filter((x) => x.type === a);
        if (list.length === 1) sendAction({ type: a, tiles: list[0].tiles });
        else { ui.optionsFor = ui.optionsFor === a ? null : a; render(); }
        return;
      }
      if (a === 'ankan' || a === 'kakan') {
        const kinds = has(a).kinds;
        if (kinds.length === 1) sendAction({ type: a, kind: kinds[0] });
        else { ui.optionsFor = ui.optionsFor === a ? null : a; render(); }
        return;
      }
      sendAction({ type: a });
    };
  });
  bar.querySelectorAll('.opt').forEach((el) => {
    el.onclick = () => {
      if (el.dataset.k != null) sendAction({ type: ui.optionsFor, kind: +el.dataset.k });
      else sendAction({ type: ui.optionsFor, tiles: acts.filter((a) => a.type === ui.optionsFor)[+el.dataset.i].tiles });
    };
  });
}

/** A link that opens the rules at a section (ids: h-goal, h-flow, h-shanten, h-calls, h-riichi, h-win, h-furiten, h-dora, h-score, h-draw, h-game). */
function ruleLink(section, text, cls = '') {
  return `<a href="#rules-${section}" class="rule-link ${cls}" data-rule="${section}" title="Open the rules: ${esc(text)}">${text}</a>`;
}
function yakuLink(text) { return `<a href="#yaku" class="rule-link" data-yaku="${yakuSlug(text)}" title="Open the yaku reference">${text}</a>`; }
/** Scroll the open help modal so `el` sits just below the sticky navigation, and flash it. */
function scrollModalTo(el) {
  const panel = $('modal').querySelector('.panel');
  if (!panel || !el) return;
  const toc = panel.querySelector('.toc');
  const top = panel.querySelector('.modal-top');
  const bar = toc || top; // the sticky bar that would cover the heading
  panel.scrollTop = Math.max(0, el.offsetTop - 60);
  // then correct by what the sticky bar actually covers (its height depends on how the links wrap)
  if (bar) {
    const gap = el.getBoundingClientRect().top - bar.getBoundingClientRect().bottom - 10;
    panel.scrollTop = Math.max(0, panel.scrollTop + gap);
  }
  el.classList.remove('target'); void el.offsetWidth; el.classList.add('target');
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('.rule-link');
  if (!a) return;
  e.preventDefault();
  if (a.dataset.yaku != null) {
    openModal(yakuHtml());
    const slug = ['yaku', 'yakureference'].includes(a.dataset.yaku) ? '' : a.dataset.yaku; // a generic link just opens the list
    let row = slug && $('modal').querySelector('#y-' + slug);
    if (!row && slug) row = [...$('modal').querySelectorAll('.yrow[id]')].find((r) => r.id.includes(slug) || slug.includes(r.id.slice(2)));
    if (row) scrollModalTo(row);
    return;
  }
  openModal(rulesHtml());
  scrollModalTo($('modal').querySelector('#h-' + a.dataset.rule));
});

function renderStatus(v) {
  const st = $('status');
  if (v.review) { st.innerHTML = `<span class="msg">Reviewing <b>${esc(v.round.name)}</b> from the log — the game continues underneath. <a href="#back" id="status-endreview">Back to the game</a></span>`; const a = $('status-endreview'); if (a) a.onclick = (e) => { e.preventDefault(); endReview(); }; renderAwayBar(view); return; }
  if (v.seat < 0) { st.innerHTML = ''; return; }
  const me = v.me;
  let msg = '';
  if (v.phase === 'roll') {
    msg = v.dealer === v.seat ? `You are the ${ruleLink('game', 'dealer')} — roll the dice to deal the hand.` : `Waiting for ${esc(v.players[v.dealer].name)} to roll the dice…`;
  } else if (v.phase === 'action') {
    if (v.turn === v.seat) {
      if (ui.riichiMode) {
        msg = me.furiten
          ? `<span class="warn">⚠ You are ${ruleLink('furiten', 'furiten')}: in riichi you could only win by tsumo, never by ron.</span> Still declare? Pick the tile to discard, or press Riichi again to cancel.`
          : `${ruleLink('riichi', 'Riichi')}: choose the tile to discard.`;
      } else msg = ui.selected != null ? `Tap <b>${esc(kindName(kindOf(ui.selected)))}</b> again to ${ruleLink('flow', 'discard')} it, or pick another tile.` : `Your turn — tap a tile, then tap it again to ${ruleLink('flow', 'discard')}.`;
      // preview: what discarding the selected (or hovered) tile would leave you waiting on
      const pv = ui.selected != null ? ui.selected : ui.hover;
      if (pv != null && !me.riichi) {
        const r = afterDiscard(v, pv);
        if (r.waits.length) {
          const pvHtml = `<span class="preview">Discard <b>${esc(kindName(kindOf(pv)))}</b> → ${ruleLink('shanten', 'tenpai', 'strong')}, waiting on <span class="waits">${r.waits.map((k) => kindHtml(k)).join('')}</span>${r.furiten && !(ui.riichiMode && me.furiten) ? ` <span class="warn">⚠ ${ruleLink('furiten', 'furiten')} — a wait is already in your pond</span>` : ''}</span>`;
          msg = ui.riichiMode ? `${msg} ${pvHtml}` : `${pvHtml}${ui.selected != null ? ' Tap it again to discard.' : ''}`;
        }
      }
    } else msg = `${esc(v.players[v.turn].name)} is thinking…`;
  } else if (v.phase === 'call') {
    if (v.waitingOn.includes(v.seat)) {
      msg = `${esc(v.players[v.lastDiscard.seat].name)} discarded ${kindName(kindOf(v.lastDiscard.tile))}. ${ruleLink('calls', 'Call')}?`;
      const locked = v.actions.filter((a) => a.type === 'pon' || a.type === 'chi' || a.type === 'kan').map((a) => [a, callFuriten(v, a)]).filter(([, f]) => f && f.locked);
      if (locked.length) {
        const types = [...new Set(locked.map(([a]) => a.type))].join(' / ');
        const inPond = [...new Set(locked.flatMap(([, f]) => f.inPond))];
        msg += ` <span class="warn">⚠ ${types.charAt(0).toUpperCase() + types.slice(1)} here would make you tenpai only on <span class="waits">${inPond.map((k) => kindHtml(k)).join('')}</span>, which is already in your pond — you would be ${ruleLink('furiten', 'furiten')} and unable to ron.</span>`;
      }
    }
    else msg = `${esc(v.players[v.lastDiscard.seat].name)} discarded ${kindName(kindOf(v.lastDiscard.tile))} — waiting for calls…`;
  }
  let extra = '';
  if (me && v.phase !== 'result' && v.phase !== 'over' && v.phase !== 'roll') {
    const fourteen = (me.hand.length + (me.drawn != null ? 1 : 0)) % 3 === 2;
    if (me.waits.length && !(fourteen && !me.riichi)) extra = ` ${ruleLink('shanten', 'Tenpai', 'strong')} — waiting on <span class="waits">${me.waits.map((k) => kindHtml(k)).join('')}</span>${me.furiten ? ' ' + ruleLink('furiten', 'FURITEN', 'furiten') : ''}`;
    else if (msg.includes('class="preview"')) extra = '';
    else if (fourteen && me.shanten === 0) extra = ` ${ruleLink('shanten', 'A discard from tenpai', 'shanten')} — the marked tiles get you there.`;
    else if (me.shanten >= 0) extra = ` ${ruleLink('shanten', me.shanten + '-shanten', 'shanten')}`;
  }
  st.innerHTML = `<span class="msg">${msg}${extra}</span>`;
  renderAwayBar(v);
}

/** Online, for the host: who is away, and a button to let a bot play for them (or take it back). */
function renderAwayBar(v) {
  const bar = $('awaybar');
  if (!bar) return;
  if (mode !== 'online' || v.host !== playerId || v.phase === 'over') { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  const rows = [];
  v.players.forEach((p, i) => {
    if (i === v.seat) return;
    const away = !v.connected[i];
    const auto = v.auto && v.auto[i];
    if (!away && !auto) return;
    rows.push(`<span class="awayrow"><b>${esc(p.name)}</b> ${auto ? 'is away — a bot is playing their seat' : 'is offline — the game is waiting for them'}
      <button class="small ${auto ? 'ghost' : ''}" data-seat="${i}" data-on="${auto ? '0' : '1'}">${auto ? 'Hand control back' : 'Let a bot play for them'}</button></span>`);
  });
  if (!rows.length) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.innerHTML = rows.join('');
  bar.classList.remove('hidden');
  bar.querySelectorAll('button').forEach((b) => { b.onclick = () => send({ t: 'autopilot', playerId: v.playerIds[+b.dataset.seat], on: b.dataset.on === '1' }); });
}

// ---------------------------------------------------------------- side panel (desktop)
function renderSide(v) {
  const el = $('side');
  if (!el) return;
  if (v.seat < 0 || !v.me || v.phase === 'roll') { el.innerHTML = ''; return; }
  const me = v.me;
  const p = v.players[v.seat];
  const a = adviseHand({ hand: me.hand, drawn: me.drawn, riichi: me.riichi, melds: p.melds }, { seatWind: p.seatWind, roundWind: 27 + v.round.wind, doraIndicators: v.doraIndicators, rules: v.rules });
  let hand = '';
  if (a.tenpai) {
    hand = `<div class="side-h">${ruleLink('shanten', 'Tenpai')}${me.furiten ? ' · ' + ruleLink('furiten', 'furiten', 'furiten') : ''}</div>
      <div class="waitlist">${a.waits.map((w) => `<div class="waitrow${w.noYaku ? ' noyaku' : ''}">${kindHtml(w.kind)}<div class="wtxt">${w.noYaku ? (w.tsumoOnly ? '<b>tsumo only</b> — no yaku on ron' : '<b>no yaku</b> — cannot win on this tile') : `<b>${w.limit || w.han + ' han ' + w.fu + ' fu'}</b>`}<span>${w.yaku.map((y) => y.name).join(', ')}</span></div></div>`).join('')}</div>`;
  } else if (a.shanten != null) {
    hand = `<div class="side-h">${ruleLink('shanten', a.shanten + '-shanten')}</div><p class="side-note">${a.shanten === 1 ? 'One good draw from tenpai.' : `${a.shanten} good draws from tenpai.`}</p>`;
  }
  const row = (y, cls) => `<div class="yrow2 ${cls}"><span class="yn">${yakuLink(esc(y.name))}</span><span class="yh">${y.han >= 13 ? 'Yakuman' : y.han + ' han'}</span><span class="yw">${esc(y.why)}</span></div>`;
  const have = a.have.length ? `<div class="side-h">Yaku you have</div>${a.have.map((y) => row(y, 'have')).join('')}` : '';
  const poss = a.possible.length ? `<div class="side-h">Within reach</div>${a.possible.slice(0, 6).map((y) => row(y, 'poss')).join('')}` : '';
  const doraLine = `<div class="side-h">${ruleLink('dora', 'Dora')}</div><p class="side-note">${a.dora.count ? `${a.dora.count} dora` : 'No dora'}${a.dora.aka ? ` + ${a.dora.aka} red five${a.dora.aka > 1 ? 's' : ''}` : ''} in your hand${a.dora.count + a.dora.aka ? ` — +${a.dora.count + a.dora.aka} han on a win` : ''}.</p>`;
  const standings = [...v.players.keys()].sort((x, y) => v.players[y].score - v.players[x].score).map((i, r) => `<div class="strow${i === v.seat ? ' me' : ''}"><span>${r + 1}</span><span>${esc(v.players[i].name)}</span><span>${v.players[i].score}</span></div>`).join('');
  el.innerHTML = `<div class="side-box">${hand}${have}${poss}${doraLine}</div><div class="side-box"><div class="side-h">Standings</div>${standings}</div>`;
}

function renderOverlay(v) {
  const ov = $('overlay');
  if (mode === 'local' && ui.handoffSeat != null) {
    const name = v.players[ui.handoffSeat].name;
    ov.innerHTML = `<div class="panel handoff"><h2>Pass the device to ${esc(name)}</h2><p class="note">Nobody else should be looking!</p><button class="primary big" id="btn-handoff">I'm ${esc(name)} — show my hand</button></div>`;
    ov.classList.remove('hidden');
    $('btn-handoff').onclick = () => { const seat = ui.handoffSeat; ui.handoffSeat = null; local.shownSeat = seat; localTick(); };
    return;
  }
  if (v.review && v.result) {
    // reviewing a finished hand from the log: its result panel, or its board with the hands as they were
    const label = `Reviewing ${esc(v.round.name)}`;
    if (ui.peek) {
      ov.classList.add('hidden'); ov.innerHTML = '';
      $('peekbar').classList.remove('hidden');
      $('peekbar').innerHTML = `<span>${label} — ${v.result.type === 'win' ? esc(v.players[v.result.wins[0].seat].name) + ' won' : esc(v.result.reason || 'Draw')}</span><button id="btn-unpeek">Show result</button><button class="primary" id="btn-endreview">Back to the game</button>`;
      $('btn-unpeek').onclick = () => { ui.peek = false; render(); };
      $('btn-endreview').onclick = endReview;
      return;
    }
    $('peekbar').classList.add('hidden');
    ov.innerHTML = resultHtml(v).replace('<div class="actions">', `<div class="review-label">${label}</div><div class="actions">`);
    ov.classList.remove('hidden');
    $('btn-peek').onclick = (e) => { e.preventDefault(); ui.peek = true; ui.peekAt = Date.now(); render(); };
    const back = $('btn-endreview'); if (back) back.onclick = endReview;
    return;
  }
  if (v.phase === 'result' && v.result) {
    const key = v.handNo + ':' + v.result.type;
    const fresh = ui.resultShownFor !== key;
    if (fresh) { ui.resultShownFor = key; ui.peek = false; }
    const paint = () => {
      if (!view || view.phase !== 'result') return;
      if (ui.peek) {
        ov.classList.add('hidden'); ov.innerHTML = '';
        $('peekbar').classList.remove('hidden');
        $('peekbar').innerHTML = `<span>${v.result.type === 'win' ? esc(v.players[v.result.wins[0].seat].name) + ' won — all hands shown' : esc(v.result.reason || 'Draw') + ' — tenpai hands shown'}</span><button id="btn-unpeek">Back to result</button>${v.actions.some((a) => a.type === 'next') ? '<button class="primary" id="btn-next2">Next hand</button>' : ''}`;
        $('btn-unpeek').onclick = () => { ui.peek = false; render(); };
        // ignore a Next tap that lands within half a second of opening the peek: it is the tail of the tap that opened it
        const n2 = $('btn-next2'); if (n2) n2.onclick = () => { if (Date.now() - (ui.peekAt || 0) > 500) sendAction({ type: 'next' }); };
        return;
      }
      $('peekbar').classList.add('hidden');
      ov.innerHTML = resultHtml(v);
      ov.classList.remove('hidden');
      const btn = $('btn-next');
      if (btn) btn.onclick = () => sendAction({ type: 'next' });
      $('btn-peek').onclick = (e) => { e.preventDefault(); e.stopPropagation(); ui.peek = true; ui.peekAt = Date.now(); render(); };
    };
    // let the RON / TSUMO callout and the revealed hands land before the panel covers the table
    if (fresh && !reduceMotion && sf() > 0) { ov.classList.add('hidden'); ov.innerHTML = ''; setTimeout(paint, 1400 * sf()); } else paint();
    return;
  }
  if (v.phase === 'over' && v.result) {
    ov.innerHTML = `<div class="panel"><h2>Game over</h2><ol class="ranking">${v.result.ranking.map((r, i) => `<li><span>${i + 1}. ${esc(r.name)}</span><span>${r.score}</span></li>`).join('')}</ol><div class="actions"><button class="primary" id="btn-home">Back to home</button></div></div>`;
    ov.classList.remove('hidden');
    $('btn-home').onclick = () => { if (mode === 'local') localStorage.removeItem('rt-local'); leaveAll(); };
    return;
  }
  ov.classList.add('hidden');
  ov.innerHTML = '';
  $('peekbar').classList.add('hidden');
}

/** Explain how han + fu became the payment. */
function scoreCalcHtml(w, v) {
  const sc = w.score, pay = w.pay;
  const isDealer = w.seat === v.dealer;
  const honba = v.round.honba;
  const r100 = (x) => Math.ceil(x / 100) * 100;
  const lines = [];
  if (sc.yakuman) lines.push(`<span>${esc(sc.limit)}</span><span>${sc.basePoints} base points</span>`);
  else {
    const raw = sc.fu * Math.pow(2, sc.han + 2);
    if (sc.han >= 5) lines.push(`<span>${sc.han} han → ${esc(sc.limit)}</span><span>${sc.basePoints} base points</span>`);
    else {
      lines.push(`<span>${sc.fu} fu × 2<sup>${sc.han} han + 2</sup> = ${sc.fu} × ${Math.pow(2, sc.han + 2)}</span><span>${raw} base points</span>`);
      if (raw > 2000) lines.push(`<span>over 2 000 → capped at mangan</span><span>2 000 base points</span>`);
    }
  }
  const bp = sc.basePoints;
  const sticks = pay.tsumo ? (pay.total - (pay.each ? pay.each * 3 : pay.dealerPays + pay.nonDealerPays * 2)) / 1000 : (pay.total - pay.ron) / 1000;
  if (!pay.tsumo) {
    lines.push(`<span>ron: base × ${isDealer ? '6 (dealer)' : '4'} = ${bp * (isDealer ? 6 : 4)}, rounded up to 100</span><span>${r100(bp * (isDealer ? 6 : 4))}</span>`);
    if (honba) lines.push(`<span>${honba} honba × 300</span><span>+${honba * 300}</span>`);
    lines.push(`<span class="sum">${esc(v.players[w.from].name)} pays</span><span class="sum">${pay.ron}</span>`);
  } else if (isDealer) {
    lines.push(`<span>dealer tsumo: base × 2 from each player = ${bp * 2}, rounded up</span><span>${r100(bp * 2)} each</span>`);
    if (honba) lines.push(`<span>${honba} honba × 100 each</span><span>+${honba * 100} each</span>`);
    lines.push(`<span class="sum">each player pays ${pay.each}</span><span class="sum">${pay.each * 3}</span>`);
  } else {
    lines.push(`<span>tsumo: dealer pays base × 2 = ${bp * 2}, rounded up</span><span>${r100(bp * 2)}</span>`);
    lines.push(`<span>others pay base × 1 = ${bp}, rounded up</span><span>${r100(bp)} each</span>`);
    if (honba) lines.push(`<span>${honba} honba × 100 each</span><span>+${honba * 100} each</span>`);
    lines.push(`<span class="sum">dealer ${pay.dealerPays} + 2 × ${pay.nonDealerPays}</span><span class="sum">${pay.dealerPays + pay.nonDealerPays * 2}</span>`);
  }
  if (sticks > 0) lines.push(`<span>riichi sticks on the table: ${sticks} × 1 000</span><span>+${sticks * 1000}</span>`);
  lines.push(`<span class="sum total-line">Total to ${esc(v.players[w.seat].name)}</span><span class="sum total-line">${pay.total}</span>`);
  return `<div class="calcwrap"><div class="calc-title">${ruleLink('score', 'How the score is worked out')}</div><div class="yaku calc">${lines.join('')}</div></div>`;
}

function resultHtml(v) {
  const r = v.result;
  const canNext = v.actions.some((a) => a.type === 'next');
  const nextBtn = v.review ? `<button class="primary" id="btn-endreview">Back to the game</button>`
    : canNext ? `<button class="primary" id="btn-next">${r.type === 'win' || r.type === 'draw' || r.type === 'abort' ? 'Next hand' : 'Continue'}</button>` : '<span class="note">Waiting for the host to continue…</span>';
  const stickStrip = (score) => `<span class="strip">${sticksFor(score).map(([val, n]) => `<span class="pile">${stickSvg(+val)}<em>×${n}</em></span>`).join('')}</span>`;
  const changes = `<div class="changes">${v.players.map((p, i) => { const c = r.changes[i]; return `<span>${esc(p.name)}${stickStrip(p.score)}</span><span class="${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}">${c > 0 ? '+' : ''}${c || ''}</span><span>${p.score}</span>`; }).join('')}</div>`;
  let body = '';
  if (r.type === 'win') {
    body = r.wins.map((w) => {
      const p = v.players[w.seat];
      // dora: the indicators in play, the ura indicators for a riichi winner, and every dora tile lit in the hand
      const doraKinds = new Set(v.doraIndicators.map((t) => doraOf(kindOf(t))));
      const uraKinds = new Set((w.uraIndicators || []).map((t) => doraOf(kindOf(t))));
      const lit = (html) => html.replace(/<span class="tile([^"]*)"([^>]*?)data-tile="(\d+)"([^>]*?)data-kind="(\d+)"/g, (m, cls, a, tile, b, kind) => {
        const k = +kind;
        const marks = (doraKinds.has(k) || isRedFive(+tile) ? ' is-dora' : '') + (uraKinds.has(k) ? ' is-ura' : '');
        return marks ? `<span class="tile${cls}${marks}"${a}data-tile="${tile}"${b}data-kind="${kind}"` : m;
      });
      const handTiles = lit(sortTiles(w.hand).map((t) => tileHtml(t, { data: { tile: t } })).join('') + tileHtml(w.winTile, { classes: ['drawn'], data: { tile: w.winTile } }));
      const melds = lit(w.melds.map((m) => meldHtmlFor(w.seat, m)).join(''));
      const allTiles = [...w.hand, w.winTile, ...w.melds.flatMap((m) => m.tiles)];
      const nDora = allTiles.filter((t) => doraKinds.has(kindOf(t))).length, nUra = allTiles.filter((t) => uraKinds.has(kindOf(t))).length, nAka = allTiles.filter(isRedFive).length;
      const doraCount = [nDora ? `${nDora} dora` : '', nUra ? `${nUra} ura dora` : '', nAka ? `${nAka} red five${nAka > 1 ? 's' : ''}` : ''].filter(Boolean).join(' + ') || 'no dora';
      const doraRow = `<div class="dora-row">${ruleLink('dora', 'Dora indicator')} ${v.doraIndicators.map((t) => tileHtml(t)).join('')} <span class="arrow">→</span> dora ${v.doraIndicators.map((t) => kindHtml(doraOf(kindOf(t)), ['dora-tile'])).join('')} <span class="dora-count">${doraCount} in the hand</span></div>` +
        `<div class="legend"><span class="sw win"></span>${w.tsumo ? 'tsumo' : 'ron'} tile <span class="sw dora"></span>dora${nUra ? ' <span class="sw ura"></span>ura dora' : ''}</div>`;
      const yaku = w.score.yaku.map((y) => `<span>${/^(Dora|Aka Dora|Ura Dora)$/.test(y.name) ? ruleLink('dora', esc(y.name)) : yakuLink(esc(y.name))}</span><span class="han">${y.yakuman ? 'Yakuman' : y.han + ' han'}</span>`).join('')
        + `<span class="sum">Total</span><span class="han sum">${w.score.yakuman ? w.score.limit : w.score.han + ' han'}</span>`;
      const fu = w.score.yakuman ? '' : `<div class="yaku fu">${(w.score.fuDetail || []).map((f) => `<span>${esc(f.name)}</span><span class="han">${f.fu > 0 ? '+' : ''}${f.fu} fu</span>`).join('')}<span class="sum">Total</span><span class="han sum">${w.score.fu} fu</span></div>`;
      const total = w.tsumo
        ? (w.pay.each ? `${w.pay.each} all` : `${w.pay.nonDealerPays} / ${w.pay.dealerPays}`)
        : `${w.pay.ron} from ${esc(v.players[w.from].name)}`;
      const ura = w.uraIndicators && w.uraIndicators.length ? `<div class="dora-row">${ruleLink('dora', 'Ura indicator')} ${w.uraIndicators.map((t) => tileHtml(t)).join('')} <span class="arrow">→</span> ura dora ${w.uraIndicators.map((t) => kindHtml(doraOf(kindOf(t)), ['ura-tile'])).join('')}</div>` : '';
      return `<h2>${esc(p.name)} wins by ${w.tsumo ? 'tsumo' : 'ron'}</h2><div class="winhand">${handTiles}${melds}</div>${doraRow}${ura}<div class="scorecols"><div class="yaku">${yaku}</div>${fu}</div>${scoreCalcHtml(w, v)}<div class="total">${w.score.limit ? w.score.limit + (w.score.yakuman ? '' : ' · ') : ''}${w.score.yakuman ? '' : `${w.score.han} han ${w.score.fu} fu`}<small>${total}</small></div>`;
    }).join('<hr>');
  } else if (r.type === 'draw') {
    body = `<h2>${ruleLink('draw', 'Exhaustive draw')}</h2><p class="note">${r.tenpai.some(Boolean) ? 'Tenpai: ' + v.players.filter((_, i) => r.tenpai[i]).map((p) => esc(p.name)).join(', ') : 'Nobody was tenpai.'}</p>` +
      r.hands.map((h, i) => h ? `<div><b>${esc(v.players[i].name)}</b><div class="winhand">${sortTiles(h.hand).map((t) => tileHtml(t)).join('')}${h.melds.map((m) => meldHtmlFor(i, m)).join('')}</div></div>` : '').join('');
  } else if (r.type === 'abort') {
    body = `<h2>${ruleLink('draw', 'Abortive draw')}</h2><p class="note">${esc(r.reason)}. The hand is redealt.</p>`;
  }
  return `<div class="panel">${body}${changes}<div class="actions">${nextBtn}<button id="btn-peek" class="ghost">Look at the table</button></div></div>`;
}

// Hovering any face-up tile highlights every other visible copy of that tile (hands, ponds, melds, dora, status).
{
  const game = $('game');
  let litKind = null;
  const light = (kind) => {
    if (litKind != null) game.querySelectorAll('.tile.hl').forEach((el) => el.classList.remove('hl'));
    litKind = kind;
    if (kind != null) game.querySelectorAll(`.tile[data-kind="${kind}"]`).forEach((el) => el.classList.add('hl'));
  };
  game.addEventListener('mouseover', (e) => {
    const ind = e.target.closest('#roundbar .ind');
    if (ind) { const k = +ind.dataset.dora; if (k !== litKind) light(k); return; }
    const t = e.target.closest('.tile[data-kind]');
    if (!t) return;
    const kind = +t.dataset.kind;
    if (kind !== litKind) light(kind);
  });
  game.addEventListener('mouseout', (e) => {
    if (e.target.closest('#roundbar .ind')) { if (!(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#roundbar .ind'))) light(null); return; }
    const t = e.target.closest('.tile[data-kind]');
    if (!t) return;
    const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.tile[data-kind]');
    if (to && +to.dataset.kind === litKind) return; // moving between copies of the same tile
    light(null);
  });
  // re-renders replace the DOM, so re-apply the highlight if the pointer is still over a tile
  const origRender = render;
  render = function () {
    origRender();
    if (litKind == null) return;
    const under = game.querySelector('.tile[data-kind]:hover');
    const k = under ? +under.dataset.kind : null;
    litKind = null;
    light(k);
  };
}

// ---------------------------------------------------------------- help & settings
function openModal(html) {
  const m = $('modal');
  m.innerHTML = `<div class="panel help"><div class="modal-top"><button class="close small ghost" id="btn-modal-close" aria-label="Close">✕ Close</button></div>${html}</div>`;
  m.classList.remove('hidden');
  $('btn-modal-close').onclick = closeModal;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  m.querySelector('.panel').scrollTop = 0;
  m.querySelectorAll('.toc a[href^="#"]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); scrollModalTo(m.querySelector(a.getAttribute('href'))); }; });
}
function closeModal() { $('modal').classList.add('hidden'); $('modal').innerHTML = ''; }

// Which rule set the Settings screen shows, and whether it can be changed here:
//  - home / local setup: this device's preferences (editable)
//  - online lobby: the room's rules (host can change them until the game starts)
//  - in a game: the rules in play (read-only)
function rulesContext() {
  if (view && view.rules) return { rules: view.rules, editable: false, why: 'Rules are fixed once a game has started.' };
  if (mode === 'online' && lobby && !lobby.started) {
    const host = lobby.host === playerId;
    return { rules: lobby.rules, editable: host, why: host ? 'Everyone in the room sees these; they lock when you start.' : 'Only the host can change the rules.' };
  }
  return { rules: rulePref, editable: true, why: 'Used for the next room you create or pass-and-play game you start. Remembered on this device.' };
}
function settingsHtml() {
  const pills = Object.keys(SPEEDS).map((k) => `<button class="pill${k === speed ? ' on' : ''}" data-speed="${k}">${SPEED_LABELS[k]}</button>`).join('');
  const ctx = rulesContext();
  const r = Object.assign({}, DEFAULT_PREF_RULES, ctx.rules || {});
  const toggles = RULE_DEFS.map((d) => {
    const link = d.link[1] === 'yaku' ? yakuLink('yaku') : ruleLink(d.link[0], 'rules');
    return `<label class="toggle${ctx.editable ? '' : ' locked'}"><input type="checkbox" data-rule="${d.key}"${r[d.key] ? ' checked' : ''}${ctx.editable ? '' : ' disabled'}><span class="sw"></span><span class="txt"><b>${d.label}</b><small>${d.desc} <span class="dim">(${link})</span></small></span></label>`;
  }).join('');
  return `<h2>Settings</h2>
<h3>Game rules</h3>
<p class="note">${ctx.why}</p>
<div class="toggles" id="rule-toggles">${toggles}</div>
<h3>Animation speed</h3>
<p class="note">How fast tiles move and how long call announcements stay up. Bots pace their play to match. "Off" skips the animations entirely.</p>
<div class="pills" id="speed-pills">${pills}</div>
<h3>Highlights</h3>
<p class="note">Hover a tile to light up every visible copy of it. Your legal discards glow on your turn; the active player's name plate is lit. The full ${ruleLink('goal', 'rules')} and the ${yakuLink('yaku reference')} are one click away from the top bar.</p>`;
}
function openSettings() {
  openModal(settingsHtml());
  $('rule-toggles').querySelectorAll('input[data-rule]').forEach((cb) => {
    cb.onchange = () => {
      const ctx = rulesContext();
      if (!ctx.editable) return;
      const next = Object.assign({}, DEFAULT_PREF_RULES, ctx.rules || {}, { [cb.dataset.rule]: cb.checked });
      if (mode === 'online' && lobby && !lobby.started) {
        send({ t: 'rules', rules: next });
      } else {
        rulePref = next;
        try { localStorage.setItem('rt-rules', JSON.stringify(rulePref)); } catch {}
        renderRuleSummaries();
      }
    };
  });
  $('speed-pills').querySelectorAll('.pill').forEach((b) => {
    b.onclick = () => {
      speed = b.dataset.speed;
      localStorage.setItem('rt-speed', speed);
      $('speed-pills').querySelectorAll('.pill').forEach((x) => x.classList.toggle('on', x === b));
      if (mode === 'online') send({ t: 'settings', speed });
    };
  });
}
for (const [id, fn] of [['btn-help-rules', () => openModal(rulesHtml())], ['btn-help-yaku', () => openModal(yakuHtml())], ['btn-help-tiles', () => openModal(tilesHtml())], ['btn-settings', openSettings],
  ['home-rules', () => openModal(rulesHtml())], ['home-yaku', () => openModal(yakuHtml())], ['home-tiles', () => openModal(tilesHtml())], ['home-settings', openSettings],
  ['lobby-rules', () => openModal(rulesHtml())], ['lobby-yaku', () => openModal(yakuHtml())], ['lobby-tiles', () => openModal(tilesHtml())], ['lobby-settings', openSettings],
  ['home-rules-edit', openSettings], ['lobby-rules-edit', openSettings]]) {
  const el = $(id);
  if (el) el.onclick = (e) => { e.preventDefault(); fn(); };
}
renderRuleSummaries();

// Keyboard: Escape closes option pickers / riichi mode
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('modal').classList.contains('hidden')) { closeModal(); return; }
  if (view && ui.review != null) { endReview(); return; }
  if (view) { ui.riichiMode = false; ui.optionsFor = null; ui.selected = null; render(); }
});
