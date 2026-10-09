import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, AuthUser } from '../env';
import { now } from '../env';
import { ok, err } from '../lib/http';
import { features, paymentSettings, getPlan, activateSubscription } from '../lib/db';
import { zpRequestPayment, zpVerifyPayment } from '../lib/zarinpal';
import { rateLimit } from '../lib/ratelimit';
import { audit } from '../lib/audit';
import { clientIp } from '../lib/http';

const payments = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

function userOf(c: { get: (k: string) => unknown }): AuthUser | null {
  return c.get('user') as AuthUser | null;
}

const checkoutSchema = z.object({
  plan_id: z.string().min(1).max(100),
  method: z.enum(['zarinpal', 'manual']),
  idempotency_key: z.string().min(8).max(100),
});

// POST /api/payments/checkout — start a payment (hosted gateway or manual)
payments.post('/checkout', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const f = await features(c.env);
  if (!f.payments) return err(503, 'feature_disabled', 'پرداخت در حال حاضر غیرفعال است.');
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `checkout:${u.id}`, 15, 600000);
  if (!rl.allowed) return err(429, 'rate_limited');

  let body: z.infer<typeof checkoutSchema>;
  try { body = checkoutSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }

  const plan = await getPlan(c.env, body.plan_id);
  if (!plan || !plan.is_active) return err(404, 'not_found', 'طرح انتخاب‌شده یافت نشد یا فعال نیست.');
  if (plan.is_free || plan.price_irr <= 0) return err(400, 'validation', 'طرح رایگان نیازی به پرداخت ندارد.');

  // Idempotency: a repeated checkout with the same key returns the SAME transaction
  const existing = await c.env.DB.prepare('SELECT * FROM transactions WHERE idempotency_key = ?')
    .bind(body.idempotency_key).first<Record<string, unknown>>();
  if (existing) {
    if (String(existing.user_id) !== u.id) return err(409, 'conflict');
    if (existing.method === 'zarinpal' && existing.status === 'pending' && existing.authority) {
      const pay = await paymentSettings(c.env);
      const { startPayUrl } = await import('../lib/zarinpal');
      return ok({ transaction_id: existing.id, method: 'zarinpal', payment_url: startPayUrl(pay.zarinpal.base_url, pay.zarinpal.sandbox, String(existing.authority)), deduplicated: true });
    }
    return ok({ transaction_id: existing.id, method: existing.method, status: existing.status, deduplicated: true });
  }

  const pay = await paymentSettings(c.env);
  const txId = crypto.randomUUID();
  const t = now();

  if (body.method === 'zarinpal') {
    if (pay.provider !== 'zarinpal' || !pay.zarinpal.merchant_id) {
      return err(503, 'payment_not_configured', 'درگاه پرداخت زرین‌پال هنوز توسط مدیر پیکربندی نشده است.');
    }
    const origin = new URL(c.req.url).origin;
    const callbackBase = pay.callback_base || origin;
    try {
      const req = await zpRequestPayment({
        base: pay.zarinpal.base_url,
        sandbox: pay.zarinpal.sandbox,
        merchantId: pay.zarinpal.merchant_id,
        amount: plan.price_irr,
        callbackUrl: callbackBase.replace(/\/+$/, '') + '/api/payments/zarinpal/callback',
        description: `خرید اشتراک ${plan.name_fa} — ${u.email}`,
        email: u.email,
      });
      await c.env.DB.prepare(
        `INSERT INTO transactions (id, user_id, plan_id, amount, currency, method, status, authority, description, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'IRR', 'zarinpal', 'pending', ?, ?, ?, ?, ?)`,
      ).bind(txId, u.id, plan.id, plan.price_irr, req.authority, `اشتراک ${plan.name_fa}`, body.idempotency_key, t, t).run();
      await audit(c.env, 'payment.checkout.created', { actorId: u.id, ip, target: txId, meta: { plan: plan.slug, amount: plan.price_irr } });
      return ok({ transaction_id: txId, method: 'zarinpal', payment_url: req.payment_url });
    } catch (e) {
      await audit(c.env, 'payment.checkout.failed', { actorId: u.id, ip, meta: { error: e instanceof Error ? e.message : String(e) } });
      return err(502, 'payment_not_configured', 'ایجاد درخواست پرداخت در درگاه ناموفق بود. لطفاً بعداً تلاش کنید یا با پشتیبانی تماس بگیرید.');
    }
  }

  // Manual bank transfer — NEVER auto-activates; requires admin review.
  if (!pay.manual.enabled || !f.manual_transfer) {
    return err(503, 'feature_disabled', 'پرداخت کارت‌به‌کارت در حال حاضر غیرفعال است.');
  }
  await c.env.DB.prepare(
    `INSERT INTO transactions (id, user_id, plan_id, amount, currency, method, status, description, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'IRR', 'manual', 'pending', ?, ?, ?, ?)`,
  ).bind(txId, u.id, plan.id, plan.price_irr, `اشتراک ${plan.name_fa} — کارت‌به‌کارت`, body.idempotency_key, t, t).run();
  await audit(c.env, 'payment.manual.created', { actorId: u.id, ip, target: txId, meta: { plan: plan.slug } });
  return ok({ transaction_id: txId, method: 'manual', status: 'pending', instructions: {
    card_number: pay.manual.card_number, card_holder: pay.manual.card_holder,
    bank_name: pay.manual.bank_name, amount: plan.price_irr, note_fa: pay.manual.note_fa,
  } });
});

// POST /api/payments/manual/receipt — attach a note/receipt to a pending manual tx
const receiptSchema = z.object({
  transaction_id: z.string().min(1).max(64),
  sender_note: z.string().max(1000).optional(),
  receipt_r2_key: z.string().max(300).optional(),
});

payments.post('/manual/receipt', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  let body: z.infer<typeof receiptSchema>;
  try { body = receiptSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }

  const tx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ? AND method = ?')
    .bind(body.transaction_id, u.id, 'manual').first<Record<string, unknown>>();
  if (!tx) return err(404, 'not_found', 'تراکنش یافت نشد.');
  if (tx.status !== 'pending') return err(409, 'conflict', 'این تراکنش دیگر در وضعیت انتظار نیست.');

  // Receipt must belong to the user if provided
  if (body.receipt_r2_key) {
    const up = await c.env.DB.prepare('SELECT id FROM uploads WHERE r2_key = ? AND user_id = ?')
      .bind(body.receipt_r2_key, u.id).first();
    if (!up) return err(400, 'validation', 'رسید بارگذاری‌شده معتبر نیست.');
  }

  const mpId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO manual_payments (id, transaction_id, sender_note, receipt_r2_key, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).bind(mpId, body.transaction_id, (body.sender_note || '').slice(0, 1000), body.receipt_r2_key || null, now()).run();
  await audit(c.env, 'payment.manual.receipt', { actorId: u.id, ip: clientIp(c), target: body.transaction_id });
  return ok({ manual_payment_id: mpId, status: 'pending', message_fa: 'رسید شما ثبت شد. اشتراک پس از بررسی و تأیید مدیر فعال می‌شود.' });
});

// GET /api/payments/zarinpal/callback — authoritative verification endpoint.
// This is the ONLY path that can activate a zarinpal subscription.
// Exempt from CSRF header rule (browser redirect from the gateway).
payments.get('/zarinpal/callback', async (c) => {
  const pay = await paymentSettings(c.env);
  const url = new URL(c.req.url);
  const authority = url.searchParams.get('Authority') || url.searchParams.get('authority') || '';
  const status = url.searchParams.get('Status') || url.searchParams.get('status') || '';
  const origin = url.origin;

  const fail = (reason: string) => c.redirect((pay.failure_path || '/pay/result?status=failed') + `&reason=${encodeURIComponent(reason)}`);

  if (!authority) return fail('missing_authority');
  const tx = await c.env.DB.prepare('SELECT * FROM transactions WHERE authority = ?').bind(authority).first<Record<string, unknown>>();
  if (!tx) return fail('unknown_transaction');

  // Idempotent: already settled — just show result.
  if (tx.status === 'paid') {
    return c.redirect((pay.success_path || '/pay/result?status=ok') + `&tx=${tx.id}`);
  }
  if (status !== 'OK') {
    await c.env.DB.prepare(`UPDATE transactions SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'pending'`).bind(now(), tx.id).run();
    await audit(c.env, 'payment.gateway_canceled', { actorId: String(tx.user_id), target: String(tx.id) });
    return fail('canceled_by_user');
  }

  // Authoritative server-side verification. Amount/currency/merchant all
  // checked against OUR record, never against callback query params.
  let verify;
  try {
    verify = await zpVerifyPayment({
      base: pay.zarinpal.base_url, sandbox: pay.zarinpal.sandbox,
      merchantId: pay.zarinpal.merchant_id, amount: Number(tx.amount), authority,
    });
  } catch {
    return fail('verify_unreachable');
  }

  if (verify.code === 100 || verify.code === 101) {
    // Replay/duplicate defense: ref_id may only ever belong to this transaction.
    if (verify.ref_id) {
      const dupe = await c.env.DB.prepare('SELECT id FROM transactions WHERE ref_id = ? AND id != ?')
        .bind(String(verify.ref_id), tx.id as string).first();
      if (dupe) {
        await audit(c.env, 'payment.replay_blocked', { actorId: String(tx.user_id), target: String(tx.id), meta: { ref_id: verify.ref_id, conflict: dupe.id } });
        return fail('duplicate_reference');
      }
    }
    // Atomic settle: only flip pending->paid once.
    const settled = await c.env.DB.prepare(
      `UPDATE transactions SET status = 'paid', ref_id = ?, verified_at = ?, updated_at = ?,
              gateway_payload_json = ? WHERE id = ? AND status = 'pending'`,
    ).bind(String(verify.ref_id || ''), now(), now(), JSON.stringify({ code: verify.code, card_pan: verify.card_pan || '' }), tx.id).run();

    if ((settled.meta.changes ?? 0) > 0) {
      await activateSubscription(c.env, String(tx.user_id), String(tx.plan_id), 'zarinpal');
      // Verified-residency policy: a settled IRR payment through an Iranian
      // gateway is our evidence of IR residency (documented in README).
      await c.env.DB.prepare(
        `UPDATE users SET country_verified = CASE WHEN country_verified = '' THEN 'IR' ELSE country_verified END,
                country_verified_source = CASE WHEN country_verified = '' THEN 'payment' ELSE country_verified_source END,
                updated_at = ? WHERE id = ?`,
      ).bind(now(), tx.user_id as string).run();
      await audit(c.env, 'payment.settled', { actorId: String(tx.user_id), target: String(tx.id), meta: { ref_id: verify.ref_id, amount: tx.amount } });
    }
    return c.redirect((pay.success_path || '/pay/result?status=ok') + `&tx=${tx.id}`);
  }

  await c.env.DB.prepare(`UPDATE transactions SET status = 'failed', updated_at = ?, gateway_payload_json = ? WHERE id = ? AND status = 'pending'`)
    .bind(now(), JSON.stringify({ code: verify.code, message: verify.message || '' }), tx.id).run();
  await audit(c.env, 'payment.verify_failed', { actorId: String(tx.user_id), target: String(tx.id), meta: { code: verify.code } });
  return fail('verify_code_' + verify.code);
});

// GET /api/payments/history — current user's transactions
payments.get('/history', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.amount, t.currency, t.method, t.status, t.ref_id, t.description, t.created_at, t.verified_at,
            p.name_fa AS plan_name, p.slug AS plan_slug
     FROM transactions t LEFT JOIN plans p ON p.id = t.plan_id
     WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 100`,
  ).bind(u.id).all();
  // Project to public-safe shape (no authority, no gateway payloads)
  return ok({ transactions: rows.results || [] });
});

export default payments;
