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

const hand = (str) => { // "123m 456p 77z" → tiles, taking fresh copies of each kind
  const seen = {}; const out = [];
  for (const part of str.split(' ')) {
    const suit = 'mpsz'.indexOf(part.slice(-1));
    for (const ch of part.slice(0, -1)) { const kind = suit * 9 + (+ch - 1); seen[kind] = (seen[kind] || 0); out.push(t(kind, seen[kind]++)); }
  }
  return out;
};
const advise = (str, melds = []) => adviseHand({ hand: hand(str), drawn: null, melds, riichi: false }, ctx);
const why = (a, name) => (a.possible.find((p) => p.name === name) || {}).why || '';

test('pinfu is within reach for a hand of runs, not for triplets or after any call', () => {
  const a = advise('123m 456m 789p 23s 55s 9p'); // tenpai on 1s/4s
  assert.ok(names(a).includes('Pinfu'), names(a).join());
  assert.match(why(a, 'Pinfu'), /one tile away/);
  assert.ok(names(advise('123m 45m 789p 23s 55s 9p 1z')).includes('Pinfu')); // a tile or two further back
  assert.ok(!names(advise('111m 222p 333s 44s 5s 77z 9m')).includes('Pinfu')); // triplets
  assert.ok(!names(advise('1m 4m 7m 2p 5p 8p 3s 6s 9s 1z 2z 3z 4z')).includes('Pinfu')); // nothing connects
  const kan = { type: 'ankan', tiles: [t(31), t(31, 1), t(31, 2), t(31, 3)], from: null };
  assert.ok(!names(advise('123m 456m 23s 55s', [kan])).includes('Pinfu')); // a kan is a triplet
});

test('chanta and junchan are within reach when every block sits on a terminal or honor', () => {
  const c = advise('123m 789m 123p 99s 11z 5p');
  assert.ok(names(c).includes('Chanta') && !names(c).includes('Junchan'), names(c).join());
  assert.equal(c.possible.find((p) => p.name === 'Chanta').han, 2);
  const j = advise('123m 789m 123p 789s 9p');
  assert.ok(names(j).includes('Junchan') && !names(j).includes('Chanta'), names(j).join());
  assert.equal(j.possible.find((p) => p.name === 'Junchan').han, 3);
  // middle tiles everywhere: neither
  const mid = advise('345m 456p 567s 44m 55p 6s');
  assert.ok(!names(mid).includes('Chanta') && !names(mid).includes('Junchan'), names(mid).join());
  // an open run of 789 fits (one han less); a pon of 5s rules both out
  const chi = { type: 'chi', tiles: hand('789s'), from: 3 };
  const open = advise('123m 789m 123p 9p', [chi]);
  assert.equal(open.possible.find((p) => p.name === 'Junchan').han, 2);
  const pon5 = { type: 'pon', tiles: [t(13), t(13, 1), t(13, 2)], from: 1 };
  const no = advise('123m 789m 123p 9p', [pon5]);
  assert.ok(!names(no).includes('Chanta') && !names(no).includes('Junchan'));
});

test('sanshoku doukou: the same triplet in three suits', () => {
  const have = (a) => a.have.map((p) => p.name);
  const near = advise('222m 222p 22s 456s 78m');
  assert.ok(names(near).includes('Sanshoku doukou') && /one tile away/.test(why(near, 'Sanshoku doukou')), names(near).join());
  assert.ok(have(advise('222m 222p 222s 456s 7m')).includes('Sanshoku doukou'));
  const pon = { type: 'pon', tiles: [t(1), t(1, 1), t(1, 2)], from: 1 }; // pon of 2m
  assert.ok(have(advise('222p 222s 456s 7m', [pon])).includes('Sanshoku doukou'));
  assert.ok(!names(advise('222m 22p 456s 78m 345p 9s')).includes('Sanshoku doukou')); // only two suits
  assert.ok(!names(advise('22m 22p 22s 456s 78m 34p')).includes('Sanshoku doukou')); // three pairs: too far
});
