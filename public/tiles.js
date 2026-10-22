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
 * The wind compass for the centre of the table — a moulded light-blue card with a navy four-lobed
 * plate, a 16-point rose, stick slots on each edge and the dice-count numbers for breaking the wall.
 * dealerRel: where the dealer sits relative to the viewer (0 bottom, 1 right, 2 top, 3 left).
 * diceSum: this hand's dice roll (highlights the matching wall-count numbers).
 */
export function compassSvg({ dealerRel = 0, diceSum = 0 } = {}) {
  const C = 120;
  const ROT = [0, -90, 180, 90]; // rotation so that content at position k reads from that seat (0 bottom, 1 right, 2 top, 3 left)
  const AT = (k, d) => [[0, d], [d, 0], [0, -d], [-d, 0]][k];
  // lobe at position r shows that seat's wind (relative to the dealer); the dealer's glyph is vermilion
  const lobes = [0, 1, 2, 3].map((r) => {
    const wind = (r - dealerRel + 4) % 4;
    const [dx, dy] = AT(r, 54);
    const isDealer = wind === 0;
    return `<g transform="translate(${C + dx},${C + dy}) rotate(${ROT[r]})">
      <text x="0" y="10" text-anchor="middle" font-size="28" font-weight="700" fill="${isDealer ? '#FF6A3D' : '#F6F7F4'}" stroke="#0C1419" stroke-width="0.8" paint-order="stroke" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">${WIND_GLYPH[wind]}</text></g>`;
  }).join('');
  // dice-count numbers: dealer edge 5·9, dealer's right 2·6·10, across 3·7·11, left 4·8·12
  const sets = [[5, 9], [2, 6, 10], [3, 7, 11], [4, 8, 12]];
  const numbers = [0, 1, 2, 3].map((k) => {
    const r = (dealerRel + k) % 4; // physical position of this edge
    const [dx, dy] = AT(r, 97);
    const hot = sets[k].includes(diceSum);
    const label = sets[k].join(' · ');
    const w = label.length * 8.2 + 16;
    return `<g transform="translate(${C + dx},${C + dy}) rotate(${ROT[r]})">
      ${hot ? `<rect x="${-w / 2}" y="-10" width="${w}" height="20" rx="10" fill="#FF6A3D"/><path d="M-5 -10 L0 -16 L5 -10 Z" fill="#FF6A3D"/>` : ''}
      <text x="0" y="5" text-anchor="middle" font-size="13.5" font-weight="800" letter-spacing="1.5" fill="${hot ? '#FFFFFF' : '#163043'}" font-family="Inter,system-ui,sans-serif">${label}</text></g>`;
  }).join('');
  // stick slots on each edge
  const slots = [0, 1, 2, 3].map((k) => {
    const [dx, dy] = AT(k, 108);
    return `<g transform="translate(${C + dx},${C + dy}) rotate(${ROT[k]})"><rect x="-36" y="-7" width="72" height="14" rx="4" fill="#15191C"/><rect x="-33" y="-4.5" width="66" height="9" rx="3" fill="#20262B" stroke="#3A4247" stroke-width="1"/></g>`;
  }).join('');
  // four-lobed plate (union of circles + hub), drawn twice for a bevel
  const plate = (fill, off) => [0, 1, 2, 3].map((k) => { const [dx, dy] = AT(k, 52); return `<circle cx="${C + dx}" cy="${C + dy + off}" r="31" fill="${fill}"/>`; }).join('') + `<circle cx="${C}" cy="${C + off}" r="47" fill="${fill}"/>`;
  // 16-point rose: each point split into a light and a dark half
  const point = (r, w, a, light, dark) => `<g transform="rotate(${a})"><path d="M0 ${-r} L${w} 0 L0 0 Z" fill="${dark}"/><path d="M0 ${-r} L${-w} 0 L0 0 Z" fill="${light}"/></g>`;
  const rose = [0, 90, 180, 270].map((a) => point(40, 6, a, '#DDF2F8', '#7FC3DA')).join('')
    + [45, 135, 225, 315].map((a) => point(28, 5, a, '#BFE3EE', '#4F93B5')).join('')
    + [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((a) => point(18, 3.5, a, '#9ED8EA', '#3B6F8A')).join('');
  return `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" class="compass" role="img" aria-label="Wind compass">
    <defs>
      <linearGradient id="cmp-base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C6ECF7"/><stop offset="1" stop-color="#86CBE2"/></linearGradient>
      <radialGradient id="cmp-sheen" cx="0.3" cy="0.25" r="0.8"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
      <linearGradient id="cmp-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A4458"/><stop offset="1" stop-color="#15232E"/></linearGradient>
    </defs>
    <rect x="4" y="4" width="232" height="232" rx="24" fill="url(#cmp-base)" stroke="#4FA7C4" stroke-width="2.5"/>
    <rect x="8" y="8" width="224" height="224" rx="21" fill="none" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="1.5"/>
    <rect x="4" y="4" width="232" height="232" rx="24" fill="url(#cmp-sheen)"/>
    ${slots}${numbers}
    ${plate('#0B141B', 3)}${plate('url(#cmp-plate)', 0)}
    <g transform="translate(${C},${C})">${rose}<circle r="6" fill="#F6F7F4" stroke="#163043" stroke-width="1.5"/><circle r="1.8" fill="#163043"/></g>
    ${lobes}
  </svg>`;
}

/** The orange dealer plaque showing the round wind. */
export function plaqueSvg(roundWind) {
  return `<svg viewBox="0 0 64 36" xmlns="http://www.w3.org/2000/svg" class="plaque" role="img" aria-label="Round wind ${WIND_GLYPH[roundWind]}"><rect x="1" y="1" width="62" height="34" rx="5" fill="#F0581F" stroke="#B53E1C" stroke-width="1.5"/><text x="32" y="27" text-anchor="middle" font-size="22" font-weight="700" fill="#FFFFFF" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">${WIND_GLYPH[roundWind]}</text></svg>`;
}

export function diceSvg(n) {
  if (!n) return `<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" class="die" role="img" aria-label="die, not rolled yet"><rect x="0.5" y="0.5" width="13" height="13" rx="2.5" fill="#FFFFFF" stroke="#C8C8C0"/><text x="7" y="10.2" text-anchor="middle" font-size="9" font-weight="700" fill="#888" font-family="Inter,system-ui,sans-serif">?</text></svg>`;
  const pips = { 1: [[7, 7]], 2: [[4, 4], [10, 10]], 3: [[4, 4], [7, 7], [10, 10]], 4: [[4, 4], [10, 4], [4, 10], [10, 10]], 5: [[4, 4], [10, 4], [7, 7], [4, 10], [10, 10]], 6: [[4, 4], [10, 4], [4, 7], [10, 7], [4, 10], [10, 10]] }[n] || [];
  return `<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" class="die" role="img" aria-label="die showing ${n}"><rect x="0.5" y="0.5" width="13" height="13" rx="2.5" fill="#FFFFFF" stroke="#C8C8C0"/>${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${n === 1 ? '#D9342B' : '#222'}"/>`).join('')}</svg>`;
}
