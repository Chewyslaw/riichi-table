// Hand advice for the side panel: which yaku the hand already has, which are still in reach,
// and (when tenpai) exactly what each winning tile would score. Pure functions over a player's view.
import { kindOf, countsOf, isRedFive, isSimple, isHonor, isDragon, isTerminalOrHonor, suitOf, numOf, doraOf, kindName } from './tiles.js';
import { waits as computeWaits, shanten, shantenChiitoi } from './hand.js';
import { scoreHand } from './yaku.js';

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
  const doraKinds = (ctx.doraIndicators || []).map((t) => doraOf(kindOf(t)));
  const dora = { count: allKinds.filter((k) => doraKinds.includes(k)).length, aka: [...concealedTiles, ...melds.flatMap((m) => m.tiles)].filter(isRedFive).length };

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
          riichi: me.riichi, doraIndicators: doraKinds.length ? (ctx.doraIndicators || []).map(kindOf) : [], uraIndicators: [], akaCount: dora.aka, rules: ctx.rules,
        });
        const tsumo = score ? null : scoreHand({
          concealed: [...me.hand.map(kindOf), k], melds: melds.map((m) => ({ type: m.type, kinds: m.tiles.map(kindOf) })),
          winKind: k, tsumo: true, seatWind: ctx.seatWind, roundWind: ctx.roundWind,
          riichi: me.riichi, doraIndicators: (ctx.doraIndicators || []).map(kindOf), uraIndicators: [], akaCount: dora.aka, rules: ctx.rules,
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
    if (!me.riichi && melds.length === 0) pushP('Riichi', 1, out.tenpai ? 'you are tenpai — declare it' : 'closed hand: declare when tenpai');
    if (melds.length === 0) pushP('Menzen tsumo', 1, 'win by self-draw with a closed hand');
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
  return out;
}
