// Riichi mahjong game state machine. Pure-ish: `apply` returns a new state
// object (deep-cloned) and never mutates its input, so it can run on a server
// or in a browser for pass-and-play. Tiles are instances (0..135), see tiles.js.
import {
  kindOf, isRedFive, isTerminalOrHonor, isWind, countsOf, makeRng, shuffledWall, sortTiles,
  kindName, tileName, numOf, suitOf, EAST,
} from './tiles.js';
import { waits as computeWaits, isComplete, shanten } from './hand.js';
import { scoreHand, payments } from './yaku.js';

export const WINDS = ['East', 'South', 'West', 'North'];

export const DEFAULT_RULES = {
  hanchan: true,          // East + South rounds (false = East only)
  startScore: 25000,
  targetScore: 30000,     // needed to end the game after the last hand
  kuitan: true,           // open tanyao allowed
  aka: true,              // red fives count as dora
  doubleYakuman: true,
  multipleRon: true,      // double/triple ron allowed (else closest to discarder wins)
  abortiveDraws: true,    // nine terminals, four winds, four riichi, four kans
  extraRound: true,       // play a West round if nobody reaches targetScore
};

const clone = (s) => JSON.parse(JSON.stringify(s));

export function newGame({ names, rules = {}, seed } = {}) {
  const r = Object.assign({}, DEFAULT_RULES, rules);
  const state = {
    rules: r,
    seed: seed ?? Math.floor(Math.random() * 2 ** 31),
    handNo: 0,
    players: (names || ['East', 'South', 'West', 'North']).slice(0, 4).map((name) => ({
      name, score: r.startScore,
      hand: [], drawn: null, melds: [], discards: [],
      riichi: false, doubleRiichi: false, ippatsu: false,
      riichiFuriten: false, tempFuriten: false, firstTurn: true, kuikae: [],
    })),
    round: { wind: 0, hand: 1, honba: 0, riichiSticks: 0, dealer: 0 },
    wall: [], rinshan: [], doraInd: [], uraInd: [], doraCount: 1, pendingDora: 0,
    kans: 0, kanSeats: [], anyCall: false,
    turn: 0, phase: 'lobby', lastDiscard: null, lastDrawRinshan: false, lastKan: null,
    calls: null, result: null, log: [],
  };
  while (state.players.length < 4) state.players.push(makePlayer('Player ' + (state.players.length + 1), r.startScore));
  return state;
}

function makePlayer(name, score) {
  return {
    name, score, hand: [], drawn: null, melds: [], discards: [],
    riichi: false, doubleRiichi: false, ippatsu: false,
    riichiFuriten: false, tempFuriten: false, firstTurn: true, kuikae: [],
  };
}

export function startGame(state) {
  const s = clone(state);
  s.handNo = 0;
  s.round = { wind: 0, hand: 1, honba: 0, riichiSticks: 0, dealer: 0 };
  for (const p of s.players) p.score = s.rules.startScore;
  s.log = [];
  startHand(s);
  return s;
}

function startHand(s) {
  const rng = makeRng((s.seed + s.handNo * 1000003) >>> 0);
  const wall = shuffledWall(rng);
  s.dice = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)]; // decorative: which wall was broken
  const dead = wall.splice(wall.length - 14, 14);
  s.rinshan = dead.slice(0, 4);
  s.doraInd = dead.slice(4, 9);
  s.uraInd = dead.slice(9, 14);
  s.wall = wall;
  s.doraCount = 1;
  s.pendingDora = 0;
  s.kans = 0;
  s.kanSeats = [];
  s.anyCall = false;
  s.lastDiscard = null;
  s.lastKan = null;
  s.lastDrawRinshan = false;
  s.calls = null;
  s.result = null;
  for (const p of s.players) {
    Object.assign(p, {
      hand: [], drawn: null, melds: [], discards: [],
      riichi: false, doubleRiichi: false, ippatsu: false,
      riichiFuriten: false, tempFuriten: false, firstTurn: true, kuikae: [],
    });
  }
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 4; j++) {
      const seat = (s.round.dealer + j) % 4;
      s.players[seat].hand.push(s.wall.shift());
    }
  }
  for (const p of s.players) p.hand = sortTiles(p.hand);
  s.turn = s.round.dealer;
  s.phase = 'action';
  s.players[s.turn].drawn = s.wall.shift();
  s.log.push(`${roundName(s)} begins. ${s.players[s.round.dealer].name} deals.`);
}

export function roundName(s) {
  return `${WINDS[s.round.wind]} ${s.round.hand}` + (s.round.honba ? ` (${s.round.honba} honba)` : '');
}

export const seatWindOf = (s, seat) => 27 + ((seat - s.round.dealer + 4) % 4);

// ---------- Legal actions ----------

export function legalActions(s, seat) {
  const p = s.players[seat];
  const out = [];
  if (s.phase === 'action' && s.turn === seat) {
    const allTiles = p.drawn != null ? [...p.hand, p.drawn] : [...p.hand];
    // discard
    let discardable;
    if (p.riichi) discardable = p.drawn != null ? [p.drawn] : [];
    else {
      discardable = allTiles.filter((t) => !p.kuikae.includes(kindOf(t)));
      if (!discardable.length) discardable = allTiles; // kuikae can't leave a player with nothing to discard
    }
    if (discardable.length) out.push({ type: 'discard', tiles: discardable });
    // riichi
    if (!p.riichi && p.melds.every((m) => m.type === 'ankan') && p.score >= 1000 && s.wall.length >= 4 && p.drawn != null) {
      const riichiTiles = [];
      const seenKinds = new Set();
      for (const t of allTiles) {
        const key = kindOf(t) * 2 + (isRedFive(t) ? 1 : 0);
        if (seenKinds.has(key)) continue;
        seenKinds.add(key);
        const rest = allTiles.filter((x) => x !== t);
        if (computeWaits(countsOf(rest.map(kindOf)), p.melds.length).length) riichiTiles.push(t);
      }
      if (riichiTiles.length) out.push({ type: 'riichi', tiles: riichiTiles });
    }
    // tsumo
    if (p.drawn != null && winScore(s, seat, kindOf(p.drawn), { tsumo: true })) out.push({ type: 'tsumo' });
    // kans
    if (p.drawn != null && s.wall.length > 0 && s.kans < 4) {
      const counts = countsOf(allTiles.map(kindOf));
      const ankan = [];
      for (let k = 0; k < 34; k++) {
        if (counts[k] !== 4) continue;
        if (p.riichi) {
          if (kindOf(p.drawn) !== k) continue;
          const before = computeWaits(countsOf(p.hand.map(kindOf)), p.melds.length);
          const afterCounts = countsOf(allTiles.map(kindOf)); afterCounts[k] = 0;
          const after = computeWaits(afterCounts, p.melds.length + 1);
          if (before.join() !== after.join()) continue;
          // the kan tile must not be part of any winning decomposition in a different role (approximation: waits unchanged)
        }
        ankan.push(k);
      }
      if (ankan.length) out.push({ type: 'ankan', kinds: ankan });
      if (!p.riichi) {
        const kakan = p.melds.filter((m) => m.type === 'pon' && counts[kindOf(m.tiles[0])] >= 1).map((m) => kindOf(m.tiles[0]));
        if (kakan.length) out.push({ type: 'kakan', kinds: kakan });
      }
    }
    // nine terminals
    if (s.rules.abortiveDraws && p.firstTurn && !s.anyCall && p.drawn != null) {
      const kinds = new Set(allTiles.map(kindOf).filter(isTerminalOrHonor));
      if (kinds.size >= 9) out.push({ type: 'kyuushu' });
    }
  } else if (s.phase === 'call' && s.calls && s.calls.options[seat] && !s.calls.responses[seat]) {
    out.push(...s.calls.options[seat]);
    out.push({ type: 'pass' });
  } else if (s.phase === 'result') {
    out.push({ type: 'next' });
  }
  return out;
}

/** Score a hypothetical win for `seat` on `winKind`. Returns null if no yaku. */
function winScore(s, seat, winKind, { tsumo, rinshan = false, chankan = false, ippatsu, extraTiles = [] }) {
  const p = s.players[seat];
  const handTiles = tsumo ? [...p.hand, p.drawn] : [...p.hand];
  const concealed = handTiles.map(kindOf);
  if (!tsumo) concealed.push(winKind);
  if (!isComplete(countsOf(concealed), p.melds.length)) return null;
  const isDealer = seat === s.round.dealer;
  const firstUninterrupted = p.firstTurn && !s.anyCall;
  const ctx = {
    concealed,
    melds: p.melds.map((m) => ({ type: m.type, kinds: m.tiles.map(kindOf) })),
    winKind, tsumo,
    seatWind: seatWindOf(s, seat), roundWind: 27 + s.round.wind,
    riichi: p.riichi && !p.doubleRiichi, doubleRiichi: p.doubleRiichi,
    ippatsu: ippatsu ?? p.ippatsu,
    rinshan, chankan,
    haitei: tsumo && !rinshan && s.wall.length === 0,
    houtei: !tsumo && !chankan && s.wall.length === 0,
    tenhou: tsumo && isDealer && firstUninterrupted && !rinshan && p.discards.length === 0,
    chiihou: tsumo && !isDealer && firstUninterrupted && !rinshan && p.discards.length === 0,
    doraIndicators: s.doraInd.slice(0, s.doraCount).map(kindOf),
    uraIndicators: s.uraInd.slice(0, s.doraCount).map(kindOf),
    akaCount: s.rules.aka ? [...handTiles, ...extraTiles, ...p.melds.flatMap((m) => m.tiles)].filter(isRedFive).length : 0,
    isDealer,
    rules: s.rules,
  };
  return scoreHand(ctx);
}

function isFuriten(s, seat) {
  const p = s.players[seat];
  if (p.riichiFuriten || p.tempFuriten) return true;
  const w = computeWaits(countsOf(p.hand.map(kindOf)), p.melds.length);
  const discKinds = new Set(p.discards.map((d) => kindOf(d.tile)));
  return w.some((k) => discKinds.has(k));
}

// ---------- Apply ----------

export function apply(state, action, seat) {
  const s = clone(state);
  const legal = legalActions(s, seat);
  const match = legal.find((a) => a.type === action.type);
  if (!match) throw new Error(`Illegal action ${action.type} for seat ${seat}`);
  switch (action.type) {
    case 'discard': {
      if (!match.tiles.includes(action.tile)) throw new Error('Cannot discard that tile');
      doDiscard(s, seat, action.tile, false);
      break;
    }
    case 'riichi': {
      if (!match.tiles.includes(action.tile)) throw new Error('Cannot riichi with that tile');
      doDiscard(s, seat, action.tile, true);
      break;
    }
    case 'tsumo': doTsumo(s, seat); break;
    case 'ankan': {
      if (!match.kinds.includes(action.kind)) throw new Error('Cannot kan that');
      doAnkan(s, seat, action.kind); break;
    }
    case 'kakan': {
      if (!match.kinds.includes(action.kind)) throw new Error('Cannot kan that');
      doKakan(s, seat, action.kind); break;
    }
    case 'kyuushu': endHandAbort(s, 'Nine terminals and honors', seat); break;
    case 'ron': case 'pon': case 'kan': case 'chi': case 'pass': {
      if (action.type === 'chi' || action.type === 'pon') {
        const opt = legal.find((a) => a.type === action.type && sameSet(a.tiles, action.tiles));
        if (!opt) throw new Error('Invalid call tiles');
        s.calls.responses[seat] = { type: action.type, tiles: opt.tiles };
      } else s.calls.responses[seat] = { type: action.type };
      maybeResolveCalls(s);
      break;
    }
    case 'next': nextHand(s); break;
    default: throw new Error('Unknown action');
  }
  return s;
}

const sameSet = (a, b) => a && b && a.length === b.length && [...a].sort().join() === [...b].sort().join();

function removeTile(p, tile) {
  const i = p.hand.indexOf(tile);
  if (i >= 0) { p.hand.splice(i, 1); return; }
  if (p.drawn === tile) { p.drawn = null; return; }
  throw new Error('tile not in hand');
}

function removeKind(p, kind, n) {
  const out = [];
  // prefer non-red copies so the red stays visible in hand if possible
  const cands = [...p.hand].filter((t) => kindOf(t) === kind).sort((a, b) => (isRedFive(a) ? 1 : 0) - (isRedFive(b) ? 1 : 0));
  for (const t of cands) { if (out.length === n) break; out.push(t); }
  for (const t of out) removeTile(p, t);
  return out;
}

function doDiscard(s, seat, tile, riichi) {
  const p = s.players[seat];
  const tsumogiri = p.drawn === tile;
  removeTile(p, tile);
  if (p.drawn != null) { p.hand.push(p.drawn); p.drawn = null; }
  p.hand = sortTiles(p.hand);
  p.kuikae = [];
  p.discards.push({ tile, tsumogiri, riichi, called: false });
  if (riichi) {
    p.riichi = true;
    p.doubleRiichi = p.firstTurn && !s.anyCall;
    p.ippatsu = true;
    p.score -= 1000;
    s.round.riichiSticks++;
    s.log.push(`${p.name} declares ${p.doubleRiichi ? 'double ' : ''}riichi.`);
  } else {
    p.ippatsu = false;
  }
  p.firstTurn = false;
  s.lastDiscard = { seat, tile };
  s.lastDrawRinshan = false;
  if (s.pendingDora) { s.doraCount = Math.min(5, s.doraCount + s.pendingDora); s.pendingDora = 0; }
  // Offer calls
  const options = collectCallOptions(s, seat, tile);
  if (Object.keys(options).length) {
    s.phase = 'call';
    s.calls = { kind: 'discard', from: seat, tile, options, responses: {} };
  } else {
    afterDiscardPassed(s);
  }
}

function collectCallOptions(s, from, tile) {
  const kind = kindOf(tile);
  const options = {};
  for (let i = 1; i < 4; i++) {
    const seat = (from + i) % 4;
    const p = s.players[seat];
    const opts = [];
    const concealed = [...p.hand.map(kindOf), kind];
    if (isComplete(countsOf(concealed), p.melds.length) && !isFuriten(s, seat) &&
        winScore(s, seat, kind, { tsumo: false, extraTiles: [tile] })) {
      opts.push({ type: 'ron' });
    }
    if (!p.riichi && s.wall.length > 0) {
      const counts = countsOf(p.hand.map(kindOf));
      if (counts[kind] >= 2) {
        // pon options: distinct by red-five composition
        const same = p.hand.filter((t) => kindOf(t) === kind);
        const combos = new Map();
        for (let a = 0; a < same.length; a++) for (let b = a + 1; b < same.length; b++) {
          const key = [isRedFive(same[a]), isRedFive(same[b])].sort().join();
          if (!combos.has(key)) combos.set(key, [same[a], same[b]]);
        }
        for (const tiles of combos.values()) opts.push({ type: 'pon', tiles });
      }
      if (counts[kind] === 3 && s.kans < 4) opts.push({ type: 'kan' });
      if (i === 1 && kind < 27) {
        const n = numOf(kind);
        const pairsOfKinds = [];
        if (n >= 3) pairsOfKinds.push([kind - 2, kind - 1]);
        if (n >= 2 && n <= 8) pairsOfKinds.push([kind - 1, kind + 1]);
        if (n <= 7) pairsOfKinds.push([kind + 1, kind + 2]);
        for (const [ka, kb] of pairsOfKinds) {
          const as = p.hand.filter((t) => kindOf(t) === ka);
          const bs = p.hand.filter((t) => kindOf(t) === kb);
          const seen = new Set();
          for (const a of as) for (const b of bs) {
            const key = isRedFive(a) + ',' + isRedFive(b);
            if (seen.has(key)) continue;
            seen.add(key);
            opts.push({ type: 'chi', tiles: [a, b] });
          }
        }
      }
    }
    if (opts.length) options[seat] = opts;
  }
  return options;
}

function maybeResolveCalls(s) {
  const c = s.calls;
  const seats = Object.keys(c.options).map(Number);
  if (!seats.every((seat) => c.responses[seat])) return;
  const resp = seats.map((seat) => ({ seat, ...c.responses[seat] })).filter((r) => r.type !== 'pass');
  const rons = resp.filter((r) => r.type === 'ron');
  if (rons.length) {
    // order by closeness to discarder
    rons.sort((a, b) => ((a.seat - c.from + 4) % 4) - ((b.seat - c.from + 4) % 4));
    const winners = s.rules.multipleRon ? rons : [rons[0]];
    endHandWin(s, winners.map((r) => ({ seat: r.seat, from: c.from, tile: c.tile, tsumo: false, chankan: c.kind === 'chankan' })));
    return;
  }
  if (c.kind === 'chankan') {
    s.calls = null;
    s.phase = 'action';
    drawRinshan(s, s.lastKan.seat, true);
    return;
  }
  const kanOrPon = resp.find((r) => r.type === 'kan') || resp.find((r) => r.type === 'pon');
  const chi = resp.find((r) => r.type === 'chi');
  const win = kanOrPon || chi;
  s.calls = null;
  if (!win) { afterDiscardPassed(s); return; }
  const p = s.players[win.seat];
  const from = s.players[c.from];
  from.discards[from.discards.length - 1].called = true;
  // a call interrupts everyone's first turn and ippatsu
  s.anyCall = true;
  for (const q of s.players) { q.firstTurn = false; q.ippatsu = false; }
  markPassedWaits(s, c.from, c.tile, [win.seat]);
  if (win.type === 'pon') {
    for (const t of win.tiles) removeTile(p, t);
    p.melds.push({ type: 'pon', tiles: [...win.tiles, c.tile], from: c.from, called: c.tile });
    p.kuikae = [kindOf(c.tile)];
    s.log.push(`${p.name} calls pon on ${tileName(c.tile)}.`);
    s.turn = win.seat; s.phase = 'action'; p.drawn = null;
  } else if (win.type === 'chi') {
    for (const t of win.tiles) removeTile(p, t);
    const tiles = sortTiles([...win.tiles, c.tile]);
    p.melds.push({ type: 'chi', tiles, from: c.from, called: c.tile });
    const ks = tiles.map(kindOf);
    const ck = kindOf(c.tile);
    const kuikae = [ck];
    if (ck === ks[0] && numOf(ks[2]) <= 8) kuikae.push(ks[2] + 1);
    if (ck === ks[2] && numOf(ks[0]) >= 2) kuikae.push(ks[0] - 1);
    p.kuikae = kuikae;
    s.log.push(`${p.name} calls chi on ${tileName(c.tile)}.`);
    s.turn = win.seat; s.phase = 'action'; p.drawn = null;
  } else if (win.type === 'kan') {
    const tiles = removeKind(p, kindOf(c.tile), 3);
    p.melds.push({ type: 'kan', tiles: [...tiles, c.tile], from: c.from, called: c.tile });
    s.kans++; s.kanSeats.push(win.seat);
    s.pendingDora++;
    s.lastKan = { seat: win.seat, kind: kindOf(c.tile), type: 'kan' };
    s.log.push(`${p.name} calls kan on ${tileName(c.tile)}.`);
    s.turn = win.seat; s.phase = 'action';
    drawRinshan(s, win.seat, false);
  }
}

function markPassedWaits(s, from, tile, exclude = []) {
  const kind = kindOf(tile);
  for (let seat = 0; seat < 4; seat++) {
    if (seat === from || exclude.includes(seat)) continue;
    const p = s.players[seat];
    const w = computeWaits(countsOf(p.hand.map(kindOf)), p.melds.length);
    if (w.includes(kind)) {
      p.tempFuriten = true;
      if (p.riichi) p.riichiFuriten = true;
    }
  }
}

function afterDiscardPassed(s) {
  const { seat, tile } = s.lastDiscard;
  markPassedWaits(s, seat, tile);
  s.calls = null;
  if (s.rules.abortiveDraws) {
    // four winds
    const firsts = s.players.map((p) => p.discards[0]);
    if (!s.anyCall && firsts.every(Boolean) && s.players.every((p) => p.discards.length === 1)) {
      const k = kindOf(firsts[0].tile);
      if (isWind(k) && firsts.every((d) => kindOf(d.tile) === k)) { endHandAbort(s, 'Four same winds'); return; }
    }
    if (s.players.every((p) => p.riichi)) { endHandAbort(s, 'Four riichi'); return; }
    if (s.kans === 4 && new Set(s.kanSeats).size > 1) { endHandAbort(s, 'Four kans'); return; }
  }
  if (s.wall.length === 0) { endHandExhaustive(s); return; }
  const next = (seat + 1) % 4;
  drawTile(s, next);
}

function drawTile(s, seat) {
  const p = s.players[seat];
  p.tempFuriten = false;
  p.drawn = s.wall.shift();
  s.turn = seat;
  s.phase = 'action';
  s.lastDrawRinshan = false;
}

function drawRinshan(s, seat, afterChankan) {
  const p = s.players[seat];
  p.tempFuriten = false;
  p.drawn = s.rinshan.shift();
  s.rinshan.push(s.wall.pop()); // keep the dead wall at 14
  s.turn = seat;
  s.phase = 'action';
  s.lastDrawRinshan = true;
  void afterChankan;
}

function doAnkan(s, seat, kind) {
  const p = s.players[seat];
  const all = [...p.hand, p.drawn];
  const tiles = all.filter((t) => kindOf(t) === kind);
  for (const t of tiles) removeTile(p, t);
  if (p.drawn != null) { p.hand.push(p.drawn); p.drawn = null; }
  p.hand = sortTiles(p.hand);
  p.melds.push({ type: 'ankan', tiles, from: seat, called: null });
  s.kans++; s.kanSeats.push(seat);
  s.doraCount = Math.min(5, s.doraCount + 1);
  s.anyCall = true;
  for (const q of s.players) { q.ippatsu = false; q.firstTurn = false; }
  s.lastKan = { seat, kind, type: 'ankan' };
  s.log.push(`${p.name} declares a closed kan of ${kindName(kind)}.`);
  drawRinshan(s, seat, false);
}

function doKakan(s, seat, kind) {
  const p = s.players[seat];
  const meld = p.melds.find((m) => m.type === 'pon' && kindOf(m.tiles[0]) === kind);
  const tile = [...p.hand, p.drawn].find((t) => t != null && kindOf(t) === kind);
  removeTile(p, tile);
  if (p.drawn != null) { p.hand.push(p.drawn); p.drawn = null; }
  p.hand = sortTiles(p.hand);
  meld.type = 'kakan';
  meld.tiles.push(tile);
  meld.added = tile;
  s.kans++; s.kanSeats.push(seat);
  s.pendingDora++;
  s.anyCall = true;
  for (const q of s.players) { q.ippatsu = false; q.firstTurn = false; }
  s.lastKan = { seat, kind, type: 'kakan' };
  s.log.push(`${p.name} adds to kan: ${kindName(kind)}.`);
  // chankan window
  const options = {};
  for (let i = 1; i < 4; i++) {
    const other = (seat + i) % 4;
    const q = s.players[other];
    const concealed = [...q.hand.map(kindOf), kind];
    if (isComplete(countsOf(concealed), q.melds.length) && !isFuriten(s, other) &&
        winScore(s, other, kind, { tsumo: false, chankan: true, extraTiles: [tile] })) {
      options[other] = [{ type: 'ron' }];
    }
  }
  if (Object.keys(options).length) {
    s.phase = 'call';
    s.calls = { kind: 'chankan', from: seat, tile, options, responses: {} };
  } else {
    drawRinshan(s, seat, false);
  }
}

function doTsumo(s, seat) {
  const p = s.players[seat];
  endHandWin(s, [{ seat, from: seat, tile: p.drawn, tsumo: true, rinshan: s.lastDrawRinshan }]);
}

// ---------- Hand endings ----------

function endHandWin(s, wins) {
  const changes = [0, 0, 0, 0];
  const results = [];
  let sticks = s.round.riichiSticks;
  for (const w of wins) {
    const p = s.players[w.seat];
    const score = winScore(s, w.seat, kindOf(w.tile), { tsumo: w.tsumo, rinshan: !!w.rinshan, chankan: !!w.chankan, extraTiles: w.tsumo ? [] : [w.tile] });
    if (!score) throw new Error('win without yaku');
    const isDealer = w.seat === s.round.dealer;
    const pay = payments({ basePoints: score.basePoints, isDealer, tsumo: w.tsumo, honba: s.round.honba, riichiSticks: sticks });
    if (w.tsumo) {
      for (let i = 0; i < 4; i++) {
        if (i === w.seat) continue;
        const amt = isDealer ? pay.each : (i === s.round.dealer ? pay.dealerPays : pay.nonDealerPays);
        changes[i] -= amt;
        changes[w.seat] += amt;
      }
    } else {
      changes[w.from] -= pay.ron;
      changes[w.seat] += pay.ron;
    }
    changes[w.seat] += sticks * 1000;
    sticks = 0;
    const handTiles = w.tsumo ? [...p.hand] : [...p.hand];
    results.push({
      seat: w.seat, from: w.from, tsumo: w.tsumo, winTile: w.tile,
      hand: handTiles, melds: p.melds, score, pay,
      uraIndicators: p.riichi ? s.uraInd.slice(0, s.doraCount) : [],
    });
    s.log.push(`${p.name} wins by ${w.tsumo ? 'tsumo' : 'ron'}: ${score.yaku.map((y) => y.name).join(', ')} — ${score.han} han ${score.fu} fu${score.limit ? ' (' + score.limit + ')' : ''}.`);
  }
  s.round.riichiSticks = 0;
  for (let i = 0; i < 4; i++) s.players[i].score += changes[i];
  s.phase = 'result';
  s.result = { type: 'win', wins: results, changes, dealerRetains: wins.some((w) => w.seat === s.round.dealer), hands: revealHands(s) };
}

function endHandExhaustive(s) {
  const tenpai = s.players.map((p) => computeWaits(countsOf(p.hand.map(kindOf)), p.melds.length).length > 0);
  const n = tenpai.filter(Boolean).length;
  const changes = [0, 0, 0, 0];
  if (n > 0 && n < 4) {
    for (let i = 0; i < 4; i++) changes[i] = tenpai[i] ? 3000 / n : -3000 / (4 - n);
  }
  for (let i = 0; i < 4; i++) s.players[i].score += changes[i];
  s.phase = 'result';
  s.log.push('Exhaustive draw. Tenpai: ' + (n ? s.players.filter((_, i) => tenpai[i]).map((p) => p.name).join(', ') : 'nobody') + '.');
  s.result = { type: 'draw', reason: 'Exhaustive draw', tenpai, changes, dealerRetains: tenpai[s.round.dealer], hands: revealHands(s, tenpai) };
}

function endHandAbort(s, reason, seat) {
  s.phase = 'result';
  s.calls = null;
  s.log.push(`Abortive draw: ${reason}.`);
  s.result = { type: 'abort', reason, by: seat, changes: [0, 0, 0, 0], dealerRetains: true, hands: revealHands(s) };
}

function revealHands(s, only) {
  return s.players.map((p, i) => (only && !only[i]) ? null : { hand: [...p.hand, ...(p.drawn != null ? [p.drawn] : [])], melds: p.melds });
}

function nextHand(s) {
  const r = s.result;
  const retains = r.dealerRetains;
  if (r.type === 'win') s.round.honba = retains ? s.round.honba + 1 : 0;
  else s.round.honba++;
  const lastWind = s.rules.hanchan ? 1 : 0;
  const top = Math.max(...s.players.map((p) => p.score));
  const dealer = s.players[s.round.dealer];
  const isLastHand = s.round.wind >= lastWind && s.round.hand === 4;
  // busted
  if (s.players.some((p) => p.score < 0)) { endGame(s); return; }
  if (retains) {
    if (isLastHand && dealer.score === top && dealer.score >= s.rules.targetScore && r.type === 'win') { endGame(s); return; }
    if (s.round.wind > lastWind && top >= s.rules.targetScore) { endGame(s); return; }
  } else {
    s.round.dealer = (s.round.dealer + 1) % 4;
    s.round.hand++;
    if (s.round.hand > 4) { s.round.hand = 1; s.round.wind++; }
    if (s.round.wind > lastWind) {
      if (top >= s.rules.targetScore || !s.rules.extraRound || s.round.wind > lastWind + 1) { endGame(s); return; }
    }
  }
  s.handNo++;
  startHand(s);
}

function endGame(s) {
  // leftover riichi sticks go to the leader
  if (s.round.riichiSticks) {
    const lead = s.players.reduce((a, p, i) => (p.score > s.players[a].score ? i : a), 0);
    s.players[lead].score += s.round.riichiSticks * 1000;
    s.round.riichiSticks = 0;
  }
  s.phase = 'over';
  const order = s.players.map((p, i) => ({ seat: i, name: p.name, score: p.score })).sort((a, b) => b.score - a.score || a.seat - b.seat);
  s.result = { type: 'over', ranking: order, hands: null };
  s.log.push('Game over. ' + order.map((o, i) => `${i + 1}. ${o.name} ${o.score}`).join('  '));
}

// ---------- Views ----------

/** What a given seat is allowed to see. Pass seat = -1 for a spectator. */
export function viewFor(s, seat) {
  const reveal = s.phase === 'result' || s.phase === 'over';
  const me = seat >= 0 ? s.players[seat] : null;
  const view = {
    seat,
    phase: s.phase,
    turn: s.turn,
    round: { ...s.round, name: roundName(s) },
    wallCount: s.wall.length,
    doraIndicators: s.doraInd.slice(0, s.doraCount),
    dice: s.dice || [1, 1],
    dealer: s.round.dealer,
    lastDiscard: s.lastDiscard,
    lastKan: s.lastKan,
    players: s.players.map((p, i) => ({
      name: p.name, score: p.score, discards: p.discards, melds: p.melds,
      riichi: p.riichi, ippatsu: p.ippatsu, handCount: p.hand.length + (p.drawn != null ? 1 : 0),
      hand: (i === seat || reveal) ? p.hand : null,
      drawn: (i === seat || reveal) ? p.drawn : null,
      seatWind: seatWindOf(s, i),
    })),
    me: me ? {
      hand: me.hand, drawn: me.drawn, riichi: me.riichi,
      waits: me.riichi || true ? computeWaits(countsOf(me.hand.map(kindOf)), me.melds.length) : [],
      shanten: shanten(countsOf([...me.hand, ...(me.drawn != null ? [me.drawn] : [])].map(kindOf)), me.melds.length),
      furiten: isFuriten(s, seat),
    } : null,
    actions: seat >= 0 ? legalActions(s, seat) : [],
    waitingOn: s.phase === 'call' ? Object.keys(s.calls.options).map(Number).filter((x) => !s.calls.responses[x]) : (s.phase === 'action' ? [s.turn] : []),
    result: s.result,
    log: s.log.slice(-12),
    handNo: s.handNo,
    rules: s.rules,
  };
  return view;
}

export { kindOf, tileName, kindName, suitOf, numOf, isRedFive, sortTiles, EAST };
