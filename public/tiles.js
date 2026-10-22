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
  if (suit === 'm') {
    inner = `<text x="20" y="25" text-anchor="middle" font-size="19" font-weight="700" fill="${red ? '#C9452C' : '#1B2A4A'}" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">${MAN_NUM[n - 1]}</text>
      <text x="20" y="48" text-anchor="middle" font-size="20" font-weight="700" fill="#C9452C" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">萬</text>`;
  } else if (suit === 'p') {
    const pts = PIN_LAYOUTS[n];
    const r = n === 1 ? 13 : n <= 4 ? 8 : 6;
    const colors = ['#1F7A4F', '#C9452C', '#1B2A4A'];
    inner = pts.map(([x, y], i) => {
      const c = n === 1 ? '#C9452C' : red ? '#C9452C' : colors[(i + n) % 3];
      return `<circle cx="${4 + x * 32}" cy="${4 + y * 48}" r="${r}" fill="${c}" stroke="#0f1a2a" stroke-width="1"/>${n === 1 ? `<circle cx="20" cy="28" r="6" fill="#1B2A4A"/><circle cx="20" cy="28" r="2.5" fill="#F5EFDF"/>` : ''}`;
    }).join('');
  } else if (suit === 's') {
    if (n === 1) {
      inner = `<g transform="translate(20,30)"><ellipse cx="0" cy="4" rx="9" ry="11" fill="${red ? '#C9452C' : '#1F7A4F'}"/><circle cx="0" cy="-11" r="6" fill="${red ? '#C9452C' : '#1F7A4F'}"/><path d="M-6 -11 l-5 -2 l5 -1 z" fill="#C9452C"/><path d="M-4 14 l-3 7 M0 15 l0 7 M4 14 l3 7" stroke="#C9452C" stroke-width="2" fill="none"/><circle cx="2" cy="-12" r="1.3" fill="#F5EFDF"/></g>`;
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
          parts.push(`<rect x="${x - 3}" y="${y}" width="6" height="${h}" rx="2" fill="${colorFor(i)}"/><line x1="${x - 3}" y1="${y + h / 2}" x2="${x + 3}" y2="${y + h / 2}" stroke="#F5EFDF" stroke-width="1.5"/>`);
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
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="38" height="54" rx="5" fill="#F5EFDF" stroke="#CFC3A5" stroke-width="1.5"/><rect x="3.5" y="3.5" width="33" height="49" rx="3.5" fill="none" stroke="#FFFBF0" stroke-width="1"/>${inner}</svg>`;
}

export function tileBack() {
  return `<svg viewBox="0 0 40 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="38" height="54" rx="5" fill="#2E8B63" stroke="#1C5A40" stroke-width="1.5"/><rect x="5" y="5" width="30" height="46" rx="3" fill="none" stroke="#5FB08A" stroke-width="1.2" opacity="0.8"/><circle cx="20" cy="28" r="5" fill="none" stroke="#5FB08A" stroke-width="1.2" opacity="0.8"/></svg>`;
}

/** HTML for a tile element. opts: { faceDown, classes, data, rotated, title } */
export function tileHtml(tile, opts = {}) {
  const cls = ['tile'];
  if (opts.faceDown) cls.push('back');
  if (opts.rotated) cls.push('rotated');
  if (opts.classes) cls.push(...opts.classes);
  const data = opts.data ? Object.entries(opts.data).map(([k, v]) => ` data-${k}="${v}"`).join('') : '';
  const inner = opts.faceDown || tile == null ? tileBack() : tileFace(kindOf(tile), isRedFive(tile));
  const title = opts.title ? ` title="${opts.title}"` : '';
  return `<div class="${cls.join(' ')}"${data}${title}>${inner}</div>`;
}

export function kindHtml(kind, classes = []) {
  return `<div class="tile ${classes.join(' ')}">${tileFace(kind)}</div>`;
}
