import { $, api, fa, dateFa, copy, toast, registerPwa, setBrand } from '/common.js';
import { probeWorker, subscriptionIsInvalid } from '/connectivity.js';

const STORAGE_KEY = 'madar_subscription_v1';
const profiles = [
  { name: 'خودکار', detail: 'انتخاب لبهٔ Cloudflare با Anycast', icon: '✦' },
  { name: 'وب‌گردی', detail: 'پروفایل TCP برای وب', icon: '◎' },
  { name: 'ویدئو', detail: 'پروفایل TCP برای ویدئو', icon: '▷' },
  { name: 'بازی (فقط TCP)', detail: 'UDP منتقل نمی‌شود', icon: '◇' },
];
let subscription = null;
let subscriptionUrl = '';
let selected = 0;
let initialized = false;
let hasFree = false;
function element(tag, cls, text) { const node = document.createElement(tag); node.className = cls; node.textContent = text; return node; }
function savedUrl() { try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; } }
function storeUrl(url) { try { if (url) localStorage.setItem(STORAGE_KEY, url); else localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ } }
function validSubUrl(path) {
  try {
    const url = new URL(path, location.origin);
    return url.origin === location.origin && /^\/api\/v1\/sub\/[A-Za-z0-9_-]{40,50}$/.test(url.pathname) ? url.pathname : '';
  } catch { return ''; }
}
function updateUi() {
  const active = !!subscription;
  const awaiting = !active && !!subscriptionUrl;
  $('#accessBadge').textContent = active ? 'کانفیگ فعال' : awaiting ? 'در انتظار بازیابی' : 'بدون دسترسی';
  $('#accessBadge').classList.toggle('active', active);
  $('#accessTitle').textContent = active ? 'کانفیگت آماده است' : awaiting ? 'لینک محفوظ است' : 'هنوز کانفیگی فعال نیست';
  $('#accessDesc').textContent = active ? 'یک پروفایل را انتخاب کن و لینک آن را در کلاینت سازگار وارد کن؛ این صفحه خودش VPN را روشن نمی‌کند.' : awaiting ? 'دسترسی به Worker موقتاً ممکن نبود. لینک اشتراک پاک نشده؛ بازیابی را دوباره بزن.' : 'برای شروع، دسترسی رایگان بگیر یا سفارش تأییدشده‌ات را بازیابی کن.';
  $('#primaryAction').textContent = active ? 'کپی کانفیگ انتخابی ↗' : awaiting ? 'بازیابی دوبارهٔ کانفیگ ↗' : hasFree ? 'فعال‌سازی طرح رایگان ↗' : 'دیدن طرح‌ها ↗';
  $('#expiryText').textContent = active ? `اعتبار تا ${dateFa(subscription.expiresAt)} · اتصال واقعی در کلاینت مستقل` : 'اتصال سیستم‌عامل فقط از طریق کلاینت مستقل انجام می‌شود.';
  $('#copySub').disabled = !subscriptionUrl;
  $('#copyConfig').disabled = !active;
  $('#accessMeta').textContent = active ? `نوع: ${subscription.tier === 'free' ? 'رایگان' : 'اشتراکی'} · لبه: ${subscription.endpoint} · اعتبار: ${dateFa(subscription.expiresAt)}` : awaiting ? 'لینک اشتراک روی همین دستگاه محفوظ است؛ اتصال به Worker هنوز تأیید نشده.' : 'اشتراک فعالی روی این دستگاه ذخیره نشده است.';
  const grid = $('#profileGrid'); grid.replaceChildren();
  if (!active) { grid.append(element('div', 'blank-state', 'ابتدا کانفیگ فعال کنید.')); return; }
  profiles.forEach((profile, index) => {
    const button = element('button', `profile-option ${selected === index ? 'selected' : ''}`, '');
    button.type = 'button';
    button.append(element('span', 'profile-symbol', profile.icon));
    const text = element('span', 'profile-text', '');
    text.append(element('strong', '', profile.name), element('small', '', profile.detail));
    button.append(text, element('span', 'profile-arrow', selected === index ? '✓' : '↗'));
    button.addEventListener('click', () => { selected = index; updateUi(); toast(`${profile.name} انتخاب شد؛ همهٔ پروفایل‌ها از همان ورودی Worker استفاده می‌کنند.`); });
    grid.append(button);
  });
}
async function loadSubscription(path) {
  const validated = validSubUrl(path);
  if (!validated) { storeUrl(''); throw new Error('لینک اشتراک معتبر نیست.'); }
  subscriptionUrl = validated;
  storeUrl(validated); // preserve the secret link even if this fetch times out/offline
  try {
    const result = await api(validated.slice('/api/v1'.length) + '?format=json');
    subscription = result;
    updateUi();
  } catch (e) {
    subscription = null;
    if (subscriptionIsInvalid(e.status)) { subscriptionUrl = ''; storeUrl(''); }
    updateUi();
    throw e;
  }
}
async function activate() {
  if (subscription) { await copy(subscription.links[selected]); toast('کانفیگ انتخابی کپی شد. آن را در کلاینت سازگار وارد کن.'); return; }
  if (subscriptionUrl) {
    const button = $('#primaryAction'); button.disabled = true;
    try { await loadSubscription(subscriptionUrl); toast('کانفیگ دوباره از Worker دریافت شد.'); }
    catch (e) { toast(e.message); }
    finally { button.disabled = false; }
    return;
  }
  if (!hasFree) { location.href = '/#plans'; return; }
  const button = $('#primaryAction'); button.disabled = true;
  try {
    const result = await api('/activate/free', { method: 'POST', data: {} });
    await loadSubscription(result.subscriptionUrl);
    toast('دسترسی آزمایشی فعال شد. این صفحه VPN دستگاه را روشن نمی‌کند.');
  } catch (e) { toast(e.message); }
  finally { button.disabled = false; }
}
$('#primaryAction').addEventListener('click', activate);
$('#copySub').addEventListener('click', async () => {
  try { await copy(new URL(subscriptionUrl, location.origin).href); toast('لینک اشتراک کپی شد؛ آن را محرمانه نگه دارید.'); }
  catch (e) { toast(e.message); }
});
$('#copyConfig').addEventListener('click', () => subscription && copy(subscription.links[selected]).then(() => toast('کانفیگ انتخابی کپی شد.')).catch((e) => toast(e.message)));
let probing = false;
async function measureNetwork(count = 3) {
  if (probing) return;
  probing = true;
  $('#pingAgain').disabled = true;
  $('#pingTen').disabled = true;
  $('#networkText').textContent = 'در حال آزمایش HTTPS Worker...';
  try {
    const result = await probeWorker({ count, onProgress: ({ completed, successes }) => {
      $('#networkText').textContent = `${fa(completed)} از ${fa(count)} تلاش HTTPS · ${fa(successes)} پاسخ`;
    } });
    $('#pingStat').textContent = result.medianMs === null ? '—' : `${fa(result.medianMs)} ms`;
    $('#coloStat').textContent = result.colo === 'unknown' ? 'نامشخص' : result.colo;
    $('#networkText').textContent = `${fa(result.successes)} پاسخ از ${fa(result.total)} تلاش HTTPS به Worker (نه اتصال VPN)`;
    $('#todayText').textContent = result.successes ? 'Worker از این شبکه پاسخ داد' : 'Worker از این شبکه پاسخ نداد';
  } finally {
    probing = false;
    $('#pingAgain').disabled = false;
    $('#pingTen').disabled = false;
  }
}
$('#pingAgain').addEventListener('click', () => measureNetwork(3));
$('#pingTen').addEventListener('click', () => measureNetwork(10));
async function refreshLiveConfig() {
  try {
    const catalog = await api('/public');
    initialized = catalog.initialized;
    hasFree = initialized && catalog.products.some((p) => p.tier === 'free');
    setBrand(catalog.settings.siteName, 'اپ همراه');
    document.body.dataset.accent = catalog.settings.accent;
    updateUi();
  } catch { /* preserve the last visible settings during a transient outage */ }
  if (subscriptionUrl) loadSubscription(subscriptionUrl).catch(() => {});
}
window.addEventListener('online', () => { measureNetwork(3); refreshLiveConfig(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshLiveConfig();
});
// Refresh public settings/revocations without rebuilding or mutating the signed clients.
setInterval(() => { if (!document.hidden) refreshLiveConfig(); }, 90_000);
async function checkOrder(id, receipt) {
  const result = await api(`/orders/${encodeURIComponent(id)}/status`, { method: 'POST', data: { receipt } });
  const order = result.order;
  const target = $('#orderResult'); target.hidden = false; target.replaceChildren();
  target.append(element('strong', '', `${order.productName} · ${fa(order.priceToman)} تومان`));
  target.append(element('span', `order-status ${order.status}`, { pending: 'در انتظار بررسی دستی', approved: 'تأیید شده', rejected: 'رد شده', revoked: 'دسترسی لغو شده' }[order.status] || order.status));
  target.append(element('small', '', `زمان ثبت: ${dateFa(order.createdAt)}`));
  if (order.subscriptionUrl) {
    await loadSubscription(order.subscriptionUrl);
    target.append(element('p', '', 'دسترسی اشتراکی به این دستگاه اضافه شد.'));
  }
}
$('#trackForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $('#trackError').textContent = '';
  try { await checkOrder(form.elements.orderId.value.trim(), form.elements.receipt.value.trim()); toast('وضعیت سفارش دریافت شد.'); }
  catch (e) { $('#trackError').textContent = e.message; }
});
(async () => {
  updateUi();
  measureNetwork();
  await refreshLiveConfig();
  const existing = savedUrl();
  if (existing) try { await loadSubscription(existing); } catch { toast('اشتراک ذخیره‌شده منقضی یا غیرفعال است.'); }
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const id = fragment.get('order'), receipt = fragment.get('receipt');
  if (id && receipt) {
    history.replaceState(null, '', location.pathname);
    $('#trackForm').elements.orderId.value = id;
    $('#trackForm').elements.receipt.value = receipt;
    try { await checkOrder(id, receipt); } catch (e) { $('#trackError').textContent = e.message; }
    location.hash = 'orders';
  }
  registerPwa();
})();
