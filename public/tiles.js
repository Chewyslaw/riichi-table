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

// Face inks — the palette of a Japanese riichi set like AMOS: black brush ink, vermilion, deep green,
// slate-blue coins and a bright white face. Fully opaque everywhere, so the art never washes out.
const INK = {
  face: '#FBFAF4', faceEdge: '#9A927E',
  index: '#15181E', indexHalo: '#FFFFFF',
  black: '#17191C', red: '#C8321A', green: '#1B6B3A', blue: '#2B57A6', coin: '#223B4F', white: '#FBFAF4',
};
// Brush calligraphy (Google Fonts "Yuji" family): Boku is a heavy kaisho brush for numerals, winds and
// dragons; Mai is a cursive brush for the red 萬. Noto Serif JP stands in until they load.
const BRUSH = `'Yuji Boku','Yuji Syuku','Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif`;
const CURSIVE = `'Yuji Mai','Yuji Boku','Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif`;
const SANS = `Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`;

// Tile faces are drawn on a 400×560 canvas (ten units per old unit) so edges, rings and
// bevels can be placed to a tenth of a pixel at any on-screen size.
export const TILE_W = 400, TILE_H = 560;

/** The blank tile body: white face, crisp edge, bevel light from the upper left. */
function tileBody() {
  return `<rect x="8" y="8" width="384" height="544" rx="46" fill="${INK.face}" stroke="${INK.faceEdge}" stroke-width="12"/>` +
    `<rect x="8" y="8" width="384" height="544" rx="46" fill="url(#tf-g)"/>` +
    `<path d="M40 500 V62 a22 22 0 0 1 22 -22 H338" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M62 520 H338 a22 22 0 0 0 22 -22 V70" fill="none" stroke="#B9B19C" stroke-width="8" stroke-linecap="round"/>`;
}

/** The index numeral, in the top-right corner like the AMOS Numbers tiles: heavy, near-black,
 *  with a white halo so it still reads on a 20 px tile. */
function cornerIndex(label, color) {
  const two = label.length > 1;
  const size = two ? 84 : 108;
  return `<text x="366" y="${two ? 104 : 116}" text-anchor="end" font-size="${size}" font-weight="900" fill="${color}" stroke="${INK.indexHalo}" stroke-width="16" stroke-linejoin="round" paint-order="stroke" letter-spacing="${two ? -5 : -2}" font-family="${SANS}">${label}</text>`;
}

/** A brush glyph with a hairline stroke in its own colour so thin brush strokes stay solid when small. */
function glyph(text, x, y, size, fill, family = BRUSH, stroke = 6) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="900" fill="${fill}" stroke="${fill}" stroke-width="${stroke}" stroke-linejoin="round" paint-order="stroke" font-family="${family}">${text}</text>`;
}

/** A coin (circle tile dot): dark disc, pale ring, coloured centre. */
function coin(cx, cy, r, centre) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK.coin}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.64}" fill="none" stroke="${INK.white}" stroke-width="${Math.max(14, r * 0.17)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="${centre}"/>`;
}

/** A bamboo stick: dark green body with two pale knots, like the engraved sticks of a Japanese set. */
function stick(x, y, h, color) {
  const k1 = y + h * 0.33, k2 = y + h * 0.67;
  return `<rect x="${x - 32}" y="${y}" width="64" height="${h}" rx="18" fill="${color}"/>` +
    `<rect x="${x - 32}" y="${k1 - 7}" width="64" height="14" fill="${INK.white}"/><rect x="${x - 32}" y="${k2 - 7}" width="64" height="14" fill="${INK.white}"/>` +
    `<rect x="${x - 22}" y="${k1 - 3}" width="44" height="6" rx="3" fill="${color}"/><rect x="${x - 22}" y="${k2 - 3}" width="44" height="6" rx="3" fill="${color}"/>`;
}

/** The bird on the one of bamboo: a dark peafowl facing left, with a fan of green tail feathers
 *  (red eye-spots), a red crest, beak and feet. */
function bird(red) {
  const body = red ? INK.red : INK.black;
  const tail = red ? INK.red : INK.green;
  const px = 46, py = 96; // tail pivot
  const feathers = [-18, -44, -70, -96, -122].map((a) => {
    const rad = a * Math.PI / 180, cx = px + Math.cos(rad) * 100, cy = py + Math.sin(rad) * 100;
    const tx = px + Math.cos(rad) * 172, ty = py + Math.sin(rad) * 172;
    return `<ellipse cx="${cx}" cy="${cy}" rx="25" ry="104" transform="rotate(${a + 90} ${cx} ${cy})" fill="${tail}" stroke="${INK.white}" stroke-width="5" paint-order="stroke"/>` +
      `<circle cx="${tx}" cy="${ty}" r="15" fill="${INK.white}"/><circle cx="${tx}" cy="${ty}" r="9" fill="${INK.red}"/>`;
  }).join('');
  return `<g transform="translate(186,290)">
    ${feathers}
    <ellipse cx="-4" cy="118" rx="70" ry="86" fill="${body}"/>
    <path d="M-60 60 Q-52 -10 -34 -30 L6 -30 Q-10 20 -4 60 Z" fill="${body}"/>
    <circle cx="-34" cy="-40" r="46" fill="${body}"/>
    <path d="M-78 -48 l-52 -10 l52 -20 z" fill="${INK.red}"/>
    <path d="M-50 -82 q0 -34 20 -46 M-36 -84 q10 -30 34 -34 M-60 -78 q-16 -26 -2 -46" fill="none" stroke="${INK.red}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="-22" cy="-50" r="13" fill="${INK.white}"/><circle cx="-18" cy="-48" r="6" fill="${INK.black}"/>
    <path d="M-50 112 q42 -30 84 -2" fill="none" stroke="${INK.white}" stroke-width="9" stroke-linecap="round"/>
    <path d="M-32 196 l-10 44 M-42 240 l-24 0 M-42 240 l22 0 M24 196 l10 44 M34 240 l-24 0 M34 240 l24 0" fill="none" stroke="${INK.red}" stroke-width="11" stroke-linecap="round"/>
  </g>`;
}

export function tileFace(kind, red = false) {
  const suit = suitOf(kind);
  const n = numOf(kind);
  let inner = '';
  const corner = suit === 'z' ? ['E', 'S', 'W', 'N', 'Wh', 'Gr', 'Rd'][n - 1] : String(n);
  const index = cornerIndex(corner, red ? INK.red : INK.index);
  if (suit === 'm') {
    // characters: black brush numeral over a red cursive 萬 (the aka five is all red)
    inner = glyph(MAN_NUM[n - 1], 200, 258, 206, red ? INK.red : INK.black) + glyph('萬', 200, 498, 214, INK.red, CURSIVE, 8);
  } else if (suit === 'p') {
    const pts = PIN_LAYOUTS[n];
    if (n === 1) {
      // the big single coin: red heart, green and blue rings
      inner = `<circle cx="200" cy="300" r="138" fill="${INK.green}"/><circle cx="200" cy="300" r="112" fill="${INK.white}"/><circle cx="200" cy="300" r="92" fill="${INK.blue}"/><circle cx="200" cy="300" r="64" fill="${INK.white}"/><circle cx="200" cy="300" r="44" fill="${INK.red}"/>` +
        [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<circle cx="${200 + Math.cos(a * Math.PI / 180) * 125}" cy="${300 + Math.sin(a * Math.PI / 180) * 125}" r="8" fill="${INK.white}"/>`).join('');
    } else {
      const r = n <= 4 ? 78 : n <= 6 ? 62 : 56;
      const centres = [INK.red, INK.green, INK.blue];
      inner = pts.map(([x, y], i) => coin(52 + x * 300, 118 + y * 410, r, red ? INK.red : centres[(i + n) % 3])).join('');
    }
  } else if (suit === 's') {
    if (n === 1) inner = bird(red);
    else {
      // sticks: 2, 3, 4, 6, 8 all green (the "all green" tiles); 5, 7, 9 carry red sticks
      const ROWS = { 2: [1, 1], 3: [1, 1, 1], 4: [2, 2], 5: [2, 1, 2], 6: [2, 2, 2], 7: [1, 3, 3], 8: [3, 2, 3], 9: [3, 3, 3] }[n];
      const RED = { 5: [2], 7: [0], 9: [1, 4, 7] }[n] || [];
      const rows = ROWS.length;
      const parts = [];
      let i = 0;
      const top = 128, bottom = 526, gap = 20;
      const h = (bottom - top - gap * (rows - 1)) / rows;
      for (let r = 0; r < rows; r++) {
        const inRow = ROWS[r];
        for (let c = 0; c < inRow; c++) {
          const x = 200 + (c - (inRow - 1) / 2) * 108;
          const y = top + r * (h + gap);
          parts.push(stick(x, y, h, red || RED.includes(i) ? INK.red : INK.green));
          i++;
        }
      }
      inner = parts.join('');
    }
  } else {
    const idx = n - 1;
    if (idx === 4) {
      // white dragon: the blue frame
      inner = `<rect x="86" y="140" width="228" height="360" rx="20" fill="none" stroke="${INK.blue}" stroke-width="28"/><rect x="122" y="176" width="156" height="288" rx="10" fill="none" stroke="${INK.blue}" stroke-width="8"/>`;
    } else {
      const fill = idx === 5 ? INK.green : idx === 6 ? INK.red : INK.black;
      inner = glyph(HONOR[idx], 200, 440, 296, fill);
    }
  }
  return `<svg viewBox="0 0 ${TILE_W} ${TILE_H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">${tileBody()}${inner}${index}</svg>`;
}

export function tileBack() {
  // amber "mahjong yellow" backs, like the AMOS tiles — a moulded block lit from the upper left, with a crisp dark edge
  return `<svg viewBox="0 0 ${TILE_W} ${TILE_H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" shape-rendering="geometricPrecision"><rect x="8" y="8" width="384" height="544" rx="46" fill="url(#tb-g)" stroke="#8A6212" stroke-width="12"/><rect x="8" y="8" width="384" height="544" rx="46" fill="url(#tb-e)"/><rect x="40" y="40" width="320" height="480" rx="30" fill="none" stroke="#F8E3A0" stroke-width="10"/><rect x="40" y="40" width="320" height="480" rx="30" fill="none" stroke="#A8781C" stroke-width="4" transform="translate(4,4)"/></svg>`;
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
  // a <span>, not a <div>: tiles are placed inside paragraphs and list items in the help pages, and a <div> there would break out of the <p>
  return `<span class="${cls.join(' ')}"${data}${title}>${inner}</span>`;
}

export function kindHtml(kind, classes = []) {
  return `<span class="tile ${classes.join(' ')}" data-kind="${kind}">${tileFace(kind)}</span>`;
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
  const gid = 'sk-' + value; // gradients are defined once in index.html
  return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${value} point stick"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2.5" fill="${st.fill}" stroke="${st.edge}"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2.5" fill="url(#${gid})"/>${marks}</svg>`;
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
export function compassSvg({ dealerRel = 0, diceSum = 0, dice = null } = {}) {
  const C = 120;
  const diceGroup = `<g class="dice-on-compass" transform="translate(160,160)">${diceSvgInline(dice ? dice[0] : 0, -19, 0, -8)}${diceSvgInline(dice ? dice[1] : 0, 6, -6, 11)}</g>`;
  const ROT = [0, -90, 180, 90]; // rotation so that content at position k reads from that seat (0 bottom, 1 right, 2 top, 3 left)
  const AT = (k, d) => [[0, d], [d, 0], [0, -d], [-d, 0]][k];
  // lobe at position r shows that seat's wind (relative to the dealer); the dealer's glyph is vermilion
  const lobes = [0, 1, 2, 3].map((r) => {
    const wind = (r - dealerRel + 4) % 4;
    const [dx, dy] = AT(r, 49);
    const isDealer = wind === 0;
    return `<g transform="translate(${C + dx},${C + dy}) rotate(${ROT[r]})">
      <text x="0" y="9" text-anchor="middle" font-size="26" font-weight="700" fill="${isDealer ? '#FF6A3D' : '#F6F7F4'}" stroke="#0C1419" stroke-width="0.8" paint-order="stroke" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">${WIND_GLYPH[wind]}</text></g>`;
  }).join('');
  // dice-count numbers: dealer edge 5·9, dealer's right 2·6·10, across 3·7·11, left 4·8·12
  const sets = [[5, 9], [2, 6, 10], [3, 7, 11], [4, 8, 12]];
  const numbers = [0, 1, 2, 3].map((k) => {
    const r = (dealerRel + k) % 4; // physical position of this edge
    const [dx, dy] = AT(r, 90);
    const hot = sets[k].includes(diceSum);
    const label = sets[k].join(' · ');
    const w = label.length * 7.6 + 14;
    return `<g transform="translate(${C + dx},${C + dy}) rotate(${ROT[r]})">
      ${hot ? `<rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="9" fill="#FF6A3D" opacity="0.22"/><circle cx="0" cy="-13" r="2" fill="#E8552B"/>` : ''}
      <text x="0" y="4.5" text-anchor="middle" font-size="12.5" font-weight="800" letter-spacing="1.5" fill="${hot ? '#9E3416' : '#163043'}" font-family="Inter,system-ui,sans-serif">${label}</text></g>`;
  }).join('');
  // stick slots on each edge
  const slots = [0, 1, 2, 3].map((k) => {
    const [dx, dy] = AT(k, 112);
    return `<g transform="translate(${C + dx},${C + dy}) rotate(${ROT[k]})"><rect x="-36" y="-6.5" width="72" height="13" rx="4" fill="#15191C"/><rect x="-33" y="-4" width="66" height="8" rx="3" fill="#20262B" stroke="#3A4247" stroke-width="1"/></g>`;
  }).join('');
  // four-lobed plate (union of circles + hub), drawn twice for a bevel
  const plate = (fill, off) => [0, 1, 2, 3].map((k) => { const [dx, dy] = AT(k, 48); return `<circle cx="${C + dx}" cy="${C + dy + off}" r="29" fill="${fill}"/>`; }).join('') + `<circle cx="${C}" cy="${C + off}" r="43" fill="${fill}"/>`;
  // 16-point rose: each point split into a light and a dark half
  const point = (r, w, a, light, dark) => `<g transform="rotate(${a})"><path d="M0 ${-r} L${w} 0 L0 0 Z" fill="${dark}"/><path d="M0 ${-r} L${-w} 0 L0 0 Z" fill="${light}"/></g>`;
  const rose = [0, 90, 180, 270].map((a) => point(36, 5.5, a, '#DDF2F8', '#7FC3DA')).join('')
    + [45, 135, 225, 315].map((a) => point(25, 4.5, a, '#BFE3EE', '#4F93B5')).join('')
    + [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((a) => point(16, 3, a, '#9ED8EA', '#3B6F8A')).join('');
  return `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" class="compass" role="img" aria-label="Wind compass">
    <rect x="4" y="4" width="232" height="232" rx="24" fill="url(#cmp-base)" stroke="#4FA7C4" stroke-width="2.5"/>
    <rect x="8" y="8" width="224" height="224" rx="21" fill="none" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="1.5"/>
    <rect x="4" y="4" width="232" height="232" rx="24" fill="url(#cmp-sheen)"/>
    ${slots}${numbers}
    ${plate('#0B141B', 3)}${plate('url(#cmp-plate)', 0)}
    <g transform="translate(${C},${C})">${rose}<circle r="6" fill="#F6F7F4" stroke="#163043" stroke-width="1.5"/><circle r="1.8" fill="#163043"/></g>
    ${lobes}
    ${diceGroup}
  </svg>`;
}

/** A small die drawn inline inside another SVG (16 px, rotated for a thrown look). */
function diceSvgInline(n, x, y, rot) {
  const pips = { 1: [[7, 7]], 2: [[4, 4], [10, 10]], 3: [[4, 4], [7, 7], [10, 10]], 4: [[4, 4], [10, 4], [4, 10], [10, 10]], 5: [[4, 4], [10, 4], [7, 7], [4, 10], [10, 10]], 6: [[4, 4], [10, 4], [4, 7], [10, 7], [4, 10], [10, 10]] }[n] || [];
  const face = n ? pips.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="1.35" fill="${n === 1 ? '#D9342B' : '#222'}"/>`).join('') : `<text x="7" y="10.3" text-anchor="middle" font-size="9" font-weight="700" fill="#999" font-family="Inter,system-ui,sans-serif">?</text>`;
  return `<g class="die" transform="translate(${x},${y}) rotate(${rot}) scale(1.45)"><rect x="1.1" y="1.1" width="13" height="13" rx="2.8" fill="#000" fill-opacity="0.22"/><rect x="0.5" y="0.5" width="13" height="13" rx="2.8" fill="#FFFFFF" stroke="#B9B9B2" stroke-width="0.8"/><path d="M2.5 11 V3.5 a1 1 0 0 1 1 -1 H11" fill="none" stroke="#FFFFFF" stroke-width="1"/><path d="M3.5 11.5 H10.5 a1 1 0 0 0 1 -1 V3.5" fill="none" stroke="#000" stroke-opacity="0.08" stroke-width="1"/>${face}</g>`;
}

/** The orange dealer plaque showing the round wind. */
export function plaqueSvg(roundWind) {
  return `<svg viewBox="0 0 64 36" xmlns="http://www.w3.org/2000/svg" class="plaque" role="img" aria-label="Round wind ${WIND_GLYPH[roundWind]}"><rect x="1" y="1" width="62" height="34" rx="5" fill="url(#pl-g)" stroke="#A93612" stroke-width="1.5"/><path d="M4 30 V6 a2 2 0 0 1 2 -2 H58" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="1.2" stroke-linecap="round"/><text x="32" y="27" text-anchor="middle" font-size="22" font-weight="700" fill="#FFFFFF" font-family="'Noto Serif JP','Hiragino Mincho ProN',serif">${WIND_GLYPH[roundWind]}</text></svg>`;
}

export function diceSvg(n) {
  // standalone die (help page); same lighting as the ones on the compass
  if (!n) return `<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" class="die" role="img" aria-label="die, not rolled yet"><rect x="0.5" y="0.5" width="13" height="13" rx="2.5" fill="#FFFFFF" stroke="#C8C8C0"/><text x="7" y="10.2" text-anchor="middle" font-size="9" font-weight="700" fill="#888" font-family="Inter,system-ui,sans-serif">?</text></svg>`;
  const pips = { 1: [[7, 7]], 2: [[4, 4], [10, 10]], 3: [[4, 4], [7, 7], [10, 10]], 4: [[4, 4], [10, 4], [4, 10], [10, 10]], 5: [[4, 4], [10, 4], [7, 7], [4, 10], [10, 10]], 6: [[4, 4], [10, 4], [4, 7], [10, 7], [4, 10], [10, 10]] }[n] || [];
  return `<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" class="die" role="img" aria-label="die showing ${n}"><rect x="0.5" y="0.5" width="13" height="13" rx="2.5" fill="#FFFFFF" stroke="#C8C8C0"/>${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${n === 1 ? '#D9342B' : '#222'}"/>`).join('')}</svg>`;
}

/** Gradient definitions shared by every tile, stick, plaque and compass. Rendered once, visibly (not display:none),
 *  because a gradient referenced from inside a hidden element paints black in Chromium. */
export const SHARED_DEFS = `<svg class="shared-defs" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">
  <defs>
    <linearGradient id="tf-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.6"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#6B6350" stop-opacity="0.16"/></linearGradient>
    <linearGradient id="tb-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F0C45A"/><stop offset="0.55" stop-color="#E0AA36"/><stop offset="1" stop-color="#BD861C"/></linearGradient>
    <linearGradient id="tb-e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="0.3" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.18"/></linearGradient>
    <linearGradient id="pl-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7A3F"/><stop offset="1" stop-color="#D9470F"/></linearGradient>
    <linearGradient id="cmp-base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C6ECF7"/><stop offset="1" stop-color="#86CBE2"/></linearGradient>
    <radialGradient id="cmp-sheen" cx="0.3" cy="0.25" r="0.8"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    <linearGradient id="cmp-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A4458"/><stop offset="1" stop-color="#15232E"/></linearGradient>
    ${[10000, 5000, 1000, 500, 100].map((v) => `<linearGradient id="sk-${v}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.45"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.22"/></linearGradient>`).join('')}
  </defs>
</svg>`;
