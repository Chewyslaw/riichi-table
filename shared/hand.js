// Hand analysis: shanten, decomposition into melds + pair, waits.
// All functions work on a 34-length count array of the *concealed* tiles.
import { isTerminalOrHonor } from './tiles.js';

const KOKUSHI_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** Standard-form shanten. meldsDone = number of melds already called. */
export function shantenStandard(c, meldsDone = 0) {
  const needMelds = 4 - meldsDone;
  let best = 8;
  const counts = c.slice();

  function evaluate(melds, taatsu, pair) {
    const m = melds + meldsDone;
    let t = taatsu;
    if (m + t > 4) t = 4 - m;
    const s = 8 - 2 * m - t - pair;
    if (s < best) best = s;
  }

  function rec(i, melds, taatsu, pair) {
    while (i < 34 && counts[i] === 0) i++;
    if (i === 34) { evaluate(melds, taatsu, pair); return; }
    // Quick bound: even if the rest is perfect, can we beat best?
    if (8 - 2 * (melds + meldsDone) - taatsu - pair - 2 * Math.floor((34 - i)) > best) { /* not a tight bound; skip */ }
    const canMeld = melds + meldsDone < 4;
    // triplet
    if (canMeld && counts[i] >= 3) {
      counts[i] -= 3; rec(i, melds + 1, taatsu, pair); counts[i] += 3;
    }
    // run
    if (canMeld && i < 27 && i % 9 <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
      counts[i]--; counts[i + 1]--; counts[i + 2]--;
      rec(i, melds + 1, taatsu, pair);
      counts[i]++; counts[i + 1]++; counts[i + 2]++;
    }
    if (melds + meldsDone + taatsu < 4) {
      // pair as taatsu
      if (counts[i] >= 2) {
        counts[i] -= 2; rec(i, melds, taatsu + 1, pair); counts[i] += 2;
      }
      // two-sided / edge
      if (i < 27 && i % 9 <= 7 && counts[i + 1] > 0) {
        counts[i]--; counts[i + 1]--;
        rec(i, melds, taatsu + 1, pair);
        counts[i]++; counts[i + 1]++;
      }
      // closed
      if (i < 27 && i % 9 <= 6 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 2]--;
        rec(i, melds, taatsu + 1, pair);
        counts[i]++; counts[i + 2]++;
      }
    }
    // isolated: drop this tile
    counts[i]--;
    rec(i, melds, taatsu, pair);
    counts[i]++;
  }

  // Try without a pair, then with each possible pair as head.
  rec(0, 0, 0, 0);
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 2) {
      counts[k] -= 2;
      rec(0, 0, 0, 1);
      counts[k] += 2;
    }
  }
  return best;
}

export function shantenChiitoi(c) {
  let pairs = 0, kinds = 0;
  for (let k = 0; k < 34; k++) {
    if (c[k] >= 2) pairs++;
    if (c[k] >= 1) kinds++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

export function shantenKokushi(c) {
  let kinds = 0, pair = 0;
  for (const k of KOKUSHI_KINDS) {
    if (c[k] >= 1) kinds++;
    if (c[k] >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}

/** Minimum shanten over all forms. -1 means complete. */
export function shanten(c, meldsDone = 0) {
  let s = shantenStandard(c, meldsDone);
  if (meldsDone === 0) {
    s = Math.min(s, shantenChiitoi(c), shantenKokushi(c));
  }
  return s;
}

/** All decompositions of the concealed counts into (4 - meldsDone) melds + a pair.
 *  Each result: { pair: kind, melds: [{ kind: 'set'|'run', k }] } */
export function decompose(c, meldsDone = 0) {
  const results = [];
  const counts = c.slice();
  const need = 4 - meldsDone;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== need * 3 + 2) return results;

  function rec(i, melds, pairK) {
    while (i < 34 && counts[i] === 0) i++;
    if (i === 34) {
      if (melds.length === need && pairK !== -1) results.push({ pair: pairK, melds: melds.slice() });
      return;
    }
    if (melds.length > need) return;
    if (counts[i] >= 3) {
      counts[i] -= 3; melds.push({ kind: 'set', k: i }); rec(i, melds, pairK); melds.pop(); counts[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
      counts[i]--; counts[i + 1]--; counts[i + 2]--;
      melds.push({ kind: 'run', k: i }); rec(i, melds, pairK); melds.pop();
      counts[i]++; counts[i + 1]++; counts[i + 2]++;
    }
    if (pairK === -1 && counts[i] >= 2) {
      counts[i] -= 2; rec(i, melds, i); counts[i] += 2;
    }
  }
  rec(0, [], -1);
  // Deduplicate (a run of three identical runs can be found via different orders? No — order is fixed by index; but sets+runs can be duplicated when same-kind runs). Dedup anyway.
  const seen = new Set();
  return results.filter((r) => {
    const key = r.pair + '|' + r.melds.map((m) => m.kind + m.k).sort().join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isChiitoi(c) {
  let pairs = 0;
  for (let k = 0; k < 34; k++) {
    if (c[k] === 2) pairs++;
    else if (c[k] !== 0) return false;
  }
  return pairs === 7;
}

export function isKokushi(c) {
  let pair = false;
  for (let k = 0; k < 34; k++) {
    const inK = KOKUSHI_KINDS.includes(k);
    if (!inK) { if (c[k] !== 0) return false; continue; }
    if (c[k] === 0) return false;
    if (c[k] === 2) { if (pair) return false; pair = true; }
    else if (c[k] !== 1) return false;
  }
  return pair;
}

/** Is a 14-tile (concealed counts + meldsDone called melds) hand complete? */
export function isComplete(c, meldsDone = 0) {
  if (meldsDone === 0 && (isChiitoi(c) || isKokushi(c))) return true;
  return decompose(c, meldsDone).length > 0;
}

/** Kinds that complete the hand (13 concealed tiles' counts). */
export function waits(c, meldsDone = 0) {
  const out = [];
  for (let k = 0; k < 34; k++) {
    if (c[k] >= 4) continue;
    c[k]++;
    if (isComplete(c, meldsDone)) out.push(k);
    c[k]--;
  }
  return out;
}

export const isTenpai = (c, meldsDone = 0) => waits(c, meldsDone).length > 0;

export { KOKUSHI_KINDS, isTerminalOrHonor };
