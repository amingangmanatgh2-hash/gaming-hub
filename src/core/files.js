/**
 * فایل و رسانه: فشرده‌سازی عکس، ویس، قطعه‌بندی فایل‌های بزرگ برای ارسال
 * از روی سوکت (بدون سرور فایل = بدون هزینه)، و دریافت/بازسازی.
 */
import { Emitter } from './util.js';

export const LIMITS = {
  inline: 46 * 1024,        // تا این حجم، داخل پیام چت (در تاریخچه می‌ماند)
  liveMax: 15 * 1024 * 1024, // سقف فایل زندهٔ هم‌زمان
  chunk: 24 * 1024,          // قطعهٔ ارسال
};

export function iconFor(name = '', mime = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (/^image\//.test(mime) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return '🖼️';
  if (/^video\//.test(mime) || ['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) return '🎬';
  if (/^audio\//.test(mime) || ['mp3', 'wav', 'ogg', 'm4a', 'opus'].includes(ext)) return '🎵';
  if (['pdf'].includes(ext)) return '📕';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['doc', 'docx', 'rtf'].includes(ext)) return '📄';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📽️';
  if (['apk'].includes(ext)) return '📱';
  if (['js', 'ts', 'py', 'json', 'html', 'css', 'java', 'c', 'cpp', 'sh'].includes(ext)) return '👨‍💻';
  return '📁';
}

export function fileKind(file) {
  const mime = file.type || '';
  if (/^image\//.test(mime)) return 'image';
  if (/^audio\//.test(mime)) return 'audio';
  if (/^video\//.test(mime)) return 'video';
  return 'file';
}

export const readAsDataURL = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = rej;
  fr.readAsDataURL(blob);
});

export const readAsText = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = rej;
  fr.readAsText(blob);
});

/** فشرده‌سازی عکس در مرورگر (کاهش شدید حجم برای اینترنت ایران) */
export async function compressImage(file, { max = 1440, quality = 0.7, preferWebp = true } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    let out = c.toDataURL(preferWebp ? 'image/webp' : 'image/jpeg', quality);
    if (preferWebp && out.length > 4 && out.startsWith('data:image/webp')) {
      // وب‌پی پشتیبانی شده
    } else {
      out = c.toDataURL('image/jpeg', quality);
    }
    // اگر هنوز بزرگ است، کیفیت را کم می‌کنیم
    let q = quality;
    while (out.length > LIMITS.inline * 0.92 && q > 0.3) {
      q -= 0.12;
      out = c.toDataURL('image/jpeg', q);
    }
    return { dataUrl: out, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** ویس (پیام صوتی) با MediaRecorder */
export class VoiceRecorder extends Emitter {
  constructor() {
    super();
    this.rec = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = 0;
  }
  get recording() { return !!this.rec && this.rec.state === 'recording'; }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.chunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : '';
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.startedAt = Date.now();
    this.rec.start(1000);
    this.tick = setInterval(() => this.emit('tick', Date.now() - this.startedAt), 200);
  }
  stop() {
    return new Promise((res) => {
      if (!this.rec) return res(null);
      clearInterval(this.tick);
      this.rec.onstop = async () => {
        try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' });
        res({ blob, ms: Date.now() - this.startedAt, dataUrl: await readAsDataURL(blob) });
      };
      try { this.rec.stop(); } catch { res(null); }
    });
  }
  cancel() {
    clearInterval(this.tick);
    try { this.rec?.stop(); } catch { /* ignore */ }
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
  }
}

/** فرستندهٔ قطعه‌ای — برای فایل‌های متوسط و بزرگ */
export class FileSender extends Emitter {
  constructor({ send, isBusy }) {
    super();
    this.send = send;
    this.isBusy = isBusy || (() => false);
    this.cancelled = new Set();
  }

  async start(file, { id = Math.random().toString(36).slice(2, 12), compress = false } = {}) {
    let blob = file;
    let name = file.name || 'file';
    let mime = file.type || 'application/octet-stream';
    if (compress && /^image\//.test(mime) && !/gif|svg/.test(mime)) {
      const c = await compressImage(file, { max: 1800, quality: 0.72 });
      blob = await (await fetch(c.dataUrl)).blob();
      mime = blob.type;
      name = name.replace(/\.[^.]+$/, '') + '.webp';
    }
    if (blob.size > LIMITS.liveMax) throw new Error(`حجم فایل بیش از ${Math.round(LIMITS.liveMax / 1024 / 1024)} مگابایت است`);
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const chunk = LIMITS.chunk;
    const total = Math.ceil(bytes.length / chunk) || 1;
    const meta = { id, n: name, s: blob.size, mime, parts: total, c: compress ? 1 : 0 };
    this.send({ to: '*', d: { f: { ...meta, i: -1 } } }); // اعلام شروع
    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      if (this.cancelled.has(id)) { this.cancelled.delete(id); return { id, cancelled: true }; }
      const slice = bytes.subarray(i * chunk, Math.min(bytes.length, (i + 1) * chunk));
      let bin = '';
      const step = 4096;
      for (let j = 0; j < slice.length; j += step) bin += String.fromCharCode.apply(null, slice.subarray(j, j + step));
      this.send({ to: '*', d: { f: { id, i, p: btoa(bin) } } });
      this.emit('progress', i + 1, total, Math.round(((i + 1) / total) * 100));
      while (this.isBusy()) await new Promise((r) => setTimeout(r, 25));
      if ((i + 1) % 8 === 0) await new Promise((r) => setTimeout(r, 6));
    }
    this.emit('done', { id, ms: Date.now() - t0 });
    return { id, meta, blob };
  }

  cancel(id) { this.cancelled.add(id); }
}

/** گیرندهٔ قطعه‌ای */
export class FileReceiver extends Emitter {
  constructor() {
    super();
    this.incoming = new Map();
  }

  handle(d) {
    const f = d && d.f;
    if (!f || !f.id) return null;
    if (f.i === -1) {
      this.incoming.set(f.id, { meta: { n: f.n, s: f.s, mime: f.mime, parts: f.parts }, parts: new Array(f.parts), got: 0, startedAt: Date.now(), lastAt: Date.now(), from: d.__from || null });
      this.emit('start', f);
      return null;
    }
    const rec = this.incoming.get(f.id);
    if (rec && d.__from) rec.from = d.__from;
    if (!rec) {
      // شاید قطعه‌های میانی را از دست داده‌ایم؛ منتظر اعلام شروع بمانیم
      this.incoming.set(f.id, { meta: null, parts: [], got: 0, startedAt: Date.now(), lastAt: Date.now(), orphan: true });
      return null;
    }
    if (rec.orphan) {
      rec.parts = rec.parts || [];
      rec.parts[f.i] = f.p;
      rec.got++;
      if (rec.got > 200 && !rec.meta) this.incoming.delete(f.id);
      return null;
    }
    if (!rec.parts[f.i]) rec.got++;
    rec.parts[f.i] = f.p;
    rec.lastAt = Date.now();
    this.emit('progress', f.id, rec.got, rec.meta.parts, Math.round((rec.got / rec.meta.parts) * 100));
    if (rec.got >= rec.meta.parts) {
      this.incoming.delete(f.id);
      try {
        const raw = rec.parts.map((p) => atob(p || '')).join('');
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const blob = new Blob([bytes], { type: rec.meta.mime || 'application/octet-stream' });
        const out = { id: f.id, name: rec.meta.n, size: blob.size, mime: rec.meta.mime, blob, url: URL.createObjectURL(blob), from: rec.from || null };
        this.emit('file', out);
        return out;
      } catch (e) {
        this.emit('error', f.id, e);
      }
    }
    return null;
  }

  /** پیشرفت فایل‌های در جریان (برای نمایش نوار) */
  list() {
    return [...this.incoming.entries()].map(([id, r]) => ({
      id,
      name: r.meta?.n || 'در حال دریافت…',
      size: r.meta?.s || 0,
      pct: r.meta ? Math.round((r.got / r.meta.parts) * 100) : 0,
      stale: Date.now() - r.lastAt > 8000,
    }));
  }

  cleanup() {
    for (const [id, r] of this.incoming) if (Date.now() - r.startedAt > 180_000) this.incoming.delete(id);
  }
}

export async function blobFromDataUrl(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'download';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** چند تکه‌کردن متن‌های بسیار بلند برای ارسال در چت */
export function splitMessage(text, max = 3800) {
  if (text.length <= max) return [text];
  const out = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest) out.push(rest);
  return out;
}
