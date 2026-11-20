// The hand advice panel ("Within reach").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviseHand } from '../shared/advice.js';

const t = (kind, copy = 0) => kind * 4 + copy;
const ctx = { seatWind: 27, roundWind: 27, doraIndicators: [t(20)], rules: { kuitan: true, aka: true } };
const names = (a) => a.possible.map((p) => p.name);

test('a closed kan keeps riichi and menzen tsumo within reach; an open call does not', () => {
  // ten tiles in hand and a kan of East
  const hand = [t(0), t(1), t(2), t(9), t(10), t(11), t(18), t(19), t(22), t(22, 1)];
  const kan = (type) => ({ type, tiles: [t(27), t(27, 1), t(27, 2), t(27, 3)], from: type === 'ankan' ? null : 1 });
  const closed = adviseHand({ hand, drawn: null, melds: [kan('ankan')], riichi: false }, ctx);
  assert.ok(names(closed).includes('Riichi'), names(closed).join());
  assert.ok(names(closed).includes('Menzen tsumo'), names(closed).join());
  const open = adviseHand({ hand, drawn: null, melds: [kan('kan')], riichi: false }, ctx);
  assert.ok(!names(open).includes('Riichi') && !names(open).includes('Menzen tsumo'), names(open).join());
  // seven pairs still needs all fourteen tiles in the hand
  assert.ok(!names(closed).includes('Chiitoitsu'));
});

test('iipeikou: two identical runs in a closed hand are listed; one tile short is within reach; not after a call', () => {
  const have = (a) => a.have.map((p) => p.name);
  // 223344 of bamboo complete
  const full = [t(19), t(19, 1), t(20), t(20, 1), t(21), t(21, 1), t(0), t(1), t(2), t(9), t(10), t(27), t(27, 1)];
  const a = adviseHand({ hand: full, drawn: null, melds: [], riichi: false }, ctx);
  assert.ok(have(a).includes('Iipeikou'), have(a).join());
  assert.ok(!names(a).includes('Iipeikou'));
  // with the fourteenth tile in hand too
  assert.ok(have(adviseHand({ hand: full, drawn: t(33), melds: [], riichi: false }, ctx)).includes('Iipeikou'));
  // 22334 of bamboo: one short
  const short = [t(19), t(19, 1), t(20), t(20, 1), t(21), t(5), t(0), t(1), t(2), t(9), t(10), t(27), t(27, 1)];
  const b = adviseHand({ hand: short, drawn: null, melds: [], riichi: false }, ctx);
  assert.ok(names(b).includes('Iipeikou') && !have(b).includes('Iipeikou'), names(b).join());
  // an open hand cannot score it
  const open = adviseHand({ hand: full.slice(0, 10), drawn: null, melds: [{ type: 'pon', tiles: [t(31), t(31, 1), t(31, 2)], from: 1 }], riichi: false }, ctx);
  assert.ok(!have(open).includes('Iipeikou') && !names(open).includes('Iipeikou'));
  // a closed kan beside it is fine
  const kan = adviseHand({ hand: full.slice(0, 10), drawn: null, melds: [{ type: 'ankan', tiles: [t(31), t(31, 1), t(31, 2), t(31, 3)], from: null }], riichi: false }, ctx);
  assert.ok(have(kan).includes('Iipeikou'));
  // two different pairs of runs: ryanpeikou, not two iipeikou
  const two = [t(19), t(19, 1), t(20), t(20, 1), t(21), t(21, 1), t(9), t(9, 1), t(10), t(10, 1), t(11), t(11, 1), t(27)];
  const c = adviseHand({ hand: two, drawn: null, melds: [], riichi: false }, ctx);
  assert.ok(have(c).includes('Ryanpeikou') && !have(c).includes('Iipeikou'), have(c).join());
  // nothing of the kind in an ordinary hand
  const plain = [t(0), t(1), t(2), t(9), t(10), t(11), t(18), t(19), t(20), t(22), t(22, 1), t(27), t(28)];
  const d = adviseHand({ hand: plain, drawn: null, melds: [], riichi: false }, ctx);
  assert.ok(!have(d).includes('Iipeikou') && !names(d).includes('Iipeikou'));
});
