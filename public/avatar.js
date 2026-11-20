// Player pictures: a small square JPEG made in the browser from any image the player picks. It is saved on this
// device only (localStorage) and handed to the room while the player is in it; there are no accounts or profiles.

const SIZE = 128;        // pixels: it is never shown larger than about 120px
const MAX_CHARS = 30000; // of the data URL (the server takes up to 40,000)
const PREFIX = 'data:image/jpeg;base64,';
const KEY = 'rt-avatar';

export const isAvatar = (x) => typeof x === 'string' && x.startsWith(PREFIX) && x.length <= 40000 && /^[A-Za-z0-9+/]+={0,2}$/.test(x.slice(PREFIX.length));

export function loadAvatar() {
  try { const a = localStorage.getItem(KEY); return isAvatar(a) ? a : null; } catch { return null; }
}
export function saveAvatar(a) {
  try { if (a) localStorage.setItem(KEY, a); else localStorage.removeItem(KEY); } catch { /* storage full or blocked: it still works until the page closes */ }
}

/** Ask for an image file. Resolves with the File, or null if the chooser was dismissed. */
export function chooseImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(input);
    let done = false;
    const finish = (f) => { if (done) return; done = true; input.remove(); resolve(f); };
    input.addEventListener('change', () => finish(input.files && input.files[0] ? input.files[0] : null));
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/** Turn an image file into the avatar: the middle square, scaled to 128px, as a JPEG data URL. */
export function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || (file.type && !file.type.startsWith('image/'))) return reject(new Error('That file is not a picture.'));
    if (file.size > 40 * 1024 * 1024) return reject(new Error('That picture is too large (over 40 MB).'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That picture could not be read.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This browser cannot open that kind of picture — try a JPEG or PNG.'));
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) throw new Error('empty');
          const side = Math.min(w, h);
          const c = document.createElement('canvas');
          c.width = c.height = SIZE;
          const g = c.getContext('2d');
          g.fillStyle = '#1B2A22'; g.fillRect(0, 0, SIZE, SIZE); // behind see-through pictures
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
          let out = '';
          for (const q of [0.86, 0.75, 0.62, 0.5, 0.38]) { out = c.toDataURL('image/jpeg', q); if (out.length <= MAX_CHARS) break; }
          if (!isAvatar(out)) throw new Error('encode');
          resolve(out);
        } catch { reject(new Error('That picture could not be used — try another one.')); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The picture as a round image, or nothing when the player has none. */
export const avatarImg = (src, cls = '') => (isAvatar(src) ? `<img class="av ${cls}" src="${escAttr(src)}" alt="" draggable="false">` : '');
/** The picture, or a disc with the player's initial in their seat colour. */
export function avatarOrInitial(src, name, color, cls = '') {
  if (isAvatar(src)) return avatarImg(src, cls);
  const ch = [...String(name || '?').trim()][0] || '?';
  return `<span class="av none ${cls}"${color ? ` style="--avc:${color}"` : ''} aria-hidden="true">${escAttr(ch.toUpperCase())}</span>`;
}
