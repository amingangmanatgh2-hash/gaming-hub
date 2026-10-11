/** ابزارهای عمومی: انتخابگر، ساخت DOM، پیام‌ها، مودال، قالب‌بندی، انبار محلی */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
export function linkify(text) {
  return esc(text).replace(URL_RE, (m) => {
    const href = m.includes('@') && !m.startsWith('http') ? `mailto:${m}` : m.startsWith('http') ? m : `https://${m}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${m}</a>`;
  });
}

/* ── پیام‌های شناور ── */
export function toast(text, kind = 'ok', ms = 3400) {
  const host = document.getElementById('toast');
  if (!host) return;
  const t = el('div', { class: `toast ${kind}`, text: String(text) });
  host.append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

/* ── مودال ── */
let modalKeyHandler = null;
export function modal({ title, html, actions = [], wide = false, onOpen }) {
  const host = document.getElementById('modal');
  const ov = document.getElementById('overlay');
  if (!host) return null;
  host.hidden = false;
  if (ov) ov.hidden = false;
  if (wide) host.style.width = 'min(940px, 96vw)';
  host.innerHTML = '';
  const head = el('h3', { text: title || '' });
  const body = el('div', { class: 'modal-body', html: html || '' });
  const foot = el('div', { class: 'row', style: { marginTop: '.8rem' } },
    ...actions.map((a) => el('button', {
      class: `btn ${a.kind || ''}`,
      text: a.label,
      onclick: async () => {
        const keep = a.onClick ? await a.onClick(body) : false;
        if (!keep) closeModal();
      },
    })),
    el('span', { class: 'grow' }),
    el('button', { class: 'btn ghost', text: 'بستن', onclick: closeModal }),
  );
  host.append(head, body, foot);
  if (ov) ov.onclick = closeModal;
  modalKeyHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', modalKeyHandler);
  onOpen?.(body);
  return body;
}
export function closeModal() {
  const host = document.getElementById('modal');
  const ov = document.getElementById('overlay');
  if (host) { host.hidden = true; host.innerHTML = ''; host.style.width = ''; }
  if (ov) ov.hidden = true;
  if (modalKeyHandler) document.removeEventListener('keydown', modalKeyHandler);
  modalKeyHandler = null;
}

/* ── قالب‌بندی ── */
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (ts) => new Date(ts).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
export function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  const u = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
export const uid = (n = 10) => Math.random().toString(36).slice(2, 2 + n);

/* ── کلیپ‌بورد و دانلود ── */
export async function copy(text, okMsg = 'کپی شد ✅') {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, 'ok', 1800);
    return true;
  } catch {
    const ta = el('textarea', { style: { position: 'fixed', opacity: 0 } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy');
    ta.remove();
    toast(ok ? okMsg : 'کپی نشد — دستی انتخاب کنید', ok ? 'ok' : 'warn', 2000);
    return !!ok;
  }
}
export function download(url, name) {
  const a = el('a', { href: url, download: name || 'file' });
  document.body.append(a);
  a.click();
  a.remove();
}

/* ── ذخیره‌سازی محلی ── */
export const store = {
  get(k, d = null) {
    try { const v = localStorage.getItem(`hk.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(`hk.${k}`, JSON.stringify(v)); } catch { /* پر یا مسدود */ }
  },
  del(k) { try { localStorage.removeItem(`hk.${k}`); } catch { /* ignore */ } },
  session: {
    get(k, d = null) {
      try { const v = sessionStorage.getItem(`hk.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; }
    },
    set(k, v) { try { sessionStorage.setItem(`hk.${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
  },
};

/* ── پوسته (روشن/تیره) ── */
export function initTheme() {
  const saved = store.get('theme');
  const sys = matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const t = saved || sys;
  document.documentElement.dataset.theme = t;
  return t;
}
export function toggleTheme() {
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  store.set('theme', t);
  return t;
}

/* ── کمکی‌ها ── */
export function debounce(fn, ms = 250) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function throttle(fn, ms = 120) {
  let last = 0;
  let timer = 0;
  return (...a) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...a); }
    else if (!timer) timer = setTimeout(() => { timer = 0; last = Date.now(); fn(...a); }, ms - (now - last));
  };
}
export const vibrate = (p = 12) => navigator.vibrate?.(p);
export const isMobile = () => matchMedia('(max-width: 760px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

export function beep(kind = 'in') {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    beep.ctx = beep.ctx || new Ctx();
    const ctx = beep.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = kind === 'in' ? [660, 880] : kind === 'out' ? [520, 390] : [720, 720];
    o.frequency.setValueAtTime(f[0], ctx.currentTime);
    o.frequency.linearRampToValueAtTime(f[1], ctx.currentTime + 0.12);
    o.type = 'sine';
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.24);
  } catch { /* بی‌صدا */ }
}

/* ── رهگیر رویداد سبک ── */
export class Emitter {
  constructor() { this._h = new Map(); }
  on(type, fn) {
    if (!this._h.has(type)) this._h.set(type, new Set());
    this._h.get(type).add(fn);
    return () => this._h.get(type).delete(fn);
  }
  emit(type, ...args) {
    for (const fn of this._h.get(type) || []) {
      try { fn(...args); } catch (e) { console.error(type, e); }
    }
  }
}

/* ── رنگ ثابت برای هر نام (آواتار متنی) ── */
export function hue(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}
export function avatarOf(name, photo) {
  if (photo && /^https?:|^data:/.test(photo)) return { img: photo };
  const emojis = ['😀', '🦊', '🐼', '🐙', '🦉', '🐬', '🦁', '🐨', '🐝', '🦄', '🐳', '🦖'];
  const e = emojis[hue(name) % emojis.length];
  return { emoji: e, color: `hsl(${hue(name)} 70% 45%)` };
}
