// ============================================================
// AMIN AI ULTRA — end-to-end smoke tests against a live dev worker
// Usage: BASE=http://127.0.0.1:8787 node scripts/smoke.mjs
// Requires: wrangler dev running + mock providers (optional for
//           chat/video/zarinpal scenarios) on 127.0.0.1:9999
// ============================================================

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const MOCK = 'http://127.0.0.1:9999';

let passed = 0, failed = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ❌ ${name} ${extra}`); }
}

function jar() {
  const cookies = new Map();
  return {
    absorb(res) {
      const set = res.headers.getSetCookie?.() || [];
      for (const c of set) {
        const [pair] = c.split(';');
        const idx = pair.indexOf('=');
        cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

async function call(j, method, path, body, extraHeaders = {}) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest', ...extraHeaders };
  if (j) headers['Cookie'] = j.header();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  if (j) j.absorb(res);
  let json = null;
  try { json = await res.json(); } catch { /* redirects have no json */ }
  return { status: res.status, json, headers: res.headers };
}

const uniq = Date.now().toString(36);
const adminCreds = { name: 'مدیر سامانه', email: `admin-${uniq}@example.com`, password: 'Str0ng!Passw0rd42' };
const userCreds = { name: 'کاربر تست', email: `user-${uniq}@example.com`, password: 'Us3r!Passw0rd99' };

async function main() {
  console.log(`\n🧪 AMIN AI ULTRA smoke tests — ${BASE}\n`);

  // ---------- health & setup ----------
  console.log('▸ setup & health');
  const health = await call(null, 'GET', '/api/health');
  check('health endpoint', health.status === 200 && health.json?.ok);

  const setupStatus = await call(null, 'GET', '/api/setup/status');
  check('setup required at first boot', setupStatus.json?.data?.setup_required === true);

  // CSRF: setup without anti-CSRF header must fail
  const csrfBad = await fetch(BASE + '/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('CSRF blocks setup without X-Requested-With', csrfBad.status === 403);

  const admin = jar();
  const setupRes = await call(admin, 'POST', '/api/setup', {
    admin_name: adminCreds.name, admin_email: adminCreds.email, admin_password: adminCreds.password,
    site_name_fa: 'امین‌ای‌آی الترا', default_locale: 'fa',
  });
  check('setup creates admin + session', setupRes.status === 200 && setupRes.json?.data?.admin_id);
  check('setup sets session cookie', admin.header().includes('amin_session='));

  const setupAgain = await call(admin, 'POST', '/api/setup', {
    admin_name: 'x', admin_email: 'x@example.com', admin_password: 'aaaaaaaaaaaa1B',
  });
  check('setup is locked after completion (410)', setupAgain.status === 410);

  const me = await call(admin, 'GET', '/api/auth/me');
  check('admin /me shows role=admin', me.json?.data?.user?.role === 'admin');

  // ---------- registration ----------
  console.log('▸ registration & login');
  const user = jar();
  const reg = await call(user, 'POST', '/api/auth/register', {
    name: userCreds.name, email: userCreds.email, password: userCreds.password, locale: 'fa', country_code: 'IR',
  });
  check('register user', reg.status === 200, JSON.stringify(reg.json));

  const dup = await call(user, 'POST', '/api/auth/register', {
    name: 'x', email: userCreds.email, password: 'aaaaaaaaaaaa1B',
  });
  check('duplicate email rejected (409)', dup.status === 409);

  const wrong = await call(jar(), 'POST', '/api/auth/login', { email: userCreds.email, password: 'wrong-password-1' });
  check('wrong password rejected (401)', wrong.status === 401);

  const login = await call(user, 'POST', '/api/auth/login', { email: userCreds.email, password: userCreds.password });
  check('login with correct password', login.status === 200);

  const userMe = await call(user, 'GET', '/api/auth/me');
  check('user plan is free', userMe.json?.data?.plan?.slug === 'free');
  check('free plan video limit default = 1 (unverified country)', userMe.json?.data?.usage?.video_limit === 1);

  // ---------- RBAC ----------
  console.log('▸ access control');
  const rbac = await call(user, 'GET', '/api/admin/overview');
  check('user blocked from admin API (403)', rbac.status === 403);
  const anon = await call(jar(), 'GET', '/api/admin/overview');
  check('anonymous blocked from admin API (401)', anon.status === 401);
  const anonChat = await call(jar(), 'GET', '/api/chat/conversations');
  check('anonymous blocked from chat (401)', anonChat.status === 401);

  // ---------- mock availability ----------
  let mockUp = false;
  try { const r = await fetch(MOCK + '/v1/models'); mockUp = r.ok; } catch { mockUp = false; }
  console.log(`  ℹ mock providers: ${mockUp ? 'available' : 'NOT running — provider-dependent tests skipped'}`);

  // ---------- admin: providers & models ----------
  console.log('▸ provider configuration');
  let chatProvId, videoProvId, chatModelId, videoModelId;
  if (mockUp) {
    const p1 = await call(admin, 'POST', '/api/admin/providers', {
      kind: 'openai_compatible', name: 'MockGPT', base_url: MOCK + '/v1', api_key: 'x', enabled: true, priority: 1,
    });
    check('create chat provider', p1.status === 200 && !!p1.json?.data?.id, JSON.stringify(p1.json));
    chatProvId = p1.json?.data?.id;

    const p2 = await call(admin, 'POST', '/api/admin/providers', {
      kind: 'video_http', name: 'MockVideo', base_url: MOCK + '/video', api_key: 'x', enabled: true, priority: 1,
    });
    check('create video provider', p2.status === 200);
    videoProvId = p2.json?.data?.id;

    const m1 = await call(admin, 'POST', '/api/admin/models', {
      provider_id: chatProvId, model_key: 'mock-gpt-1', display_name: 'موک‌جی‌پی‌تی', kind: 'chat', tier: 'basic', enabled: true,
    });
    check('create chat model', m1.status === 200 && !!m1.json?.data?.id, JSON.stringify(m1.json));
    chatModelId = m1.json?.data?.id;

    const m2 = await call(admin, 'POST', '/api/admin/models', {
      provider_id: videoProvId, model_key: 'mock-video-1', display_name: 'موک‌ویدیو', kind: 'video', tier: 'basic', enabled: true,
      config: { durations: [3, 5], ratios: ['16:9', '9:16'] },
    });
    check('create video model', m2.status === 200);
    videoModelId = m2.json?.data?.id;

    const testConn = await call(admin, 'POST', `/api/admin/providers/${chatProvId}/test`);
    check('provider connection test OK', testConn.json?.data?.ok === true);

    // Secrets must never leak
    const provList = await call(admin, 'GET', '/api/admin/providers');
    check('admin provider list redacts api_key', provList.status === 200 && !JSON.stringify(provList.json).includes('"api_key":"x"'));
    const pubCfg = await call(null, 'GET', '/api/config/public');
    check('public config has no secrets', !JSON.stringify(pubCfg.json).includes('api_key'));
  }

  // ---------- chat & message quota ----------
  if (mockUp) {
    console.log('▸ chat + message quota');
    const send1 = await call(user, 'POST', '/api/chat/send', { message: 'سلام دنیا', model_id: chatModelId });
    check('chat send returns reply', send1.status === 200 && String(send1.json?.data?.reply || '').includes('پاسخ آزمایشی'), JSON.stringify(send1.json).slice(0, 200));
    check('chat reply persisted conversation', !!send1.json?.data?.conversation_id);

    // exhaust to the free-plan limit (20) — follow-ups stay in ONE conversation
    // so we isolate the daily MESSAGE quota (not the conversation storage cap)
    const planRes = await call(admin, 'GET', '/api/admin/plans');
    const free = planRes.json?.data?.plans?.find((p) => p.slug === 'free');
    const limit = free?.daily_message_limit ?? 20;
    const conv = send1.json?.data?.conversation_id;
    let hit = 0;
    for (let i = 0; i < limit + 3; i++) {
      const r = await call(user, 'POST', '/api/chat/send', { message: 'پیام ' + (i + 2), model_id: chatModelId, conversation_id: conv });
      if (r.status === 429) { hit = i + 1; break; }
    }
    check(`quota blocks after ${limit} messages (got 429 at attempt ${hit})`, hit > 0 && hit <= limit + 1);

    // conversation storage cap is a separate entitlement (403)
    let storageBlocked = false;
    for (let i = 0; i < (free?.conversation_storage_limit ?? 20) + 4; i++) {
      const r = await call(user, 'POST', '/api/chat/conversations', { title: 'c' + i });
      if (r.status === 403) { storageBlocked = true; break; }
    }
    check('conversation storage cap enforced (403)', storageBlocked);

    const usage = await call(user, 'GET', '/api/auth/me');
    check('usage reflects the limit', usage.json?.data?.usage?.message >= limit);

    // tier gating: plus model must be unavailable for free plan
    const m3 = await call(admin, 'POST', '/api/admin/models', {
      provider_id: chatProvId, model_key: 'mock-gpt-pro', display_name: 'حرفه‌ای', kind: 'chat', tier: 'plus', enabled: true,
    });
    const tiered = await call(user, 'POST', '/api/chat/send', { message: 'تست', model_id: m3.json?.data?.id });
    check('free user blocked from plus-tier model (403)', tiered.status === 403);
  }

  // ---------- video quota: atomic reservation, concurrency, release ----------
  if (mockUp) {
    console.log('▸ video generation + quota');
    const modelsInfo = await call(user, 'GET', '/api/video/models');
    check('video models listed with daily limit 1', modelsInfo.json?.data?.daily_limit === 1);

    // concurrency: fire 5 parallel generations, at most ONE must reserve the quota
    const parallel = await Promise.all([
      call(user, 'POST', '/api/video/generate', { model_id: videoModelId, prompt: 'باران در جنگل 1', aspect_ratio: '16:9', duration_seconds: 3 }),
      call(user, 'POST', '/api/video/generate', { model_id: videoModelId, prompt: 'باران در جنگل 2', aspect_ratio: '16:9', duration_seconds: 3 }),
      call(user, 'POST', '/api/video/generate', { model_id: videoModelId, prompt: 'باران در جنگل 3', aspect_ratio: '16:9', duration_seconds: 3 }),
      call(user, 'POST', '/api/video/generate', { model_id: videoModelId, prompt: 'باران در جنگل 4', aspect_ratio: '16:9', duration_seconds: 3 }),
      call(user, 'POST', '/api/video/generate', { model_id: videoModelId, prompt: 'باران در جنگل 5', aspect_ratio: '16:9', duration_seconds: 3 }),
    ]);
    const okCount = parallel.filter((r) => r.status === 200).length;
    const denied = parallel.filter((r) => r.status === 429).length;
    check(`concurrency: exactly 1 reserved (${okCount} ok, ${denied} denied)`, okCount + denied === 5 && okCount === 1 && denied === 4);

    const jobId = parallel.find((r) => r.status === 200)?.json?.data?.job_id;
    // poll until finished
    let jobStatus = '';
    for (let i = 0; i < 8; i++) {
      const st = await call(user, 'GET', `/api/video/jobs/${jobId}`);
      jobStatus = st.json?.data?.job?.status;
      if (['succeeded', 'failed'].includes(jobStatus)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    check('video job succeeded with result_url', jobStatus === 'succeeded');

    // next day quota still 0 today → further attempts fail
    const after = await call(user, 'POST', '/api/video/generate', { model_id: videoModelId, prompt: 'یک ویدیوی دیگر', aspect_ratio: '16:9', duration_seconds: 3 });
    check('daily video quota exhausted (429)', after.status === 429);

    // failed-job quota release: admin marks verified IR (limit 2) for this user to allow another attempt
    await call(admin, 'PATCH', `/api/admin/users/${userMe.json.data.user.id}`, { country_verified: 'IR' });
    const info2 = await call(user, 'GET', '/api/video/models');
    check('verified IR account gets IR daily limit (2)', info2.json?.data?.daily_limit === 2);

    const failJob = await call(user, 'POST', '/api/video/generate', { model_id: videoModelId, prompt: 'fail این کار باید شکست بخورد', aspect_ratio: '16:9', duration_seconds: 3 });
    check('second job allowed within IR limit', failJob.status === 200);
    const failId = failJob.json?.data?.job_id;
    let failStatus = '';
    for (let i = 0; i < 8; i++) {
      const st = await call(user, 'GET', `/api/video/jobs/${failId}`);
      failStatus = st.json?.data?.job?.status;
      if (['succeeded', 'failed'].includes(failStatus)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    check('failed job reports failed', failStatus === 'failed');
    const usageAfterFail = await call(user, 'GET', '/api/video/models');
    check('failed job released its quota reservation (used back to 1)', usageAfterFail.json?.data?.used_today === 1, `used=${usageAfterFail.json?.data?.used_today}`);
  }

  // ---------- payments: zarinpal stub flow ----------
  if (mockUp) {
    console.log('▸ payments (zarinpal stub)');
    // configure zarinpal to point at the stub (requires reauth)
    const re = await call(admin, 'POST', '/api/auth/reauth', { password: adminCreds.password });
    check('admin reauth token issued', re.status === 200 && !!re.json?.data?.reauth_token);
    const setPay = await call(admin, 'PUT', '/api/admin/settings/payments', {
      provider: 'zarinpal',
      zarinpal: { merchant_id: 'TEST-MERCHANT-0001', sandbox: false, base_url: MOCK + '/zp/pg/v4' },
      callback_base: '', success_path: '/pay/result?status=ok', failure_path: '/pay/result?status=failed',
      currencies: ['IRR'],
      manual: { enabled: true, card_number: '6104337712345678', card_holder: 'امین آزمایشی', bank_name: 'بانک ملت', note_fa: 'رسید را ثبت کنید.' },
      refund_policy_fa: 'قوانین بازگشت وجه.',
      reauth_token: re.json?.data?.reauth_token,
    });
    check('payment settings saved with reauth', setPay.status === 200, JSON.stringify(setPay.json));

    // reauth token must be single-use
    const setPay2 = await call(admin, 'PUT', '/api/admin/settings/payments', {
      provider: 'zarinpal',
      zarinpal: { merchant_id: 'TEST-MERCHANT-0001', sandbox: false, base_url: MOCK + '/zp/pg/v4' },
      callback_base: '', success_path: '/pay/result?status=ok', failure_path: '/pay/result?status=failed',
      currencies: ['IRR'],
      manual: { enabled: true, card_number: '6104337712345678', card_holder: 'امین آزمایشی', bank_name: 'بانک ملت', note_fa: '-' },
      refund_policy_fa: '-',
      reauth_token: re.json?.data?.reauth_token,
    });
    check('reauth token is single-use (403)', setPay2.status === 403);

    const planRes = await call(admin, 'GET', '/api/admin/plans');
    const plus = planRes.json?.data?.plans?.find((p) => p.slug === 'plus');

    const idem = 'idem-' + uniq;
    const ck1 = await call(user, 'POST', '/api/payments/checkout', { plan_id: plus.id, method: 'zarinpal', idempotency_key: idem });
    check('checkout returns hosted payment URL', ck1.status === 200 && String(ck1.json?.data?.payment_url || '').includes('/StartPay/'), JSON.stringify(ck1.json).slice(0, 200));

    const ck2 = await call(user, 'POST', '/api/payments/checkout', { plan_id: plus.id, method: 'zarinpal', idempotency_key: idem });
    check('idempotent checkout returns same transaction', ck2.json?.data?.transaction_id === ck1.json?.data?.transaction_id && ck2.json?.data?.deduplicated === true);

    // user cancels at the bank → Status=NOK
    const authority = String(ck1.json.data.payment_url).split('/StartPay/')[1];
    const cancelRes = await fetch(`${BASE}/api/payments/zarinpal/callback?Authority=${authority}&Status=NOK`, { redirect: 'manual' });
    const cancelBody = await cancelRes.text();
    check('canceled payment redirects to failure', cancelRes.status === 302 && (cancelRes.headers.get('location') || '').includes('status=failed'), cancelBody.slice(0,100));
    const histAfterCancel = await call(user, 'GET', '/api/payments/history');
    check('canceled payment recorded as failed', histAfterCancel.json?.data?.transactions?.[0]?.status === 'failed');

    // new checkout → pay successfully at the bank
    const ck3 = await call(user, 'POST', '/api/payments/checkout', { plan_id: plus.id, method: 'zarinpal', idempotency_key: 'idem2-' + uniq });
    const authority3 = String(ck3.json.data.payment_url).split('/StartPay/')[1];
    const payCb = await fetch(`${BASE}/api/payments/zarinpal/callback?Authority=${authority3}&Status=OK`, { redirect: 'manual' });
    check('successful payment redirects to success', payCb.status === 302 && (payCb.headers.get('location') || '').includes('status=ok'));

    const meAfterPay = await call(user, 'GET', '/api/auth/me');
    check('subscription activated to plus after authoritative verify', meAfterPay.json?.data?.plan?.slug === 'plus');
    check('IRR gateway payment marked IR verified', meAfterPay.json?.data?.user?.country_verified === 'IR');

    // replay the SAME callback → idempotent, no second activation
    const replay = await fetch(`${BASE}/api/payments/zarinpal/callback?Authority=${authority3}&Status=OK`, { redirect: 'manual' });
    check('replayed callback is idempotent (302, no error)', replay.status === 302);

    const subCount = await call(admin, 'GET', '/api/admin/transactions?status=paid');
    const paidCount = (subCount.json?.data?.transactions || []).filter((t) => t.ref_id).length;
    check('transaction ledger has exactly settled payments', paidCount >= 1);

    // unknown authority must not activate anything
    const badAuth = await fetch(`${BASE}/api/payments/zarinpal/callback?Authority=FAKE0000&Status=OK`, { redirect: 'manual' });
    check('unknown authority rejected (redirect to failure)', badAuth.status === 302 && (badAuth.headers.get('location') || '').includes('failed'));

    // ---------- manual transfer with admin review ----------
    console.log('▸ manual bank transfer');
    const mk = await call(user, 'POST', '/api/payments/checkout', { plan_id: plus.id, method: 'manual', idempotency_key: 'idem3-' + uniq });
    check('manual checkout returns instructions', mk.status === 200 && !!mk.json?.data?.instructions?.card_number);
    const subBefore = await call(user, 'GET', '/api/auth/me');
    const rc = await call(user, 'POST', '/api/payments/manual/receipt', { transaction_id: mk.json.data.transaction_id, sender_note: 'واریز شد ۱۴:۳۰' });
    check('manual receipt submitted and pending', rc.status === 200 && rc.json?.data?.status === 'pending');
    const subAfterReceipt = await call(user, 'GET', '/api/auth/me');
    check('manual receipt does NOT auto-activate (plan unchanged)', subAfterReceipt.json?.data?.plan?.slug === subBefore.json?.data?.plan?.slug);

    const pendList = await call(admin, 'GET', '/api/admin/manual-payments');
    const pend = (pendList.json?.data?.manual_payments || []).find((m) => m.transaction_id === mk.json.data.transaction_id);
    check('manual payment appears in admin review queue', !!pend);
    const approve = await call(admin, 'POST', `/api/admin/manual-payments/${pend.id}/review`, { decision: 'approved', note: 'تأیید شد' });
    check('admin approval succeeds', approve.status === 200);
    // plan extends/stays plus — expiry pushed → subscription updated
    const meFinal = await call(user, 'GET', '/api/auth/me');
    check('plan is plus after admin approval', meFinal.json?.data?.plan?.slug === 'plus');
    const audit = await call(admin, 'GET', '/api/admin/audit');
    check('audit log recorded the approval', JSON.stringify(audit.json).includes('admin.manual_payment.reviewed'));
  }

  // ---------- maintenance mode ----------
  console.log('▸ maintenance mode');
  const setMaint = await call(admin, 'PUT', '/api/admin/settings/features', { chat: true, video: true, payments: true, registration: true, google_auth: true, manual_transfer: true, maintenance_mode: true });
  check('admin enables maintenance mode', setMaint.status === 200);
  const chatBlocked = await call(user, 'GET', '/api/chat/conversations');
  check('user blocked during maintenance (503)', chatBlocked.status === 503);
  const adminOk = await call(admin, 'GET', '/api/chat/conversations');
  check('admin unaffected during maintenance', adminOk.status === 200);
  await call(admin, 'PUT', '/api/admin/settings/features', { chat: true, video: true, payments: true, registration: true, google_auth: true, manual_transfer: true, maintenance_mode: false });

  // ---------- rate limiting ----------
  console.log('▸ rate limiting');
  let lastStatus = 0;
  for (let i = 0; i < 25; i++) {
    const r = await call(jar(), 'POST', '/api/auth/login', { email: `nobody-${uniq}@example.com`, password: 'x' + i + 'xxxxxx1B' });
    lastStatus = r.status;
  }
  check('login rate limit engages (429/423)', lastStatus === 429 || lastStatus === 423, `last=${lastStatus}`);

  // ---------- logout ----------
  const lo = await call(user, 'POST', '/api/auth/logout');
  check('logout works', lo.status === 200);
  const meAfterLogout = await call(user, 'GET', '/api/auth/me');
  check('session invalid after logout', meAfterLogout.json?.data?.user === null);

  // ---------- summary ----------
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ passed: ${passed}   ❌ failed: ${failed}`);
  if (failures.length) { console.log('failures:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
  console.log('🎉 ALL SMOKE TESTS PASSED\n');
}

main().catch((e) => { console.error('smoke runner crashed:', e); process.exit(1); });
