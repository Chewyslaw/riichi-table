import { newGame, startGame, apply, viewFor, legalActions, WINDS } from '../shared/game.js';
import { chooseBotAction } from '../shared/bot.js';
import { kindOf, kindName, sortTiles, isRedFive } from '../shared/tiles.js';
import { tileHtml, kindHtml } from './tiles.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['home', 'local-setup', 'lobby', 'game'];
const WIND_CHAR = { 27: '東', 28: '南', 29: '西', 30: '北' };
const BOT_DELAY = 550;

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
const ui = { riichiMode: false, optionsFor: null, logOpen: false, handoffSeat: null, lastSeenHand: -1 };

// ---------------------------------------------------------------- home
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
  ws.onopen = () => { wsRetry = 0; setConn('connected'); onOpen && onOpen(); };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => {
    setConn('reconnecting…');
    if (roomCode && playerId) {
      const delay = Math.min(8000, 500 * 2 ** wsRetry++);
      setTimeout(() => connect(() => send({ t: 'rejoin', code: roomCode, playerId })), delay);
    }
  };
  ws.onerror = () => { $('home-error').textContent = 'Could not reach the server.'; };
}
function send(msg) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function setConn(t) { $('conn-label').textContent = mode === 'online' ? t : ''; }

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
  $('lobby-code').textContent = lobby.code;
  const link = `${location.origin}/?room=${lobby.code}`;
  $('lobby-link').value = link;
  const isHost = lobby.host === playerId;
  $('lobby-players').innerHTML = lobby.players.map((p) =>
    `<li><span>${esc(p.name)}${p.id === playerId ? ' (you)' : ''}</span><span class="tag">${WINDS[p.seat]}${p.bot ? ' · bot' : ''}${p.id === lobby.host ? ' · host' : ''}${!p.connected ? ' · offline' : ''}</span></li>`).join('');
  $('btn-addbot').classList.toggle('hidden', !isHost || lobby.players.length >= 4);
  $('btn-removebot').classList.toggle('hidden', !isHost || !lobby.players.some((p) => p.bot));
  $('btn-start').classList.toggle('hidden', !isHost);
  $('lobby-hint').textContent = isHost
    ? (lobby.players.length < 4 ? `${4 - lobby.players.length} empty seat(s) will be filled by bots when you start.` : 'All seats filled. Start when ready.')
    : 'Waiting for the host to start the game…';
  $('lobby-error').textContent = '';
}
$('btn-copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('lobby-link').value); $('btn-copy').textContent = 'Copied!'; setTimeout(() => ($('btn-copy').textContent = 'Copy link'), 1500); }
  catch { $('lobby-link').select(); }
};
$('btn-addbot').onclick = () => send({ t: 'addBot' });
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
  $('room-label').textContent = mode === 'online' ? `Room ${roomCode}` : 'Pass-and-play';
  setConn(ws && ws.readyState === WebSocket.OPEN ? 'connected' : (mode === 'online' ? 'reconnecting…' : ''));
  renderTable(v);
  renderHand(v);
  renderActions(v);
  renderStatus(v);
  $('log').innerHTML = v.log.map((l) => `<div>${esc(l)}</div>`).join('');
  renderOverlay(v);
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
      rotated: d.riichi, classes: [d.called ? 'called' : '', d.tsumogiri ? 'tsumogiri' : '', (lastSeat && j === p.discards.length - 1) ? 'last' : ''].filter(Boolean),
    })).join('');
    let hand = '';
    if (i !== v.seat) {
      if (p.hand) {
        hand = sortTiles(p.hand).map((t) => tileHtml(t)).join('') + (p.drawn != null ? tileHtml(p.drawn, { classes: ['drawn'] }) : '');
      } else {
        const n = p.handCount;
        hand = Array.from({ length: n }, (_, j) => tileHtml(null, { faceDown: true, classes: [j === 13 ? 'drawn' : ''] })).join('');
      }
    }
    const melds = i === v.seat ? '' : p.melds.map((m) => meldHtml(m, i)).join('');
    const offline = v.connected && !v.connected[i] ? '<span class="offline">offline</span>' : '';
    const isTurn = (v.phase === 'action' && v.turn === i) || (v.phase === 'call' && v.waitingOn.includes(i));
    html += `<div class="pblock rel${rel}">
      <div class="pond${p.discards.length > 18 ? ' wide' : ''}">${pond}</div>
      <div class="prow"><div class="hand">${hand}</div><div class="melds">${melds}</div></div>
      <div class="pname">${isTurn ? '<span class="turn"></span>' : ''}<span class="wind${v.dealer === i ? ' dealer' : ''}">${WIND_CHAR[p.seatWind]}</span><span>${esc(p.name)}</span><span class="score">${p.score}</span>${p.riichi ? '<span class="riichi">RIICHI</span>' : ''}${offline}</div>
    </div>`;
  }
  const dora = v.doraIndicators.map((t) => tileHtml(t)).join('');
  html += `<div class="center">
    <div class="round">${esc(v.round.name)}</div>
    <div class="sticks">${v.round.riichiSticks ? `riichi ×${v.round.riichiSticks} ` : ''}${v.round.honba ? `honba ${v.round.honba}` : ''}</div>
    <div class="dora">${dora}</div>
    <div class="wall">${v.wallCount} tiles left</div>
  </div>`;
  $('table').innerHTML = html;
  void reveal;
}

function meldHtml(m, owner) {
  const tiles = m.type === 'ankan'
    ? [tileHtml(null, { faceDown: true }), tileHtml(m.tiles[1]), tileHtml(m.tiles[2]), tileHtml(null, { faceDown: true })]
    : (() => {
      // show called tile rotated; place it on the side it came from (left = kamicha, middle = toimen, right = shimocha)
      const rest = m.tiles.filter((t) => t !== m.called && t !== m.added);
      const parts = rest.map((t) => tileHtml(t));
      const called = tileHtml(m.called, { classes: ['called'] }) + (m.added != null ? tileHtml(m.added, { classes: ['added'] }) : '');
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
    if (me.waits.length) extra = ` Tenpai — waiting on <span class="waits">${me.waits.map((k) => kindHtml(k)).join('')}</span>${me.furiten ? ' <span class="furiten">FURITEN</span>' : ''}`;
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
    ov.innerHTML = resultHtml(v);
    ov.classList.remove('hidden');
    const btn = $('btn-next');
    if (btn) btn.onclick = () => sendAction({ type: 'next' });
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
}

function resultHtml(v) {
  const r = v.result;
  const canNext = v.actions.some((a) => a.type === 'next');
  const nextBtn = canNext ? `<button class="primary" id="btn-next">${r.type === 'win' || r.type === 'draw' || r.type === 'abort' ? 'Next hand' : 'Continue'}</button>` : '<span class="note">Waiting for the host to continue…</span>';
  const changes = `<div class="changes">${v.players.map((p, i) => { const c = r.changes[i]; return `<span>${esc(p.name)}</span><span class="${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}">${c > 0 ? '+' : ''}${c || ''}</span><span>${p.score}</span>`; }).join('')}</div>`;
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
      const limit = w.score.limit ? ` · ${w.score.limit}` : '';
      const ura = w.uraIndicators && w.uraIndicators.length ? `<div class="dora-row">Ura dora indicator ${w.uraIndicators.map((t) => tileHtml(t)).join('')}</div>` : '';
      return `<h2>${esc(p.name)} wins by ${w.tsumo ? 'tsumo' : 'ron'}</h2><div class="winhand">${handTiles}${melds}</div>${ura}<div class="yaku">${yaku}</div><div class="total">${w.score.yakuman ? '' : `${w.score.han} han ${w.score.fu} fu`}${limit} — ${total}</div>`;
    }).join('<hr>');
  } else if (r.type === 'draw') {
    body = `<h2>Exhaustive draw</h2><p class="note">${r.tenpai.some(Boolean) ? 'Tenpai: ' + v.players.filter((_, i) => r.tenpai[i]).map((p) => esc(p.name)).join(', ') : 'Nobody was tenpai.'}</p>` +
      r.hands.map((h, i) => h ? `<div><b>${esc(v.players[i].name)}</b><div class="winhand">${sortTiles(h.hand).map((t) => tileHtml(t)).join('')}${h.melds.map((m) => meldHtmlFor(i, m)).join('')}</div></div>` : '').join('');
  } else if (r.type === 'abort') {
    body = `<h2>Abortive draw</h2><p class="note">${esc(r.reason)}. The hand is redealt.</p>`;
  }
  return `<div class="panel">${body}${changes}<div class="actions">${nextBtn}</div></div>`;
}

// Keyboard: Escape closes option pickers / riichi mode
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && view) { ui.riichiMode = false; ui.optionsFor = null; render(); }
});
