// Three-player mahjong (sanma): 108 tiles, no chi, North set aside as a dora, three hands a round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startGame, apply, legalActions, viewFor } from '../shared/game.js';
import { chooseBotAction } from '../shared/bot.js';
import { makeRng, kindOf, doraOf, shuffledWall } from '../shared/tiles.js';
import { scoreHand, payments } from '../shared/yaku.js';

const NORTH = 30;
const three = (extra = {}) => ({ players: 3, ...extra });

function checkTiles(s) {
  const seen = [...s.wall, ...s.rinshan, ...s.doraInd, ...s.uraInd];
  for (const p of s.players) {
    seen.push(...p.hand, ...(p.drawn != null ? [p.drawn] : []), ...p.nuki);
    for (const m of p.melds) seen.push(...m.tiles);
    for (const d of p.discards) if (!d.called) seen.push(d.tile);
  }
  assert.equal(seen.length, 108, 'all 108 tiles are somewhere');
  assert.equal(new Set(seen).size, 108, 'and none twice');
  assert.ok(seen.every((t) => !(kindOf(t) >= 1 && kindOf(t) <= 7)), 'no 2–8 of characters');
}

function playGame(seed, rules = {}) {
  let s = startGame(newGame({ names: ['A', 'B', 'C'], seed, rules: three(rules) }));
  const rng = makeRng(seed);
  const start = s.players.reduce((t, p) => t + p.score, 0);
  const stats = { wins: 0, tsumo: 0, draws: 0, aborts: 0, pons: 0, riichi: 0, kans: 0, nuki: 0, nukiRon: 0, hands: 0, rounds: new Set(), nukiDora: 0 };
  let steps = 0;
  while (s.phase !== 'over' && steps++ < 20000) {
    let acted = false;
    for (let seat = 0; seat < 3; seat++) {
      const acts = legalActions(s, seat);
      if (!acts.length) continue;
      assert.ok(!acts.some((a) => a.type === 'chi'), 'no chi with three players');
      let a = chooseBotAction(s, seat, rng);
      if (s.phase === 'call' && rng() < 0.5) {
        const opts = acts.filter((x) => x.type !== 'pass' && x.type !== 'ron');
        if (opts.length) { const o = opts[Math.floor(rng() * opts.length)]; a = { type: o.type, tiles: o.tiles }; }
      }
      if (s.phase === 'action' && rng() < 0.3) {
        const kakan = acts.find((x) => x.type === 'kakan');
        const ankan = acts.find((x) => x.type === 'ankan');
        if (kakan) a = { type: 'kakan', kind: kakan.kinds[0] };
        else if (ankan) a = { type: 'ankan', kind: ankan.kinds[0] };
      }
      if (a.type === 'riichi') stats.riichi++;
      if (a.type === 'pon' || a.type === 'kan') stats.pons++;
      if (a.type === 'ankan' || a.type === 'kakan') stats.kans++;
      if (a.type === 'nuki') stats.nuki++;
      if (a.type === 'ron' && s.calls.kind === 'nuki') stats.nukiRon++;
      if (a.type === 'next') {
        stats.hands++;
        stats.rounds.add(s.round.wind + ':' + s.round.hand);
        assert.ok(s.round.hand >= 1 && s.round.hand <= 3, 'three hands a round');
        if (s.result.type === 'win') {
          stats.wins++;
          for (const w of s.result.wins) {
            if (w.tsumo) stats.tsumo++;
            const nd = w.score.yaku.find((y) => y.name === 'Nuki-dora');
            assert.equal(nd ? nd.han : 0, w.nuki.length, 'one han for each North set aside');
            stats.nukiDora += w.nuki.length;
          }
        }
        if (s.result.type === 'draw') {
          stats.draws++;
          const n = s.result.tenpai.filter(Boolean).length;
          const paid = s.result.changes.filter((c) => c < 0).reduce((t, c) => t - c, 0);
          assert.equal(paid, n === 0 || n === 3 ? 0 : 2000, 'noten players pay 2000 between them');
        }
        if (s.result.type === 'abort') { stats.aborts++; assert.ok(!/Four same winds|Four riichi/.test(s.result.reason)); }
      }
      s = apply(s, a, seat);
      assert.equal(s.players.reduce((t, p) => t + p.score, 0) + s.round.riichiSticks * 1000, start, 'points are conserved');
      if (s.phase !== 'over') checkTiles(s);
      for (let i = 0; i < 3; i++) {
        const p = s.players[i];
        const n = p.hand.length + (p.drawn != null ? 1 : 0) + p.melds.length * 3;
        if (s.phase === 'action' || s.phase === 'call') assert.ok(n === 13 || n === 14, `hand size ${n}`);
        assert.ok(viewFor(s, i).players[i].seatWind <= 29, 'seats are East, South and West');
      }
      acted = true;
      break;
    }
    assert.ok(acted, 'someone must always have a legal action');
  }
  assert.equal(s.phase, 'over', 'game finishes');
  return { state: s, stats, start };
}

test('three-player: the wall has 108 tiles and 1/9 of characters point at each other', () => {
  const wall = shuffledWall(makeRng(5), true);
  assert.equal(wall.length, 108);
  assert.ok(wall.every((t) => kindOf(t) === 0 || kindOf(t) >= 8));
  assert.equal(doraOf(0, true), 8);
  assert.equal(doraOf(8, true), 0);
  assert.equal(doraOf(0), 1);
  assert.equal(doraOf(9, true), 10);
  assert.equal(doraOf(30, true), 27);
});

test('three-player: a game starts with three seats, 35,000 each and a 40,000 target', () => {
  const s = startGame(newGame({ names: ['A', 'B', 'C', 'D'], seed: 3, rules: three() }));
  assert.equal(s.players.length, 3);
  assert.deepEqual(s.players.map((p) => p.score), [35000, 35000, 35000]);
  assert.equal(s.rules.targetScore, 40000);
  const d = apply(s, { type: 'roll' }, 0);
  assert.equal(d.wall.length, 108 - 14 - 13 * 3 - 1);
  checkTiles(d);
  // and a four-player game is untouched
  const f = startGame(newGame({ seed: 3 }));
  assert.equal(f.players.length, 4);
  assert.equal(f.rules.startScore, 25000);
});

test('three-player: bots play full games (fuzz) with tiles and points conserved', () => {
  const t = { wins: 0, tsumo: 0, draws: 0, pons: 0, riichi: 0, nuki: 0, hands: 0, nukiDora: 0, nukiRon: 0 };
  const rounds = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const { stats } = playGame(seed, seed % 3 === 0 ? { tsumoLoss: false } : {});
    for (const k in t) t[k] += stats[k];
    for (const r of stats.rounds) rounds.add(r);
  }
  assert.ok(t.wins > 40, JSON.stringify(t));
  assert.ok(t.tsumo > 5 && t.riichi > 0 && t.pons > 0 && t.draws > 0, JSON.stringify(t));
  assert.ok(t.nuki > 50, 'North tiles are set aside: ' + JSON.stringify(t));
  assert.ok(t.nukiDora > 0, 'and count in winning hands');
  assert.ok(rounds.has('0:3') && rounds.has('1:1') && !rounds.has('0:4'), 'East 3 is followed by South 1');
});

test('three-player: with the nuki rule off North is never set aside', () => {
  for (let seed = 1; seed <= 4; seed++) assert.equal(playGame(seed, { nuki: false }).stats.nuki, 0);
});

// --- a hand set up by hand: seat 0 (dealer) draws North; seat 1 is waiting on North ---
function setup({ wait = false, riichi = false } = {}) {
  let s = startGame(newGame({ names: ['A', 'B', 'C'], seed: 11, rules: three() }));
  s = apply(s, { type: 'roll' }, 0);
  const pool = [...s.wall, ...s.rinshan, ...s.doraInd, ...s.uraInd, ...s.players.flatMap((p) => [...p.hand, ...(p.drawn != null ? [p.drawn] : [])])];
  const take = (kind) => { const i = pool.findIndex((t) => kindOf(t) === kind); assert.ok(i >= 0, 'tile ' + kind); return pool.splice(i, 1)[0]; };
  const hand = (kinds) => kinds.map(take);
  // seat 0: thirteen scattered tiles, then draws North
  s.players[0].hand = hand([9, 10, 11, 13, 14, 15, 18, 19, 20, 27, 27, 31, 32]);
  s.players[0].drawn = take(NORTH);
  // seat 1: 123p 456p 789p 111s + North (single wait on North), or nothing in particular
  s.players[1].hand = wait ? hand([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 18, 18, NORTH]) : hand([0, 8, 9, 12, 16, 17, 21, 22, 23, 28, 29, 33, 33]);
  s.players[2].hand = hand([0, 0, 8, 8, 21, 22, 24, 25, 26, 28, 28, 29, 29]);
  if (riichi) { s.players[1].riichi = true; s.players[1].ippatsu = true; }
  s.doraInd = hand([20, 20, 23, 23, 24]); s.uraInd = hand([25, 25, 26, 26, 19]); s.rinshan = hand([31, 31, 32, 32]);
  s.wall = pool;
  s.turn = 0; s.phase = 'action';
  return s;
}

test('three-player: setting North aside draws a replacement, counts as a call and turns no new dora', () => {
  const s = setup();
  assert.ok(legalActions(s, 0).some((a) => a.type === 'nuki'));
  assert.ok(legalActions(s, 0).some((a) => a.type === 'kyuushu') === false);
  const wall = s.wall.length;
  const a = apply(s, { type: 'nuki' }, 0);
  assert.equal(a.phase, 'action');
  assert.equal(a.turn, 0);
  assert.equal(a.players[0].nuki.length, 1);
  assert.equal(kindOf(a.players[0].nuki[0]), NORTH);
  assert.equal(kindOf(a.players[0].drawn), 31, 'the replacement comes from the dead wall');
  assert.equal(a.wall.length, wall - 1, 'which is topped up from the end of the wall');
  assert.equal(a.rinshan.length, 4);
  assert.equal(a.doraCount, s.doraCount, 'no new dora indicator');
  assert.ok(a.anyCall && a.players.every((p) => !p.firstTurn), 'first turns are over');
  assert.equal(viewFor(a, 1).players[0].nuki.length, 1, 'everyone sees it');
  checkTiles(a);
});

test('three-player: North set aside can be won on by ron, with ippatsu but not as a robbed kan', () => {
  const s = setup({ wait: true, riichi: true });
  const a = apply(s, { type: 'nuki' }, 0);
  assert.equal(a.phase, 'call');
  assert.deepEqual(viewFor(a, 1).call && viewFor(a, 1).call.kind, 'nuki');
  assert.deepEqual(legalActions(a, 1).map((x) => x.type), ['ron', 'pass']);
  assert.deepEqual(legalActions(a, 2), []);
  const won = apply(a, { type: 'ron' }, 1);
  assert.equal(won.phase, 'result');
  const w = won.result.wins[0];
  assert.equal(w.seat, 1); assert.equal(w.from, 0); assert.equal(w.tsumo, false);
  const names = w.score.yaku.map((y) => y.name);
  assert.ok(names.includes('Ippatsu'), names.join());
  assert.ok(!names.some((n) => /chankan|robbing/i.test(n)), names.join());
  assert.equal(won.result.changes[2], 0);
  assert.equal(won.result.changes[0], -won.result.changes[1]);
  // passing instead: the replacement is drawn, ippatsu is gone and the passer is furiten
  const passed = apply(a, { type: 'pass' }, 1);
  assert.equal(passed.phase, 'action');
  assert.equal(passed.turn, 0);
  assert.ok(passed.players[0].drawn != null);
  assert.equal(passed.players[1].ippatsu, false);
  assert.equal(passed.players[1].riichiFuriten, true);
});

test('three-player: a riichi player may only set aside the North just drawn', () => {
  const s = setup();
  s.players[0].riichi = true;
  assert.ok(legalActions(s, 0).some((a) => a.type === 'nuki'));
  // swap: North in the hand, something else drawn
  const p = s.players[0];
  const n = p.drawn; p.drawn = p.hand[0]; p.hand[0] = n;
  assert.ok(!legalActions(s, 0).some((a) => a.type === 'nuki'));
  p.riichi = false;
  assert.ok(legalActions(s, 0).some((a) => a.type === 'nuki'));
});

test('three-player scoring: nuki-dora, North as dora, 1m indicator, payments', () => {
  const base = {
    concealed: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 18, 18, 30, 30], melds: [], winKind: 30, tsumo: true,
    seatWind: 28, roundWind: 27, riichi: true, doraIndicators: [20], uraIndicators: [20], akaCount: 0, isDealer: false,
  };
  const r3 = { ...newGame({ rules: three() }).rules };
  const plain = scoreHand({ ...base, rules: r3 });
  const two = scoreHand({ ...base, rules: r3, nukiDora: 2 });
  assert.equal(two.han, plain.han + 2);
  assert.equal(two.yaku.find((y) => y.name === 'Nuki-dora').han, 2);
  // West indicator makes North the dora: the pair in the hand and the two set aside all count
  const northDora = scoreHand({ ...base, rules: r3, nukiDora: 2, doraIndicators: [29] });
  assert.equal(northDora.han, plain.han + 2 + 4);
  // 1 of characters as indicator points at 9 of characters
  const m = { ...base, concealed: [8, 8, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 30, 30], doraIndicators: [0], rules: r3 };
  assert.equal(scoreHand(m).han, scoreHand({ ...m, doraIndicators: [20] }).han + 3);
  // tsumo loss: a non-dealer mangan tsumo is 2000/4000 from two players (6000, not 8000); without it 3000/5000
  const loss = payments({ basePoints: 2000, isDealer: false, tsumo: true, players: 3, tsumoLoss: true });
  assert.deepEqual([loss.nonDealerPays, loss.dealerPays, loss.total], [2000, 4000, 6000]);
  const none = payments({ basePoints: 2000, isDealer: false, tsumo: true, players: 3, tsumoLoss: false });
  assert.deepEqual([none.nonDealerPays, none.dealerPays, none.total], [3000, 5000, 8000]);
  const dl = payments({ basePoints: 2000, isDealer: true, tsumo: true, players: 3, tsumoLoss: true });
  assert.deepEqual([dl.each, dl.total], [4000, 8000]);
  const dn = payments({ basePoints: 2000, isDealer: true, tsumo: true, players: 3, tsumoLoss: false });
  assert.deepEqual([dn.each, dn.total], [6000, 12000]);
});
