import { $, api, fa, dateFa, copy, toast, registerPwa, setBrand } from '/common.js';

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
  $('#accessBadge').textContent = active ? 'کانفیگ فعال' : 'بدون دسترسی';
  $('#accessBadge').classList.toggle('active', active);
  $('#accessTitle').textContent = active ? 'کانفیگت آماده است' : 'هنوز کانفیگی فعال نیست';
  $('#accessDesc').textContent = active ? 'یک پروفایل را انتخاب کن و لینک آن را در کلاینت سازگار وارد کن؛ این صفحه خودش VPN را روشن نمی‌کند.' : 'برای شروع، دسترسی رایگان بگیر یا سفارش تأییدشده‌ات را بازیابی کن.';
  $('#primaryAction').textContent = active ? 'کپی کانفیگ انتخابی ↗' : hasFree ? 'فعال‌سازی طرح رایگان ↗' : 'دیدن طرح‌ها ↗';
  $('#expiryText').textContent = active ? `اعتبار تا ${dateFa(subscription.expiresAt)} · اتصال واقعی در کلاینت مستقل` : 'اتصال سیستم‌عامل فقط از طریق کلاینت مستقل انجام می‌شود.';
  $('#copySub').disabled = !active;
  $('#copyConfig').disabled = !active;
  $('#accessMeta').textContent = active ? `نوع: ${subscription.tier === 'free' ? 'رایگان' : 'اشتراکی'} · لبه: ${subscription.endpoint} · اعتبار: ${dateFa(subscription.expiresAt)}` : 'اشتراک فعالی روی این دستگاه ذخیره نشده است.';
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
  if (!validated) throw new Error('لینک اشتراک معتبر نیست.');
  try {
    const result = await api(validated.slice('/api/v1'.length) + '?format=json');
    subscriptionUrl = validated;
    subscription = result;
    storeUrl(validated);
    updateUi();
  } catch (e) {
    subscription = null; subscriptionUrl = ''; storeUrl(''); updateUi();
    throw e;
  }
}
async function activate() {
  if (subscription) { await copy(subscription.links[selected]); toast('کانفیگ انتخابی کپی شد. آن را در کلاینت سازگار وارد کن.'); return; }
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
async function measureNetwork() {
  $('#pingAgain').disabled = true;
  $('#networkText').textContent = 'در حال آزمایش دسترسی به Worker...';
  const samples = []; let colo = '—';
  for (let i = 0; i < 3; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const start = performance.now();
    try {
      const res = await fetch('/api/v1/ping', { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('worker_unavailable');
      const data = await res.json();
      if (!data.ok) throw new Error('worker_unavailable');
      samples.push(Math.round(performance.now() - start));
      colo = data.colo || '—';
    } catch { break; }
    finally { clearTimeout(timer); }
  }
  if (samples.length) {
    samples.sort((a, b) => a - b);
    $('#pingStat').textContent = `${fa(samples[Math.floor(samples.length / 2)])} ms`;
    $('#coloStat').textContent = colo === 'unknown' ? 'نامشخص' : colo;
    $('#networkText').textContent = 'Worker از این شبکه پاسخ می‌دهد';
    $('#todayText').textContent = 'Worker در دسترس است';
  } else {
    $('#pingStat').textContent = '—'; $('#coloStat').textContent = '—';
    $('#networkText').textContent = 'Worker از این شبکه پاسخ نداد؛ دلیل قطعی مشخص نیست';
    $('#todayText').textContent = 'بررسی اتصال لازم است';
  }
  $('#pingAgain').disabled = false;
}
$('#pingAgain').addEventListener('click', measureNetwork);
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
  try {
    const catalog = await api('/public');
    initialized = catalog.initialized;
    hasFree = initialized && catalog.products.some((p) => p.tier === 'free');
    setBrand(catalog.settings.siteName, 'اپ همراه');
    document.body.dataset.accent = catalog.settings.accent;
  } catch { /* the network diagnostic already reports availability */ }
  updateUi();
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
