/** شبکه: API، اندازه‌گیری تأخیر، پایش کیفیت و پیشنهاد خودکار پروفایل */
import { Emitter } from './util.js';

export async function api(path, { method = 'GET', body, timeout = 10_000, retry = 1 } = {}) {
  let lastErr;
  for (let i = 0; i <= retry; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(path, {
        method,
        signal: ac.signal,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      clearTimeout(t);
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('json') ? await res.json() : await res.text();
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, data });
      return data;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (i < retry) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function measureLatency(rounds = 3) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    try {
      await fetch('/api/health?ts=' + Date.now(), { cache: 'no-store' });
      samples.push(Math.round(performance.now() - t0));
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  if (!samples.length) return null;
  return { min: Math.min(...samples), avg: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) };
}

export function connectionInfo() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    type: c?.effectiveType || 'نامشخص',
    downlink: c?.downlink || 0,
    rtt: c?.rtt || 0,
    saveData: !!c?.saveData,
  };
}

/** پیشنهاد بهترین پروفایل بر اساس شبکهٔ کاربر */
export function suggestInitialProfile() {
  const { type, saveData, downlink } = connectionInfo();
  if (saveData) return 'audio';
  if (type === 'slow-2g' || type === '2g') return 'audio';
  if (type === '3g' || (downlink && downlink < 1.5)) return 'lite';
  if (type === '4g' && downlink >= 5) return 'hd';
  return 'normal';
}

export const TIERS = {
  great: { label: 'عالی', emoji: '🟢', hint: 'اتصال پایدار و کم‌تأخیر' },
  ok: { label: 'خوب', emoji: '🟡', hint: 'اتصال مناسب' },
  weak: { label: 'ضعیف', emoji: '🟠', hint: 'تأخیر یا افت بستهٔ محسوس' },
  bad: { label: 'بد', emoji: '🔴', hint: 'کیفیت پایین‌تر پیشنهاد می‌شود' },
};

export class QualityMonitor extends Emitter {
  constructor({ mesh, socket, interval = 6000 }) {
    super();
    this.mesh = mesh;
    this.socket = socket;
    this.interval = interval;
    this.timer = 0;
    this.tier = 'ok';
    this.history = [];
    this.autoSwitched = null;
  }

  start() {
    this.stop();
    const tick = async () => {
      const s = await this.mesh.collectStats().catch(() => null);
      const rtt = Math.min(s?.rtt || 999, this.socket.rtt || 999);
      const loss = s?.loss || 0;
      let tier = 'great';
      if (rtt > 120 || loss > 1) tier = 'ok';
      if (rtt > 320 || loss > 4) tier = 'weak';
      if (rtt > 700 || loss > 12) tier = 'bad';
      const out = { tier, rtt: Math.round(rtt), loss: Math.round(loss * 10) / 10, up: Math.round(s?.up || 0), down: Math.round(s?.down || 0), res: s?.res || '', fps: s?.fps || 0, limited: s?.limited || '', n: s?.n || 0 };
      this.tier = tier;
      this.history.push(tier);
      if (this.history.length > 10) this.history.shift();
      this.emit('quality', out);
      // پیشنهاد خودکار: ۳ نمونهٔ بد پشت‌سرهم
      const last3 = this.history.slice(-3);
      if (last3.length === 3 && last3.every((t) => t === 'bad' || t === 'weak')) {
        this.emit('suggest', 'lite', out);
      } else if (this.history.slice(-8).length === 8 && this.history.slice(-8).every((t) => t === 'great')) {
        this.emit('suggest', 'normal', out);
      }
    };
    this.timer = setInterval(tick, this.interval);
    tick();
    return this;
  }

  stop() { clearInterval(this.timer); }
}
