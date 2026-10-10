import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { now, DAY_MS } from '../env';
import { ok, err, clientIp, isSafeMutation } from '../lib/http';
import { getSetting, setSetting } from '../lib/db';
import { hashPassword, validatePasswordStrength } from '../lib/crypto';
import { createSession, sessionCookie } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { audit } from '../lib/audit';

const setup = new Hono<{ Bindings: Env }>();

const setupSchema = z.object({
  admin_name: z.string().min(1).max(100),
  admin_email: z.string().email().max(200),
  admin_password: z.string().min(10).max(256),
  site_name_fa: z.string().min(1).max(100).optional(),
  site_name_en: z.string().max(100).optional(),
  default_locale: z.enum(['fa', 'en']).optional(),
});

// GET /api/setup/status — is initial setup required?
setup.get('/status', async (c) => {
  const complete = await getSetting<boolean>(c.env, 'setup_complete', false);
  return ok({ setup_required: !complete });
});

// POST /api/setup — one-time initial install. Disabled forever after success.
setup.post('/', async (c) => {
  const complete = await getSetting<boolean>(c.env, 'setup_complete', false);
  if (complete) return err(410, 'setup_completed');
  if (!isSafeMutation(c)) return err(403, 'csrf');

  const ip = clientIp(c);
  // Anti-abuse: setup attempts are rate-limited per IP so a public first-boot
  // cannot be brute-forced or raced by unauthorized users.
  const rl = await rateLimit(c.env, `setup:${ip}`, 10, 3600000);
  if (!rl.allowed) return err(429, 'rate_limited');

  let body: z.infer<typeof setupSchema>;
  try {
    body = setupSchema.parse(await c.req.json());
  } catch {
    return err(400, 'validation', 'اطلاعات ارسالی معتبر نیست. ایمیل و گذرواژه (حداقل ۱۰ نویسه با حرف و عدد) را بررسی کنید.');
  }

  const pw = validatePasswordStrength(body.admin_password);
  if (!pw.ok) return err(400, 'validation', 'گذرواژه باید حداقل ۱۰ نویسه و شامل حرف و عدد باشد.');

  // Race-safe claim: only the first successful UPDATE flips the flag.
  const claim = await c.env.DB.prepare(
    `UPDATE settings SET value_json = 'true', updated_at = ? WHERE key = 'setup_complete' AND value_json = 'false'`,
  ).bind(now()).run();
  if ((claim.meta.changes ?? 0) === 0) return err(410, 'setup_completed');

  const email = body.admin_email.trim().toLowerCase();
  const passwordHash = await hashPassword(body.admin_password);
  const adminId = crypto.randomUUID();
  const t = now();

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, email_normalized, name, password_hash, role, status, email_verified_at, locale, country_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'admin', 'active', ?, 'fa', 'IR', ?, ?)`,
  ).bind(adminId, email, email, body.admin_name.trim(), passwordHash, t, t, t).run();

  // Apply wizard site preferences
  const site = await getSetting<Record<string, string>>(c.env, 'site', {} as Record<string, string>);
  if (body.site_name_fa) site.name_fa = body.site_name_fa;
  if (body.site_name_en) site.name_en = body.site_name_en;
  if (body.default_locale) site.default_locale = body.default_locale;
  await setSetting(c.env, 'site', site, adminId);

  await audit(c.env, 'setup.completed', { actorId: adminId, actorRole: 'admin', ip, meta: { email } });

  // Auto-assign free plan so admin can use the app immediately
  const fp = await c.env.DB.prepare('SELECT id FROM plans WHERE is_free = 1 LIMIT 1').first<{ id: string }>();
  if (fp) {
    await c.env.DB.prepare(
      `INSERT INTO subscriptions (id, user_id, plan_id, status, source, starts_at, ends_at, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 'system', ?, NULL, ?, ?)`,
    ).bind(crypto.randomUUID(), adminId, fp.id, t, t, t).run();
  }

  const token = await createSession(c.env, adminId, ip, c.req.header('User-Agent') || '', 30);
  const res = ok({ admin_id: adminId });
  res.headers.append('Set-Cookie', sessionCookie(token, 30 * DAY_MS / 1000));
  return res;
});

export default setup;
