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
