import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKinds, countsOf, EAST, SOUTH, doraOf } from '../shared/tiles.js';
import { shanten, waits, isComplete, decompose } from '../shared/hand.js';
import { scoreHand, payments, basePoints } from '../shared/yaku.js';

const k = parseKinds;

test('shanten: complete and tenpai hands', () => {
  assert.equal(shanten(countsOf(k('123m456p789s11z22z2z'))), -1);
  assert.equal(shanten(countsOf(k('123m456p789s11z22z'))), 0);
  assert.equal(shanten(countsOf(k('123m456p789s1z2z3z4z'))), 2);
  assert.equal(shanten(countsOf(k('123m456p789s1z2z33z'))), 1);
  assert.equal(shanten(countsOf(k('19m19p19s1234567z'))), 0); // kokushi 13-wait
  assert.equal(shanten(countsOf(k('1122334455667m'))), 0); // chiitoi / ryanpeikou
  assert.equal(shanten(countsOf(k('123m456p78s11z')), 1), 0); // one meld called
});

test('waits', () => {
  assert.deepEqual(waits(countsOf(k('123m456p789s1122z'))), k('12z'));
  assert.deepEqual(waits(countsOf(k('23m456p789s11z222z'))), k('14m'));
  assert.deepEqual(waits(countsOf(k('19m19p19s1234567z'))).length, 13);
});

test('decompose finds multiple interpretations', () => {
  const d = decompose(countsOf(k('11223344m456p789s')));
  assert.equal(d.length, 2);
  assert.ok(isComplete(countsOf(k('22334455m666p777s'))));
});

function ctx(hand, win, extra = {}) {
  return Object.assign({
    concealed: [...k(hand), k(win)[0]], melds: [], winKind: k(win)[0], tsumo: false,
    seatWind: SOUTH, roundWind: EAST, doraIndicators: [], uraIndicators: [], akaCount: 0, isDealer: false,
  }, extra);
}

test('pinfu tsumo = 20 fu, pinfu ron = 30 fu', () => {
  const r = scoreHand(ctx('123m456p78s99p234s', '9s', { tsumo: true }));
  assert.ok(r.yaku.some((y) => y.name === 'Pinfu'));
  assert.equal(r.fu, 20);
  assert.equal(r.han, 2); // pinfu + tsumo
  const r2 = scoreHand(ctx('123m456p78s99p234s', '9s'));
  assert.equal(r2.fu, 30);
  assert.equal(r2.han, 1);
});

test('no yaku returns null; tanyao open with kuitan', () => {
  assert.equal(scoreHand(ctx('123m456p78s99p23s', '4s')), null);
  const r = scoreHand({ ...ctx('456p22p23s', '4s'), melds: [{ type: 'chi', kinds: k('234m') }, { type: 'pon', kinds: k('555s') }] });
  assert.ok(r && r.yaku.some((y) => y.name === 'Tanyao'));
  assert.equal(r.closed, false);
});

test('yakuhai, fu for closed triplets and kanchan', () => {
  // Closed hand, ron: 20 base + 10 closed ron + 8 (closed honor triplet of green dragon) + 4 closed simple triplet + 2 kanchan
  const r = scoreHand(ctx('666z555m13p99s789p', '2p'));
  assert.ok(r.yaku.some((y) => y.name === 'Yakuhai: Hatsu'));
  assert.equal(r.fu, 50); // 20+10+8+4+2 = 44 -> 50
});

test('chiitoitsu 25 fu, 2 han', () => {
  const r = scoreHand(ctx('1122m3344p5566s7z', '7z'));
  assert.equal(r.fu, 25);
  assert.equal(r.han, 2);
});

test('kokushi and suuankou are yakuman', () => {
  const r = scoreHand(ctx('19m19p19s1234567z', '7z'));
  assert.equal(r.yakuman, 2); // 13-sided wait (double by default)
  const r2 = scoreHand(ctx('111m222p333s444m5z', '5z', { tsumo: true }));
  assert.ok(r2.yaku.some((y) => y.name.startsWith('Suuankou')));
  assert.equal(r2.yakuman, 2); // tanki
  const r3 = scoreHand(ctx('111m222p333s44m55z', '5z', { tsumo: true }));
  assert.equal(r3.yakuman, 1);
  // Ron on the last triplet makes it sanankou, not suuankou
  const r4 = scoreHand(ctx('111m222p333s44m55z', '5z'));
  assert.ok(r4.yaku.some((y) => y.name === 'Sanankou'));
  assert.equal(r4.yakuman, 0);
});

test('dora counting and limits', () => {
  const r = scoreHand(ctx('123m456p78s99p234s', '9s', { riichi: true, doraIndicators: k('8p'), uraIndicators: k('5z'), akaCount: 1 }));
  // riichi + pinfu + dora(9p x2) + ura(2m... none) + aka
  assert.equal(r.han, 1 + 1 + 2 + 1);
  assert.equal(doraOf(k('9m')[0]), k('1m')[0]);
  assert.equal(doraOf(k('4z')[0]), k('1z')[0]);
  assert.equal(doraOf(k('7z')[0]), k('5z')[0]);
});

test('point table', () => {
  assert.equal(basePoints(1, 30), 240);
  assert.equal(payments({ basePoints: 240, isDealer: false, tsumo: false }).ron, 1000);
  assert.equal(payments({ basePoints: 240, isDealer: true, tsumo: false }).ron, 1500);
  assert.equal(basePoints(3, 40), 1280);
  assert.equal(payments({ basePoints: 1280, isDealer: false, tsumo: false }).ron, 5200);
  assert.equal(basePoints(4, 40), 2000); // mangan cap
  assert.equal(payments({ basePoints: 2000, isDealer: false, tsumo: false }).ron, 8000);
  assert.equal(payments({ basePoints: 2000, isDealer: true, tsumo: false }).ron, 12000);
  const t = payments({ basePoints: 320, isDealer: false, tsumo: true }); // 2 han 20fu? use 1 han 40? pinfu tsumo 20fu 2han = 320
  assert.equal(t.dealerPays, 700);
  assert.equal(t.nonDealerPays, 400);
  const d = payments({ basePoints: 8000, isDealer: true, tsumo: true, honba: 1 });
  assert.equal(d.each, 16100);
  const h = payments({ basePoints: 240, isDealer: false, tsumo: false, honba: 2, riichiSticks: 1 });
  assert.equal(h.ron, 1600);
  assert.equal(h.total, 2600);
});
