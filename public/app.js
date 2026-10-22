import { newGame, startGame, apply, viewFor, legalActions, WINDS } from '../shared/game.js';
import { chooseBotAction } from '../shared/bot.js';
import { kindOf, kindName, sortTiles, isRedFive } from '../shared/tiles.js';
import { tileHtml, kindHtml, compassSvg, plaqueSvg, diceSvg, stickSvg, sticksFor } from './tiles.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['home', 'local-setup', 'lobby', 'game'];
const WIND_CHAR = { 27: '東', 28: '南', 29: '西', 30: '北' };
const BOT_DELAY = 900;

function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- state
let mode = null;            // 'online' | 'local'
let ws = null, wsRetry = 0;
let roomCode = null, playerId = null;
let lobby = null;
let local = null;           // { state, humans: bool[], shownSeat, pending:boolean }
let view = null;
const ui = { riichiMode: false, optionsFor: null, logOpen: false, handoffSeat: null, lastSeenHand: -1, peek: false, resultShownFor: null };
let prevView = null;

// ---------------------------------------------------------------- home
$('hero').innerHTML = [27, 33, 0].map((k) => kindHtml(k)).join('');
$('name').value = localStorage.getItem('rt-name') || '';
$('name').addEventListener('input', () => localStorage.setItem('rt-name', $('name').value));

function myName() {
  const n = $('name').value.trim();
  return n || 'Player';
}
function rules() {
  return { hanchan: $('rule-hanchan').checked, aka: $('rule-aka').checked, kuitan: $('rule-kuitan').checked };
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
  if (saved && saved.code && saved.playerId) {
    roomCode = saved.code; playerId = saved.playerId;
    connect(() => send({ t: 'rejoin', code: roomCode, playerId }));
  } else if (code) {
    $('join-code').value = code;
    if ($('name').value) joinRoom(code);
  }
}

// ---------------------------------------------------------------- online
function connect(onOpen) {
  if (ws && ws.readyState === WebSocket.OPEN) { onOpen && onOpen(); return; }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { wsRetry = 0; setConn('Connected'); onOpen && onOpen(); };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => {
    setConn('Reconnecting…');
    if (roomCode && playerId) {
      const delay = Math.min(8000, 500 * 2 ** wsRetry++);
      setTimeout(() => connect(() => send({ t: 'rejoin', code: roomCode, playerId })), delay);
    }
  };
  ws.onerror = () => { $('home-error').textContent = 'Could not reach the server.'; };
}
function send(msg) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function setConn(t) { const el = $('conn-label'); el.textContent = mode === 'online' ? t : ''; el.classList.toggle('off', t !== 'Connected'); }

function handle(msg) {
  switch (msg.t) {
    case 'joined':
      mode = 'online';
      roomCode = msg.code; playerId = msg.playerId;
      sessionStorage.setItem('rt-room', JSON.stringify({ code: roomCode, playerId }));
      history.replaceState(null, '', `/?room=${roomCode}`);
      break;
    case 'lobby':
      lobby = msg; view = null;
      renderLobby();
      show('lobby');
      break;
    case 'view':
      view = msg.view;
      show('game');
      render();
      break;
    case 'error': {
      const screen = SCREENS.find((s) => !$(s).classList.contains('hidden'));
      const el = screen === 'lobby' ? $('lobby-error') : screen === 'game' ? $('status') : $('home-error');
      el.textContent = msg.msg;
      if (screen === 'home' && (/no room|no longer|not in that/i).test(msg.msg)) { sessionStorage.removeItem('rt-room'); roomCode = playerId = null; }
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
    return `<li><span class="seat${p.id === lobby.host ? ' host' : ''}">${wind}</span><span class="who"><b>${esc(p.name)}${p.id === playerId ? ' <span>(you)</span>' : ''}</b><small>${tags || 'Ready'}</small></span><span class="dot${p.connected ? '' : ' off'}"></span></li>`;
  });
  $('lobby-players').innerHTML = seats.join('');
  $('lobby-players').querySelectorAll('.add-bot').forEach((b) => (b.onclick = () => send({ t: 'addBot' })));
  $('lobby-count').textContent = `${lobby.players.length} of 4 filled`;
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
$('btn-start').onclick = () => send({ t: 'start' });
$('btn-leave').onclick = () => leaveAll();

function leaveAll() {
  if (mode === 'online') { send({ t: 'leave' }); sessionStorage.removeItem('rt-room'); roomCode = playerId = null; if (ws) { ws.onclose = null; ws.close(); ws = null; } }
  mode = null; view = null; local = null;
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
    localTimer = setTimeout(act, BOT_DELAY);
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
  ui.riichiMode = false; ui.optionsFor = null;
  if (mode === 'online') { send({ t: 'action', action: a }); return; }
  try { local.state = apply(local.state, a, view.seat); } catch (e) { $('status').textContent = e.message; return; }
  if (a.type === 'next') { local.shownSeat = -1; localStorage.removeItem('rt-local'); }
  localTick();
}

// ---------------------------------------------------------------- render
$('btn-log').onclick = () => { ui.logOpen = !ui.logOpen; $('log').classList.toggle('hidden', !ui.logOpen); };
$('btn-quit').onclick = () => { if (confirm('Leave this game?')) { if (mode === 'local') localStorage.removeItem('rt-local'); leaveAll(); } };

function render() {
  if (!view) return;
  const v = view;
  const before = snapshotTiles();
  $('room-label').innerHTML = mode === 'online' ? `Room <b>${esc(roomCode)}</b>` : 'Pass-and-play';
  setConn(ws && ws.readyState === WebSocket.OPEN ? 'Connected' : (mode === 'online' ? 'Reconnecting…' : ''));
  renderTable(v);
  renderHand(v);
  renderActions(v);
  renderStatus(v);
  $('log').innerHTML = v.log.map((l) => `<div>${esc(l)}</div>`).join('');
  renderOverlay(v);
  animateTiles(before, v);
  announceCalls(prevView, v);
  prevView = v;
}

// ---------------------------------------------------------------- call announcements
// Compare with the previous view: a new meld, a new riichi, or a win shows a big callout on that
// player's side of the table ("PON!", "RIICHI!", "RON!") so nobody misses what just happened.
const CALL_WORDS = { chi: 'CHI', pon: 'PON', kan: 'KAN', ankan: 'KAN', kakan: 'KAN' };
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
      const mine = c.seat === v.seat ? document.querySelectorAll('#hand-area .mymelds .meld') : [];
      const target = (melds.length ? melds[melds.length - 1] : null) || (mine.length ? mine[mine.length - 1] : null);
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
  setTimeout(() => el.classList.add('out'), kind === 'win' ? 1500 : 1100);
  setTimeout(() => el.remove(), kind === 'win' ? 2000 : 1600);
}

// ---------------------------------------------------------------- tile animation (FLIP)
// Every face-up tile carries data-tile (its instance id), so after a re-render we can find where each
// tile was and slide it to where it is now: discards fly from a hand to the pond, called tiles slide
// from the pond into a meld, drawn tiles arrive from the wall, and the hand re-sorts smoothly.
const ANIM = { move: 420, pop: 260 };
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
  const snap = { tiles: new Map(), hands: {}, center: null, handNo: view && view.handNo, seat: view && view.seat };
  if (!view || $('game').classList.contains('hidden')) return snap;
  for (const el of document.querySelectorAll('#table [data-tile], #hand-area [data-tile]')) {
    const key = el.dataset.tile;
    const inMeld = !!el.closest('.meld');
    if (snap.tiles.has(key) && !inMeld) continue; // a called discard still shows dimmed in the pond; the meld copy is the live one
    snap.tiles.set(key, el.getBoundingClientRect());
  }
  for (const b of document.querySelectorAll('#table .pblock')) {
    const h = b.querySelector('.hand');
    if (h) snap.hands[b.dataset.seat] = h.getBoundingClientRect();
  }
  const mine = $('hand-area');
  if (view.seat >= 0 && mine) snap.hands[view.seat] = mine.getBoundingClientRect();
  const c = document.querySelector('#table .center');
  if (c) snap.center = c.getBoundingClientRect();
  return snap;
}

function animateTiles(before, v) {
  if (reduceMotion || !before.tiles) return;
  // a new hand or a different perspective: no travel animation, just let it appear
  if (before.handNo !== v.handNo || before.seat !== v.seat) return;
  const seen = new Set();
  const els = [...document.querySelectorAll('#table .meld [data-tile], #table [data-tile], #hand-area [data-tile], #table [data-drawn]')];
  for (const el of els) {
    const key = el.dataset.tile != null ? el.dataset.tile : 'drawn-' + el.dataset.drawn;
    if (seen.has(key)) continue;
    seen.add(key);
    if (el.closest('.center')) continue;
    const now = el.getBoundingClientRect();
    if (!now.width) continue;
    let from = before.tiles.get(key);
    let pop = false;
    if (!from) {
      // a tile that was hidden until now: discards and meld tiles come from that player's hand, draws from the wall
      const block = el.closest('.pblock');
      const seat = block ? +block.dataset.seat : v.seat;
      if (el.closest('.pond') || el.closest('.meld')) from = before.hands[seat];
      else from = before.center; // my drawn tile / an opponent's drawn tile
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
        { transform: `translate(${lx}px, ${ly}px) scale(${scale}) ${final}`, opacity: pop ? 0.4 : 1 },
        { transform: `translate(0, 0) scale(1) ${final}`, opacity: 1 },
      ],
      { duration: ANIM.move, easing: 'cubic-bezier(.22,.9,.3,1)', fill: 'backwards' },
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
  let html = '';
  for (let i = 0; i < 4; i++) {
    const p = v.players[i];
    const rel = (i - mySeat + 4) % 4;
    const lastSeat = v.lastDiscard && v.lastDiscard.seat === i && (v.phase === 'call');
    const pond = p.discards.map((d, j) => tileHtml(d.tile, {
      rotated: d.riichi, data: { tile: d.tile }, classes: [d.called ? 'called' : '', d.tsumogiri ? 'tsumogiri' : '', (lastSeat && j === p.discards.length - 1) ? 'last' : ''].filter(Boolean),
    })).join('');
    let hand = '';
    if (i !== v.seat) {
      if (p.hand) {
        hand = sortTiles(p.hand).map((t) => tileHtml(t, { data: { tile: t } })).join('') + (p.drawn != null ? tileHtml(p.drawn, { classes: ['drawn'], data: { tile: p.drawn } }) : '');
      } else {
        const n = p.handCount;
        const drawnIdx = n - 1 - p.melds.length * 3 === 13 ? n - 1 : -1; // 14th tile = just drawn
        hand = Array.from({ length: n }, (_, j) => tileHtml(null, { faceDown: true, classes: [j === drawnIdx ? 'drawn' : ''], data: j === drawnIdx ? { drawn: i } : null })).join('');
      }
    }
    const melds = i === v.seat ? '' : p.melds.map((m) => meldHtml(m, i)).join('');
    const offline = v.connected && !v.connected[i] ? '<span class="offline">offline</span>' : '';
    const isTurn = (v.phase === 'action' && v.turn === i) || (v.phase === 'call' && v.waitingOn.includes(i));
    html += `<div class="pblock rel${rel}${isTurn ? ' active' : ''}" data-seat="${i}">
      <div class="stickrow">${p.riichi ? stickSvg(1000) : ''}</div>
      <div class="pond${p.discards.length > 18 ? ' wide' : ''}">${pond}</div>
      <div class="prow"><div class="hand">${hand}</div><div class="melds">${melds}</div></div>
      <div class="pname">${isTurn ? '<span class="turn"></span>' : ''}<span class="wind${v.dealer === i ? ' dealer' : ''}">${WIND_CHAR[p.seatWind]}</span><span>${esc(p.name)}</span><span class="score">${p.score}</span>${p.riichi ? '<span class="riichi">RIICHI</span>' : ''}${offline}</div>
    </div>`;
  }
  const dora = v.doraIndicators.map((t) => tileHtml(t)).join('');
  const dealerRel = (v.dealer - mySeat + 4) % 4;
  const diceSum = v.dice[0] + v.dice[1];
  const honbaSticks = v.round.honba ? Array.from({ length: Math.min(v.round.honba, 6) }, () => stickSvg(100)).join('') : '';
  const potSticks = v.round.riichiSticks ? Array.from({ length: Math.min(v.round.riichiSticks, 6) }, () => stickSvg(1000)).join('') : '';
  html += `<div class="center">
    <div class="compass-wrap">${compassSvg({ dealerRel, diceSum })}
      <div class="plaque-wrap">${plaqueSvg(v.round.wind)}<span class="dice">${diceSvg(v.dice[0])}${diceSvg(v.dice[1])}</span></div>
    </div>
    <div class="info">
      <div class="round">${esc(v.round.name.replace(/ \(.*\)$/, ''))}</div>
      <div class="dora">${dora}</div>
      <div class="wall">${v.wallCount} left</div>
      ${honbaSticks ? `<div class="sticks" title="${v.round.honba} honba">${honbaSticks}${v.round.honba > 6 ? `<span>×${v.round.honba}</span>` : ''}</div>` : ''}
      ${potSticks ? `<div class="sticks" title="${v.round.riichiSticks} riichi sticks in the pot">${potSticks}${v.round.riichiSticks > 6 ? `<span>×${v.round.riichiSticks}</span>` : ''}</div>` : ''}
    </div>
  </div>`;
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
      const called = tileHtml(m.called, { classes: ['called'], data: { tile: m.called } }) + (m.added != null ? tileHtml(m.added, { classes: ['added'], data: { tile: m.added } }) : '');
      const relFrom = m.from == null ? 0 : (m.from - owner + 4) % 4;
      if (relFrom === 3) parts.unshift(called);        // from the left player
      else if (relFrom === 2) parts.splice(1, 0, called); // from across
      else parts.push(called);                         // from the right player
      return parts;
    })();
  return `<div class="meld">${tiles.join('')}</div>`;
}
const meldHtmlFor = (seat, m) => meldHtml(m, seat);

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
  const tiles = sortTiles(me.hand).map((t) => tileHtml(t, { classes: [canDiscard ? (legalTiles.has(t) ? 'legal' : 'illegal') : ''], data: { tile: t }, title: kindName(kindOf(t)) }));
  if (me.drawn != null) tiles.push(tileHtml(me.drawn, { classes: ['drawn', canDiscard ? (legalTiles.has(me.drawn) ? 'legal' : 'illegal') : ''], data: { tile: me.drawn }, title: kindName(kindOf(me.drawn)) }));
  const p = v.players[v.seat];
  const melds = p.melds.length ? `<div class="mymelds">${p.melds.map((m) => meldHtmlFor(v.seat, m)).join('')}</div>` : '';
  area.innerHTML = tiles.join('') + melds;
  area.classList.toggle('my-turn', canDiscard);
  if (canDiscard) {
    area.querySelectorAll('.tile.legal').forEach((el) => {
      el.onclick = () => {
        const t = +el.dataset.tile;
        if (ui.riichiMode) sendAction({ type: 'riichi', tile: t });
        else sendAction({ type: 'discard', tile: t });
      };
    });
  }
}

function renderActions(v) {
  const bar = $('action-bar');
  const acts = v.seat >= 0 ? v.actions : [];
  const b = [];
  const has = (t) => acts.find((a) => a.type === t);
  if (has('tsumo')) b.push(`<button class="win" data-a="tsumo">Tsumo</button>`);
  if (has('ron')) b.push(`<button class="win" data-a="ron">Ron</button>`);
  if (has('riichi')) b.push(`<button class="riichi${ui.riichiMode ? ' active' : ''}" data-a="riichi-mode">Riichi</button>`);
  if (has('pon')) b.push(`<button class="call" data-a="pon">Pon</button>`);
  if (has('chi')) b.push(`<button class="call" data-a="chi">Chi</button>`);
  if (has('kan')) b.push(`<button class="call" data-a="kan">Kan</button>`);
  if (has('ankan')) b.push(`<button class="call" data-a="ankan">Closed kan</button>`);
  if (has('kakan')) b.push(`<button class="call" data-a="kakan">Add kan</button>`);
  if (has('kyuushu')) b.push(`<button data-a="kyuushu">Nine terminals: redeal</button>`);
  if (has('pass')) b.push(`<button data-a="pass">Pass</button>`);
  let options = '';
  if (ui.optionsFor) {
    const list = acts.filter((a) => a.type === ui.optionsFor);
    if (ui.optionsFor === 'pon' || ui.optionsFor === 'chi') {
      options = `<div class="options">${list.map((a, i) => `<span class="opt" data-i="${i}">${a.tiles.map((t) => tileHtml(t)).join('')}${tileHtml(v.lastDiscard.tile, { classes: ['called'] })}</span>`).join('')}</div>`;
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

function renderStatus(v) {
  const st = $('status');
  if (v.seat < 0) { st.textContent = ''; return; }
  const me = v.me;
  let msg = '';
  if (v.phase === 'action') {
    if (v.turn === v.seat) msg = ui.riichiMode ? 'Riichi: choose the tile to discard.' : 'Your turn — pick a tile to discard.';
    else msg = `${esc(v.players[v.turn].name)} is thinking…`;
  } else if (v.phase === 'call') {
    if (v.waitingOn.includes(v.seat)) msg = `${esc(v.players[v.lastDiscard.seat].name)} discarded ${kindName(kindOf(v.lastDiscard.tile))}. Call?`;
    else msg = `Waiting for ${v.waitingOn.map((s) => esc(v.players[s].name)).join(', ')}…`;
  }
  let extra = '';
  if (me && v.phase !== 'result' && v.phase !== 'over') {
    if (me.waits.length) extra = ` <b>Tenpai</b> — waiting on <span class="waits">${me.waits.map((k) => kindHtml(k)).join('')}</span>${me.furiten ? ' <span class="furiten">FURITEN</span>' : ''}`;
    else if (me.shanten >= 0 && me.shanten <= 2) extra = ` ${me.shanten}-shanten`;
  }
  st.innerHTML = msg + extra;
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
        const n2 = $('btn-next2'); if (n2) n2.onclick = () => sendAction({ type: 'next' });
        return;
      }
      $('peekbar').classList.add('hidden');
      ov.innerHTML = resultHtml(v);
      ov.classList.remove('hidden');
      const btn = $('btn-next');
      if (btn) btn.onclick = () => sendAction({ type: 'next' });
      $('btn-peek').onclick = () => { ui.peek = true; render(); };
    };
    // let the RON / TSUMO callout and the revealed hands land before the panel covers the table
    if (fresh && !reduceMotion) { ov.classList.add('hidden'); ov.innerHTML = ''; setTimeout(paint, 1400); } else paint();
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

function resultHtml(v) {
  const r = v.result;
  const canNext = v.actions.some((a) => a.type === 'next');
  const nextBtn = canNext ? `<button class="primary" id="btn-next">${r.type === 'win' || r.type === 'draw' || r.type === 'abort' ? 'Next hand' : 'Continue'}</button>` : '<span class="note">Waiting for the host to continue…</span>';
  const stickStrip = (score) => `<span class="strip">${sticksFor(score).map(([val, n]) => `<span class="pile">${stickSvg(+val)}<em>×${n}</em></span>`).join('')}</span>`;
  const changes = `<div class="changes">${v.players.map((p, i) => { const c = r.changes[i]; return `<span>${esc(p.name)}${stickStrip(p.score)}</span><span class="${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}">${c > 0 ? '+' : ''}${c || ''}</span><span>${p.score}</span>`; }).join('')}</div>`;
  let body = '';
  if (r.type === 'win') {
    body = r.wins.map((w) => {
      const p = v.players[w.seat];
      const handTiles = sortTiles(w.hand).map((t) => tileHtml(t)).join('') + tileHtml(w.winTile, { classes: ['drawn'] });
      const melds = w.melds.map((m) => meldHtmlFor(w.seat, m)).join('');
      const yaku = w.score.yaku.map((y) => `<span>${esc(y.name)}</span><span class="han">${y.yakuman ? 'Yakuman' : y.han + ' han'}</span>`).join('');
      const total = w.tsumo
        ? (w.pay.each ? `${w.pay.each} all` : `${w.pay.nonDealerPays} / ${w.pay.dealerPays}`)
        : `${w.pay.ron} from ${esc(v.players[w.from].name)}`;
      const ura = w.uraIndicators && w.uraIndicators.length ? `<div class="dora-row">Ura dora indicator ${w.uraIndicators.map((t) => tileHtml(t)).join('')}</div>` : '';
      return `<h2>${esc(p.name)} wins by ${w.tsumo ? 'tsumo' : 'ron'}</h2><div class="winhand">${handTiles}${melds}</div>${ura}<div class="yaku">${yaku}</div><div class="total">${w.score.limit ? w.score.limit + (w.score.yakuman ? '' : ' · ') : ''}${w.score.yakuman ? '' : `${w.score.han} han ${w.score.fu} fu`}<small>${total}</small></div>`;
    }).join('<hr>');
  } else if (r.type === 'draw') {
    body = `<h2>Exhaustive draw</h2><p class="note">${r.tenpai.some(Boolean) ? 'Tenpai: ' + v.players.filter((_, i) => r.tenpai[i]).map((p) => esc(p.name)).join(', ') : 'Nobody was tenpai.'}</p>` +
      r.hands.map((h, i) => h ? `<div><b>${esc(v.players[i].name)}</b><div class="winhand">${sortTiles(h.hand).map((t) => tileHtml(t)).join('')}${h.melds.map((m) => meldHtmlFor(i, m)).join('')}</div></div>` : '').join('');
  } else if (r.type === 'abort') {
    body = `<h2>Abortive draw</h2><p class="note">${esc(r.reason)}. The hand is redealt.</p>`;
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
    const t = e.target.closest('.tile[data-kind]');
    if (!t) return;
    const kind = +t.dataset.kind;
    if (kind !== litKind) light(kind);
  });
  game.addEventListener('mouseout', (e) => {
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

// Keyboard: Escape closes option pickers / riichi mode
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && view) { ui.riichiMode = false; ui.optionsFor = null; render(); }
});
