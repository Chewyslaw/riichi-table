// Yaku detection, fu, and point calculation for riichi mahjong.
import {
  countsOf, isTerminalOrHonor, isTerminal, isHonor, isDragon, isWind, isSimple,
  suitOf, numOf, doraOf, kindName, HAKU, HATSU, CHUN,
} from './tiles.js';
import { decompose, isChiitoi, isKokushi, KOKUSHI_KINDS } from './hand.js';

/**
 * ctx = {
 *   concealed: kinds[] of the concealed tiles INCLUDING the winning tile,
 *   melds: [{type:'chi'|'pon'|'kan'|'ankan'|'kakan', kinds:[..]}],
 *   winKind, tsumo, seatWind, roundWind,
 *   riichi, doubleRiichi, ippatsu, rinshan, chankan, haitei, houtei, tenhou, chiihou,
 *   doraIndicators:[kinds], uraIndicators:[kinds], akaCount, isDealer,
 *   rules: { kuitan: true, doubleYakuman: true }
 * }
 * Returns null when the hand has no yaku (cannot win), else the best scoring:
 * { yaku:[{name, han}], han, fu, yakuman (count), dora, aka, ura }
 */
export function scoreHand(ctx) {
  const rules = Object.assign({ kuitan: true, doubleYakuman: true }, ctx.rules || {});
  const c = countsOf(ctx.concealed);
  const openMelds = ctx.melds || [];
  const closed = openMelds.every((m) => m.type === 'ankan');
  const meldsDone = openMelds.length;
  const base = situationalYaku(ctx, closed);

  const candidates = [];

  // Kokushi
  if (meldsDone === 0 && isKokushi(c)) {
    const thirteen = ctx.concealed.filter((k) => k === ctx.winKind).length === 2 &&
      KOKUSHI_KINDS.every((k) => c[k] >= 1);
    // 13-sided wait: before the win tile, all 13 kinds present once (pair formed by win tile)
    const before = c.slice(); before[ctx.winKind]--;
    const was13 = KOKUSHI_KINDS.every((k) => before[k] === 1);
    const ym = was13 && rules.doubleYakuman ? 2 : 1;
    const y = [{ name: was13 ? 'Kokushi Musou (13-sided)' : 'Kokushi Musou', han: 13 * ym, yakuman: ym }];
    if (ctx.tenhou) y.push({ name: 'Tenhou', han: 13, yakuman: 1 });
    if (ctx.chiihou) y.push({ name: 'Chiihou', han: 13, yakuman: 1 });
    candidates.push(finish(y, 30, ctx, rules, closed));
    void thirteen;
  }

  // Chiitoitsu
  if (meldsDone === 0 && isChiitoi(c)) {
    const y = [...base, { name: 'Chiitoitsu', han: 2 }];
    const kinds = ctx.concealed;
    if (kinds.every(isHonor)) y.push({ name: 'Tsuuiisou', han: 13, yakuman: 1 });
    else {
      if (kinds.every(isTerminalOrHonor)) y.push({ name: 'Honroutou', han: 2 });
      const suits = new Set(kinds.filter((k) => !isHonor(k)).map(suitOf));
      const hasHonor = kinds.some(isHonor);
      if (suits.size === 1) y.push(hasHonor ? { name: 'Honitsu', han: 3 } : { name: 'Chinitsu', han: 6 });
      if (kinds.every(isSimple)) y.push({ name: 'Tanyao', han: 1 });
    }
    candidates.push(finish(y, 25, ctx, rules, closed));
  }

  // Standard decompositions
  for (const d of decompose(c, meldsDone)) {
    const structs = placements(d, openMelds, ctx);
    for (const s of structs) {
      const y = [...base, ...structuralYaku(s, ctx, rules, closed)];
      const fu = computeFu(s, ctx, closed, y);
      candidates.push(finish(y, fu, ctx, rules, closed));
    }
  }

  const valid = candidates.filter(Boolean);
  if (!valid.length) return null;
  valid.sort((a, b) => b.basePoints - a.basePoints || b.han - a.han || b.fu - a.fu);
  return valid[0];
}

function situationalYaku(ctx, closed) {
  const y = [];
  if (ctx.tenhou) y.push({ name: 'Tenhou', han: 13, yakuman: 1 });
  if (ctx.chiihou) y.push({ name: 'Chiihou', han: 13, yakuman: 1 });
  if (ctx.doubleRiichi) y.push({ name: 'Double Riichi', han: 2 });
  else if (ctx.riichi) y.push({ name: 'Riichi', han: 1 });
  if (ctx.ippatsu) y.push({ name: 'Ippatsu', han: 1 });
  if (ctx.tsumo && closed) y.push({ name: 'Menzen Tsumo', han: 1 });
  if (ctx.rinshan) y.push({ name: 'Rinshan Kaihou', han: 1 });
  if (ctx.chankan) y.push({ name: 'Chankan', han: 1 });
  if (ctx.haitei) y.push({ name: 'Haitei Raoyue', han: 1 });
  if (ctx.houtei) y.push({ name: 'Houtei Raoyui', han: 1 });
  return y;
}

/** Enumerate which meld/pair the winning tile completes. */
function placements(d, openMelds, ctx) {
  const all = openMelds.map((m) => ({
    kind: m.type === 'chi' ? 'run' : 'set',
    k: m.type === 'chi' ? Math.min(...m.kinds) : m.kinds[0],
    open: m.type !== 'ankan',
    isKan: m.type === 'kan' || m.type === 'ankan' || m.type === 'kakan',
    ron: false,
  }));
  const out = [];
  const w = ctx.winKind;
  // in a concealed meld
  d.melds.forEach((m, i) => {
    const contains = m.kind === 'set' ? m.k === w : (w >= m.k && w <= m.k + 2);
    if (!contains) return;
    let waitType;
    if (m.kind === 'set') waitType = 'shanpon';
    else if (w === m.k + 1) waitType = 'kanchan';
    else if ((numOf(m.k) === 1 && w === m.k + 2) || (numOf(m.k) === 7 && w === m.k)) waitType = 'penchan';
    else waitType = 'ryanmen';
    const melds = d.melds.map((mm, j) => ({ kind: mm.kind, k: mm.k, open: false, isKan: false, ron: j === i && !ctx.tsumo }));
    out.push({ melds: [...all, ...melds], pair: d.pair, waitType });
  });
  if (d.pair === w) {
    const melds = d.melds.map((mm) => ({ kind: mm.kind, k: mm.k, open: false, isKan: false, ron: false }));
    out.push({ melds: [...all, ...melds], pair: d.pair, waitType: 'tanki' });
  }
  return out;
}

function isYakuhaiPair(k, ctx) {
  return isDragon(k) || k === ctx.seatWind || k === ctx.roundWind;
}

function structuralYaku(s, ctx, rules, closed) {
  const y = [];
  const melds = s.melds;
  const sets = melds.filter((m) => m.kind === 'set');
  const runs = melds.filter((m) => m.kind === 'run');
  const allKinds = [];
  for (const m of melds) {
    if (m.kind === 'set') allKinds.push(m.k, m.k, m.k);
    else allKinds.push(m.k, m.k + 1, m.k + 2);
  }
  allKinds.push(s.pair, s.pair);
  const concealedSets = sets.filter((m) => !m.open && !m.ron);
  const kans = melds.filter((m) => m.isKan);

  // --- Yakuman ---
  if (concealedSets.length === 4) {
    const tanki = s.waitType === 'tanki';
    const ym = tanki && rules.doubleYakuman ? 2 : 1;
    y.push({ name: tanki ? 'Suuankou Tanki' : 'Suuankou', han: 13 * ym, yakuman: ym });
  }
  const dragonSets = sets.filter((m) => isDragon(m.k)).length;
  if (dragonSets === 3) y.push({ name: 'Daisangen', han: 13, yakuman: 1 });
  const windSets = sets.filter((m) => isWind(m.k)).length;
  if (windSets === 4) {
    const ym = rules.doubleYakuman ? 2 : 1;
    y.push({ name: 'Daisuushii', han: 13 * ym, yakuman: ym });
  } else if (windSets === 3 && isWind(s.pair)) y.push({ name: 'Shousuushii', han: 13, yakuman: 1 });
  if (allKinds.every(isHonor)) y.push({ name: 'Tsuuiisou', han: 13, yakuman: 1 });
  if (allKinds.every(isTerminal)) y.push({ name: 'Chinroutou', han: 13, yakuman: 1 });
  if (allKinds.every((k) => [19, 20, 21, 23, 25, HATSU].includes(k))) y.push({ name: 'Ryuuiisou', han: 13, yakuman: 1 });
  if (kans.length === 4) y.push({ name: 'Suukantsu', han: 13, yakuman: 1 });
  // Chuuren poutou: closed, one suit, 1112345678999 + any
  if (closed && melds.every((m) => !m.open && !m.isKan)) {
    const suits = new Set(allKinds.map(suitOf));
    if (suits.size === 1 && !isHonor(allKinds[0])) {
      const cnt = new Array(9).fill(0);
      for (const k of allKinds) cnt[numOf(k) - 1]++;
      const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      let ok = true, extra = -1;
      for (let i = 0; i < 9; i++) {
        if (cnt[i] < need[i]) { ok = false; break; }
        if (cnt[i] === need[i] + 1) { if (extra !== -1) { ok = false; break; } extra = i; }
        else if (cnt[i] !== need[i]) { ok = false; break; }
      }
      if (ok) {
        const nine = extra === numOf(ctx.winKind) - 1;
        const ym = nine && rules.doubleYakuman ? 2 : 1;
        y.push({ name: nine ? 'Junsei Chuuren Poutou' : 'Chuuren Poutou', han: 13 * ym, yakuman: ym });
      }
    }
  }
  if (y.some((v) => v.yakuman)) return y;

  // --- Normal yaku ---
  // Pinfu
  if (closed && runs.length === 4 && !isYakuhaiPair(s.pair, ctx) && s.waitType === 'ryanmen') y.push({ name: 'Pinfu', han: 1 });
  // Tanyao
  if (allKinds.every(isSimple) && (closed || rules.kuitan)) y.push({ name: 'Tanyao', han: 1 });
  // Yakuhai
  for (const m of sets) {
    if (isDragon(m.k)) y.push({ name: 'Yakuhai: ' + ['Haku', 'Hatsu', 'Chun'][m.k - HAKU], han: 1 });
    if (m.k === ctx.seatWind) y.push({ name: 'Yakuhai: Seat Wind', han: 1 });
    if (m.k === ctx.roundWind) y.push({ name: 'Yakuhai: Round Wind', han: 1 });
  }
  // Iipeikou / Ryanpeikou
  if (closed) {
    const runKeys = runs.map((m) => m.k).sort((a, b) => a - b);
    let pairsOfRuns = 0;
    for (let i = 0; i < runKeys.length - 1; i++) {
      if (runKeys[i] === runKeys[i + 1]) { pairsOfRuns++; i++; }
    }
    if (pairsOfRuns === 2) y.push({ name: 'Ryanpeikou', han: 3 });
    else if (pairsOfRuns === 1) y.push({ name: 'Iipeikou', han: 1 });
  }
  // Sanshoku doujun
  for (let n = 0; n <= 6; n++) {
    if (runs.some((m) => m.k === n) && runs.some((m) => m.k === 9 + n) && runs.some((m) => m.k === 18 + n)) {
      y.push({ name: 'Sanshoku Doujun', han: closed ? 2 : 1 }); break;
    }
  }
  // Sanshoku doukou
  for (let n = 0; n <= 8; n++) {
    if (sets.some((m) => m.k === n) && sets.some((m) => m.k === 9 + n) && sets.some((m) => m.k === 18 + n)) {
      y.push({ name: 'Sanshoku Doukou', han: 2 }); break;
    }
  }
  // Ittsu
  for (const base of [0, 9, 18]) {
    if (runs.some((m) => m.k === base) && runs.some((m) => m.k === base + 3) && runs.some((m) => m.k === base + 6)) {
      y.push({ name: 'Ittsu', han: closed ? 2 : 1 }); break;
    }
  }
  // Toitoi
  if (sets.length === 4) y.push({ name: 'Toitoi', han: 2 });
  // Sanankou
  if (concealedSets.length === 3) y.push({ name: 'Sanankou', han: 2 });
  // Sankantsu
  if (kans.length === 3) y.push({ name: 'Sankantsu', han: 2 });
  // Honroutou
  if (allKinds.every(isTerminalOrHonor)) y.push({ name: 'Honroutou', han: 2 });
  // Shousangen
  if (dragonSets === 2 && isDragon(s.pair)) y.push({ name: 'Shousangen', han: 2 });
  // Chanta / Junchan
  const meldHasTerminal = (m) => m.kind === 'set' ? isTerminalOrHonor(m.k) : (numOf(m.k) === 1 || numOf(m.k) === 7);
  const meldHasHonor = (m) => m.kind === 'set' && isHonor(m.k);
  if (melds.every(meldHasTerminal) && isTerminalOrHonor(s.pair) && runs.length > 0) {
    const anyHonor = melds.some(meldHasHonor) || isHonor(s.pair);
    if (anyHonor) y.push({ name: 'Chanta', han: closed ? 2 : 1 });
    else y.push({ name: 'Junchan', han: closed ? 3 : 2 });
  }
  // Honitsu / Chinitsu
  const suits = new Set(allKinds.filter((k) => !isHonor(k)).map(suitOf));
  const hasHonor = allKinds.some(isHonor);
  if (suits.size === 1) {
    if (hasHonor) y.push({ name: 'Honitsu', han: closed ? 3 : 2 });
    else y.push({ name: 'Chinitsu', han: closed ? 6 : 5 });
  }
  return y;
}

function computeFu(s, ctx, closed, yaku) {
  if (yaku.some((y) => y.name === 'Pinfu')) return ctx.tsumo ? 20 : 30;
  let fu = 20;
  if (closed && !ctx.tsumo) fu += 10;
  if (ctx.tsumo) fu += 2;
  for (const m of s.melds) {
    if (m.kind !== 'set') continue;
    let v = isTerminalOrHonor(m.k) ? 4 : 2;
    if (!m.open && !m.ron) v *= 2;
    if (m.isKan) v *= 4;
    fu += v;
  }
  if (isDragon(s.pair)) fu += 2;
  if (s.pair === ctx.seatWind) fu += 2;
  if (s.pair === ctx.roundWind) fu += 2;
  if (s.waitType === 'kanchan' || s.waitType === 'penchan' || s.waitType === 'tanki') fu += 2;
  if (!closed && fu === 20) fu = 30;
  return Math.ceil(fu / 10) * 10;
}

function finish(yaku, fu, ctx, rules, closed) {
  if (!yaku.length) return null;
  const yakumanList = yaku.filter((y) => y.yakuman);
  let out;
  if (yakumanList.length) {
    const count = yakumanList.reduce((a, y) => a + y.yakuman, 0);
    out = { yaku: yakumanList, han: 13 * count, fu, yakuman: count, dora: 0, aka: 0, ura: 0 };
  } else {
    const doraCount = countDora(ctx.concealed, ctx.melds, ctx.doraIndicators || []);
    const ura = ctx.riichi || ctx.doubleRiichi ? countDora(ctx.concealed, ctx.melds, ctx.uraIndicators || []) : 0;
    const aka = ctx.akaCount || 0;
    const list = [...yaku];
    if (doraCount) list.push({ name: 'Dora', han: doraCount });
    if (aka) list.push({ name: 'Aka Dora', han: aka });
    if (ura) list.push({ name: 'Ura Dora', han: ura });
    const han = list.reduce((a, y) => a + y.han, 0);
    out = { yaku: list, han, fu, yakuman: 0, dora: doraCount, aka, ura };
  }
  out.closed = closed;
  out.basePoints = basePoints(out.han, out.fu, out.yakuman);
  out.limit = limitName(out.han, out.fu, out.yakuman);
  return out;
}

function countDora(concealed, melds, indicators) {
  if (!indicators.length) return 0;
  const kinds = [...concealed];
  for (const m of melds || []) kinds.push(...m.kinds);
  let n = 0;
  for (const ind of indicators) {
    const d = doraOf(ind);
    n += kinds.filter((k) => k === d).length;
  }
  return n;
}

export function basePoints(han, fu, yakuman = 0) {
  if (yakuman) return 8000 * yakuman;
  if (han >= 13) return 8000;
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  if (han >= 5) return 2000;
  return Math.min(2000, fu * Math.pow(2, han + 2));
}

export function limitName(han, fu, yakuman = 0) {
  if (yakuman) return yakuman > 1 ? `${yakuman}x Yakuman` : 'Yakuman';
  if (han >= 13) return 'Kazoe Yakuman';
  if (han >= 11) return 'Sanbaiman';
  if (han >= 8) return 'Baiman';
  if (han >= 6) return 'Haneman';
  if (han >= 5 || fu * Math.pow(2, han + 2) >= 2000) return 'Mangan';
  return '';
}

const r100 = (x) => Math.ceil(x / 100) * 100;

/**
 * Payments for one win.
 * Returns { total, fromEach: {dealer, nonDealer} for tsumo | fromDiscarder for ron }
 */
export function payments({ basePoints: bp, isDealer, tsumo, honba = 0, riichiSticks = 0 }) {
  if (tsumo) {
    if (isDealer) {
      const each = r100(bp * 2) + 100 * honba;
      return { tsumo: true, each, total: each * 3 + 1000 * riichiSticks, dealerPays: 0, nonDealerPays: each };
    }
    const dealerPays = r100(bp * 2) + 100 * honba;
    const nonDealerPays = r100(bp) + 100 * honba;
    return { tsumo: true, dealerPays, nonDealerPays, total: dealerPays + nonDealerPays * 2 + 1000 * riichiSticks };
  }
  const ron = r100(bp * (isDealer ? 6 : 4)) + 300 * honba;
  return { tsumo: false, ron, total: ron + 1000 * riichiSticks };
}

export { kindName };
