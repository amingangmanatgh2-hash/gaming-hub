import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, AuthUser } from '../env';
import { now, DAY_MS } from '../env';
import { ok, err, clientIp, isSafeMutation } from '../lib/http';
import { authPolicy, features, setSetting, userPlan, activateSubscription } from '../lib/db';
import { hashPassword, verifyPassword, validatePasswordStrength, randomToken, sha256Hex, hmacSha256, timingSafeEqual } from '../lib/crypto';
import {
  createSession, getSessionUser, revokeSession, revokeAllSessions,
  sessionCookie, readSessionCookie, createReauthToken,
} from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { sendEmail, codeEmailHtml } from '../lib/email';
import { siteSettings } from '../lib/db';
import { audit } from '../lib/audit';
import { usageToday, limitFor } from '../lib/quota';

const auth = new Hono<{ Bindings: Env }>();

// ---------------- helpers ----------------

const emailSchema = z.string().email().max(200);

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

async function issueCode(env: Env, userId: string | null, email: string, purpose: 'verify' | 'reset'): Promise<{ code: string; devEcho: boolean }> {
  const policy = await authPolicy(env);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await hmacSha256('code:' + (env.APP_SECRET || ''), `${purpose}:${email}:${code}`);
  const t = now();
  await env.DB.prepare(
    `INSERT INTO email_codes (id, user_id, email, purpose, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  ).bind(crypto.randomUUID(), userId, email, purpose, codeHash, t + 10 * 60000, t).run();
  const site = await siteSettings(env);
  const purposeFa = purpose === 'verify' ? 'کد تأیید ایمیل شما:' : 'کد بازیابی گذرواژه شما:';
  const result = await sendEmail(env, email, `${site.name_fa} — ${purposeFa}`, codeEmailHtml({ siteName: site.name_fa, code, purposeFa }));
  // Dev echo is only allowed when explicitly enabled AND email delivery is
  // not configured — keeps local/dev onboarding possible without SMTP.
  const devEcho = !result.delivered && policy.allow_dev_code_echo;
  return { code, devEcho };
}

async function checkCode(env: Env, email: string, purpose: 'verify' | 'reset', code: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id, code_hash, expires_at, consumed_at, attempts FROM email_codes
     WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(email, purpose).first<{ id: string; code_hash: string; expires_at: number; consumed_at: number | null; attempts: number }>();
  if (!row || row.consumed_at || row.expires_at < now() || row.attempts >= 5) return false;
  const expect = await hmacSha256('code:' + (env.APP_SECRET || ''), `${purpose}:${email}:${code}`);
  if (!timingSafeEqual(expect, row.code_hash)) {
    await env.DB.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
    return false;
  }
  await env.DB.prepare('UPDATE email_codes SET consumed_at = ? WHERE id = ?').bind(now(), row.id).run();
  return true;
}

function publicUser(u: AuthUser) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale,
    country_code: u.country_code, country_verified: u.country_verified,
    email_verified: Boolean(u.email_verified_at), avatar_url: u.avatar_url,
  };
}

// ---------------- register ----------------

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: emailSchema,
  password: z.string().min(10).max(256),
  locale: z.enum(['fa', 'en']).optional(),
  country_code: z.string().max(2).optional(),
});

auth.post('/register', async (c) => {
  if (!isSafeMutation(c)) return err(403, 'csrf');
  const f = await features(c.env);
  if (!f.registration) return err(403, 'feature_disabled', 'ثبت‌نام در حال حاضر غیرفعال است.');
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `register:${ip}`, 10, 3600000);
  if (!rl.allowed) return err(429, 'rate_limited');

  let body: z.infer<typeof registerSchema>;
  try { body = registerSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }
  const pw = validatePasswordStrength(body.password);
  if (!pw.ok) return err(400, 'validation', 'گذرواژه باید حداقل ۱۰ نویسه و شامل حرف و عدد باشد.');

  const email = normalizeEmail(body.email);
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email_normalized = ?').bind(email).first();
  if (existing) {
    await audit(c.env, 'auth.register.duplicate', { ip, meta: { email } });
    return err(409, 'conflict', 'حسابی با این ایمیل از قبل وجود دارد. وارد شوید یا گذرواژه را بازیابی کنید.');
  }

  const policy = await authPolicy(c.env);
  const userId = crypto.randomUUID();
  const t = now();
  const passwordHash = await hashPassword(body.password);
  const verifiedAt = policy.require_email_verification ? null : t;

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, email_normalized, name, password_hash, role, status, email_verified_at, locale, country_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'user', 'active', ?, ?, ?, ?, ?)`,
  ).bind(
    userId, email, email, body.name.trim(), passwordHash,
    verifiedAt, body.locale || 'fa', (body.country_code || '').toUpperCase(), t, t,
  ).run();

  // Grant free plan
  const fp = await c.env.DB.prepare('SELECT id FROM plans WHERE is_free = 1 AND is_active = 1 LIMIT 1').first<{ id: string }>();
  if (fp) await activateSubscription(c.env, userId, fp.id, 'system');

  await audit(c.env, 'auth.register', { actorId: userId, ip });

  let devCode: string | undefined;
  if (policy.require_email_verification) {
    const issued = await issueCode(c.env, userId, email, 'verify');
    if (issued.devEcho) devCode = issued.code;
  }

  const token = await createSession(c.env, userId, ip, c.req.header('User-Agent') || '', policy.session_days);
  const res = ok({ user_id: userId, requires_verification: policy.require_email_verification, dev_code: devCode });
  res.headers.append('Set-Cookie', sessionCookie(token, policy.session_days * DAY_MS / 1000));
  return res;
});

// ---------------- login ----------------

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });

auth.post('/login', async (c) => {
  if (!isSafeMutation(c)) return err(403, 'csrf');
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `login:${ip}`, 20, 600000);
  if (!rl.allowed) return err(429, 'rate_limited');

  let body: z.infer<typeof loginSchema>;
  try { body = loginSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }
  const email = normalizeEmail(body.email);

  const policy = await authPolicy(c.env);
  const lockRl = await rateLimit(c.env, `loginacct:${email}`, policy.max_login_attempts * 3, policy.lockout_minutes * 60000);
  if (!lockRl.allowed) return err(429, 'locked', 'به دلیل تلاش‌های متعدد، ورود موقتاً محدود شده است.');

  const user = await c.env.DB.prepare(
    `SELECT id, password_hash, status, locked_until, failed_login_attempts FROM users WHERE email_normalized = ?`,
  ).bind(email).first<{ id: string; password_hash: string | null; status: string; locked_until: number | null; failed_login_attempts: number }>();

  if (!user || !user.password_hash) {
    await verifyPassword('dummy-password', 'pbkdf2$310000$AAAAAAAAAAA=$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    return err(401, 'unauthorized', 'ایمیل یا گذرواژه نادرست است.');
  }
  if (user.status !== 'active') return err(403, 'forbidden', 'حساب شما فعال نیست.');
  if (user.locked_until && user.locked_until > now()) return err(423, 'locked');

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    const fails = user.failed_login_attempts + 1;
    const locked = fails >= policy.max_login_attempts ? now() + policy.lockout_minutes * 60000 : null;
    await c.env.DB.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
      .bind(fails, locked, user.id).run();
    await audit(c.env, 'auth.login.failed', { actorId: user.id, ip });
    return err(401, 'unauthorized', 'ایمیل یا گذرواژه نادرست است.');
  }

  await c.env.DB.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?')
    .bind(now(), user.id).run();

  const token = await createSession(c.env, user.id, ip, c.req.header('User-Agent') || '', policy.session_days);
  const res = ok({ user_id: user.id });
  res.headers.append('Set-Cookie', sessionCookie(token, policy.session_days * DAY_MS / 1000));
  return res;
});

// ---------------- logout / me ----------------

auth.post('/logout', async (c) => {
  const token = readSessionCookie(c);
  const user = await getSessionUser(c.env, token);
  if (token) await revokeSession(c.env, token);
  if (user) await audit(c.env, 'auth.logout', { actorId: user.id, ip: clientIp(c) });
  const res = ok({});
  res.headers.append('Set-Cookie', sessionCookie('', 0, true));
  return res;
});

auth.get('/me', async (c) => {
  const token = readSessionCookie(c);
  const user = await getSessionUser(c.env, token);
  if (!user) return ok({ user: null });
  const [plan, usage, msgLimit, videoLimit] = await Promise.all([
    userPlan(c.env, user.id),
    usageToday(c.env, user.id),
    limitFor(c.env, user.id, 'message'),
    limitFor(c.env, user.id, 'video'),
  ]);
  const sub = await c.env.DB.prepare(
    `SELECT s.id, s.status, s.starts_at, s.ends_at, s.source FROM subscriptions s
     WHERE s.user_id = ? AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1`,
  ).bind(user.id).first();
  return ok({
    user: publicUser(user),
    plan: { slug: plan.slug, name_fa: plan.name_fa, name_en: plan.name_en, model_tier: plan.model_tier, price_irr: plan.price_irr, duration_days: plan.duration_days },
    subscription: sub || null,
    usage: { ...usage, message_limit: msgLimit, video_limit: videoLimit },
  });
});

// ---------------- email verification ----------------

auth.post('/verify/request', async (c) => {
  if (!isSafeMutation(c)) return err(403, 'csrf');
  const token = readSessionCookie(c);
  const user = await getSessionUser(c.env, token);
  if (!user) return err(401, 'unauthorized');
  if (user.email_verified_at) return ok({ already: true });
  const rl = await rateLimit(c.env, `verify:${user.id}`, 5, 3600000);
  if (!rl.allowed) return err(429, 'rate_limited');
  const issued = await issueCode(c.env, user.id, user.email, 'verify');
  return ok({ sent: !issued.devEcho, dev_code: issued.devEcho ? issued.code : undefined });
});

auth.post('/verify/confirm', async (c) => {
  if (!isSafeMutation(c)) return err(403, 'csrf');
  const token = readSessionCookie(c);
  const user = await getSessionUser(c.env, token);
  if (!user) return err(401, 'unauthorized');
  const body = (await c.req.json().catch(() => ({}))) as { code?: string };
  if (!body.code || !/^\d{6}$/.test(body.code)) return err(400, 'validation');
  const okCode = await checkCode(c.env, user.email, 'verify', body.code);
  if (!okCode) return err(400, 'validation', 'کد وارد شده صحیح نیست یا منقضی شده است.');
  await c.env.DB.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').bind(now(), user.id).run();
  await audit(c.env, 'auth.email_verified', { actorId: user.id, ip: clientIp(c) });
  return ok({});
});

// ---------------- password reset ----------------

auth.post('/password/forgot', async (c) => {
  if (!isSafeMutation(c)) return err(403, 'csrf');
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `forgot:${ip}`, 8, 3600000);
  if (!rl.allowed) return err(429, 'rate_limited');
  const body = (await c.req.json().catch(() => ({}))) as { email?: string };
  const parsed = emailSchema.safeParse(body.email);
  if (!parsed.success) return err(400, 'validation');
  const email = normalizeEmail(parsed.data);
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email_normalized = ? AND status = ?').bind(email, 'active').first<{ id: string }>();
  // Always return ok to avoid account enumeration; only echo dev code when the account exists.
  let devCode: string | undefined;
  if (user) {
    const issued = await issueCode(c.env, user.id, email, 'reset');
    if (issued.devEcho) devCode = issued.code;
  }
  return ok({ sent: true, dev_code: devCode });
});

auth.post('/password/reset', async (c) => {
  if (!isSafeMutation(c)) return err(403, 'csrf');
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; code?: string; new_password?: string };
  const parsed = emailSchema.safeParse(body.email);
  if (!parsed.success || !body.code || !body.new_password) return err(400, 'validation');
  const pw = validatePasswordStrength(body.new_password);
  if (!pw.ok) return err(400, 'validation', 'گذرواژه باید حداقل ۱۰ نویسه و شامل حرف و عدد باشد.');
  const email = normalizeEmail(parsed.data);
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email_normalized = ?').bind(email).first<{ id: string }>();
  if (!user) return err(400, 'validation', 'کد یا ایمیل معتبر نیست.');
  const okCode = await checkCode(c.env, email, 'reset', body.code);
  if (!okCode) return err(400, 'validation', 'کد وارد شده صحیح نیست یا منقضی شده است.');
  const passwordHash = await hashPassword(body.new_password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .bind(passwordHash, now(), user.id).run();
  await revokeAllSessions(c.env, user.id);
  await audit(c.env, 'auth.password_reset', { actorId: user.id, ip: clientIp(c) });
  return ok({});
});

// ---------------- reauth (sensitive ops) ----------------

auth.post('/reauth', async (c) => {
  if (!isSafeMutation(c)) return err(403, 'csrf');
  const token = readSessionCookie(c);
  const user = await getSessionUser(c.env, token);
  if (!user) return err(401, 'unauthorized');
  const body = (await c.req.json().catch(() => ({}))) as { password?: string };
  if (!body.password) return err(400, 'validation');
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string | null }>();
  if (!row?.password_hash || !(await verifyPassword(body.password, row.password_hash))) {
    return err(401, 'unauthorized', 'گذرواژه نادرست است.');
  }
  const rt = await createReauthToken(c.env, user.id);
  return ok({ reauth_token: rt });
});

// ---------------- Google OIDC ----------------

auth.get('/google/start', async (c) => {
  const f = await features(c.env);
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!f.google_auth) return err(403, 'feature_disabled');
  if (!clientId) return err(503, 'feature_disabled', 'ورود با گوگل هنوز پیکربندی نشده است. لطفاً با ایمیل ثبت‌نام کنید.');
  const origin = new URL(c.req.url).origin;
  const state = randomToken(16);
  const sig = await hmacSha256('oauth-state:' + (c.env.APP_SECRET || ''), state);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: origin + '/api/auth/google/callback',
    response_type: 'code',
    scope: 'openid email profile',
    state: state + '.' + sig,
    access_type: 'online',
    prompt: 'select_account',
  });
  return c.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

auth.get('/google/callback', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return err(503, 'feature_disabled', 'ورود با گوگل پیکربندی نشده است.');
  const url = new URL(c.req.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const [raw, sig] = state.split('.');
  const expect = await hmacSha256('oauth-state:' + (c.env.APP_SECRET || ''), raw || '');
  if (!raw || !timingSafeEqual(expect, sig || '')) return err(400, 'csrf', 'نشست ورود معتبر نیست.');
  if (!code) return c.redirect('/auth/login?error=google_denied');

  // Exchange authorization code
  const origin = url.origin;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: origin + '/api/auth/google/callback', grant_type: 'authorization_code',
    }).toString(),
  }).catch(() => null);
  if (!tokenRes || !tokenRes.ok) return c.redirect('/auth/login?error=google_token');

  const tokenData = (await tokenRes.json()) as { id_token?: string };
  if (!tokenData.id_token) return c.redirect('/auth/login?error=google_token');

  // Verify the ID token via Google's tokeninfo (simple, fetch-only verification)
  const infoRes = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tokenData.id_token)).catch(() => null);
  if (!infoRes || !infoRes.ok) return c.redirect('/auth/login?error=google_verify');
  const claims = (await infoRes.json()) as { sub?: string; email?: string; name?: string; picture?: string; aud?: string; email_verified?: string };
  if (claims.aud !== clientId || !claims.sub || !claims.email) return c.redirect('/auth/login?error=google_verify');

  const email = normalizeEmail(claims.email);
  const t = now();
  const ip = clientIp(c);

  let user = await c.env.DB.prepare('SELECT id, status FROM users WHERE google_sub = ?').bind(claims.sub).first<{ id: string; status: string }>();
  if (!user) {
    user = await c.env.DB.prepare('SELECT id, status FROM users WHERE email_normalized = ?').bind(email).first<{ id: string; status: string }>();
    if (user) {
      await c.env.DB.prepare('UPDATE users SET google_sub = ?, email_verified_at = COALESCE(email_verified_at, ?), avatar_url = COALESCE(NULLIF(avatar_url, \'\'), ?), updated_at = ? WHERE id = ?')
        .bind(claims.sub, t, claims.picture || '', t, user.id).run();
    }
  }
  if (!user) {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, email_normalized, name, google_sub, role, status, email_verified_at, locale, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'user', 'active', ?, 'fa', ?, ?, ?)`,
    ).bind(id, email, email, claims.name || email.split('@')[0], claims.sub, t, claims.picture || '', t, t).run();
    const fp = await c.env.DB.prepare('SELECT id FROM plans WHERE is_free = 1 AND is_active = 1 LIMIT 1').first<{ id: string }>();
    if (fp) await activateSubscription(c.env, id, fp.id, 'system');
    user = { id, status: 'active' };
    await audit(c.env, 'auth.register.google', { actorId: id, ip, meta: { email } });
  }
  if (user.status !== 'active') return c.redirect('/auth/login?error=account_inactive');

  const policy = await authPolicy(c.env);
  await c.env.DB.prepare('UPDATE users SET last_login_at = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?').bind(t, user.id).run();
  const sessionToken = await createSession(c.env, user.id, ip, c.req.header('User-Agent') || '', policy.session_days);

  const res = new Response(null, { status: 302, headers: { Location: '/app/chat' } });
  res.headers.append('Set-Cookie', sessionCookie(sessionToken, policy.session_days * DAY_MS / 1000));
  return res;
});

export default auth;
