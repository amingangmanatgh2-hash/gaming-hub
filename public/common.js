export const $ = (selector, root = document) => root.querySelector(selector);
export const fa = (number) => new Intl.NumberFormat('fa-IR').format(number);
export const dateFa = (iso) => iso ? new Date(iso).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }) : 'هنوز ثبت نشده';
export function setBrand(name, suffix) {
  document.querySelectorAll('.brand-word').forEach((node) => { if (node.firstChild?.nodeType === Node.TEXT_NODE) node.firstChild.textContent = name; });
  document.title = `${name} | ${suffix}`;
}

export async function api(path, { method = 'GET', data, csrf, timeoutMs = 8000 } = {}) {
  let res, payload;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(`/api/v1${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    payload = await res.json().catch(() => ({}));
  } catch {
    const error = new Error('ارتباط با سرویس برقرار نشد؛ اتصال خود را بررسی کنید.');
    error.status = 0; // offline/timeout is NOT an expired subscription
    throw error;
  } finally { clearTimeout(timer); }
  if (!res.ok || !payload.ok) {
    const error = new Error(payload.error || `خطای سرویس (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return payload;
}
export async function copy(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* fall back for restricted WebViews */ }
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed'; el.style.opacity = '0';
  document.body.append(el); el.select();
  const success = document.execCommand('copy');
  el.remove();
  if (!success) throw new Error('کپی ممکن نیست؛ متن را دستی انتخاب کنید.');
}
export function toast(message, el = $('#toast')) {
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 4800);
}
export function registerPwa() {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once: true });
}
