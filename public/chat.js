// The room chat: one panel that lives in the waiting room and then moves into the game with everyone.
// Docked beside the table on wide screens; a floating panel opened from the top bar on smaller ones.
import { SEAT_COLORS } from './gameover.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

/** One tap sends these straight away: the reactions people reach for mid-hand. */
export const QUICK = ['👍', '😂', '😮', '😭', '🔥', '🎉', '🙏', '🀄'];
/** The picker: a short, hand-picked set rather than the whole of Unicode. */
export const EMOJI = [
  ['Faces', '😀 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 😘 😋 😜 🤪 😎 🤓 🧐 🤔 🤨 😐 😶 🙄 😏 😬 😴 😮 😲 😳 🥺 😢 😭 😤 😠 😡 🤬 😱 😨 😰 😓 🤗 🤭 🫣 🤫 🫡 😵 🤯 🥳 😈 👻 💀 🤡'],
  ['Hands', '👍 👎 👏 🙌 🙏 🤝 👌 🤞 ✌️ 🤟 🤘 👊 ✊ 💪 👋 🫶 🤷 🤦 🙇 💁 👀 🧠'],
  ['Table', '🀄 🎲 🎴 🃏 🎯 🏆 🥇 🥈 🥉 🎰 💰 💸 🪙 📈 📉 ⏳ ⏰ 🍀 🧧 🐉 🎋 🍵 🍶 🍺 🍻 🍜 🍣 🍙 🍪 ☕'],
  ['Signs', '❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 ✨ ⭐ 🔥 💥 💤 ❗ ❓ ✅ ❌ ⚡ 🌈 🎉 🎊 🙈 🙉 🙊'],
].map(([name, list]) => [name, list.split(' ')]);

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|\s)+$/u;
/** A message that is just one to three emoji is shown large, the way messaging apps do. */
function bigEmoji(text) {
  if (!EMOJI_ONLY.test(text)) return false;
  const bare = text.replace(/\s/g, '');
  try { return [...new Intl.Segmenter().segment(bare)].length <= 3; } catch { return Array.from(bare).length <= 6; }
}
const clock = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** Docked beside the table: wide screens, unless a result / game-over panel is covering the table. */
const docked = () => window.matchMedia('(min-width: 1180px) and (min-height: 501px)').matches && !document.getElementById('game').classList.contains('has-overlay');

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
    <div class="chat-picker" hidden>${EMOJI.map(([name, list]) => `<div class="pk-h">${name}</div><div class="pk-g">${list.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>`).join('')}</div>
    <div class="chat-quick" aria-label="Quick reactions">${QUICK.map((e) => `<button type="button" data-q="${e}" title="Send ${e}">${e}</button>`).join('')}</div>
    <form class="chat-form" autocomplete="off"><button type="button" class="chat-emoji" aria-label="Emoji" aria-expanded="false" title="Emoji">🙂</button><input type="text" maxlength="300" placeholder="Message the room…" enterkeyhint="send" aria-label="Message"><button type="submit" class="chat-send" aria-label="Send" title="Send"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 10l14-6-5 14-2.5-5.5L3 10z" fill="currentColor"/></svg></button></form>`;
  const msgs = el.querySelector('.chat-msgs'), input = el.querySelector('input'), picker = el.querySelector('.chat-picker');
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
    return `<div class="cl${mine ? ' me' : ''}${lead ? ' lead' : ''}">${head}<div class="cb${bigEmoji(l.text) ? ' big' : ''}" title="${clock(l.at)}">${esc(l.text)}</div></div>`;
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
    const slot = where === 'lobby' ? $('lobby-chat-slot') : where === 'game' ? $('leftcol') : null;
    if (st.where === where && el.parentElement === slot) return;
    const hadFocus = document.activeElement === input;
    st.where = where;
    el.classList.toggle('hidden', !slot);
    el.classList.toggle('in-lobby', where === 'lobby'); el.classList.toggle('in-game', where === 'game');
    if (slot) { slot.appendChild(el); if (where === 'lobby') { st.open = false; el.classList.remove('open'); } st.scrolledUp = false; toBottom(); if (hadFocus) input.focus(); }
    else if (el.parentElement) el.remove();
    const btn = $('btn-chat'); if (btn) btn.classList.toggle('hidden', where !== 'game');
    if (visible()) seen(); else hideToast();
  }
  function open() { if (st.where !== 'game') return; st.open = true; el.classList.add('open'); toBottom(); seen(); }
  function close() { st.open = false; el.classList.remove('open'); picker.hidden = true; emojiBtn.setAttribute('aria-expanded', 'false'); input.blur(); }
  const toggle = () => (st.open ? close() : open());
  function reset() { st.lines = []; st.unread = 0; st.missed = 0; close(); badge(); hideToast(); paint(); input.value = ''; }

  function post(text) {
    text = String(text).trim();
    if (!text) return;
    send(text);
    st.scrolledUp = false;
  }
  el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); post(input.value); input.value = ''; picker.hidden = true; emojiBtn.setAttribute('aria-expanded', 'false'); });
  el.querySelector('.chat-quick').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) post(b.dataset.q); });
  emojiBtn.addEventListener('click', () => { picker.hidden = !picker.hidden; emojiBtn.setAttribute('aria-expanded', String(!picker.hidden)); });
  // picking an emoji must not take the focus (and the phone keyboard) away from the message box
  picker.addEventListener('mousedown', (e) => e.preventDefault());
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    const a = input.selectionStart ?? input.value.length, z = input.selectionEnd ?? input.value.length;
    if (Array.from(input.value).length + Array.from(b.dataset.e).length > 300) return;
    input.setRangeText(b.dataset.e, a, z, 'end');
  });
  msgs.addEventListener('scroll', () => { st.scrolledUp = !atBottom(); if (!st.scrolledUp) { st.missed = 0; newPill.hidden = true; } });
  newPill.addEventListener('click', toBottom);
  el.querySelector('.chat-close').addEventListener('click', close);
  // floating panel: a tap anywhere else puts it away (the tap still does its own job)
  document.addEventListener('click', (e) => {
    if (!st.open || docked() || st.where !== 'game') return;
    if (e.target.closest && e.target.closest('#chat, #btn-chat, #chat-toast, [data-chat-open]')) return;
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

  return { el, receive, place, open, close, toggle, reset, layout, isOpen: () => st.open && !docked(), unread: () => st.unread, repaint: paint };
}
