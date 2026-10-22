// A simple bot: wins when it can, calls riichi when tenpai, otherwise discards
// the tile that keeps the hand closest to tenpai. Used to fill empty seats and
// to fuzz the engine in tests.
import { kindOf, countsOf, isTerminalOrHonor } from './tiles.js';
import { shanten, waits } from './hand.js';
import { legalActions } from './game.js';

export function chooseBotAction(state, seat, rng = Math.random) {
  const actions = legalActions(state, seat);
  if (!actions.length) return null;
  const p = state.players[seat];
  const by = (t) => actions.find((a) => a.type === t);

  if (by('tsumo')) return { type: 'tsumo' };
  if (by('ron')) return { type: 'ron' };
  if (by('next')) return { type: 'next' };

  // Call phase: take a pon/kan only if it keeps or improves shanten and the hand already has a yaku-ish shape (we keep it simple: only yakuhai/tanyao-friendly pons).
  if (state.phase === 'call') {
    const pon = by('pon');
    if (pon && p.melds.length < 2 && isTerminalOrHonor(kindOf(pon.tiles[0])) && kindOf(pon.tiles[0]) >= 31) return { type: 'pon', tiles: pon.tiles };
    return { type: 'pass' };
  }

  const riichi = by('riichi');
  if (riichi) {
    // pick the riichi discard giving the most waits
    const best = bestDiscard(p, riichi.tiles, true);
    return { type: 'riichi', tile: best };
  }
  const ankan = by('ankan');
  if (ankan && rng() < 0.5) return { type: 'ankan', kind: ankan.kinds[0] };

  const discard = by('discard');
  if (discard) return { type: 'discard', tile: bestDiscard(p, discard.tiles, false, rng) };
  return { type: actions[0].type };
}

function bestDiscard(p, tiles, maximizeWaits, rng = Math.random) {
  const all = p.drawn != null ? [...p.hand, p.drawn] : [...p.hand];
  let best = null, bestScore = -Infinity;
  for (const t of tiles) {
    const rest = all.filter((x) => x !== t);
    const c = countsOf(rest.map(kindOf));
    const sh = shanten(c, p.melds.length);
    let score = -sh * 100;
    if (sh === 0) score += waits(c, p.melds.length).length * 5;
    // prefer throwing isolated terminals/honors early
    const k = kindOf(t);
    const neighbors = c[k] + (k < 27 && k % 9 > 0 ? c[k - 1] : 0) + (k < 27 && k % 9 < 8 ? c[k + 1] : 0);
    if (neighbors === 0) score += isTerminalOrHonor(k) ? 3 : 1;
    score += rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  void maximizeWaits;
  return best;
}
