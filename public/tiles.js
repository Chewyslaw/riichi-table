// SVG tile renderer (client side).
import { kindOf, isRedFive, suitOf, numOf } from '../shared/tiles.js';

const MAN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR = ['東', '南', '西', '北', '', '發', '中'];

// Pin circle layouts, in a 0..1 box.
const PIN_LAYOUTS = {
  1: [[0.5, 0.5]],
  2: [[0.5, 0.28], [0.5, 0.72]],
  3: [[0.3, 0.25], [0.5, 0.5], [0.7, 0.75]],
  4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
  5: [[0.28, 0.25], [0.72, 0.25], [0.5, 0.5], [0.28, 0.75], [0.72, 0.75]],
  6: [[0.33, 0.22], [0.67, 0.22], [0.33, 0.5], [0.67, 0.5], [0.33, 0.78], [0.67, 0.78]],
  7: [[0.28, 0.2], [0.5, 0.3], [0.72, 0.4], [0.3, 0.62], [0.7, 0.62], [0.3, 0.82], [0.7, 0.82]],
  8: [[0.33, 0.18], [0.67, 0.18], [0.33, 0.4], [0.67, 0.4], [0.33, 0.6], [0.67, 0.6], [0.33, 0.82], [0.67, 0.82]],
  9: [[0.27, 0.2], [0.5, 0.2], [0.73, 0.2], [0.27, 0.5], [0.5, 0.5], [0.73, 0.5], [0.27, 0.8], [0.5, 0.8], [0.73, 0.8]],
};

export function tileFace(kind, red = false) {
  const suit = suitOf(kind);
  const n = numOf(kind);
  const W = 40, H = 56;
  let inner = '';
  // AMOS Numbers style: a small index numeral in the top-left corner of every suited tile
  const index = suit === 'z' ? '' : `<text x="5" y="9.5" font-size="7.5" font-weight="700" fill="${red ? '#C9452C' : '#4B4F55'}" font-family="Inter,system-ui,sans-serif">${n}</text>`;
  if (suit === 'm') {
    inner = `<text x="20" y="25" text-anchor="middle" font-size="19" font-weight="700" fill="${red ? '#C9452C' : '#1B2A4A'}" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">${MAN_NUM[n - 1]}</text>
      <text x="20" y="48" text-anchor="middle" font-size="20" font-weight="700" fill="#C9452C" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">萬</text>`;
  } else if (suit === 'p') {
    const pts = PIN_LAYOUTS[n];
    const r = n === 1 ? 13 : n <= 4 ? 8 : 6;
    const colors = ['#1F7A4F', '#C9452C', '#1B2A4A'];
    inner = pts.map(([x, y], i) => {
      const c = n === 1 ? '#C9452C' : red ? '#C9452C' : colors[(i + n) % 3];
      const cx = 4 + x * 32, cy = 4 + y * 48;
      // concentric "coin" rings like the physical set
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="none" stroke="#FFFFFF" stroke-width="${r > 7 ? 1.5 : 1.1}" opacity="0.9"/>${n === 1 ? `<circle cx="20" cy="28" r="5" fill="#1B2A4A"/><circle cx="20" cy="28" r="2" fill="#FFFFFF"/>` : ''}`;
    }).join('');
  } else if (suit === 's') {
    if (n === 1) {
      inner = `<g transform="translate(20,30)"><ellipse cx="0" cy="4" rx="9" ry="11" fill="${red ? '#C9452C' : '#1F7A4F'}"/><circle cx="0" cy="-11" r="6" fill="${red ? '#C9452C' : '#1F7A4F'}"/><path d="M-6 -11 l-5 -2 l5 -1 z" fill="#C9452C"/><path d="M-4 14 l-3 7 M0 15 l0 7 M4 14 l3 7" stroke="#C9452C" stroke-width="2" fill="none"/><circle cx="2" cy="-12" r="1.3" fill="#FBFAF5"/></g>`;
    } else {
      const cols = n <= 3 ? 1 : n <= 6 ? 2 : 3;
      const rows = Math.ceil(n / cols);
      const parts = [];
      let i = 0;
      const colorFor = (idx) => red ? '#C9452C' : (idx % 3 === 1 ? '#C9452C' : '#1F7A4F');
      for (let r = 0; r < rows; r++) {
        const inRow = Math.min(cols, n - r * cols);
        for (let c = 0; c < inRow; c++) {
          const x = 20 + (c - (inRow - 1) / 2) * 11;
          const y = 8 + r * (40 / rows) + (rows === 1 ? 12 : rows === 2 ? 4 : 0);
          const h = rows === 1 ? 24 : rows === 2 ? 20 : 12;
          parts.push(`<rect x="${x - 3}" y="${y}" width="6" height="${h}" rx="2" fill="${colorFor(i)}"/><line x1="${x - 3}" y1="${y + h / 2}" x2="${x + 3}" y2="${y + h / 2}" stroke="#FBFAF5" stroke-width="1.5"/>`);
          i++;
        }
      }
      inner = parts.join('');
    }
  } else {
    const idx = n - 1;
    if (idx === 4) inner = `<rect x="7" y="9" width="26" height="38" rx="3" fill="none" stroke="#2E5FAF" stroke-width="3"/>`;
    else {
      const fill = idx === 5 ? '#1F7A4F' : idx === 6 ? '#C9452C' : '#1B2A4A';
      inner = `<text x="20" y="40" text-anchor="middle" font-size="30" font-weight="700" fill="${fill}" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">${HONOR[idx]}</text>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="38" height="54" rx="5" fill="#FBFAF5" stroke="#C9C6BA" stroke-width="1.5"/><rect x="3.5" y="3.5" width="33" height="49" rx="3.5" fill="none" stroke="#FFFFFF" stroke-width="1"/>${index}${inner}</svg>`;
}

export function tileBack() {
  // black backs, like the AMOS trays
  return `<svg viewBox="0 0 40 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="38" height="54" rx="5" fill="#24282C" stroke="#111315" stroke-width="1.5"/><rect x="4" y="4" width="32" height="48" rx="3.5" fill="none" stroke="#3B4147" stroke-width="1"/></svg>`;
}

/** HTML for a tile element. opts: { faceDown, classes, data, rotated, title } */
export function tileHtml(tile, opts = {}) {
  const cls = ['tile'];
  if (opts.faceDown) cls.push('back');
  if (opts.rotated) cls.push('rotated');
  if (opts.classes) cls.push(...opts.classes);
  const faceDown = opts.faceDown || tile == null;
  let data = opts.data ? Object.entries(opts.data).map(([k, v]) => ` data-${k}="${v}"`).join('') : '';
  if (!faceDown) data += ` data-kind="${kindOf(tile)}"`; // lets the UI highlight every visible copy of a tile
  const inner = faceDown ? tileBack() : tileFace(kindOf(tile), isRedFive(tile));
  const title = opts.title ? ` title="${opts.title}"` : '';
  return `<div class="${cls.join(' ')}"${data}${title}>${inner}</div>`;
}

export function kindHtml(kind, classes = []) {
  return `<div class="tile ${classes.join(' ')}" data-kind="${kind}">${tileFace(kind)}</div>`;
}

/** Point sticks in the AMOS Numbers colours. value: 10000 | 5000 | 1000 | 500 | 100 */
export const STICK_STYLES = {
  10000: { fill: '#F2D44A', edge: '#C9AC2A', marks: 'x', mark: '#D9342B' },
  5000: { fill: '#E8552B', edge: '#B53E1C', marks: 5, mark: '#FFFFFF' },
  1000: { fill: '#2E6DB4', edge: '#1F4F86', marks: 1, mark: '#FFFFFF' },
  500: { fill: '#2BA596', edge: '#1D7A6E', marks: 8, mark: '#FFFFFF' },
  100: { fill: '#F4F4F0', edge: '#C8C8C0', marks: 8, mark: '#222222' },
};

export function stickSvg(value, opts = {}) {
  const st = STICK_STYLES[value] || STICK_STYLES[100];
  const W = 120, H = 14;
  let marks = '';
  if (st.marks === 'x') {
    marks = [30, 60, 90].map((x) => `<path d="M${x - 3} 4 l6 6 M${x + 3} 4 l-6 6" stroke="${st.mark}" stroke-width="1.6" stroke-linecap="round"/>`).join('');
  } else if (st.marks === 1) {
    marks = `<circle cx="60" cy="7" r="2.6" fill="${st.mark}"/>`;
  } else if (st.marks === 5) {
    marks = [[52, 4], [68, 4], [60, 7], [52, 10], [68, 10]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${st.mark}"/>`).join('');
  } else {
    marks = [0, 1, 2, 3].flatMap((i) => [[50 + i * 6.5, 4.5], [50 + i * 6.5, 9.5]]).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${st.mark}"/>`).join('');
  }
  const cls = ['stick', 's' + value, ...(opts.classes || [])].join(' ');
  return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${value} point stick"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2.5" fill="${st.fill}" stroke="${st.edge}"/>${marks}</svg>`;
}

/** Break a score into sticks (greedy), e.g. 25000 → {10000:2, 5000:1}. */
export function sticksFor(score) {
  const out = []; // [[value, count], ...] largest first
  let rest = Math.max(0, Math.round(score / 100) * 100);
  for (const v of [10000, 5000, 1000, 100]) {
    const n = Math.floor(rest / v);
    if (n) out.push([v, n]);
    rest -= n * v;
  }
  return out;
}

const WIND_GLYPH = ['東', '南', '西', '北'];

/**
 * The AMOS-style wind compass for the centre of the table.
 * dealerRel: where the dealer sits relative to the viewer (0 bottom, 1 right, 2 top, 3 left).
 * diceSum: this hand's dice roll (highlights the matching wall-count numbers).
 */
export function compassSvg({ dealerRel = 0, diceSum = 0 } = {}) {
  const C = 100;
  // lobe facing position k (0 bottom,1 right,2 top,3 left) shows the seat wind of that seat
  // relative to the dealer: seat at rel r has wind (r - dealerRel + 4) % 4
  const lobes = [0, 1, 2, 3].map((r) => {
    const wind = (r - dealerRel + 4) % 4;
    const ang = [0, -90, 180, 90][r]; // rotate so the glyph reads from that seat
    const dist = 38;
    const [dx, dy] = [[0, dist], [dist, 0], [0, -dist], [-dist, 0]][r];
    const isDealer = wind === 0;
    return `<g transform="translate(${C + dx},${C + dy}) rotate(${ang})"><text x="0" y="8" text-anchor="middle" font-size="22" font-weight="700" fill="${isDealer ? '#E8552B' : '#F4F4F0'}" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">${WIND_GLYPH[wind]}</text></g>`;
  }).join('');
  // dice-count numbers: dealer edge 5·9, dealer's right 2·6·10, across 3·7·11, left 4·8·12
  const sets = [[5, 9], [2, 6, 10], [3, 7, 11], [4, 8, 12]];
  const numbers = [0, 1, 2, 3].map((k) => {
    const r = (dealerRel + k) % 4; // physical position of this edge
    const ang = [0, -90, 180, 90][r];
    const [dx, dy] = [[0, 88], [88, 0], [0, -88], [-88, 0]][r];
    const hot = sets[k].includes(diceSum);
    return `<g transform="translate(${C + dx},${C + dy}) rotate(${ang})"><text x="0" y="3" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1" fill="${hot ? '#E8552B' : '#1E3A4C'}" font-family="Inter,system-ui,sans-serif">${sets[k].join(' · ')}</text></g>`;
  }).join('');
  const slots = [[100, 10, 60, 10], [190, 100, 10, 60], [100, 190, 60, 10], [10, 100, 10, 60]].map(([x, y, w, h]) => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3" fill="#20262B" stroke="#0E1114"/>`).join('');
  const rose = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M0 -22 L4 0 L0 22 L-4 0 Z" transform="rotate(${a})" fill="${a % 90 === 0 ? '#9ED8EA' : '#4F93B5'}" opacity="${a % 90 === 0 ? 1 : 0.8}"/>`).join('');
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="compass" role="img" aria-label="Wind compass">
    <rect x="2" y="2" width="196" height="196" rx="14" fill="#9ED8EA" stroke="#5FB6CF" stroke-width="2"/>
    ${slots}${numbers}
    <path d="M100 42 C118 42 124 56 124 66 C124 72 130 76 134 76 C144 76 158 82 158 100 C158 118 144 124 134 124 C130 124 124 128 124 134 C124 144 118 158 100 158 C82 158 76 144 76 134 C76 128 70 124 66 124 C56 124 42 118 42 100 C42 82 56 76 66 76 C70 76 76 72 76 66 C76 56 82 42 100 42 Z" fill="#1E2F3A"/>
    <g transform="translate(100,100)">${rose}<circle r="3" fill="#F4F4F0"/></g>
    ${lobes}
  </svg>`;
}

/** The orange dealer plaque showing the round wind. */
export function plaqueSvg(roundWind) {
  return `<svg viewBox="0 0 64 36" xmlns="http://www.w3.org/2000/svg" class="plaque" role="img" aria-label="Round wind ${WIND_GLYPH[roundWind]}"><rect x="1" y="1" width="62" height="34" rx="5" fill="#F0581F" stroke="#B53E1C" stroke-width="1.5"/><text x="32" y="27" text-anchor="middle" font-size="22" font-weight="700" fill="#FFFFFF" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">${WIND_GLYPH[roundWind]}</text></svg>`;
}

export function diceSvg(n) {
  const pips = { 1: [[7, 7]], 2: [[4, 4], [10, 10]], 3: [[4, 4], [7, 7], [10, 10]], 4: [[4, 4], [10, 4], [4, 10], [10, 10]], 5: [[4, 4], [10, 4], [7, 7], [4, 10], [10, 10]], 6: [[4, 4], [10, 4], [4, 7], [10, 7], [4, 10], [10, 10]] }[n] || [];
  return `<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" class="die" role="img" aria-label="die showing ${n}"><rect x="0.5" y="0.5" width="13" height="13" rx="2.5" fill="#FFFFFF" stroke="#C8C8C0"/>${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${n === 1 ? '#D9342B' : '#222'}"/>`).join('')}</svg>`;
}
