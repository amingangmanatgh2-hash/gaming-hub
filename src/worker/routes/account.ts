import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, AuthUser } from '../env';
import { now } from '../env';
import { ok, err, clientIp } from '../lib/http';
import { userPlan, usageRowsForUser, countries } from '../lib/db';
import { usageToday, limitFor } from '../lib/quota';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../lib/crypto';
import { revokeAllSessions, consumeReauthToken } from '../lib/auth';
import { listEnabledModels } from '../lib/providers';
import { audit } from '../lib/audit';

const account = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

function userOf(c: { get: (k: string) => unknown }): AuthUser | null {
  return c.get('user') as AuthUser | null;
}

// GET /api/account/dashboard — authoritative data for the user dashboard
account.get('/dashboard', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const [plan, usage, msgLimit, videoLimit] = await Promise.all([
    userPlan(c.env, u.id), usageToday(c.env, u.id), limitFor(c.env, u.id, 'message'), limitFor(c.env, u.id, 'video'),
  ]);
  const sub = await c.env.DB.prepare(
    `SELECT s.id, s.status, s.starts_at, s.ends_at, s.source, p.name_fa, p.name_en, p.slug
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = ? AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1`,
  ).bind(u.id).first();

  const [convs, vids, txs, usageHistory] = await Promise.all([
    c.env.DB.prepare('SELECT id, title, updated_at FROM conversations WHERE user_id = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 8').bind(u.id).all(),
    c.env.DB.prepare('SELECT id, prompt, status, progress, result_url, created_at FROM video_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 8').bind(u.id).all(),
    c.env.DB.prepare('SELECT id, amount, currency, method, status, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 8').bind(u.id).all(),
    usageRowsForUser(c.env, u.id, 14),
  ]);

  const [chatModels, videoModels] = await Promise.all([listEnabledModels(c.env, 'chat'), listEnabledModels(c.env, 'video')]);
  const TIER: Record<string, number> = { basic: 0, plus: 1, pro: 2 };
  const pRank = TIER[plan.model_tier] ?? 0;

  return ok({
    user: { id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale, country_code: u.country_code, country_verified: u.country_verified, email_verified: Boolean(u.email_verified_at), avatar_url: u.avatar_url },
    subscription: sub || null,
    plan: { slug: plan.slug, name_fa: plan.name_fa, name_en: plan.name_en, model_tier: plan.model_tier },
    quotas: {
      message: { used: usage.message, limit: msgLimit },
      video: { used: usage.video, limit: videoLimit },
    },
    models_available: {
      chat: chatModels.filter((m) => (TIER[m.tier] ?? 0) <= pRank).map((m) => ({ id: m.id, name: m.display_name, tier: m.tier })),
      video: videoModels.filter((m) => (TIER[m.tier] ?? 0) <= pRank).map((m) => ({ id: m.id, name: m.display_name, tier: m.tier })),
    },
    recent: {
      conversations: convs.results || [],
      videos: vids.results || [],
      transactions: txs.results || [],
    },
    usage_history: usageHistory,
  });
});

// PUT /api/account/profile — non-sensitive preferences are saved directly
const profileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  locale: z.enum(['fa', 'en']).optional(),
  country_code: z.string().max(2).optional(),
});

account.put('/profile', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  let body: z.infer<typeof profileSchema>;
  try { body = profileSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }

  const cc = (body.country_code || '').toUpperCase();
  if (cc) {
    const list = await countries(c.env);
    if (!list.some((x) => x.code === cc)) return err(400, 'validation', 'کشور انتخاب‌شده پشتیبانی نمی‌شود.');
  }
  await c.env.DB.prepare(
    `UPDATE users SET name = COALESCE(?, name), locale = COALESCE(?, locale),
            country_code = CASE WHEN ? != '' THEN ? ELSE country_code END, updated_at = ? WHERE id = ?`,
  ).bind(body.name ?? null, body.locale ?? null, cc, cc, now(), u.id).run();
  await audit(c.env, 'account.profile_updated', { actorId: u.id, ip: clientIp(c) });
  return ok({});
});

// POST /api/account/password — change password (requires current password)
account.post('/password', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const body = (await c.req.json().catch(() => ({}))) as { current_password?: string; new_password?: string };
  if (!body.current_password || !body.new_password) return err(400, 'validation');
  const pw = validatePasswordStrength(body.new_password);
  if (!pw.ok) return err(400, 'validation', 'گذرواژه جدید باید حداقل ۱۰ نویسه و شامل حرف و عدد باشد.');
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(u.id).first<{ password_hash: string | null }>();
  if (!row?.password_hash || !(await verifyPassword(body.current_password, row.password_hash))) {
    return err(401, 'unauthorized', 'گذرواژه فعلی نادرست است.');
  }
  const newHash = await hashPassword(body.new_password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(newHash, now(), u.id).run();
  await revokeAllSessions(c.env, u.id);
  await audit(c.env, 'account.password_changed', { actorId: u.id, ip: clientIp(c) });
  return ok({ sessions_revoked: true });
});

// GET /api/account/export — GDPR-style data export
account.get('/export', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const [convs, msgs, vids, txs, subs, uploads] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM conversations WHERE user_id = ?').bind(u.id).all(),
    c.env.DB.prepare('SELECT m.* FROM messages m JOIN conversations cv ON cv.id = m.conversation_id WHERE cv.user_id = ?').bind(u.id).all(),
    c.env.DB.prepare('SELECT id, prompt, aspect_ratio, duration_seconds, status, result_url, created_at FROM video_jobs WHERE user_id = ?').bind(u.id).all(),
    c.env.DB.prepare('SELECT id, amount, currency, method, status, ref_id, created_at FROM transactions WHERE user_id = ?').bind(u.id).all(),
    c.env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(u.id).all(),
    c.env.DB.prepare('SELECT id, filename, mime, size_bytes, created_at FROM uploads WHERE user_id = ?').bind(u.id).all(),
  ]);
  const userRow = await c.env.DB.prepare(
    'SELECT id, email_normalized AS email, name, role, locale, country_code, country_verified, created_at, last_login_at FROM users WHERE id = ?',
  ).bind(u.id).first();
  const payload = {
    exported_at: new Date().toISOString(),
    user: userRow,
    subscriptions: subs.results || [],
    conversations: convs.results || [],
    messages: msgs.results || [],
    video_jobs: vids.results || [],
    transactions: txs.results || [],
    uploads: uploads.results || [],
  };
  await audit(c.env, 'account.exported', { actorId: u.id, ip: clientIp(c) });
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="amin-ai-ultra-export.json"',
    },
  });
});

// POST /api/account/delete — destructive: requires fresh reauthentication
account.post('/delete', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const body = (await c.req.json().catch(() => ({}))) as { reauth_token?: string; confirmation?: string };
  if (body.confirmation !== 'DELETE') return err(400, 'validation', 'برای حذف حساب، عبارت DELETE را وارد کنید.');
  if (!(await consumeReauthToken(c.env, u.id, body.reauth_token || ''))) return err(403, 'reauth_required');
  if (u.role === 'admin') {
    const admins = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'`).first<{ n: number }>();
    if ((admins?.n ?? 0) <= 1) return err(409, 'conflict', 'آخرین مدیر سامانه نمی‌تواند حساب خود را حذف کند.');
  }
  const t = now();
  await c.env.DB.prepare(
    `UPDATE users SET status = 'deleted', deleted_at = ?, email = NULL, google_sub = NULL, password_hash = NULL,
            email_normalized = 'deleted-' || id, name = 'حساب حذف‌شده', avatar_url = '', updated_at = ? WHERE id = ?`,
  ).bind(t, t, u.id).run();
  await revokeAllSessions(c.env, u.id);
  await audit(c.env, 'account.deleted', { actorId: u.id, ip: clientIp(c) });
  return ok({});
});

export default account;
