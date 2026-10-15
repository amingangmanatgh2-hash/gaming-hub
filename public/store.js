import { $, api, fa, dateFa, copy, toast, registerPwa, setBrand } from '/common.js';

let catalog = null;
let quotedPrice = null;
let receiptText = '';
const grid = $('#planGrid');
function elem(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderProducts() {
  grid.replaceChildren();
  if (!catalog.products.length) { grid.append(elem('div', 'empty-state', 'فعلاً طرح فعالی وجود ندارد؛ بعداً دوباره سر بزنید.')); return; }
  catalog.products.forEach((plan, index) => {
    const card = elem('article', `plan-card${index === 1 ? ' popular' : ''}`);
    const top = elem('div', 'plan-top');
    top.append(elem('span', 'plan-chip', plan.tier === 'free' ? 'برای شروع' : index === 1 ? 'انتخاب محبوب' : 'اشتراکی'), elem('span', 'plan-icon', ['✦', '◈', '◎'][index % 3]));
    const title = elem('h3', '', plan.name);
    const description = elem('p', 'description', plan.description);
    const price = elem('div', 'plan-price');
    price.append(elem('strong', '', plan.tier === 'free' ? 'رایگان' : fa(plan.priceToman)));
    if (plan.tier !== 'free') price.append(elem('small', '', 'تومان'));
    const usd = elem('div', 'plan-usd', plan.tier === 'free' ? `${fa(plan.durationDays)} روز دسترسی` : `$${plan.priceUSD.toFixed(2)} USD  /  ${fa(plan.durationDays)} روز`);
    const list = elem('ul');
    plan.features.forEach((text) => list.append(elem('li', '', text)));
    const action = elem(plan.tier === 'free' ? 'a' : 'button', `button ${index === 1 ? 'button-primary' : 'button-outline'} full`, plan.tier === 'free' ? 'شروع رایگان ↗' : 'ثبت سفارش ↗');
    if (plan.tier === 'free') action.href = '/app';
    else { action.type = 'button'; action.addEventListener('click', () => openOrder(plan)); }
    if (!catalog.initialized) {
      action.textContent = 'در انتظار نصب اولیه';
      if (action.tagName === 'A') action.removeAttribute('href');
      else action.disabled = true;
    }
    card.append(top, title, description, price, usd, list, action);
    grid.append(card);
  });
}
function openOrder(plan) {
  $('#orderForm').hidden = false;
  $('#receiptView').hidden = true;
  $('#orderForm').reset();
  $('#orderForm').elements.productId.value = plan.id;
  $('#orderTitle').textContent = plan.name;
  quotedPrice = plan.priceToman;
  $('#orderSummary').textContent = `${fa(plan.priceToman)} تومان · ${fa(plan.durationDays)} روز · قیمت ثابت در زمان ثبت سفارش`;
  $('#orderFeedback').textContent = '';
  $('#orderDialog').showModal();
}
async function loadCatalog() {
  try {
    catalog = await api('/public');
    setBrand(catalog.settings.siteName, 'اتصال ساده، انتخاب روشن');
    document.body.dataset.accent = catalog.settings.accent;
    $('#announcement').textContent = catalog.settings.announcement || catalog.settings.tagline;
    $('#rateValue').textContent = `${fa(catalog.settings.usdToToman)} تومان`;
    $('#rateMeta').textContent = `${catalog.settings.rateSource === 'provider' ? 'منبع خودکار' : 'نرخ دستی پنل'} · ${dateFa(catalog.settings.rateUpdatedAt)}`;
    if (catalog.settings.supportUsername) {
      $('#supportLink').href = `https://t.me/${catalog.settings.supportUsername}`;
      $('#supportLink').target = '_blank';
      $('#supportLink').rel = 'noopener noreferrer';
    }
    if (!catalog.initialized) $('#planNotice').textContent = 'این فروشگاه هنوز راه‌اندازی نشده است. طرح‌ها صرفاً نمونه هستند و خرید/فعال‌سازی تا نصب اولیه ممکن نیست.';
    renderProducts();
  } catch (e) {
    grid.replaceChildren(elem('div', 'empty-state', `دریافت طرح‌ها ممکن نبود: ${e.message}`));
    $('#rateValue').textContent = 'در دسترس نیست';
    $('#edgeLabel').textContent = 'سرویس در دسترس نیست';
  }
}
async function measure() {
  const start = performance.now();
  try {
    const result = await api('/ping');
    $('#latencyValue').replaceChildren(document.createTextNode(String(Math.round(performance.now() - start)) + ' '), elem('small', '', 'ms'));
    $('#edgeLabel').textContent = result.colo === 'unknown' ? 'Cloudflare Worker' : `لبهٔ ${result.colo}`;
  } catch { $('#edgeLabel').textContent = 'در دسترس نیست'; $('#latencyValue').textContent = '—'; }
}
$('#orderForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  $('#orderFeedback').textContent = '';
  try {
    const data = Object.fromEntries(new FormData(form));
    const latest = await api('/public');
    const live = latest.products.find((p) => p.id === data.productId && p.tier === 'paid');
    if (!live) throw new Error('این طرح دیگر برای سفارش در دسترس نیست.');
    if (live.priceToman !== quotedPrice) {
      quotedPrice = live.priceToman;
      $('#orderSummary').textContent = `${fa(live.priceToman)} تومان · ${fa(live.durationDays)} روز · نرخ به‌روز شد`;
      throw new Error('نرخ تغییر کرده است؛ قیمت تازه را بررسی کنید و دوباره ثبت را بزنید.');
    }
    data.expectedPriceToman = quotedPrice;
    const order = await api('/orders', { method: 'POST', data });
    receiptText = `شناسه سفارش: ${order.id}\nکد پیگیری: ${order.receipt}\nمبلغ: ${fa(order.priceToman)} تومان`;
    $('#receiptCode').textContent = receiptText;
    $('#trackLink').href = `/app/#order=${encodeURIComponent(order.id)}&receipt=${encodeURIComponent(order.receipt)}`;
    form.hidden = true;
    $('#receiptView').hidden = false;
  } catch (e) { $('#orderFeedback').textContent = e.message; }
  finally { button.disabled = false; }
});
$('#closeOrder').addEventListener('click', () => $('#orderDialog').close());
$('#orderDialog').addEventListener('click', (e) => { if (e.target === $('#orderDialog')) $('#orderDialog').close(); });
$('#copyReceipt').addEventListener('click', () => copy(receiptText).then(() => toast('اطلاعات پیگیری کپی شد.')).catch((e) => toast(e.message)));
loadCatalog(); measure(); registerPwa();
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCatalog(); });
setInterval(() => { if (!document.hidden) loadCatalog(); }, 60_000);
