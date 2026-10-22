import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startGame, apply, legalActions, viewFor } from '../shared/game.js';
import { chooseBotAction } from '../shared/bot.js';
import { makeRng, kindOf } from '../shared/tiles.js';

function playGame(seed, { maxSteps = 20000 } = {}) {
  let s = startGame(newGame({ names: ['A', 'B', 'C', 'D'], seed }));
  const rng = makeRng(seed);
  let steps = 0;
  const stats = { wins: 0, draws: 0, aborts: 0, calls: 0, riichi: 0, kans: 0 };
  while (s.phase !== 'over' && steps++ < maxSteps) {
    let acted = false;
    for (let seat = 0; seat < 4; seat++) {
      const acts = legalActions(s, seat);
      if (!acts.length) continue;
      let a = chooseBotAction(s, seat, rng);
      // occasionally take random calls to exercise more code paths
      if (s.phase === 'call' && rng() < 0.5) {
        const opts = acts.filter((x) => x.type !== 'pass' && x.type !== 'ron');
        if (opts.length) {
          const o = opts[Math.floor(rng() * opts.length)];
          a = { type: o.type, tiles: o.tiles };
        }
      }
      if (s.phase === 'action' && rng() < 0.3) {
        const kakan = acts.find((x) => x.type === 'kakan');
        const ankan = acts.find((x) => x.type === 'ankan');
        if (kakan) a = { type: 'kakan', kind: kakan.kinds[0] };
        else if (ankan) a = { type: 'ankan', kind: ankan.kinds[0] };
      }
      if (a.type === 'riichi') stats.riichi++;
      if (['pon', 'chi', 'kan'].includes(a.type)) stats.calls++;
      if (['ankan', 'kakan'].includes(a.type)) stats.kans++;
      if (s.phase === 'result' && s.result.type === 'win') stats.wins++;
      if (s.phase === 'result' && s.result.type === 'draw') stats.draws++;
      if (s.phase === 'result' && s.result.type === 'abort') stats.aborts++;
      s = apply(s, a, seat);
      // invariants
      const total = s.players.reduce((t, p) => t + p.score, 0) + s.round.riichiSticks * 1000;
      assert.equal(total, 100000, 'points are conserved');
      for (const p of s.players) {
        const n = p.hand.length + (p.drawn != null ? 1 : 0) + p.melds.length * 3;
        if (s.phase === 'action' || s.phase === 'call' || s.phase === 'roll') {
          assert.ok(n === 13 || n === 14, `hand size ${n}`);
        }
      }
      acted = true;
      break;
    }
    assert.ok(acted, 'someone must always have a legal action');
  }
  assert.equal(s.phase, 'over', 'game finishes');
  return { state: s, stats };
}

test('bots can play full games to completion (fuzz)', () => {
  const totals = { wins: 0, draws: 0, aborts: 0, calls: 0, riichi: 0, kans: 0 };
  for (let seed = 1; seed <= 25; seed++) {
    const { stats } = playGame(seed);
    for (const k in totals) totals[k] += stats[k];
  }
  assert.ok(totals.wins > 20, 'some hands are won: ' + JSON.stringify(totals));
  assert.ok(totals.calls > 0, 'some calls happen');
  assert.ok(totals.riichi > 0, 'some riichi happen');
});

test('view hides other hands and reveals own', () => {
  let s = startGame(newGame({ names: ['A', 'B', 'C', 'D'], seed: 7 }));
  assert.deepEqual(legalActions(s, 0).map((a) => a.type), ['roll']);
  assert.equal(viewFor(s, 1).players[0].handCount, 0);
  s = apply(s, { type: 'roll' }, 0);
  const v = viewFor(s, 1);
  assert.equal(v.players[1].hand.length, 13);
  assert.equal(v.players[0].hand, null);
  assert.equal(v.players[0].handCount, 14);
  assert.ok(v.actions.length === 0 || v.turn === 1);
  const d = viewFor(s, 0);
  assert.ok(d.actions.some((a) => a.type === 'discard'));
  assert.equal(d.me.hand.length, 13);
  assert.ok(d.me.drawn != null);
});

test('deterministic: same seed gives same deal', () => {
  const a = startGame(newGame({ seed: 42 }));
  const b = startGame(newGame({ seed: 42 }));
  assert.deepEqual(a.players.map((p) => p.hand), b.players.map((p) => p.hand));
  assert.deepEqual(a.wall.map(kindOf), b.wall.map(kindOf));
});
