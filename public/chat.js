// The room chat: one panel that lives in the waiting room and then moves into the game with everyone.
// It sits in the bottom right corner: always open there on wide screens, a floating panel opened from the top bar
// on smaller ones (which drops from the top on touch screens, so the on-screen keyboard cannot cover it).
import { SEAT_COLORS } from './gameover.js';
import { createEmojiPicker } from './emoji-picker.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

/** One tap sends these straight away: the reactions people reach for mid-hand. */
export const QUICK = ['👍', '😂', '😮', '😭', '🔥', '🎉', '🙏', '🀄'];
// any emoji: pictographs, skin tones, flags (regional indicators and the tagged England / Scotland / Wales ones), keycaps
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3|[\u{E0020}-\u{E007F}]|\u200D|\uFE0F|\s)+$/u;
/** A message made only of emoji is shown larger, so it is easy to see: very large for one to three, large for a
 *  handful, and still clearly bigger than text for a long run. Returns the size class, or '' for ordinary messages. */
function emojiSize(text) {
  if (!EMOJI_ONLY.test(text)) return '';
  const bare = text.replace(/\s/g, '');
  let n;
  try { n = [...new Intl.Segmenter().segment(bare)].length; } catch { n = Math.ceil(Array.from(bare).length / 2); }
  return n <= 3 ? ' emo e1' : n <= 8 ? ' emo e2' : ' emo e3';
}
const clock = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** Docked: always open in the bottom right corner, beside the hand (the app sets this when there is room there). */
const docked = () => document.getElementById('game').classList.contains('chat-dock');

/**
 * @param send   (text) => void — hand a message to the server
 * @param me     () => this player's id
 * @param seatOf (playerId) => seat number at the table, or -1 if they have left
 */
export function createChat({ send, me, seatOf }) {
  const st = { lines: [], unread: 0, open: false, where: null, scrolledUp: false, missed: 0, toastTimer: null };
  const el = document.createElement('section');
  el.id = 'chat'; el.className = 'chat hidden'; el.setAttribute('aria-label', 'Room chat');
  el.innerHTML = `<header class="chat-head"><b>Chat</b><span class="chat-sub"></span><button type="button" class="chat-close small ghost" aria-label="Close chat">Close</button></header>
    <div class="chat-msgs" role="log" aria-live="polite"></div>
    <button type="button" class="chat-new" hidden>New messages ↓</button>
    <div class="chat-quick" aria-label="Quick reactions">${QUICK.map((e) => `<button type="button" data-q="${e}" title="Send ${e}">${e}</button>`).join('')}</div>
    <form class="chat-form" autocomplete="off"><button type="button" class="chat-emoji" aria-label="All emoji" aria-haspopup="dialog" aria-expanded="false" title="All emoji">🙂</button><textarea rows="1" maxlength="300" placeholder="Message the room…" aria-label="Message" title="Enter sends · Shift+Enter starts a new line · type : and a name for emoji"></textarea><button type="submit" class="chat-send" aria-label="Send" title="Send"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 10l14-6-5 14-2.5-5.5L3 10z" fill="currentColor"/></svg></button></form>`;
  const msgs = el.querySelector('.chat-msgs'), input = el.querySelector('textarea'), form = el.querySelector('form');
  // the full picker floats above the panel (it would not fit inside the docked chat); a pick goes in at the caret
  const picker = createEmojiPicker({
    onPick(emoji) {
      const a = input.selectionStart ?? input.value.length, z = input.selectionEnd ?? input.value.length;
      if (Array.from(input.value).length + Array.from(emoji).length > 300) return;
      input.setRangeText(emoji, a, z, 'end');
      fit();
    },
  });
  const newPill = el.querySelector('.chat-new'), emojiBtn = el.querySelector('.chat-emoji');

  /** In the waiting room the panel is on the page, but on a phone it can be scrolled out of sight below the room card. */
  const onScreen = () => { const r = msgs.getBoundingClientRect(); return r.bottom > 60 && r.top < window.innerHeight - 60; };
  const visible = () => !!st.where && !el.classList.contains('hidden') && (st.where === 'lobby' ? onScreen() : docked() || st.open);
  const atBottom = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 28;
  const toBottom = () => { msgs.scrollTop = msgs.scrollHeight; st.scrolledUp = false; st.missed = 0; newPill.hidden = true; };

  function lineHtml(l, prev) {
    if (!l.from) return `<div class="cl note">${esc(l.text)}</div>`;
    const mine = l.from === me();
    const seat = seatOf(l.from);
    const lead = !prev || prev.from !== l.from || l.at - prev.at > 180000;
    const head = lead ? `<div class="ch">${mine ? '' : `<b style="color:${seat >= 0 ? SEAT_COLORS[seat] : 'var(--muted)'}">${esc(l.name)}</b>`}<time>${clock(l.at)}</time></div>` : '';
    return `<div class="cl${mine ? ' me' : ''}${lead ? ' lead' : ''}">${head}<div class="cb${emojiSize(l.text)}" title="${clock(l.at)}">${esc(l.text)}</div></div>`;
  }
  function paint() {
    const stick = !st.scrolledUp;
    msgs.innerHTML = st.lines.length
      ? st.lines.map((l, i) => lineHtml(l, st.lines[i - 1])).join('')
      : '<div class="chat-empty">Say hello 👋 — everyone in the room sees this.</div>';
    if (stick) toBottom();
  }
  function badge() {
    for (const b of document.querySelectorAll('[data-chat-badge]')) { b.hidden = !st.unread; b.textContent = st.unread > 9 ? '9+' : String(st.unread); }
  }
  function seen() { st.unread = 0; badge(); hideToast(); }
  function hideToast() { clearTimeout(st.toastTimer); const t = $('chat-toast'); if (t) t.classList.add('hidden'); }
  function toast(l) {
    const t = $('chat-toast'); if (!t) return;
    const seat = seatOf(l.from);
    t.innerHTML = `<b style="color:${seat >= 0 ? SEAT_COLORS[seat] : 'var(--muted)'}">${esc(l.name)}</b><span>${esc(l.text)}</span>`;
    t.classList.remove('hidden');
    clearTimeout(st.toastTimer); st.toastTimer = setTimeout(hideToast, 5000);
  }

  /** A chat message from the server: the whole history (on joining), or one new line. */
  function receive(msg) {
    if (Array.isArray(msg.history)) { st.lines = msg.history.slice(-200); st.scrolledUp = false; paint(); return; }
    const l = msg.line;
    if (!l || st.lines.some((x) => x.id === l.id)) return;
    st.lines.push(l); if (st.lines.length > 200) st.lines.shift();
    const wasUp = st.scrolledUp;
    paint();
    const fromOther = l.from && l.from !== me();
    if (!visible()) { if (fromOther) { st.unread++; badge(); toast(l); } }
    else if (wasUp && fromOther) { st.missed++; newPill.hidden = false; newPill.textContent = `${st.missed} new message${st.missed > 1 ? 's' : ''} ↓`; }
  }

  /** Put the panel on the waiting-room screen ('lobby'), in the game ('game'), or away (null: no room, or pass-and-play). */
  function place(where) {
    const slot = where === 'lobby' ? $('lobby-chat-slot') : where === 'game' ? $('game') : null;
    if (st.where === where && el.parentElement === slot) return;
    const hadFocus = document.activeElement === input;
    picker.close(); sugClose();
    st.where = where;
    el.classList.toggle('hidden', !slot);
    el.classList.toggle('in-lobby', where === 'lobby'); el.classList.toggle('in-game', where === 'game');
    if (slot) { slot.appendChild(el); if (where === 'lobby') { st.open = false; el.classList.remove('open'); } st.scrolledUp = false; toBottom(); if (hadFocus) input.focus(); }
    else if (el.parentElement) el.remove();
    const btn = $('btn-chat'); if (btn) btn.classList.toggle('hidden', where !== 'game');
    if (visible()) seen(); else hideToast();
  }
  function open() { if (st.where !== 'game') return; st.open = true; el.classList.add('open'); toBottom(); seen(); }
  function close() { st.open = false; el.classList.remove('open'); picker.close(); sugClose(); input.blur(); }
  const toggle = () => (st.open ? close() : open());
  function reset() { st.lines = []; st.unread = 0; st.missed = 0; close(); badge(); hideToast(); paint(); input.value = ''; input.style.height = ''; }

  /** Spaces and line breaks go out exactly as typed; only a message with nothing but whitespace is not sent.
   *  Any finished ":shortcode:" still in the text (typed quickly, or pasted) becomes its emoji on the way out. */
  const CODES = /(^|[\s(]):([a-z0-9_+]+):(?=$|[\s).,!?])/gi;
  function post(text) {
    text = String(text);
    if (!/\S/.test(text)) return;
    st.scrolledUp = false;
    const go = () => send(text.replace(CODES, (m, pre, code) => { const e = picker.exact(code); return e ? pre + e : m; }));
    CODES.lastIndex = 0;
    if (CODES.test(text) && !picker.loaded()) { picker.preload().then(go, () => send(text)); return; }
    go();
  }
  // ---- ":name" → emoji, the way Slack and Discord do it ----
  // Type a colon and at least two letters: matching emoji are listed above the message box (arrows / Tab / Enter or a
  // tap to pick, Esc to dismiss). Finishing a known shortcode with a second colon (":joy:") swaps it in directly.
  const sug = document.createElement('div');
  sug.id = 'emoji-suggest'; sug.className = 'hidden'; sug.setAttribute('role', 'listbox'); sug.setAttribute('aria-label', 'Emoji suggestions');
  document.body.appendChild(sug);
  const sg = { open: false, items: [], at: 0, start: 0, end: 0, seq: 0, dismissed: null };
  const TOKEN = /(?:^|[\s(])(:([a-z0-9_+]{2,}))$/i; // a colon at the start of a word ("10:30" and "http://" are left alone)
  const DONE = /(?:^|[\s(])(:([a-z0-9_+]+):)$/i;
  function sugClose() { if (!sg.open) return; sg.open = false; sug.classList.add('hidden'); }
  function sugPaint() {
    sug.innerHTML = sg.items.map((x, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === sg.at}" class="${i === sg.at ? 'on' : ''}"><span class="se">${x.emoji}</span><span class="sc">:${esc(x.code)}:</span></button>`).join('') + '<div class="sh">↑↓ to move · Tab or Enter to pick · Esc to close</div>';
    const r = input.getBoundingClientRect(), host = el.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    sug.classList.remove('hidden');
    const h = sug.offsetHeight;
    const above = r.top - 8 - h >= 8;
    Object.assign(sug.style, { width: w + 'px', left: Math.max(8, Math.min(host.left + 8, window.innerWidth - w - 8)) + 'px', top: (above ? r.top - 8 - h : Math.min(r.bottom + 8, window.innerHeight - h - 8)) + 'px' });
  }
  function sugPick(i) {
    const x = sg.items[i]; if (!x) return;
    input.setRangeText(x.emoji + ' ', sg.start, sg.end, 'end');
    picker.used(x.emoji);
    sugClose(); fit();
  }
  function sugCheck() {
    const seq = ++sg.seq; // anything still being looked up for an earlier keystroke is out of date now
    const caret = input.selectionStart ?? input.value.length;
    if (caret !== (input.selectionEnd ?? caret)) { sugClose(); return; }
    const before = input.value.slice(0, caret);
    // a finished shortcode: swap it for the emoji
    const done = DONE.exec(before);
    if (done) {
      const emoji = picker.exact(done[2]);
      if (emoji) { input.setRangeText(emoji, caret - done[1].length, caret, 'end'); picker.used(emoji); sugClose(); fit(); return; }
      // typed faster than the emoji list loaded: look again as soon as it is there, if nothing else was typed meanwhile
      if (!picker.loaded()) picker.preload().then(() => { if (seq === sg.seq && document.activeElement === input) sugCheck(); });
    }
    const m = TOKEN.exec(before);
    if (!m) { sugClose(); sg.dismissed = null; return; }
    const start = caret - m[1].length, q = m[2];
    if (sg.dismissed === start) return; // Esc was pressed for this word: stay out of the way until a new one starts
    picker.lookup(q, 8).then((items) => {
      if (seq !== sg.seq || document.activeElement !== input) return; // something newer was typed meanwhile
      if (!items.length) { sugClose(); return; }
      const keep = sg.open && sg.items[sg.at] ? sg.items[sg.at].emoji : null;
      Object.assign(sg, { open: true, items, start, end: caret });
      sg.at = Math.max(0, items.findIndex((x) => x.emoji === keep));
      sugPaint();
    });
  }
  sug.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret (and a phone's keyboard) in the message box
  sug.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) sugPick(+b.dataset.i); });
  document.addEventListener('pointerdown', (e) => { if (sg.open && !(e.target.closest && e.target.closest('#emoji-suggest')) && e.target !== input) sugClose(); }, true);
  window.addEventListener('resize', sugClose);

  /** The message box grows with what is typed, up to about five lines, then scrolls. */
  function fit() {
    const stick = !st.scrolledUp;
    input.style.height = 'auto';
    input.style.height = input.value ? Math.min(input.scrollHeight + 2, 124) + 'px' : ''; // empty: back to one line
    if (stick) toBottom();
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); post(input.value); input.value = ''; fit(); picker.close(); sugClose(); sg.dismissed = null; });
  input.addEventListener('input', () => { fit(); sugCheck(); });
  input.addEventListener('click', sugCheck);
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) sugClose(); }, 120));
  // With a keyboard, Enter sends and Shift+Enter starts a new line. On a touch keyboard Enter starts a new line and
  // the send button sends, as in any messaging app. (Never while an input method is still composing a word.)
  const touchKeys = () => window.matchMedia('(pointer: coarse)').matches;
  input.enterKeyHint = touchKeys() ? 'enter' : 'send';
  input.addEventListener('keydown', (e) => {
    if (sg.open && !e.isComposing) {
      // the suggestion list takes the navigation keys while it is showing
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sg.at = (sg.at + (e.key === 'ArrowDown' ? 1 : sg.items.length - 1)) % sg.items.length; sugPaint(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); sugPick(sg.at); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sg.dismissed = sg.start; sugClose(); return; }
    }
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    if (e.shiftKey || e.altKey) return;
    if (touchKeys() && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
  el.querySelector('.chat-quick').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) post(b.dataset.q); });
  emojiBtn.addEventListener('click', () => picker.toggle(emojiBtn));
  // whenever the room for messages changes (the reaction row appearing as you click into the box, the box growing as
  // you type, the panel being resized) keep the newest message in view, unless the reader has scrolled up to read back
  if (window.ResizeObserver) new ResizeObserver(() => { if (!st.scrolledUp) msgs.scrollTop = msgs.scrollHeight; }).observe(msgs);
  msgs.addEventListener('scroll', () => { st.scrolledUp = !atBottom(); if (!st.scrolledUp) { st.missed = 0; newPill.hidden = true; } });
  newPill.addEventListener('click', toBottom);
  el.querySelector('.chat-close').addEventListener('click', close);
  // floating panel: a tap anywhere else puts it away (the tap still does its own job)
  document.addEventListener('click', (e) => {
    if (!st.open || docked() || st.where !== 'game') return;
    if (e.target.closest && e.target.closest('#chat, #btn-chat, #chat-toast, [data-chat-open], #emoji-picker, #emoji-suggest')) return;
    close();
  }, true);
  /** The layout around the panel changed (resize, an overlay opening or closing): what is on screen counts as read. */
  function layout() { if (visible()) { if (st.unread) seen(); } }
  window.addEventListener('resize', layout);
  const toastEl = $('chat-toast');
  if (toastEl) toastEl.addEventListener('click', () => {
    hideToast();
    if (st.where === 'lobby') { el.scrollIntoView({ block: 'end', behavior: 'smooth' }); st.unread = 0; badge(); } else open();
  });
  paint();

  return { el, receive, place, open, close, toggle, reset, layout, pickerOpen: () => picker.isOpen(), closePicker: () => picker.close(), isOpen: () => st.open && !docked(), unread: () => st.unread, repaint: paint };
}
