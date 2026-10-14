import { $, api, fa, dateFa, toast, setBrand } from '/common.js';

let csrf = '';
let state = null;
let editing = '';
let proposal = null;
const pages = { overview: 'نمای کلی', products: 'مدیریت طرح‌ها', orders: 'سفارش‌ها', settings: 'تنظیمات سایت', bot: 'ربات تلگرام', assistant: 'دستیار AI' };
function el(tag, cls = '', text = '') { const node = document.createElement(tag); if (cls) node.className = cls; node.textContent = text; return node; }
function showLogin(message = '') {
  $('#panelShell').hidden = true;
  $('#authGate').hidden = false;
  $('#loginError').textContent = message;
}
function openPage(page) {
  if (!pages[page]) page = 'overview';
  document.querySelectorAll('.panel-section').forEach((section) => section.classList.toggle('active', section.id === `page-${page}`));
  document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  $('#pageLabel').textContent = pages[page];
  if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => openPage(b.dataset.page)));
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => openPage(b.dataset.go)));

async function refresh() {
  try { state = await api('/admin/state'); }
  catch (e) { if (/نشست/.test(e.message)) showLogin(e.message); else toast(e.message); return; }
  const { settings, products, orders, bot, aiHistory } = state;
  setBrand(settings.siteName, 'پنل مدیریت');
  document.body.dataset.accent = settings.accent;
  $('#statOrders').textContent = fa(orders.length);
  const pending = orders.filter((o) => o.status === 'pending').length;
  $('#statPending').textContent = fa(pending);
  $('#statPlans').textContent = fa(products.filter((p) => p.enabled && (p.tier === 'free' ? settings.freeEnabled : settings.paidEnabled)).length);
  $('#statRate').textContent = fa(settings.usdToToman);
  $('#pendingBadge').textContent = fa(pending);
  $('#pendingBadge').hidden = pending === 0;
  $('#botMiniBadge').textContent = bot.enabled ? 'فعال' : 'خاموش';
  $('#botMiniStatus').textContent = bot.status;
  $('#rateMiniStatus').textContent = `${settings.rateSource === 'provider' ? 'منبع خودکار' : 'تنظیم دستی'} · ${dateFa(settings.rateUpdatedAt)}`;
  $('#botStatusChip').textContent = bot.enabled ? 'توکن ثبت شده' : 'غیرفعال';
  $('#botStatusChip').classList.toggle('on', bot.enabled);
  $('#botStatusText').textContent = bot.status;
  renderOverview(); renderProducts(); renderOrders(); renderAiHistory(aiHistory);
  const form = $('#settingsForm');
  for (const name of ['siteName', 'tagline', 'announcement', 'supportUsername', 'usdToToman', 'accent']) form.elements[name].value = settings[name] ?? '';
  form.elements.freeEnabled.checked = settings.freeEnabled;
  form.elements.paidEnabled.checked = settings.paidEnabled;
}
function statusLabel(status) { return { pending: 'در انتظار', approved: 'تأییدشده', rejected: 'ردشده', revoked: 'لغوشده' }[status] || status; }
function renderOverview() {
  const target = $('#recentOrders'); target.replaceChildren();
  const orders = state.orders.slice(0, 4);
  if (!orders.length) { target.append(el('p', 'blank-state', 'هنوز سفارشی ثبت نشده است.')); return; }
  orders.forEach((order) => {
    const row = el('div', 'recent-row');
    const icon = el('span', 'recent-icon', order.status === 'approved' ? '✓' : order.status === 'rejected' ? '×' : '◷');
    const info = el('div'); info.append(el('strong', '', `${order.productName} · ${order.name}`), el('small', '', dateFa(order.createdAt)));
    row.append(icon, info, el('span', `order-status ${order.status}`, statusLabel(order.status)));
    target.append(row);
  });
}
function renderProducts() {
  const list = $('#productList'); list.replaceChildren();
  $('#productCount').textContent = fa(state.products.length);
  if (!state.products.length) list.append(el('p', 'blank-state', 'هنوز طرحی تعریف نشده است.'));
  state.products.forEach((product) => {
    const card = el('article', 'product-row');
    const badge = el('span', 'product-row-icon', product.tier === 'free' ? '✦' : '◈');
    const info = el('div', 'product-row-info');
    info.append(el('strong', '', product.name), el('small', '', `${product.id} · ${product.durationDays} روز · ${product.enabled ? 'فعال' : 'مخفی'}`));
    const price = el('span', 'product-row-price', product.tier === 'free' ? 'رایگان' : `${fa(product.priceUSD)} $`);
    const edit = el('button', 'button button-outline button-small', 'ویرایش ↗'); edit.type = 'button'; edit.addEventListener('click', () => editProduct(product.id));
    card.append(badge, info, price, edit); list.append(card);
  });
}
function renderOrders() {
  const target = $('#orderRows'); target.replaceChildren();
  const chosen = $('#orderFilter').value;
  const orders = state.orders.filter((order) => chosen === 'all' || order.status === chosen);
  $('#orderCount').textContent = fa(orders.length);
  if (!orders.length) { const tr = el('tr'); const td = el('td', 'blank-state', 'سفارشی با این وضعیت پیدا نشد.'); td.colSpan = 5; tr.append(td); target.append(tr); return; }
  orders.forEach((order) => {
    const tr = el('tr');
    const plan = el('td'); plan.append(el('strong', '', order.productName), el('small', 'mono', order.id));
    const customer = el('td'); customer.append(el('strong', '', order.name), el('small', '', order.contact));
    const amount = el('td'); amount.append(el('strong', '', `${fa(order.priceToman)} تومان`), el('small', '', `${fa(order.exchangeRate)} تومان / دلار`));
    const status = el('td'); status.append(el('span', `order-status ${order.status}`, statusLabel(order.status)));
    const action = el('td', 'order-actions');
    if (order.status === 'pending') {
      const approve = el('button', 'action-approve', 'تأیید'); approve.type = 'button'; approve.addEventListener('click', () => review(order, 'approved'));
      const reject = el('button', 'action-reject', 'رد'); reject.type = 'button'; reject.addEventListener('click', () => review(order, 'rejected'));
      action.append(approve, reject);
    } else if (order.status === 'approved') {
      const revoke = el('button', 'action-reject', 'لغو دسترسی'); revoke.type = 'button'; revoke.addEventListener('click', () => review(order, 'revoked'));
      action.append(revoke);
    } else action.textContent = dateFa(order.reviewedAt);
    tr.append(plan, customer, amount, status, action); target.append(tr);
  });
}
function renderAiHistory(history = []) {
  const area = $('#aiMessages'); area.replaceChildren();
  if (!history.length) { area.append(el('div', 'ai-empty', 'سلام! مثلاً بگو: «طرح رایگان را غیرفعال کن» یا «نرخ دلار را ۹۵۰۰۰ تومان بگذار». بدون تأیید تو چیزی تغییر نمی‌کند.')); return; }
  history.forEach((message) => area.append(el('div', `ai-message ${message.role === 'user' ? 'user' : 'bot'}`, message.text)));
  area.scrollTop = area.scrollHeight;
}
function editProduct(id = '') {
  editing = id;
  const product = state.products.find((p) => p.id === id);
  const form = $('#productForm'); form.hidden = false;
  form.reset();
  $('#productError').textContent = '';
  $('#productEditorTitle').textContent = product ? `ویرایش ${product.name}` : 'ساخت طرح جدید';
  form.elements.id.disabled = !!product;
  $('#deleteProduct').hidden = !product;
  const values = product || { id: '', name: '', description: '', tier: 'paid', priceUSD: 3.9, durationDays: 30, features: [], enabled: true };
  for (const key of ['id', 'name', 'description', 'tier', 'priceUSD', 'durationDays']) form.elements[key].value = values[key];
  form.elements.features.value = values.features.join('\n');
  form.elements.enabled.checked = values.enabled;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#newProductBtn').addEventListener('click', () => editProduct());
$('#cancelProduct').addEventListener('click', () => { $('#productForm').hidden = true; editing = ''; });
$('#productForm').elements.tier.addEventListener('change', (event) => { if (event.target.value === 'free') $('#productForm').elements.priceUSD.value = 0; });
$('#productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = {
    id: editing || form.elements.id.value.trim(),
    name: form.elements.name.value.trim(), description: form.elements.description.value.trim(),
    tier: form.elements.tier.value, priceUSD: Number(form.elements.priceUSD.value),
    durationDays: Number(form.elements.durationDays.value), enabled: form.elements.enabled.checked,
    features: form.elements.features.value.split('\n').map((s) => s.trim()).filter(Boolean),
  };
  try {
    await api(editing ? `/admin/products/${editing}` : '/admin/products', { method: editing ? 'PUT' : 'POST', data, csrf });
    form.hidden = true; toast('طرح ذخیره شد.'); await refresh();
  } catch (e) { $('#productError').textContent = e.message; }
});
$('#deleteProduct').addEventListener('click', async () => {
  if (!editing || !window.confirm('این طرح حذف شود؟ سفارش‌های قدیمی با قیمت ثبت‌شده باقی می‌مانند.')) return;
  try { await api(`/admin/products/${editing}`, { method: 'DELETE', csrf }); $('#productForm').hidden = true; toast('طرح حذف شد.'); await refresh(); }
  catch (e) { $('#productError').textContent = e.message; }
});
$('#orderFilter').addEventListener('change', renderOrders);
async function review(order, status) {
  const question = status === 'approved'
    ? `آیا پرداخت سفارش ${order.id} را خارج از سایت بررسی کرده‌اید و می‌خواهید دسترسی را فعال کنید؟`
    : status === 'revoked' ? `دسترسی سفارش ${order.id} برای اتصال‌های جدید باطل شود؟ اتصال‌های باز تا قطع‌شدنشان ادامه دارند.` : `سفارش ${order.id} رد شود؟`;
  if (!window.confirm(question)) return;
  try { await api(`/admin/orders/${order.id}`, { method: 'PATCH', csrf, data: { status } }); toast('وضعیت سفارش به‌روزرسانی شد.'); await refresh(); }
  catch (e) { toast(e.message); }
}
$('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const f = event.currentTarget;
  const data = {
    siteName: f.elements.siteName.value.trim(), tagline: f.elements.tagline.value.trim(),
    announcement: f.elements.announcement.value.trim(), supportUsername: f.elements.supportUsername.value.trim(),
    usdToToman: Number(f.elements.usdToToman.value), accent: f.elements.accent.value,
    freeEnabled: f.elements.freeEnabled.checked, paidEnabled: f.elements.paidEnabled.checked,
  };
  $('#settingsError').textContent = '';
  try { await api('/admin/settings', { method: 'PUT', data, csrf }); $('#settingsSaved').textContent = 'تغییرات ذخیره شد'; toast('تنظیمات فروشگاه ذخیره شد.'); await refresh(); }
  catch (e) { $('#settingsError').textContent = e.message; }
});
$('#passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $('#passwordError').textContent = '';
  if (form.elements.newPassword.value !== form.elements.confirmPassword.value) { $('#passwordError').textContent = 'تکرار رمز یکسان نیست.'; return; }
  try {
    await api('/admin/password', { method: 'POST', csrf, data: { currentPassword: form.elements.currentPassword.value, newPassword: form.elements.newPassword.value } });
    form.reset(); csrf = ''; state = null; showLogin('رمز تغییر کرد. دوباره وارد شوید.'); toast('تمام نشست‌ها خارج شدند.');
  } catch (e) { $('#passwordError').textContent = e.message; }
});
$('#botForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $('#botError').textContent = '';
  try { await api('/admin/bot', { method: 'POST', data: { token: form.elements.token.value.trim() }, csrf }); form.reset(); toast('توکن ذخیره شد؛ ثبت webhook در حال انجام است.'); await refresh(); }
  catch (e) { $('#botError').textContent = e.message; }
});
$('#disconnectBot').addEventListener('click', async () => {
  if (!window.confirm('ربات غیرفعال شود؟ webhook قدیمی دیگر توسط سایت پذیرفته نمی‌شود.')) return;
  try { await api('/admin/bot', { method: 'POST', data: { clear: true }, csrf }); toast('ربات غیرفعال شد.'); await refresh(); }
  catch (e) { $('#botError').textContent = e.message; }
});
$('#aiForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = form.elements.message.value.trim();
  const button = form.querySelector('button'); button.disabled = true;
  $('#aiError').textContent = '';
  try {
    const result = await api('/admin/ai', { method: 'POST', data: { message }, csrf });
    proposal = result.proposal;
    const preview = $('#proposalView'); preview.replaceChildren();
    preview.append(el('strong', '', proposal.reply));
    const code = el('pre', '', JSON.stringify(proposal.changes, null, 2)); preview.append(code);
    $('#applyProposal').disabled = false;
    form.reset(); await refresh();
  } catch (e) { $('#aiError').textContent = e.message; }
  finally { button.disabled = false; }
});
$('#applyProposal').addEventListener('click', async () => {
  if (!proposal || !window.confirm('تغییرات پیشنهادی پس از اعتبارسنجی روی فروشگاه اعمال شود؟')) return;
  try { await api('/admin/ai/apply', { method: 'POST', data: proposal, csrf }); toast('تغییرات تأیید و اعمال شد.'); proposal = null; $('#applyProposal').disabled = true; $('#proposalView').textContent = 'تغییرات اعمال شد.'; await refresh(); }
  catch (e) { $('#aiError').textContent = e.message; }
});
$('#logoutBtn').addEventListener('click', async () => { try { await api('/admin/logout', { method: 'POST', data: {}, csrf }); } catch { /* still discard UI session */ } csrf = ''; state = null; showLogin('خارج شدید.'); });
$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button'); button.disabled = true;
  $('#loginError').textContent = '';
  try { const result = await api('/login', { method: 'POST', data: { password: form.elements.password.value } }); csrf = result.csrf; form.reset(); $('#authGate').hidden = true; $('#panelShell').hidden = false; await refresh(); openPage(location.hash.slice(1)); }
  catch (e) { $('#loginError').textContent = e.message; }
  finally { button.disabled = false; }
});
(async () => {
  try {
    const status = await api('/setup/status');
    if (!status.initialized) { location.replace('/setup'); return; }
    const session = await api('/admin/me');
    csrf = session.csrf;
    $('#panelShell').hidden = false;
    await refresh(); openPage(location.hash.slice(1));
    $('#aiBindingBadge').textContent = status.aiConfigured ? 'Binding فعال' : 'غیرفعال';
    $('#aiBindingBadge').classList.toggle('on', status.aiConfigured);
  } catch (e) { showLogin(e.message.includes('نشست') ? '' : e.message); }
})();
