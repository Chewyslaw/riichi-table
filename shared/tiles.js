// Tile model.
// A tile *kind* is an integer 0..33:
//   0-8  man 1-9, 9-17 pin 1-9, 18-26 sou 1-9,
//   27 East, 28 South, 29 West, 30 North, 31 White, 32 Green, 33 Red.
// A tile *instance* is an integer 0..135: kind*4 + copy. Copy 0 of each
// five (kinds 4, 13, 22) is the red five (aka dora).

export const EAST = 27, SOUTH = 28, WEST = 29, NORTH = 30;
export const HAKU = 31, HATSU = 32, CHUN = 33;

export const kindOf = (t) => t >> 2;
export const isRedFive = (t) => (t & 3) === 0 && (t >> 2 === 4 || t >> 2 === 13 || t >> 2 === 22);
export const suitOf = (k) => (k < 9 ? 'm' : k < 18 ? 'p' : k < 27 ? 's' : 'z');
export const numOf = (k) => (k < 27 ? (k % 9) + 1 : k - 26);
export const isHonor = (k) => k >= 27;
export const isTerminal = (k) => k < 27 && (k % 9 === 0 || k % 9 === 8);
export const isTerminalOrHonor = (k) => isHonor(k) || isTerminal(k);
export const isSimple = (k) => !isTerminalOrHonor(k);
export const isDragon = (k) => k >= 31;
export const isWind = (k) => k >= 27 && k <= 30;

export const KIND_NAMES = (() => {
  const out = [];
  for (const s of ['m', 'p', 's']) for (let n = 1; n <= 9; n++) out.push(n + s);
  for (let n = 1; n <= 7; n++) out.push(n + 'z');
  return out;
})();

export const kindName = (k) => KIND_NAMES[k];
export const tileName = (t) => (isRedFive(t) ? '0' + suitOf(kindOf(t)) : kindName(kindOf(t)));

/** Parse "123m456p789s11z" into an array of kinds. "0m" means red five (kind 4). */
export function parseKinds(str) {
  const out = [];
  let digits = [];
  for (const ch of str.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') digits.push(+ch);
    else {
      const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
      if (base === undefined) throw new Error('bad suit ' + ch);
      for (const d of digits) out.push(base + (d === 0 ? 4 : d - 1));
      digits = [];
    }
  }
  return out;
}

/** Parse like parseKinds but returns tile instances, preferring non-red copies
 *  unless "0" is used. Copies are allocated in order so a hand never has two
 *  identical instances. */
export function parseTiles(str) {
  const used = new Map();
  const out = [];
  let digits = [];
  for (const ch of str.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') digits.push(+ch);
    else {
      const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
      for (const d of digits) {
        const k = base + (d === 0 ? 4 : d - 1);
        let copy;
        if (d === 0) copy = 0;
        else {
          const u = used.get(k) || [];
          copy = [1, 2, 3, 0].find((c) => !u.includes(c));
          if (copy === undefined) throw new Error('too many ' + kindName(k));
        }
        const u = used.get(k) || [];
        u.push(copy);
        used.set(k, u);
        out.push(k * 4 + copy);
      }
      digits = [];
    }
  }
  return out;
}

export function countsOf(kinds) {
  const c = new Array(34).fill(0);
  for (const k of kinds) c[k]++;
  return c;
}

/** Dora from an indicator kind. */
export function doraOf(indicatorKind) {
  const k = indicatorKind;
  if (k < 27) {
    const suitBase = k - (k % 9);
    return suitBase + ((k % 9) + 1) % 9;
  }
  if (k <= 30) return k === 30 ? 27 : k + 1;
  return k === 33 ? 31 : k + 1;
}

/** Deterministic PRNG (mulberry32) so games are replayable from a seed. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledWall(rng) {
  const wall = Array.from({ length: 136 }, (_, i) => i);
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

/** Sort tile instances in standard display order (by kind, red fives first). */
export function sortTiles(tiles) {
  return [...tiles].sort((a, b) => kindOf(a) - kindOf(b) || (isRedFive(a) ? -1 : 0) - (isRedFive(b) ? -1 : 0) || a - b);
}
