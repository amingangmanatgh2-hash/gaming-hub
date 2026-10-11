/** صفحهٔ خانه: ساخت اتاق، ورود، قابلیت‌ها، تست دستگاه، استقرار */
import { $, $$, toast, store, initTheme, toggleTheme, copy, el, esc, beep } from '../core/util.js';
import { api, measureLatency, connectionInfo, suggestInitialProfile } from '../core/net.js';
import { FEATURES, FEATURE_COUNT, CATEGORIES } from '../features/registry.js';
import { APP, FAQ } from '../core/const.js';
import { MediaManager } from '../core/media.js';

initTheme();
$('#themeBtn').onclick = () => {
  const t = toggleTheme();
  toast(t === 'light' ? 'پوستهٔ روشن' : 'پوستهٔ تیره', 'ok', 1200);
};
$('#ver').textContent = APP.version;
$('#deployBtn').href = APP.deployUrl;
$('#deployBtn').title = `الگوی مخزن: ${APP.repo}`;

/* ── قابلیت‌ها ── */
const grid = $('#featGrid');
const cats = $('#featCat');
for (const c of CATEGORIES) cats.append(el('option', { value: c.id, text: c.title }));
$('#featSearch').placeholder = `جست‌وجو در ${FEATURE_COUNT} قابلیت…`;

function renderFeatures() {
  const q = $('#featSearch').value.trim().toLowerCase();
  const cat = $('#featCat').value;
  const list = FEATURES.filter((f) => (!cat || f.cat === cat) && (!q || f.k.toLowerCase().includes(q)));
  grid.innerHTML = '';
  for (const f of list.slice(0, 400)) {
    grid.append(el('div', { class: 'feat' },
      el('span', { class: 'em', text: f.e }),
      el('div', {}, el('b', { text: f.t }), el('small', { text: f.d })),
    ));
  }
  $('#featCount').textContent = `${list.length} از ${FEATURE_COUNT} قابلیت`;
}
$('#featSearch').oninput = renderFeatures;
$('#featCat').onchange = renderFeatures;
renderFeatures();
document.querySelector('#features h2').textContent = `${FEATURE_COUNT} قابلیت، همه در یک اتاق`;
document.querySelector('.hero-copy .lead b').textContent = `بیش از ${FEATURE_COUNT} قابلیت کاربردی`;

/* ── پرسش‌های پرتکرار ── */
for (const [q, a] of FAQ) {
  $('#faqList').append(el('details', {}, el('summary', { text: q }), el('p', { class: 'fine', html: esc(a) })));
}

/* ── ساخت/ورود به اتاق ── */
function go(code, { pin = '', name = '' } = {}) {
  const u = new URL(`/r/${code}`, location.origin);
  if (pin) u.searchParams.set('pin', pin);
  if (name) u.searchParams.set('name', name);
  location.href = u.toString();
}

function recentRooms() {
  const list = store.get('recent', []);
  const host = $('#recent');
  host.innerHTML = '';
  if (!list.length) return;
  host.append(el('span', { class: 'fine', text: 'اتاق‌های اخیر:' }));
  for (const r of list.slice(0, 5)) {
    host.append(el('button', {
      class: 'chip',
      text: `${r.name || r.code} (${r.code})`,
      onclick: () => go(r.code),
    }));
  }
}
recentRooms();

$('#createForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const btn = ev.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = '⏳ در حال ساخت…';
  try {
    const body = {
      name: String(f.get('name') || '').trim(),
      pin: String(f.get('pin') || '').trim(),
      ttlHours: Number(f.get('ttlHours') || 8),
      maxP: Number(f.get('maxP') || 8),
      waitingRoom: !!f.get('waitingRoom'),
    };
    const data = await api('/api/room', { method: 'POST', body });
    if (!data.ok || !data.code) throw new Error('ساخت اتاق ناموفق بود');
    const list = store.get('recent', []).filter((r) => r.code !== data.code);
    list.unshift({ code: data.code, name: body.name, ts: Date.now() });
    store.set('recent', list.slice(0, 8));
    toast(`اتاق ${data.code} آماده است ✅`, 'ok', 1600);
    beep('in');
    go(data.code, { pin: body.pin, name: store.get('name', '') });
  } catch (e) {
    toast(`خطا: ${e.message || e}`, 'err', 4000);
    btn.disabled = false;
    btn.textContent = '🚀 ساخت اتاق و ورود';
  }
});

$('#joinForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const code = String(f.get('code') || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code) return toast('کد اتاق را وارد کنید', 'warn');
  go(code, { pin: String(f.get('pin') || '') });
});

$('#navRoom').href = '/r/';

/* ── تست دوربین و میکروفن ── */
const mm = new MediaManager();
let stopMeter = null;
$('#testStart').onclick = async () => {
  $('#testMsg').textContent = 'در حال گرفتن دسترسی…';
  const p = suggestInitialProfile();
  const r = await mm.init({ audio: true, video: true, profile: p === 'audio' ? 'lite' : p });
  $('#testVideo').srcObject = mm.local;
  $('#testVideo').muted = true;
  const tracks = mm.local.getTracks().map((t) => t.kind).join('+');
  $('#testMsg').textContent = tracks ? `آماده: ${tracks} (پروفایل پیشنهادی: ${p})` : 'دسترسی داده نشد';
  if (stopMeter) stopMeter();
  if (mm.local.getAudioTracks().length) {
    stopMeter = mm.attachMeter(mm.local, (v) => { $('#testBar').style.width = `${Math.min(100, v * 140)}%`; });
  }
  if (mm.camTrack) mm.setFx('blur');
};
$('#testStop').onclick = () => {
  mm.stop();
  if (stopMeter) stopMeter();
  $('#testVideo').srcObject = null;
  $('#testBar').style.width = '0%';
  $('#testMsg').textContent = 'خاموش شد';
};

/* ── تأخیر و وضعیت سرور ── */
$('#pingBtn').onclick = async () => {
  $('#netStat').textContent = '…';
  const r = await measureLatency(3);
  const c = connectionInfo();
  $('#netStat').innerHTML = r
    ? `${r.min} <small class="fine">میلی‌ثانیه (کمترین) · میانگین ${r.avg}</small><br><small class="fine">شبکه: ${esc(c.type)}${c.downlink ? ` · ${c.downlink}Mbps` : ''}${c.saveData ? ' · حالت کم‌داده' : ''} · پروفایل پیشنهادی: ${suggestInitialProfile()}</small>`
    : 'اندازه‌گیری نشد';
};
(async () => {
  try {
    const h = await api('/api/health', { retry: 0 });
    $('#healthStat').innerHTML = `✅ سرور فعال — ${h.runtime === 'workers-durable-objects' ? 'سیگنالینگ با Durable Objects' : 'بدون Durable Object (فقط استاتیک)'}<br>${h.turn ? 'TURN رایگان فعال است' : 'TURN خاموش (پیش‌فرض P2P مستقیم)'}`;
  } catch {
    $('#healthStat').textContent = '⚠️ سرور در دسترس نیست (اگر فقط Pages استاتیک است، این طبیعی است)';
  }
})();

/* ── میان‌بر: Ctrl/Cmd+K تمرکز روی ورود سریع ── */
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('#joinForm').code?.focus?.() || $('#joinForm input').focus();
  }
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    $('#featSearch').focus();
  }
});

/* ── لینک سریع با ?r=CODE ── */
const qp = new URLSearchParams(location.search);
const direct = qp.get('r') || qp.get('join') || qp.get('code');
if (direct) $('#joinForm input').value = direct.toUpperCase();
else {
  const saved = store.get('name', '');
  $('#createForm').name.value = '';
  if (saved) $('#createForm').name.placeholder = `مثلاً: جلسهٔ ${saved}`;
}

/* ── PWA ── */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
