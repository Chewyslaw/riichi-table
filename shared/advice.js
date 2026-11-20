// Hand advice for the side panel: which yaku the hand already has, which are still in reach,
// and (when tenpai) exactly what each winning tile would score. Pure functions over a player's view.
import { kindOf, countsOf, isRedFive, isSimple, isHonor, isDragon, isTerminalOrHonor, suitOf, numOf, doraOf, kindName } from './tiles.js';
import { waits as computeWaits, shanten, shantenChiitoi } from './hand.js';
import { scoreHand } from './yaku.js';

/** The most tiles of a hand that fit a target shape of `need` sets and a pair. Each group of tiles (one end of a
 *  suit, one honor…) offers options { sets, pair, used }; one option per group is taken. Sets left unfilled use none. */
function mostUsed(groups, need) {
  let best = Array.from({ length: need + 1 }, () => [-1, -1]);
  best[0][0] = 0;
  for (const opts of groups) {
    const next = best.map((r) => r.slice());
    for (let st = 0; st <= need; st++) for (let p = 0; p < 2; p++) {
      if (best[st][p] < 0) continue;
      for (const o of opts) {
        const s2 = st + o.sets, p2 = p + o.pair;
        if (s2 <= need && p2 <= 1 && best[st][p] + o.used > next[s2][p2]) next[s2][p2] = best[st][p] + o.used;
      }
    }
    best = next;
  }
  return Math.max(...best.flat());
}
/** Chanta / junchan: every set and the pair holds a terminal (or, for chanta, an honor). How many tiles the hand is
 *  short of that shape. Only 123 and 789 runs, triplets and pairs of 1s, 9s and honors can be used. */
function outsideMissing(cnt, need, withHonors) {
  const groups = [];
  for (const base of [0, 9, 18]) {
    for (const [a, b, c] of [[cnt[base], cnt[base + 1], cnt[base + 2]], [cnt[base + 8], cnt[base + 7], cnt[base + 6]]]) {
      const opts = [];
      for (let r = 0; r <= need; r++) for (let t = 0; t < 2; t++) for (let p = 0; p < 2; p++) {
        const ends = r + 3 * t + 2 * p; // copies of the 1 (or 9) this would take
        if (ends === 0 || ends > 4) continue;
        opts.push({ sets: r + t, pair: p, used: Math.min(a, ends) + Math.min(b, r) + Math.min(c, r) });
      }
      groups.push(opts);
    }
  }
  if (withHonors) for (let k = 27; k < 34; k++) if (cnt[k]) groups.push([{ sets: 1, pair: 0, used: Math.min(cnt[k], 3) }, { sets: 0, pair: 1, used: Math.min(cnt[k], 2) }]);
  return need * 3 + 2 - mostUsed(groups, need);
}
/** Pinfu: four runs and a pair that is worth nothing. How many tiles the hand is short of that shape. */
function runsMissing(cnt, valuePairs) {
  const groups = [];
  for (const base of [0, 9, 18]) {
    const c = cnt.slice(base, base + 9);
    if (!c.some(Boolean)) continue;
    const best = {}; // "runs,pair" → most tiles used
    const note = (r, p, used) => { const key = r + ',' + p; if (!(key in best) || used > best[key]) best[key] = used; };
    const d = Array(9).fill(0); // how many of each tile the chosen runs ask for
    const walk = (from, r) => {
      let used = 0; for (let k = 0; k < 9; k++) used += Math.min(c[k], d[k]);
      note(r, 0, used);
      for (let k = 0; k < 9; k++) if (c[k] > d[k]) note(r, 1, used + Math.min(c[k] - d[k], 2));
      if (r === 4) return;
      for (let st = from; st <= 6; st++) { d[st]++; d[st + 1]++; d[st + 2]++; walk(st, r + 1); d[st]--; d[st + 1]--; d[st + 2]--; }
    };
    walk(0, 0);
    groups.push(Object.entries(best).map(([key, used]) => ({ sets: +key.split(',')[0], pair: +key.split(',')[1], used })));
  }
  for (let k = 27; k < 31; k++) if (cnt[k] && !valuePairs.includes(k)) groups.push([{ sets: 0, pair: 1, used: Math.min(cnt[k], 2) }]);
  return 14 - mostUsed(groups, 4);
}
const tilesAway = (n) => (n <= 0 ? 'the shape is there' : n === 1 ? 'one tile away' : `${n} tiles away`);

/**
 * me: { hand: tiles[], drawn: tile|null, riichi, melds:[{type,tiles}] }
 * ctx: { seatWind, roundWind, doraIndicators: tiles[], rules }
 * Returns { tenpai, waits:[{kind, yaku:[{name,han}], han, fu, limit, noYaku}], have:[...], possible:[...], dora:{count, aka} }
 */
export function adviseHand(me, ctx) {
  const concealedTiles = [...me.hand, ...(me.drawn != null ? [me.drawn] : [])];
  const kinds = concealedTiles.map(kindOf);
  const melds = me.melds || [];
  const meldKinds = melds.flatMap((m) => m.tiles.map(kindOf));
  const allKinds = [...kinds, ...meldKinds];
  const closed = melds.every((m) => m.type === 'ankan');
  const c13 = countsOf((me.drawn != null ? me.hand : me.hand).map(kindOf)); // 13-tile shape for waits
  const doraKinds = (ctx.doraIndicators || []).map((t) => doraOf(kindOf(t), (ctx.rules || {}).players === 3));
  const nuki = ctx.nuki || 0; // North tiles set aside (three-player): a han each, and dora too when North is the dora
  const dora = { count: allKinds.filter((k) => doraKinds.includes(k)).length + nuki * doraKinds.filter((k) => k === 30).length, aka: [...concealedTiles, ...melds.flatMap((m) => m.tiles)].filter(isRedFive).length, nuki };

  const out = { tenpai: false, waits: [], have: [], possible: [], dora, shanten: null };

  // --- tenpai: exact scoring per wait (from the 13-tile hand, i.e. after discarding the drawn tile is the player's job)
  const base13 = me.drawn != null && !me.riichi ? null : c13; // with 14 tiles the player still has to choose a discard; show waits only for 13
  if (me.drawn == null || me.riichi) {
    const w = computeWaits(c13, melds.length);
    if (w.length) {
      out.tenpai = true;
      out.waits = w.map((k) => {
        const score = scoreHand({
          concealed: [...me.hand.map(kindOf), k], melds: melds.map((m) => ({ type: m.type, kinds: m.tiles.map(kindOf) })),
          winKind: k, tsumo: false, seatWind: ctx.seatWind, roundWind: ctx.roundWind,
          riichi: me.riichi, doraIndicators: doraKinds.length ? (ctx.doraIndicators || []).map(kindOf) : [], uraIndicators: [], akaCount: dora.aka, nukiDora: nuki, rules: ctx.rules,
        });
        const tsumo = score ? null : scoreHand({
          concealed: [...me.hand.map(kindOf), k], melds: melds.map((m) => ({ type: m.type, kinds: m.tiles.map(kindOf) })),
          winKind: k, tsumo: true, seatWind: ctx.seatWind, roundWind: ctx.roundWind,
          riichi: me.riichi, doraIndicators: (ctx.doraIndicators || []).map(kindOf), uraIndicators: [], akaCount: dora.aka, nukiDora: nuki, rules: ctx.rules,
        });
        const s = score || tsumo;
        return { kind: k, noYaku: !score, tsumoOnly: !score && !!tsumo, yaku: s ? s.yaku : [], han: s ? s.han : 0, fu: s ? s.fu : 0, limit: s ? s.limit : '' };
      });
    }
  }
  void base13;
  out.shanten = shanten(countsOf(kinds), melds.length);

  // --- yaku already locked in
  if (me.riichi) out.have.push({ name: 'Riichi', han: 1, why: 'declared' });
  const cnt = countsOf(allKinds);
  for (const k of [31, 32, 33, ctx.seatWind, ctx.roundWind]) {
    const n = (cnt[k] || 0);
    if (n >= 3) {
      const label = isDragon(k) ? 'Yakuhai: ' + ['Haku', 'Hatsu', 'Chun'][k - 31] : (k === ctx.seatWind && k === ctx.roundWind ? 'Yakuhai: seat + round wind (×2)' : k === ctx.seatWind ? 'Yakuhai: seat wind' : 'Yakuhai: round wind');
      if (!out.have.some((h) => h.name === label)) out.have.push({ name: label, han: k === ctx.seatWind && k === ctx.roundWind ? 2 : 1, why: `triplet of ${kindName(k)}` });
    }
  }
  const kans = melds.filter((m) => /kan/.test(m.type)).length;
  if (kans >= 3) out.have.push({ name: kans === 4 ? 'Suukantsu' : 'Sankantsu', han: kans === 4 ? 13 : 2, why: `${kans} kans` });

  // --- yaku still in reach (shape is compatible)
  const pushP = (name, han, why) => { if (!out.have.some((h) => h.name === name) && !out.possible.some((h) => h.name === name)) out.possible.push({ name, han, why }); };
  if (allKinds.every(isSimple) && (closed || (ctx.rules || {}).kuitan !== false)) pushP('Tanyao', 1, 'no terminals or honors so far');
  // "within reach" for shape yaku: at most one tile further off than the quickest way to finish the hand
  const handCnt = countsOf(kinds); // tiles still in the hand (calls are fixed)
  const reach = Math.min(4, (out.shanten == null ? 6 : out.shanten + 1) + 1);
  // pinfu: no calls at all (a closed kan is a triplet), four runs and a pair that scores nothing
  if (melds.length === 0) {
    const m = runsMissing(handCnt, [31, 32, 33, ctx.seatWind, ctx.roundWind]);
    // pinfu fits most hands early on, so it is listed only once it is no slower than the quickest finish
    if (m <= Math.min(3, reach - 1)) pushP('Pinfu', 1, `all runs and a pair worth nothing, won on a two-sided wait — ${tilesAway(m)}`);
  }
  const suits = new Set(allKinds.filter((k) => !isHonor(k)).map(suitOf));
  const honors = allKinds.filter(isHonor).length;
  if (suits.size === 1) {
    if (honors === 0) pushP('Chinitsu', closed ? 6 : 5, 'one suit only');
    else pushP('Honitsu', closed ? 3 : 2, 'one suit plus honors');
  } else if (suits.size === 2 && allKinds.length >= 11) {
    // one off-suit tile or two: honitsu is still a realistic target
    const bySuit = {}; for (const k of allKinds) if (!isHonor(k)) bySuit[suitOf(k)] = (bySuit[suitOf(k)] || 0) + 1;
    const minor = Math.min(...Object.values(bySuit));
    if (minor <= 2 && closed) pushP('Honitsu', 3, `${minor} off-suit tile${minor > 1 ? 's' : ''} to shed`);
  }
  if (allKinds.every(isTerminalOrHonor)) pushP('Honroutou', 2, 'only terminals and honors');
  else {
    // chanta / junchan: every set and the pair with a terminal (chanta: or an honor). Calls made so far must fit too.
    const hasEnd = (m) => m.tiles.some((t) => { const k = kindOf(t); return !isHonor(k) && (numOf(k) === 1 || numOf(k) === 9); });
    const need = 4 - melds.length;
    const jOk = melds.every((m) => hasEnd(m) && !m.tiles.some((t) => isHonor(kindOf(t))));
    const cOk = melds.every((m) => hasEnd(m) || m.tiles.some((t) => isHonor(kindOf(t))));
    const j = jOk ? outsideMissing(handCnt, need, false) : 99;
    const c = cOk ? outsideMissing(handCnt, need, true) : 99;
    if (j <= reach && j <= c) pushP('Junchan', closed ? 3 : 2, `a 1 or 9 in every set and the pair — ${tilesAway(j)}`);
    else if (c <= reach) pushP('Chanta', closed ? 2 : 1, `a 1, 9 or honor in every set and the pair — ${tilesAway(c)}`);
  }
  for (const k of [31, 32, 33, ctx.seatWind, ctx.roundWind]) {
    if (cnt[k] === 2) pushP(isDragon(k) ? 'Yakuhai: ' + ['Haku', 'Hatsu', 'Chun'][k - 31] : 'Yakuhai: ' + (k === ctx.seatWind ? 'seat wind' : 'round wind'), 1, `pair of ${kindName(k)} — one more for a triplet`);
  }
  const dragonSets = [31, 32, 33].filter((k) => cnt[k] >= 3).length;
  const dragonPairs = [31, 32, 33].filter((k) => cnt[k] === 2).length;
  if (dragonSets === 2 && dragonPairs === 1) pushP('Shousangen', 2, 'two dragon triplets and the third as a pair');
  if (dragonSets === 3) out.have.push({ name: 'Daisangen', han: 13, why: 'all three dragon triplets' });
  if (closed) {
    const pairs = Object.values(countsOf(kinds)).filter((n) => n >= 2).length;
    if (melds.length === 0 && pairs >= 4) pushP('Chiitoitsu', 2, `${pairs} pairs`);
    const trip = cnt.filter((n) => n >= 3).length;
    if (trip >= 2 && pairs >= 4) pushP('Toitoi', 2, `${trip} triplets, ${pairs - trip} pairs`);
    if (trip >= 3 && melds.every((m) => m.type === 'ankan')) pushP('Sanankou', 2, `${trip} concealed triplets`);
    // iipeikou: the same run twice in one suit (closed hands only) — complete, or one tile short
    const SUIT = ['characters', 'circles', 'bamboo'];
    const left = countsOf(kinds); // concealed tiles only: tiles in a kan are not part of a run
    const twins = [];
    let near = null;
    for (const base of [0, 9, 18]) {
      for (let n = 0; n <= 6; n++) {
        const k = base + n;
        while (left[k] >= 2 && left[k + 1] >= 2 && left[k + 2] >= 2) { left[k] -= 2; left[k + 1] -= 2; left[k + 2] -= 2; twins.push(`${n + 1}${n + 2}${n + 3} of ${SUIT[base / 9]}`); }
        if (!near && Math.min(left[k], 2) + Math.min(left[k + 1], 2) + Math.min(left[k + 2], 2) === 5) near = `${n + 1}${n + 2}${n + 3} of ${SUIT[base / 9]}`;
      }
    }
    if (twins.length >= 2) out.have.push({ name: 'Ryanpeikou', han: 3, why: `two pairs of identical runs: ${twins[0]} and ${twins[1]}` });
    else if (twins.length === 1) out.have.push({ name: 'Iipeikou', han: 1, why: `${twins[0]}, twice — keep the hand closed` });
    if (near && twins.length < 2) pushP(twins.length ? 'Ryanpeikou' : 'Iipeikou', twins.length ? 3 : 1, `one tile from ${twins.length ? 'a second pair of identical runs' : 'two identical runs'}: ${near}`);
    // a closed kan keeps the hand closed: riichi and menzen tsumo are still on
    if (!me.riichi) pushP('Riichi', 1, out.tenpai ? 'you are tenpai — declare it' : 'closed hand: declare when tenpai');
    pushP('Menzen tsumo', 1, 'win by self-draw with a closed hand');
  } else {
    const trip = cnt.filter((n) => n >= 3).length;
    const pairs = cnt.filter((n) => n === 2).length;
    if (trip >= 2 && trip + pairs >= 4) pushP('Toitoi', 2, `${trip} triplets so far`);
  }
  // runs-based yaku: ittsu / sanshoku if the pieces are there
  for (const base of [0, 9, 18]) {
    const have = [0, 3, 6].filter((o) => cnt[base + o] && cnt[base + o + 1] && cnt[base + o + 2]).length;
    if (have >= 2) pushP('Ittsu', closed ? 2 : 1, `${have} of the three runs in ${'mps'[base / 9]}`);
  }
  for (let n = 0; n <= 6; n++) {
    const have = [0, 9, 18].filter((b) => cnt[b + n] && cnt[b + n + 1] && cnt[b + n + 2]).length;
    if (have >= 2) pushP('Sanshoku doujun', closed ? 2 : 1, `${numOf(n)}${numOf(n) + 1}${numOf(n) + 2} in ${have} suits`);
  }
  // sanshoku doukou: the same triplet in all three suits (open or closed). Tiles in the hand, plus pons and kans.
  for (let n = 0; n < 9; n++) {
    const per = [0, 9, 18].map((b) => Math.min(3, handCnt[b + n] + (melds.some((m) => m.type !== 'chi' && kindOf(m.tiles[0]) === b + n) ? 3 : 0)));
    const total = per[0] + per[1] + per[2];
    if (total === 9) out.have.push({ name: 'Sanshoku doukou', han: 2, why: `triplets of ${n + 1} in all three suits` });
    else if (total >= 7 && per.every(Boolean)) pushP('Sanshoku doukou', 2, `${n + 1}s in all three suits — ${tilesAway(9 - total)}`);
  }
  return out;
}
