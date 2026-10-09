import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, AuthUser } from '../env';
import { now } from '../env';
import { ok, err, clientIp } from '../lib/http';
import {
  getSetting, setSetting, siteSettings, countries, features, paymentSettings,
  authPolicy, quotaPolicy, getPlan, activateSubscription,
} from '../lib/db';
import { consumeReauthToken } from '../lib/auth';
import { testProviderConnection, type ProviderRow } from '../lib/providers';
import { audit } from '../lib/audit';

const admin = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

function adminUser(c: { get: (k: string) => unknown }): AuthUser {
  return c.get('user') as AuthUser;
}

// ------------------------------------------------ overview
admin.get('/overview', async (c) => {
  const db = c.env.DB;
  const [users, usersToday, subs, txPaid, txPending, messages24, videos24, pendingManual, providers, models] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM users WHERE status != 'deleted'`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM users WHERE created_at > ?`).bind(now() - 86400000).first<{ n: number }>(),
    db.prepare(`SELECT p.slug, COUNT(*) AS n FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active' GROUP BY p.slug`).all(),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM transactions WHERE status = 'paid'`).first<{ n: number; total: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE status = 'pending'`).first<{ n: number }>(),
    db.prepare(`SELECT COALESCE(SUM(count),0) AS n FROM quota_usage WHERE kind = 'message' AND day >= date('now','-1 day')`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM video_jobs WHERE created_at > ?`).bind(now() - 86400000).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM manual_payments WHERE status = 'pending'`).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) AS n FROM providers WHERE enabled = 1').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) AS n FROM models WHERE enabled = 1').first<{ n: number }>(),
  ]);
  return ok({
    users_total: users?.n ?? 0,
    users_new_24h: usersToday?.n ?? 0,
    active_subscriptions_by_plan: subs.results || [],
    payments: { settled_count: txPaid?.n ?? 0, settled_total_irr: txPaid?.total ?? 0, pending: txPending?.n ?? 0 },
    usage_24h: { messages: messages24?.n ?? 0, video_jobs: videos24?.n ?? 0 },
    pending_manual_payments: pendingManual?.n ?? 0,
    config: { providers_enabled: providers?.n ?? 0, models_enabled: models?.n ?? 0 },
  });
});

// ------------------------------------------------ users
admin.get('/users', async (c) => {
  const q = (c.req.query('q') || '').slice(0, 100);
  const page = Math.max(0, parseInt(c.req.query('page') || '0', 10));
  const like = `%${q}%`;
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email_normalized AS email, u.name, u.role, u.status, u.country_code, u.country_verified,
            u.locale, u.email_verified_at, u.last_login_at, u.created_at,
            (SELECT p.slug FROM subscriptions s JOIN plans p ON p.id = s.plan_id
             WHERE s.user_id = u.id AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1) AS plan_slug
     FROM users u
     WHERE u.email_normalized LIKE ? OR u.name LIKE ?
     ORDER BY u.created_at DESC LIMIT 50 OFFSET ?`,
  ).bind(like, like, page * 50).all();
  return ok({ users: rows.results || [], page });
});

admin.get('/users/:id', async (c) => {
  const u = await c.env.DB.prepare(
    `SELECT id, email_normalized AS email, name, role, status, country_code, country_verified, country_verified_source,
            locale, email_verified_at, last_login_at, created_at, failed_login_attempts FROM users WHERE id = ?`,
  ).bind(c.req.param('id')).first();
  if (!u) return err(404, 'not_found');
  const [subs, txs, usage, jobs] = await Promise.all([
    c.env.DB.prepare('SELECT s.*, p.name_fa AS plan_name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 20').bind(c.req.param('id')).all(),
    c.env.DB.prepare('SELECT id, amount, currency, method, status, ref_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').bind(c.req.param('id')).all(),
    c.env.DB.prepare('SELECT * FROM quota_usage WHERE user_id = ? ORDER BY day DESC LIMIT 14').bind(c.req.param('id')).all(),
    c.env.DB.prepare('SELECT id, status, prompt, created_at FROM video_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').bind(c.req.param('id')).all(),
  ]);
  return ok({ user: u, subscriptions: subs.results || [], transactions: txs.results || [], usage: usage.results || [], video_jobs: jobs.results || [] });
});

const userPatchSchema = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  role: z.enum(['user', 'admin']).optional(),
  country_verified: z.string().max(2).optional(),
  reauth_token: z.string().optional(),
});

admin.patch('/users/:id', async (c) => {
  const me = adminUser(c);
  const targetId = c.req.param('id');
  let body: z.infer<typeof userPatchSchema>;
  try { body = userPatchSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }
  const target = await c.env.DB.prepare('SELECT id, role, status FROM users WHERE id = ?').bind(targetId).first<{ id: string; role: string; status: string }>();
  if (!target) return err(404, 'not_found');

  // Role changes are security-sensitive: fresh authentication + audit.
  if (body.role && body.role !== target.role) {
    if (!(await consumeReauthToken(c.env, me.id, body.reauth_token || ''))) return err(403, 'reauth_required', 'تغییر نقش کاربر نیازمند تأیید مجدد گذرواژه شماست.');
    if (target.id === me.id && body.role !== 'admin') {
      const admins = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'`).first<{ n: number }>();
      if ((admins?.n ?? 0) <= 1) return err(409, 'conflict', 'آخرین مدیر سامانه را نمی‌توان تنزل داد.');
    }
    await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(body.role, now(), targetId).run();
    await audit(c.env, 'admin.user.role_changed', { actorId: me.id, actorRole: 'admin', target: targetId, meta: { role: body.role }, ip: clientIp(c) });
  }
  if (body.status && body.status !== target.status) {
    if (target.id === me.id) return err(409, 'conflict', 'نمی‌توانید حساب خودتان را تعلیق کنید.');
    await c.env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind(body.status, now(), targetId).run();
    if (body.status === 'suspended') {
      await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now(), targetId).run();
    }
    await audit(c.env, 'admin.user.status_changed', { actorId: me.id, actorRole: 'admin', target: targetId, meta: { status: body.status }, ip: clientIp(c) });
  }
  if (body.country_verified !== undefined) {
    const cc = body.country_verified.toUpperCase();
    if (cc && !(await countries(c.env)).some((x) => x.code === cc)) return err(400, 'validation', 'کد کشور معتبر نیست.');
    await c.env.DB.prepare('UPDATE users SET country_verified = ?, country_verified_source = ?, updated_at = ? WHERE id = ?')
      .bind(cc, cc ? 'admin' : '', now(), targetId).run();
    await audit(c.env, 'admin.user.country_verified', { actorId: me.id, actorRole: 'admin', target: targetId, meta: { country: cc }, ip: clientIp(c) });
  }
  return ok({});
});

// Manual subscription adjustment (always audited)
admin.post('/users/:id/subscription', async (c) => {
  const me = adminUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { plan_id?: string; action?: string; note?: string };
  if (!body.plan_id || body.action !== 'activate') return err(400, 'validation');
  const plan = await getPlan(c.env, body.plan_id);
  if (!plan) return err(404, 'not_found', 'طرح یافت نشد.');
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(c.req.param('id')).first();
  if (!target) return err(404, 'not_found');
  await activateSubscription(c.env, c.req.param('id'), plan.id, 'admin');
  await audit(c.env, 'admin.subscription.adjusted', {
    actorId: me.id, actorRole: 'admin', target: c.req.param('id'),
    meta: { plan: plan.slug, note: (body.note || '').slice(0, 300) }, ip: clientIp(c),
  });
  return ok({});
});

// ------------------------------------------------ plans
const planSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_-]+$/).max(50),
  name_fa: z.string().min(1).max(100),
  name_en: z.string().max(100).default(''),
  description_fa: z.string().max(500).default(''),
  description_en: z.string().max(500).default(''),
  price_irr: z.number().int().min(0).max(1e12).default(0),
  price_usd_cents: z.number().int().min(0).max(1e8).default(0),
  duration_days: z.number().int().min(1).max(36500).default(30),
  daily_message_limit: z.number().int().min(0).max(100000).default(20),
  daily_video_limit_default: z.number().int().min(0).max(10000).default(1),
  daily_video_limit_ir: z.number().int().min(0).max(10000).default(2),
  upload_limit_mb: z.number().int().min(0).max(10000).default(5),
  conversation_storage_limit: z.number().int().min(1).max(100000).default(20),
  model_tier: z.enum(['basic', 'plus', 'pro']).default('basic'),
  features: z.record(z.unknown()).default({}),
  is_active: z.boolean().default(true),
  is_free: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(1000).default(0),
});

admin.get('/plans', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM plans ORDER BY sort_order').all();
  return ok({ plans: (rows.results || []).map((p) => ({ ...p, features: safeJson(String((p as Record<string, unknown>).features_json || '{}')) })) });
});

admin.post('/plans', async (c) => {
  const me = adminUser(c);
  let body: z.infer<typeof planSchema>;
  try { body = planSchema.parse(await c.req.json()); } catch { return err(400, 'validation', 'اطلاعات طرح معتبر نیست.'); }
  const id = 'plan_' + crypto.randomUUID().slice(0, 8);
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO plans (id, slug, name_fa, name_en, description_fa, description_en, price_irr, price_usd_cents,
      duration_days, daily_message_limit, daily_video_limit_default, daily_video_limit_ir, upload_limit_mb,
      conversation_storage_limit, model_tier, features_json, is_active, is_free, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, body.slug, body.name_fa, body.name_en, body.description_fa, body.description_en, body.price_irr,
    body.price_usd_cents, body.duration_days, body.daily_message_limit, body.daily_video_limit_default,
    body.daily_video_limit_ir, body.upload_limit_mb, body.conversation_storage_limit, body.model_tier,
    JSON.stringify(body.features), body.is_active ? 1 : 0, body.is_free ? 1 : 0, body.sort_order, t, t).run();
  await audit(c.env, 'admin.plan.created', { actorId: me.id, actorRole: 'admin', target: id, meta: { slug: body.slug }, ip: clientIp(c) });
  return ok({ id });
});

admin.put('/plans/:id', async (c) => {
  const me = adminUser(c);
  const existing = await c.env.DB.prepare('SELECT id FROM plans WHERE id = ?').bind(c.req.param('id')).first();
  if (!existing) return err(404, 'not_found');
  let body: z.infer<typeof planSchema>;
  try { body = planSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }
  if (body.is_free) {
    // Ensure only one free plan
    await c.env.DB.prepare('UPDATE plans SET is_free = 0 WHERE id != ?').bind(c.req.param('id')).run();
  }
  await c.env.DB.prepare(
    `UPDATE plans SET slug=?, name_fa=?, name_en=?, description_fa=?, description_en=?, price_irr=?, price_usd_cents=?,
      duration_days=?, daily_message_limit=?, daily_video_limit_default=?, daily_video_limit_ir=?, upload_limit_mb=?,
      conversation_storage_limit=?, model_tier=?, features_json=?, is_active=?, is_free=?, sort_order=?, updated_at=? WHERE id=?`,
  ).bind(body.slug, body.name_fa, body.name_en, body.description_fa, body.description_en, body.price_irr,
    body.price_usd_cents, body.duration_days, body.daily_message_limit, body.daily_video_limit_default,
    body.daily_video_limit_ir, body.upload_limit_mb, body.conversation_storage_limit, body.model_tier,
    JSON.stringify(body.features), body.is_active ? 1 : 0, body.is_free ? 1 : 0, body.sort_order, now(), c.req.param('id')).run();
  await audit(c.env, 'admin.plan.updated', { actorId: me.id, actorRole: 'admin', target: c.req.param('id'), meta: { slug: body.slug }, ip: clientIp(c) });
  return ok({});
});

admin.delete('/plans/:id', async (c) => {
  const me = adminUser(c);
  const id = c.req.param('id');
  const used = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE plan_id = ? AND status = 'active'`).bind(id).first<{ n: number }>();
  if ((used?.n ?? 0) > 0) return err(409, 'conflict', 'این طرح مشترک فعال دارد و قابل حذف نیست. می‌توانید آن را غیرفعال کنید.');
  await c.env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(id).run();
  await audit(c.env, 'admin.plan.deleted', { actorId: me.id, actorRole: 'admin', target: id, ip: clientIp(c) });
  return ok({});
});

// ------------------------------------------------ providers & models
admin.get('/providers', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM providers ORDER BY priority DESC, created_at').all<ProviderRow>();
  const models = await c.env.DB.prepare('SELECT * FROM models ORDER BY display_name').all();
  return ok({
    providers: (rows.results || []).map((p) => ({
      id: p.id, kind: p.kind, name: p.name, base_url: p.base_url,
      api_key_set: Boolean(p.api_key), enabled: Boolean(p.enabled), priority: p.priority, notes: p.notes,
    })),
    models: (models.results || []).map((m) => ({ ...(m as Record<string, unknown>), config: safeJson(String((m as Record<string, unknown>).config_json || '{}')), config_json: undefined })),
  });
});

const providerSchema = z.object({
  kind: z.enum(['openai_compatible', 'video_http']),
  name: z.string().min(1).max(100),
  base_url: z.string().url().max(500),
  api_key: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  notes: z.string().max(500).default(''),
});

admin.post('/providers', async (c) => {
  const me = adminUser(c);
  let body: z.infer<typeof providerSchema>;
  try { body = providerSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }
  const id = crypto.randomUUID();
  const t = now();
  await c.env.DB.prepare(
    'INSERT INTO providers (id, kind, name, base_url, api_key, enabled, priority, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, body.kind, body.name, body.base_url, body.api_key || '', body.enabled ? 1 : 0, body.priority, body.notes, t, t).run();
  await audit(c.env, 'admin.provider.created', { actorId: me.id, actorRole: 'admin', target: id, meta: { name: body.name, kind: body.kind }, ip: clientIp(c) });
  return ok({ id });
});

admin.put('/providers/:id', async (c) => {
  const me = adminUser(c);
  const existing = await c.env.DB.prepare('SELECT id FROM providers WHERE id = ?').bind(c.req.param('id')).first();
  if (!existing) return err(404, 'not_found');
  let body: z.infer<typeof providerSchema>;
  try { body = providerSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }
  await c.env.DB.prepare(
    `UPDATE providers SET kind=?, name=?, base_url=?,
       api_key = CASE WHEN ? != '' THEN ? ELSE api_key END,
     enabled=?, priority=?, notes=?, updated_at=? WHERE id=?`,
  ).bind(body.kind, body.name, body.base_url, body.api_key || '', body.api_key || '', body.enabled ? 1 : 0,
    body.priority, body.notes, now(), c.req.param('id')).run();
  await audit(c.env, 'admin.provider.updated', { actorId: me.id, actorRole: 'admin', target: c.req.param('id'), meta: { name: body.name }, ip: clientIp(c) });
  return ok({});
});

admin.delete('/providers/:id', async (c) => {
  const me = adminUser(c);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM models WHERE provider_id = ?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM providers WHERE id = ?').bind(c.req.param('id')),
  ]);
  await audit(c.env, 'admin.provider.deleted', { actorId: me.id, actorRole: 'admin', target: c.req.param('id'), ip: clientIp(c) });
  return ok({});
});

admin.post('/providers/:id/test', async (c) => {
  const p = await c.env.DB.prepare('SELECT * FROM providers WHERE id = ?').bind(c.req.param('id')).first<ProviderRow>();
  if (!p) return err(404, 'not_found');
  const result = await testProviderConnection(p);
  await audit(c.env, 'admin.provider.tested', { actorId: adminUser(c).id, actorRole: 'admin', target: p.id, meta: result, ip: clientIp(c) });
  return ok(result);
});

const modelSchema = z.object({
  provider_id: z.string().min(1).max(64),
  model_key: z.string().min(1).max(200),
  display_name: z.string().min(1).max(200),
  kind: z.enum(['chat', 'video']).default('chat'),
  tier: z.enum(['basic', 'plus', 'pro']).default('basic'),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});

admin.post('/models', async (c) => {
  const me = adminUser(c);
  let body: z.infer<typeof modelSchema>;
  try { body = modelSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }
  const prov = await c.env.DB.prepare('SELECT id, kind FROM providers WHERE id = ?').bind(body.provider_id).first<{ id: string; kind: string }>();
  if (!prov) return err(404, 'not_found', 'ارائه‌دهنده یافت نشد.');
  if ((prov.kind === 'video_http') !== (body.kind === 'video')) {
    return err(400, 'validation', 'نوع مدل با نوع ارائه‌دهنده هم‌خوانی ندارد.');
  }
  const id = crypto.randomUUID();
  const t = now();
  try {
    await c.env.DB.prepare(
      'INSERT INTO models (id, provider_id, model_key, display_name, kind, tier, enabled, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, body.provider_id, body.model_key, body.display_name, body.kind, body.tier, body.enabled ? 1 : 0,
      JSON.stringify(body.config), t, t).run();
  } catch {
    return err(409, 'conflict', 'این مدل قبلاً برای این ارائه‌دهنده ثبت شده است.');
  }
  await audit(c.env, 'admin.model.created', { actorId: me.id, actorRole: 'admin', target: id, meta: { key: body.model_key }, ip: clientIp(c) });
  return ok({ id });
});

admin.put('/models/:id', async (c) => {
  const me = adminUser(c);
  const existing = await c.env.DB.prepare('SELECT id FROM models WHERE id = ?').bind(c.req.param('id')).first();
  if (!existing) return err(404, 'not_found');
  const body = (await c.req.json().catch(() => ({}))) as Partial<z.infer<typeof modelSchema>>;
  await c.env.DB.prepare(
    `UPDATE models SET model_key=COALESCE(?,model_key), display_name=COALESCE(?,display_name),
       tier=COALESCE(?,tier), enabled=COALESCE(?,enabled), config_json=COALESCE(?,config_json), updated_at=? WHERE id=?`,
  ).bind(body.model_key ?? null, body.display_name ?? null, body.tier ?? null,
    body.enabled === undefined ? null : body.enabled ? 1 : 0,
    body.config ? JSON.stringify(body.config) : null, now(), c.req.param('id')).run();
  await audit(c.env, 'admin.model.updated', { actorId: me.id, actorRole: 'admin', target: c.req.param('id'), ip: clientIp(c) });
  return ok({});
});

admin.delete('/models/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM models WHERE id = ?').bind(c.req.param('id')).run();
  await audit(c.env, 'admin.model.deleted', { actorId: adminUser(c).id, actorRole: 'admin', target: c.req.param('id'), ip: clientIp(c) });
  return ok({});
});

// ------------------------------------------------ settings
admin.get('/settings', async (c) => {
  const [site, cs, f, pay, ap, qp] = await Promise.all([
    siteSettings(c.env), countries(c.env), features(c.env), paymentSettings(c.env), authPolicy(c.env), quotaPolicy(c.env),
  ]);
  return ok({
    site, countries: cs, features: f,
    payments: {
      ...pay,
      zarinpal: { ...pay.zarinpal, merchant_id: maskSecret(pay.zarinpal.merchant_id), merchant_id_set: Boolean(pay.zarinpal.merchant_id) },
    },
    auth_policy: ap, quota_policy: qp,
    env: { google_configured: Boolean(c.env.GOOGLE_CLIENT_ID), email_configured: Boolean(c.env.EMAIL_API_KEY) },
  });
});

const settingsSchemas: Record<string, z.ZodTypeAny> = {
  site: z.object({
    name_fa: z.string().min(1).max(100), name_en: z.string().max(100),
    tagline_fa: z.string().max(200), tagline_en: z.string().max(200),
    default_locale: z.enum(['fa', 'en']), logo_text: z.string().max(20),
  }),
  countries: z.array(z.object({
    code: z.string().length(2), fa: z.string().max(100), en: z.string().max(100),
    currency: z.string().max(6), locales: z.array(z.string().max(5)).max(5),
    features: z.record(z.boolean()), default: z.boolean().optional(),
  })).max(50),
  features: z.record(z.boolean()),
  auth_policy: z.object({
    require_email_verification: z.boolean(), allow_dev_code_echo: z.boolean(),
    session_days: z.number().int().min(1).max(365), max_login_attempts: z.number().int().min(3).max(20),
    lockout_minutes: z.number().int().min(1).max(1440),
  }),
  quota_policy: z.object({
    video_count_only_successful: z.boolean(), message_count_each: z.boolean(),
    day_timezone: z.string().max(64),
  }),
  payments: z.object({
    provider: z.enum(['disabled', 'zarinpal']),
    zarinpal: z.object({
      merchant_id: z.string().max(64), sandbox: z.boolean(), base_url: z.string().max(200),
      keep_merchant_id: z.boolean().optional(),
    }),
    callback_base: z.string().max(300), success_path: z.string().max(200), failure_path: z.string().max(200),
    currencies: z.array(z.string().max(6)).max(10),
    manual: z.object({
      enabled: z.boolean(), card_number: z.string().max(32), card_holder: z.string().max(100),
      bank_name: z.string().max(100), note_fa: z.string().max(500),
    }),
    refund_policy_fa: z.string().max(1000),
    reauth_token: z.string().optional(),
  }),
};

admin.put('/settings/:key', async (c) => {
  const me = adminUser(c);
  const key = c.req.param('key');
  const schema = settingsSchemas[key];
  if (!schema) return err(404, 'not_found', 'کلید تنظیمات پشتیبانی نمی‌شود.');
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return err(400, 'validation', 'مقادیر تنظیمات معتبر نیست.');

  let value = parsed.data as Record<string, unknown>;
  if (key === 'payments') {
    // Payment-gateway config is security-sensitive → reauthentication.
    const z = value.zarinpal as { merchant_id: string; keep_merchant_id?: boolean };
    const { reauth_token: rt, ...clean } = value as Record<string, unknown> & { reauth_token?: string };
    void z;
    if (!(await consumeReauthToken(c.env, me.id, rt || ''))) {
      return err(403, 'reauth_required', 'تغییر تنظیمات پرداخت نیازمند تأیید مجدد گذرواژه شماست.');
    }
    const current = await paymentSettings(c.env);
    const next = clean as unknown as ReturnType<typeof Object> & {
      zarinpal: { merchant_id: string; keep_merchant_id?: boolean; sandbox: boolean; base_url: string };
    };
    // Masked merchant id means "keep the existing one"
    const typed = next as { zarinpal: { merchant_id: string } };
    if (!typed.zarinpal.merchant_id || typed.zarinpal.merchant_id.includes('••')) {
      typed.zarinpal.merchant_id = current.zarinpal.merchant_id;
    }
    value = next as Record<string, unknown>;
  }
  await setSetting(c.env, key, value, me.id);
  await audit(c.env, `admin.settings.${key}`, { actorId: me.id, actorRole: 'admin', meta: key === 'payments' ? { redacted: true } : value, ip: clientIp(c) });
  return ok({});
});

// ------------------------------------------------ transactions & manual review
admin.get('/transactions', async (c) => {
  const status = c.req.query('status') || '';
  const page = Math.max(0, parseInt(c.req.query('page') || '0', 10));
  let rows;
  if (status) {
    rows = await c.env.DB.prepare(
      `SELECT t.id, t.user_id, u.email_normalized AS user_email, t.amount, t.currency, t.method, t.status,
              t.ref_id, t.description, t.created_at, t.verified_at, p.name_fa AS plan_name
       FROM transactions t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN plans p ON p.id = t.plan_id
       WHERE t.status = ? ORDER BY t.created_at DESC LIMIT 50 OFFSET ?`,
    ).bind(status, page * 50).all();
  } else {
    rows = await c.env.DB.prepare(
      `SELECT t.id, t.user_id, u.email_normalized AS user_email, t.amount, t.currency, t.method, t.status,
              t.ref_id, t.description, t.created_at, t.verified_at, p.name_fa AS plan_name
       FROM transactions t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN plans p ON p.id = t.plan_id
       ORDER BY t.created_at DESC LIMIT 50 OFFSET ?`,
    ).bind(page * 50).all();
  }
  return ok({ transactions: rows.results || [], page });
});

admin.get('/manual-payments', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT mp.*, t.amount, t.plan_id, p.name_fa AS plan_name, u.email_normalized AS user_email, u.id AS uid
     FROM manual_payments mp
     JOIN transactions t ON t.id = mp.transaction_id
     LEFT JOIN plans p ON p.id = t.plan_id
     LEFT JOIN users u ON u.id = t.user_id
     ORDER BY mp.created_at DESC LIMIT 100`,
  ).all();
  const list = (rows.results || []) as Array<Record<string, unknown>>;
  // Signed short-lived URLs would be ideal; local/miniflare: stream via files endpoint. Provide receipt token only.
  for (const mp of list) delete mp.receipt_r2_key;
  return ok({ manual_payments: list });
});

admin.post('/manual-payments/:id/review', async (c) => {
  const me = adminUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { decision?: string; note?: string };
  if (!['approved', 'rejected'].includes(body.decision || '')) return err(400, 'validation');
  const mp = await c.env.DB.prepare('SELECT * FROM manual_payments WHERE id = ? AND status = ?')
    .bind(c.req.param('id'), 'pending').first<Record<string, unknown>>();
  if (!mp) return err(404, 'not_found', 'درخواست یافت نشد یا قبلاً بررسی شده است.');
  const tx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(mp.transaction_id as string).first<Record<string, unknown>>();
  if (!tx) return err(404, 'not_found');
  const t = now();

  if (body.decision === 'approved') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE manual_payments SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`)
        .bind(me.id, t, (body.note || '').slice(0, 500), mp.id),
      c.env.DB.prepare(`UPDATE transactions SET status = 'paid', verified_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
        .bind(t, t, tx.id),
    ]);
    await activateSubscription(c.env, String(tx.user_id), String(tx.plan_id), 'manual');
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE manual_payments SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`)
        .bind(me.id, t, (body.note || '').slice(0, 500), mp.id),
      c.env.DB.prepare(`UPDATE transactions SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'pending'`).bind(t, tx.id),
    ]);
  }
  await audit(c.env, 'admin.manual_payment.reviewed', {
    actorId: me.id, actorRole: 'admin', target: String(mp.transaction_id),
    meta: { decision: body.decision, note: (body.note || '').slice(0, 200) }, ip: clientIp(c),
  });
  return ok({});
});

// ------------------------------------------------ audit log
admin.get('/audit', async (c) => {
  const page = Math.max(0, parseInt(c.req.query('page') || '0', 10));
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.action, a.target, a.meta_json, a.ip, a.created_at, u.email_normalized AS actor_email
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
     ORDER BY a.created_at DESC LIMIT 100 OFFSET ?`,
  ).bind(page * 100).all();
  return ok({ entries: rows.results || [], page });
});

// ------------------------------------------------ video job monitoring
admin.get('/video-jobs', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT v.id, v.status, v.model_key, v.aspect_ratio, v.duration_seconds, v.error, v.created_at,
            u.email_normalized AS user_email, v.counted_quota
     FROM video_jobs v LEFT JOIN users u ON u.id = v.user_id
     ORDER BY v.created_at DESC LIMIT 100`,
  ).all();
  return ok({ jobs: rows.results || [] });
});

function maskSecret(s: string): string {
  if (!s) return '';
  if (s.length <= 6) return '••••••';
  return s.slice(0, 3) + '••••••' + s.slice(-3);
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}

export default admin;
