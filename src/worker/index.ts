import { Hono } from 'hono';
import type { Env } from './env';
import { err, ok, defaultMessageFa, isSafeMutation } from './lib/http';
import { attachUser, requireUser, requireAdmin, maintenanceGate } from './lib/auth';
import { rateLimit } from './lib/ratelimit';
import { clientIp } from './lib/http';
import type { AuthUser } from './env';

import setup from './routes/setup';
import auth from './routes/auth';
import config from './routes/config';
import chat from './routes/chat';
import video from './routes/video';
import payments from './routes/payments';
import account from './routes/account';
import files from './routes/files';
import admin from './routes/admin';

export { QuotaCoordinator } from './do/QuotaCoordinator';
export { RateLimiter } from './do/RateLimiter';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

// ---------- Global API middleware (ORDER MATTERS — registered first) ----------

// 1) Security headers
app.use('/api/*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  await next();
});

// 2) Attach session user
app.use('/api/*', attachUser);

// 3) Broad abuse guard on the whole API surface (soft limit per IP)
app.use('/api/*', async (c, next) => {
  const ip = clientIp(c) || 'unknown';
  const rl = await rateLimit(c.env, `api:${ip}`, 600, 60000);
  if (!rl.allowed) return err(429, 'rate_limited');
  await next();
});

// 4) Universal CSRF/origin defense for every mutating API call.
//    (safe methods pass; webhook-style public callbacks are GET and unaffected)
app.use('/api/*', async (c, next) => {
  if (!isSafeMutation(c)) return err(403, 'csrf');
  await next();
});

// 5) Auth gates, registered BEFORE the routers they protect
app.use('/api/chat/*', requireUser, maintenanceGate);
app.use('/api/video/*', requireUser, maintenanceGate);
app.use('/api/account/*', requireUser, maintenanceGate);
app.use('/api/files/*', requireUser, maintenanceGate);
app.use('/api/files', requireUser, maintenanceGate);
app.use('/api/admin/*', requireAdmin);

// Payments: gateway callback must stay public; everything else needs a session.
app.use('/api/payments/*', async (c, next) => {
  if (c.req.path.startsWith('/api/payments/zarinpal/callback')) return next();
  return requireUser(c, next);
});

// ---------- Routes ----------
app.route('/api/setup', setup);
app.route('/api/auth', auth);
app.route('/api/config', config);
app.route('/api/chat', chat);
app.route('/api/video', video);
app.route('/api/payments', payments);
app.route('/api/account', account);
app.route('/api/files', files);
app.route('/api/admin', admin);

app.get('/api/health', (c) => ok({ status: 'healthy', time: new Date().toISOString() }));

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return err(404, 'not_found');
  return c.notFound();
});

app.onError((e, c) => {
  console.error('worker_error', e);
  if (c.req.path.startsWith('/api/')) {
    return Response.json({ ok: false, error: { code: 'internal', message_fa: defaultMessageFa('internal') } }, { status: 500 });
  }
  return new Response('Internal Server Error', { status: 500 });
});

export default app;
