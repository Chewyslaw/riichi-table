// The game-over screen: final standings, how the scores moved hand by hand, a few stats, and every winning hand.
import { tileHtml } from './tiles.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
const shortRound = (r) => r.replace(/^(East|South|West|North) (\d)$/, (m, w, n) => w[0] + n);

// One colour per seat (validated as a 4-series set on the dark panel: blue, orange, aqua, violet).
export const SEAT_COLORS = ['#3987e5', '#d95926', '#199e70', '#9085e9'];

const DORA = /^(Dora|Aka Dora|Ura Dora)( \d+)?$/;

/** Per-player and per-game numbers, from the compact record of every hand. */
export function gameStats(summary, nPlayers = 4) {
  const blank = () => Array(nPlayers).fill(0);
  const st = { hands: summary.length, wins: blank(), tsumo: blank(), dealIns: blank(), riichi: blank(), open: blank(), won: blank(), best: Array(nPlayers).fill(null), draws: 0, yaku: new Map(), biggest: null, streak: null };
  let run = null;
  for (const h of summary) {
    if (h.type === 'win') {
      const dealtIn = new Set();
      for (const w of h.wins) {
        st.wins[w.seat]++;
        if (w.tsumo) st.tsumo[w.seat]++; else dealtIn.add(w.from);
        st.won[w.seat] += w.value;
        if (!st.best[w.seat] || w.value > st.best[w.seat].value) st.best[w.seat] = { ...w, round: h.round };
        if (!st.biggest || w.value > st.biggest.value) st.biggest = { ...w, round: h.round };
        for (const y of w.yaku) if (!DORA.test(y)) st.yaku.set(y, (st.yaku.get(y) || 0) + 1);
      }
      for (const s of dealtIn) st.dealIns[s]++;
    } else st.draws++;
    h.riichi.forEach((r, i) => { if (r) st.riichi[i]++; });
    h.open.forEach((o, i) => { if (o) st.open[i]++; });
    // the longest a dealer kept the deal (hands in a row as dealer)
    run = run && run.seat === h.dealer && run.round === h.round ? { ...run, n: run.n + 1 } : { seat: h.dealer, round: h.round, n: 1 };
    if (run.n > 1 && (!st.streak || run.n > st.streak.n)) st.streak = run;
  }
  st.topYaku = [...st.yaku.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  return st;
}

function handValue(w) {
  if (w.yakuman) return esc(w.limit);
  return `${w.han} han${w.han < 5 ? ` ${w.fu} fu` : ''}${w.limit ? ` · ${esc(w.limit)}` : ''}`;
}

/** The whole panel. reviewable: hand numbers the log can still open (the last few). */
export function gameOverHtml(v, { reviewable = new Set() } = {}) {
  const ranking = v.result.ranking;
  const start = v.rules.startScore || 25000;
  const names = v.players.map((p) => p.name);
  const summary = v.summary || [];
  const st = gameStats(summary, v.players.length);
  const dot = (seat) => `<i class="sw" style="background:${SEAT_COLORS[seat]}"></i>`;
  const who = (seat) => `${dot(seat)}${esc(names[seat])}`;

  const standings = `<ol class="go-rank">${ranking.map((r, i) => `<li class="${i === 0 ? 'first' : ''}${r.seat === v.seat ? ' me' : ''}"><span class="pl">${i + 1}</span><span class="nm">${who(r.seat)}</span><span class="sc">${fmt(r.score)}</span><span class="df ${r.score - start > 0 ? 'pos' : r.score - start < 0 ? 'neg' : ''}">${signed(r.score - start)}</span></li>`).join('')}</ol>`;

  const sub = summary.length
    ? `${st.hands} hand${st.hands === 1 ? '' : 's'} played`
    : '';

  if (!summary.length) return `<div class="panel gameover"><div class="go-head"><h2>Game over</h2></div>${standings}<div class="actions"><button class="primary" id="btn-home">Back to home</button></div></div>`;

  // highlights
  const tiles = [];
  if (st.biggest) tiles.push(['Biggest hand', `${fmt(st.biggest.value)}`, `${esc(names[st.biggest.seat])} · ${handValue(st.biggest)} · ${esc(st.biggest.round)}`]);
  const mostWins = Math.max(...st.wins);
  if (mostWins > 0) {
    const leaders = st.wins.map((n, i) => (n === mostWins ? i : -1)).filter((i) => i >= 0);
    tiles.push(['Most wins', String(mostWins), leaders.map((i) => esc(names[i])).join(', ')]);
  }
  if (st.topYaku) tiles.push(['Most common yaku', esc(st.topYaku[0]), `in ${st.topYaku[1]} winning hand${st.topYaku[1] === 1 ? '' : 's'}`]);
  if (st.streak) tiles.push(['Longest dealer run', `${st.streak.n} hands`, `${esc(names[st.streak.seat])} · ${esc(st.streak.round)}`]);
  const highlights = tiles.length ? `<div class="go-tiles">${tiles.map(([k, big, small]) => `<div class="go-tile"><div class="k">${k}</div><div class="big">${big}</div><div class="small">${small}</div></div>`).join('')}</div>` : '';

  // per-player table, in finishing order
  const cols = [['Wins', (i) => st.wins[i]], ['Tsumo', (i) => st.tsumo[i]], ['Dealt in', (i) => st.dealIns[i]], ['Riichi', (i) => st.riichi[i]], ['Called', (i) => st.open[i]], ['Best hand', (i) => (st.best[i] ? fmt(st.best[i].value) : '—')]];
  const tips = { 'Dealt in': 'Hands where this player discarded someone else’s winning tile', Called: 'Hands where this player opened their hand with a chi, pon or kan', 'Best hand': 'Points from their most valuable win (riichi sticks not included)', Riichi: 'Hands where this player declared riichi' };
  const table = `<div class="go-tablewrap"><table class="go-table"><thead><tr><th></th>${cols.map(([h]) => `<th class="c-${h.split(' ')[0].toLowerCase()}"${tips[h] ? ` title="${tips[h]}"` : ''}>${h}</th>`).join('')}</tr></thead><tbody>${ranking.map((r) => `<tr${r.seat === v.seat ? ' class="me"' : ''}><th>${who(r.seat)}</th>${cols.map(([h, f]) => `<td class="c-${h.split(' ')[0].toLowerCase()}">${f(r.seat)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  // every winning hand, in order
  const wins = summary.filter((h) => h.type === 'win');
  const handRows = wins.map((h) => {
    const can = reviewable.has(h.handNo);
    return h.wins.map((w) => `<${can ? 'button type="button"' : 'div'} class="go-hand${can ? ' can' : ''}"${can ? ` data-review="${h.handNo}" title="Open this hand"` : ''}>
      <span class="rd">${esc(shortRound(h.round))}${h.honba ? `<small>${h.honba} honba</small>` : ''}</span>
      <span class="wn"><b>${who(w.seat)}</b><small>${w.tsumo ? 'Tsumo' : `Ron off ${esc(names[w.from])}`}${h.wins.length > 1 ? ` · ${h.wins.length === 2 ? 'double' : 'triple'} ron` : ''}</small></span>
      <span class="wt">${tileHtml(w.winTile, { classes: ['inline'] })}</span>
      <span class="yk">${w.yaku.map(esc).join(', ')}</span>
      <span class="val"><b>${fmt(w.value)}</b><small>${handValue(w)}</small></span>
      <span class="chev" aria-hidden="true">${can ? '›' : ''}</span>
    </${can ? 'button' : 'div'}>`).join('');
  }).join('');
  const list = wins.length ? `<div class="go-h">Winning hands</div><div class="go-hands">${handRows}</div>` : `<div class="go-h">Winning hands</div><p class="note">Nobody won a hand — every hand was drawn.</p>`;

  return `<div class="panel gameover">
    <div class="go-head"><h2>Game over</h2><span class="note">${sub}</span></div>
    ${standings}
    <div class="go-h">Scores, hand by hand</div>
    <div class="go-chart" id="go-chart"></div>
    ${highlights}
    <div class="go-h">Player stats</div>
    ${table}
    ${list}
    <div class="actions"><button class="primary" id="btn-home">Back to home</button></div>
  </div>`;
}

/** Score lines for each player across the game, drawn to the width of `el`, with a crosshair + tooltip on hover/tap. */
export function drawScoreChart(el, v) {
  const summary = v.summary || [];
  if (!el || !summary.length) return;
  const names = v.players.map((p) => p.name);
  const n = names.length;
  // a point before the first hand, then the scores after each hand; the last point is the final total (leftover riichi sticks included)
  const first = summary[0];
  // (scores were all the starting score before the first hand; riichi deposits aren't in a hand's changes, so don't work back from them)
  const pts = [{ label: 'Start', note: '', scores: first.handNo === 0 ? first.scores.map(() => v.rules.startScore || 25000) : first.scores.map((s, i) => s - first.changes[i]) }];
  for (const h of summary) {
    const note = h.type === 'win' ? h.wins.map((w) => `${names[w.seat]} ${w.tsumo ? 'tsumo' : 'ron off ' + names[w.from]}`).join(' · ') : h.type === 'draw' ? 'Exhaustive draw' : (h.reason || 'Abortive draw');
    pts.push({ label: h.round + (h.honba ? ` · ${h.honba} honba` : ''), short: shortRound(h.round), note, scores: [...h.scores] });
  }
  pts[pts.length - 1].scores = v.result.ranking.reduce((a, r) => { a[r.seat] = r.score; return a; }, []);

  const W = Math.max(280, el.clientWidth);
  const H = W < 480 ? 190 : 230;
  const labelW = Math.min(110, Math.max(70, W * 0.18));
  const m = { t: 12, r: labelW, b: 26, l: 46 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const all = pts.flatMap((p) => p.scores);
  let lo = Math.min(...all), hi = Math.max(...all);
  const step = [1000, 2000, 5000, 10000, 20000, 50000].find((s) => (hi - lo) / s <= 4) || 100000;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const x = (i) => m.l + (pts.length === 1 ? iw / 2 : (i * iw) / (pts.length - 1));
  const y = (s) => m.t + ih - ((s - lo) / (hi - lo)) * ih;

  const grid = [];
  for (let s = lo; s <= hi + 1; s += step) grid.push(`<line class="gl" x1="${m.l}" x2="${m.l + iw}" y1="${y(s)}" y2="${y(s)}"/><text class="yl" x="${m.l - 6}" y="${y(s) + 4}">${s >= 1000 || s <= -1000 ? (s / 1000) + 'k' : s}</text>`);
  // x labels: as many round names as fit without crowding
  const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor(iw / 38))));
  const shown = pts.map((_, i) => i).filter((i) => i % every === 0);
  const last = pts.length - 1;
  if (shown[shown.length - 1] !== last) {
    if (last - shown[shown.length - 1] < every * 0.6 && shown.length > 1) shown.pop();
    shown.push(last);
  }
  const xl = shown.map((i) => `<text class="xl" x="${x(i)}" y="${H - 8}">${i === 0 ? 'Start' : esc(pts[i].short)}</text>`).join('');
  const lines = [...Array(n).keys()].map((s) => `<path class="ln" stroke="${SEAT_COLORS[s]}" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.scores[s]).toFixed(1)}`).join('')}"/>`).join('');
  // direct labels at the end of each line, nudged apart so they never overlap
  const ends = [...Array(n).keys()].map((s) => ({ s, y: y(pts[pts.length - 1].scores[s]) })).sort((a, b) => a.y - b.y);
  const gap = 15;
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gap) ends[i].y = ends[i - 1].y + gap;
  const over = ends[ends.length - 1].y - (m.t + ih);
  if (over > 0) for (const e of ends) e.y -= over;
  for (let i = ends.length - 2; i >= 0; i--) if (ends[i + 1].y - ends[i].y < gap) ends[i].y = ends[i + 1].y - gap;
  const maxChars = Math.floor((labelW - 18) / 6.6);
  const clip = (t) => (t.length > maxChars ? t.slice(0, maxChars - 1) + '…' : t);
  const endLabels = ends.map((e) => `<circle cx="${m.l + iw + 9}" cy="${e.y - 4}" r="4" fill="${SEAT_COLORS[e.s]}"/><text class="el${e.s === v.seat ? ' me' : ''}" x="${m.l + iw + 17}" y="${e.y}">${esc(clip(names[e.s]))}</text>`).join('');

  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Each player's score after every hand">
    ${grid.join('')}${xl}${lines}${endLabels}
    <g class="xh" style="display:none"><line class="xhl" y1="${m.t}" y2="${m.t + ih}"/>${[...Array(n).keys()].map((s) => `<circle class="mk" r="4.5" fill="${SEAT_COLORS[s]}"/>`).join('')}</g>
    <rect class="hit" x="${m.l - 8}" y="0" width="${iw + 16}" height="${H}" fill="transparent"/>
  </svg><div class="go-tip" hidden></div>`;

  const svg = el.querySelector('svg'), xh = el.querySelector('.xh'), tip = el.querySelector('.go-tip');
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = clientX - r.left;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - m.l) / iw) * (pts.length - 1))));
    const p = pts[i];
    xh.style.display = '';
    xh.querySelector('.xhl').setAttribute('x1', x(i)); xh.querySelector('.xhl').setAttribute('x2', x(i));
    xh.querySelectorAll('.mk').forEach((c, s) => { c.setAttribute('cx', x(i)); c.setAttribute('cy', y(p.scores[s])); });
    const order = [...Array(n).keys()].sort((a, b) => p.scores[b] - p.scores[a]);
    tip.innerHTML = `<div class="th">${esc(p.label)}</div>${p.note ? `<div class="tn">${esc(p.note)}</div>` : ''}${order.map((s) => `<div class="tr"><i class="sw" style="background:${SEAT_COLORS[s]}"></i><span>${esc(names[s])}</span><b>${fmt(p.scores[s])}</b></div>`).join('')}`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = x(i) + 12;
    if (left + tw > W) left = x(i) - 12 - tw;
    tip.style.left = Math.max(0, left) + 'px';
  };
  const hide = () => { xh.style.display = 'none'; tip.hidden = true; };
  const hit = el.querySelector('.hit');
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
}
