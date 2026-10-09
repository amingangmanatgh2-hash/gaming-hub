// Seeds a rich demo state into the RUNNING dev server so the live preview
// is explorable immediately. Idempotent-ish: safe to run once per fresh DB.
// Usage: node scripts/seed-demo.mjs

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const MOCK = process.env.MOCK || 'http://127.0.0.1:9999';

const ADMIN = { name: 'مدیر نمایشی', email: 'admin@amin.demo', password: 'Admin#Demo1403' };
const USER = { name: 'کاربر نمایشی', email: 'user@amin.demo', password: 'User#Demo1403' };

function jar() {
  const c = new Map();
  return {
    absorb(r) { for (const s of r.headers.getSetCookie?.() || []) { const [p] = s.split(';'); const i = p.indexOf('='); c.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } },
    header() { return [...c.entries()].map(([k, v]) => `${k}=${v}`).join('; '); },
  };
}
async function call(j, m, p, b) {
  const h = { 'X-Requested-With': 'XMLHttpRequest', Cookie: j.header() };
  if (b) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  j.absorb(r);
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${m} ${p} → ${r.status}: ${JSON.stringify(json)}`);
  return json?.data;
}

const admin = jar();
const user = jar();

console.log('› setup wizard…');
const status = await call(jar(), 'GET', '/api/setup/status');
if (status.setup_required) {
  await call(admin, 'POST', '/api/setup', {
    admin_name: ADMIN.name, admin_email: ADMIN.email, admin_password: ADMIN.password,
    site_name_fa: 'امین‌ای‌آی الترا', site_name_en: 'AMIN AI ULTRA', default_locale: 'fa',
  });
  console.log('  setup completed');
} else {
  await call(admin, 'POST', '/api/auth/login', { email: ADMIN.email, password: ADMIN.password }).catch(() => null);
  console.log('  setup already completed; logged in as admin');
}

console.log('› demo user…');
await call(user, 'POST', '/api/auth/register', { name: USER.name, email: USER.email, password: USER.password, locale: 'fa', country_code: 'IR' })
  .catch(() => call(user, 'POST', '/api/auth/login', { email: USER.email, password: USER.password }));

console.log('› providers & models (local test stubs)…');
const chatProv = await call(admin, 'POST', '/api/admin/providers', {
  kind: 'openai_compatible', name: 'موک‌جی‌پی‌تی (تست محلی)', base_url: MOCK + '/v1', api_key: 'x', enabled: true, priority: 5,
});
await call(admin, 'POST', '/api/admin/models', {
  provider_id: chatProv.id, model_key: 'mock-gpt-1', display_name: 'پاسخ‌گر سریع (تست)', kind: 'chat', tier: 'basic', enabled: true,
});
const videoProv = await call(admin, 'POST', '/api/admin/providers', {
  kind: 'video_http', name: 'موک‌ویدیو (تست محلی)', base_url: MOCK + '/video', api_key: 'x', enabled: true, priority: 5,
});
await call(admin, 'POST', '/api/admin/models', {
  provider_id: videoProv.id, model_key: 'mock-video-1', display_name: 'ویدیوساز نمایشی', kind: 'video', tier: 'basic', enabled: true,
  config: { durations: [3, 5, 10], ratios: ['16:9', '9:16', '1:1'], cost_hint: 'نمایشی — هزینه واقعی وابسته به ارائه‌دهنده واقعی' },
});

console.log('› payment settings (zarinpal stub + manual card)…');
const re = await call(admin, 'POST', '/api/auth/reauth', { password: ADMIN.password });
await call(admin, 'PUT', '/api/admin/settings/payments', {
  provider: 'zarinpal',
  zarinpal: { merchant_id: 'TEST-MERCHANT-0001', sandbox: false, base_url: MOCK + '/zp/pg/v4' },
  callback_base: '', success_path: '/pay/result?status=ok', failure_path: '/pay/result?status=failed',
  currencies: ['IRR'],
  manual: { enabled: true, card_number: '6104-3377-1234-5678', card_holder: 'امین نمایشی', bank_name: 'بانک ملت (نمایشی)', note_fa: 'این اطلاعات نمایشی است؛ در محیط واقعی شماره کارت خود را وارد کنید.' },
  refund_policy_fa: 'بازگشت وجه پس از بررسی مدیر و طبق قوانین درگاه انجام می‌شود.',
  reauth_token: re.reauth_token,
});

console.log('› demo conversations…');
for (const q of ['سلام! امین‌ای‌آی چطور کار می‌کند؟', 'یک برنامه سفر دو روزه به شیراز پیشنهاد بده', 'چطور گذرواژه قوی بسازم؟']) {
  await call(user, 'POST', '/api/chat/send', { message: q }).catch(() => {});
}

console.log('› demo video job…');
const vmodels = await call(user, 'GET', '/api/video/models');
const vm = vmodels.models?.[0];
if (vm) {
  await call(user, 'POST', '/api/video/generate', { model_id: vm.id, prompt: 'غروب آفتاب روی ساحل خزر، موج‌های آرام', aspect_ratio: '16:9', duration_seconds: 3 }).catch(() => {});
}

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ داده نمایشی آماده است.

حساب مدیر:     ${ADMIN.email} / ${ADMIN.password}
حساب کاربر:    ${USER.email} / ${USER.password}

نکته: ارائه‌دهندگان «موک» روی ${MOCK} اجرا می‌شوند
(اسکریپت scripts/mock-providers.mjs) و فقط برای تست‌اند.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
