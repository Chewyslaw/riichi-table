// The full emoji picker for the room chat: every emoji this device can draw, in the standard groups,
// with search, recently used and skin tones. The data (130 KB) is only fetched the first time it opens.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TAB_ICON = { 'Smileys & Emotion': '😀', 'People & Body': '👋', 'Animals & Nature': '🐻', 'Food & Drink': '🍔', 'Travel & Places': '✈️', Activities: '⚽', Objects: '💡', Symbols: '🔣', Flags: '🏁' };
const TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
const TONE_NAMES = ['Default', 'Light', 'Medium-light', 'Medium', 'Medium-dark', 'Dark'];
const RECENT_MAX = 32;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window, storage full: the picker still works */ } },
};

/** Put a skin tone on an emoji that takes one. Only when exactly one figure in it can carry a tone: half-toned
 *  groups are not real emoji and fall apart into separate pictures on most devices. */
const MOD_BASE = /\p{Emoji_Modifier_Base}/u;
export function withTone(emoji, tone) {
  if (!tone) return emoji;
  const cps = Array.from(emoji);
  const bases = cps.map((c, i) => (MOD_BASE.test(c) ? i : -1)).filter((i) => i >= 0);
  if (bases.length !== 1) return emoji;
  const i = bases[0];
  const rest = cps.slice(i + 1);
  if (rest[0] === '\uFE0F') rest.shift(); // the tone replaces the "draw as emoji" mark
  return cps.slice(0, i + 1).join('') + TONES[tone] + rest.join('');
}

// ---- what can this device draw? Newer emoji (and, on Windows, country flags) come out as blank boxes or as two
// separate pictures where the font is older than the emoji; those are left out rather than shown broken.
function makeProbe() {
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 40;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.textBaseline = 'top'; ctx.font = '28px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  const draw = (e) => {
    ctx.clearRect(0, 0, 96, 40); ctx.fillStyle = '#000'; ctx.fillText(e, 0, 4);
    const d = ctx.getImageData(0, 0, 96, 40).data;
    let ink = 0, color = 0, hash = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 32) continue;
      ink++; hash = (hash * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + i) | 0;
      if (Math.abs(d[i] - d[i + 1]) > 28 || Math.abs(d[i + 1] - d[i + 2]) > 28) color++;
    }
    return { ink, color, hash, width: ctx.measureText(e).width };
  };
  const ref = draw('😀');
  const colorFont = ref.color > 20; // no colour emoji font at all (rare): then there is nothing to tell apart, show everything
  return {
    colorFont,
    /** One picture, in colour, about as wide as any other emoji. */
    ok(e) {
      if (!colorFont) return true;
      const r = draw(e);
      return r.ink > 0 && r.color > 8 && r.width < ref.width * 1.5;
    },
    same(a, b) { const x = draw(a), y = draw(b); return x.hash === y.hash && x.ink === y.ink; },
  };
}

export function createEmojiPicker({ onPick }) {
  const st = { open: false, built: false, loading: null, entries: [], groups: [], tone: Math.min(5, Math.max(0, store.get('rt-emoji-tone', 0) | 0)), recent: store.get('rt-emoji-recent', []), anchor: null };
  if (!Array.isArray(st.recent)) st.recent = [];
  const el = document.createElement('div');
  el.id = 'emoji-picker'; el.className = 'hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Emoji');
  el.innerHTML = `<div class="ep-top"><input type="search" placeholder="Search emoji" aria-label="Search emoji" autocomplete="off" spellcheck="false"><button type="button" class="ep-tone" aria-label="Skin tone" aria-expanded="false" title="Skin tone"></button></div>
    <div class="ep-tones" hidden>${TONES.map((t, i) => `<button type="button" data-tone="${i}" title="${TONE_NAMES[i]}" aria-label="${TONE_NAMES[i]} skin tone">${withTone('✋', i)}</button>`).join('')}</div>
    <nav class="ep-tabs" aria-label="Emoji groups"></nav>
    <div class="ep-body" tabindex="-1"><div class="ep-wait">Loading emoji…</div></div>`;
  document.body.appendChild(el);
  const search = el.querySelector('input'), body = el.querySelector('.ep-body'), tabs = el.querySelector('.ep-tabs');
  const toneBtn = el.querySelector('.ep-tone'), tonesRow = el.querySelector('.ep-tones');
  toneBtn.textContent = withTone('✋', st.tone);

  const btn = (x) => { const e = x.t ? withTone(x.e, st.tone) : x.e; return `<button type="button" data-e="${e}" title="${esc(x.n)}" aria-label="${esc(x.n)}">${e}</button>`; };

  /** Load the data, drop what this device cannot draw, and build the grid (once). */
  function load() {
    if (st.loading) return st.loading;
    st.loading = import('./emoji-data.js').then(({ EMOJI_GROUPS }) => {
      const probe = makeProbe();
      const okVersion = new Map();
      let flagsOk = true, tagFlagsOk = true;
      const all = EMOJI_GROUPS.map(([name, rows]) => [name, rows.split('\n').map((r) => { const [e, n, k, t, v, c = ''] = r.split('\t'); const codes = c.split(' ').filter(Boolean); return { e, n, c: codes, k: ` ${n} ${k} ${codes.join(' ')}`.toLowerCase(), t: !!t, v }; })]);
      if (probe && probe.colorFont) {
        // one test per recent emoji version, on a few of its emoji (most of them must draw)
        const byV = {};
        for (const [, list] of all) for (const x of list) if (x.v) (byV[x.v] = byV[x.v] || []).push(x.e);
        for (const [v, list] of Object.entries(byV)) { const sample = list.slice(0, 5); okVersion.set(v, sample.filter((e) => probe.ok(e)).length * 2 > sample.length); }
        flagsOk = probe.ok('🇯🇵'); tagFlagsOk = flagsOk && !probe.same('🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🏴');
      }
      const can = (x) => {
        if (!probe || !probe.colorFont) return true;
        if (x.v && okVersion.get(x.v) === false) return false;
        if (/\p{Regional_Indicator}/u.test(x.e)) return flagsOk;
        if (/[\u{E0020}-\u{E007F}]/u.test(x.e)) return tagFlagsOk;
        return true;
      };
      st.groups = all.map(([name, list]) => [name, list.filter(can)]).filter(([, list]) => list.length);
      st.entries = st.groups.flatMap(([, list]) => list);
      st.byEmoji = new Map(st.entries.map((x) => [x.e, x]));
      st.byCode = new Map();
      for (const x of st.entries) for (const c of x.c) if (!st.byCode.has(c)) st.byCode.set(c, x);
      build();
    }).catch(() => { st.loading = null; body.innerHTML = '<div class="ep-wait">Could not load the emoji list — you can still type emoji from your keyboard.</div>'; });
    return st.loading;
  }
  function recentHtml() {
    const list = st.recent.filter((e) => typeof e === 'string').slice(0, RECENT_MAX);
    return list.length ? `<section data-g="recent"><h4>Recently used</h4><div class="ep-grid">${list.map((e) => `<button type="button" data-e="${esc(e)}">${esc(e)}</button>`).join('')}</div></section>` : '';
  }
  function build() {
    st.built = true;
    tabs.innerHTML = `<button type="button" data-tab="recent" title="Recently used" aria-label="Recently used">🕘</button>` + st.groups.map(([name], i) => `<button type="button" data-tab="${i}" title="${esc(name)}" aria-label="${esc(name)}">${TAB_ICON[name] || '•'}</button>`).join('');
    paint();
  }
  function paint() {
    if (!st.built) return;
    const q = search.value.trim().toLowerCase().replace(/^:+|:+$/g, ''); // ":joy" and ":joy:" work here too
    if (q) {
      const tokens = q.split(/\s+/);
      // emoji whose own name matches come first, then the ones that only match a search word
      const inName = (x) => x.c.includes(q) || tokens.every((t) => (' ' + x.n.toLowerCase()).includes(' ' + t));
      const all = st.entries.filter((x) => tokens.every((t) => x.k.includes(' ' + t) || x.e === t));
      const hits = [...all.filter(inName), ...all.filter((x) => !inName(x))].slice(0, 160);
      body.innerHTML = hits.length ? `<section><h4>${hits.length === 160 ? 'First 160 matches' : hits.length + (hits.length === 1 ? ' match' : ' matches')}</h4><div class="ep-grid">${hits.map(btn).join('')}</div></section>` : `<div class="ep-wait">No emoji found for “${esc(q)}”.</div>`;
      body.scrollTop = 0;
    } else {
      body.innerHTML = recentHtml() + st.groups.map(([name, list], i) => `<section data-g="${i}"><h4>${esc(name)}</h4><div class="ep-grid">${list.map(btn).join('')}</div></section>`).join('');
    }
    tabs.classList.toggle('dim', !!q);
    spy();
  }
  function spy() {
    const top = body.scrollTop + 12;
    let cur = null;
    for (const s of body.querySelectorAll('section[data-g]')) { if (s.offsetTop <= top) cur = s.dataset.g; }
    for (const b of tabs.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === cur);
  }

  /** Sit just above the button that opened it (or below, when there is no room above), inside the window. */
  function place() {
    const a = st.anchor; if (!a) return;
    const r = a.getBoundingClientRect();
    const host = a.closest('.chat') ? a.closest('.chat').getBoundingClientRect() : r;
    const w = Math.min(356, window.innerWidth - 16);
    const left = Math.max(8, Math.min(host.left, window.innerWidth - w - 8));
    const above = r.top - 16;
    let top, h;
    if (above >= 250) { h = Math.min(400, above); top = r.top - 8 - h; } else { top = Math.min(r.bottom + 8, window.innerHeight - 258); h = Math.min(400, window.innerHeight - top - 8); }
    Object.assign(el.style, { left: left + 'px', top: Math.max(8, top) + 'px', width: w + 'px', height: Math.max(200, h) + 'px' });
  }
  /** opts.onPick: where this opening's pick goes instead of the message box (a reaction to a message, say). */
  function open(anchor, opts = {}) {
    st.anchor = anchor; st.open = true; st.pick = opts.onPick || null;
    el.classList.remove('hidden'); place(); load();
    anchor.setAttribute('aria-expanded', 'true');
    // a fresh look each time: recents first, no stale search
    if (st.built && search.value) { search.value = ''; paint(); } else if (st.built) { const sec = body.querySelector('section[data-g="recent"]'); const html = recentHtml(); if (sec) sec.outerHTML = html; else if (html) body.insertAdjacentHTML('afterbegin', html); }
    body.scrollTop = 0; spy();
  }
  function close() {
    if (!st.open) return;
    st.open = false; st.pick = null; el.classList.add('hidden'); tonesRow.hidden = true; toneBtn.setAttribute('aria-expanded', 'false');
    if (st.anchor) st.anchor.setAttribute('aria-expanded', 'false');
  }
  const toggle = (anchor, opts) => (st.open ? close() : open(anchor, opts));

  // picking must not take the focus (and a phone's keyboard) away from the message box — except into the search box
  el.addEventListener('mousedown', (e) => { if (e.target !== search) e.preventDefault(); });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    const emoji = b.dataset.e;
    st.recent = [emoji, ...st.recent.filter((x) => x !== emoji)].slice(0, RECENT_MAX); store.set('rt-emoji-recent', st.recent);
    (st.pick || onPick)(emoji);
  });
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    if (search.value) { search.value = ''; paint(); }
    const sec = body.querySelector(`section[data-g="${b.dataset.tab}"]`);
    body.scrollTop = sec ? sec.offsetTop : 0; spy();
  });
  body.addEventListener('scroll', spy, { passive: true });
  search.addEventListener('input', paint);
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = body.querySelector('[data-e]'); if (first && search.value.trim()) first.click(); } });
  toneBtn.addEventListener('click', () => { tonesRow.hidden = !tonesRow.hidden; toneBtn.setAttribute('aria-expanded', String(!tonesRow.hidden)); });
  tonesRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tone]'); if (!b) return;
    st.tone = +b.dataset.tone; store.set('rt-emoji-tone', st.tone);
    toneBtn.textContent = withTone('✋', st.tone); tonesRow.hidden = true; toneBtn.setAttribute('aria-expanded', 'false');
    const keep = body.scrollTop; paint(); body.scrollTop = keep;
  });
  // a click or tap anywhere else puts it away
  document.addEventListener('pointerdown', (e) => {
    if (!st.open) return;
    if (e.target.closest && (e.target.closest('#emoji-picker') || (st.anchor && st.anchor.contains(e.target)))) return;
    close();
  }, true);
  window.addEventListener('resize', () => { if (st.open) place(); });

  // ---- ":name" look-ups for the message box ----
  /** Emoji for what has been typed after a colon, best first: the shortcode itself, shortcodes that start with it,
   *  names and search words that start with it, then shortcodes that merely contain it. Resolves to
   *  [{ emoji (with the chosen skin tone), code }] once the list is loaded. */
  function lookup(query, limit = 8) {
    return load().then(() => {
      const q = String(query).toLowerCase();
      if (!q || !st.entries.length) return [];
      const words = q.split('_').filter(Boolean);
      const rank = (x) => {
        if (x.c.includes(q)) return 0;
        if (x.c.some((c) => c.startsWith(q))) return 1;
        if (words.length && words.every((w) => x.k.includes(' ' + w))) return 2;
        if (q.length >= 3 && x.c.some((c) => c.includes(q))) return 3;
        return 9;
      };
      const hits = [];
      st.entries.forEach((x, i) => { const r = rank(x); if (r < 9) hits.push([r, i, x]); });
      hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return hits.slice(0, limit).map(([, , x]) => ({ emoji: x.t ? withTone(x.e, st.tone) : x.e, code: x.c.find((c) => c.startsWith(q)) || x.c[0] }));
    });
  }
  /** The emoji for a complete ":shortcode:", or null (also null until the list has been loaded once). */
  function exact(code) {
    const x = st.byCode && st.byCode.get(String(code).toLowerCase());
    return x ? (x.t ? withTone(x.e, st.tone) : x.e) : null;
  }
  function used(emoji) { st.recent = [emoji, ...st.recent.filter((x) => x !== emoji)].slice(0, RECENT_MAX); store.set('rt-emoji-recent', st.recent); }

  return { el, open, close, toggle, isOpen: () => st.open, reposition: place, lookup, exact, used, preload: load, loaded: () => !!st.byCode };
}
