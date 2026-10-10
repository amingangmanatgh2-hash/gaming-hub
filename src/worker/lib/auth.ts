import type { Context, Next } from 'hono';
import type { Env, AuthUser } from '../env';
import { now, DAY_MS } from '../env';
import { sha256Hex, randomToken, hmacSha256 } from './crypto';
import { err, isSafeMutation } from './http';
import { features } from './db';

export const SESSION_COOKIE = 'amin_session';

// ---------- Sessions ----------

export async function createSession(env: Env, userId: string, ip: string, ua: string, days: number): Promise<string> {
  const token = randomToken(32);
  const id = await sha256Hex(token + '.' + (env.APP_SECRET || ''));
  const t = now();
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, t, t + days * DAY_MS, t, ip.slice(0, 64), ua.slice(0, 256))
    .run();
  return token;
}

export async function getSessionUser(env: Env, token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const id = await sha256Hex(token + '.' + (env.APP_SECRET || ''));
  const row = await env.DB.prepare(
    `SELECT u.id, u.email_normalized AS email, u.name, u.role, u.status, u.locale, u.country_code,
            u.country_verified, u.email_verified_at, u.avatar_url, s.expires_at, s.revoked_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
  )
    .bind(id)
    .first<AuthUser & { expires_at: number; revoked_at: number | null }>();
  if (!row || row.revoked_at || row.expires_at < now() || row.status !== 'active') return null;
  // touch session (best-effort)
  env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now(), id).run().catch(() => {});
  const { expires_at: _e, revoked_at: _r, ...user } = row;
  return user;
}

export async function revokeSession(env: Env, token: string): Promise<void> {
  const id = await sha256Hex(token + '.' + (env.APP_SECRET || ''));
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').bind(now(), id).run();
}

export async function revokeAllSessions(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now(), userId).run();
}

export function sessionCookie(token: string, maxAgeSec: number, clear = false): string {
  const parts = [
    `${SESSION_COOKIE}=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${clear ? 0 : maxAgeSec}`,
  ];
  return parts.join('; ');
}

export function readSessionCookie(c: Context): string | undefined {
  const header = c.req.header('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return v.join('=');
  }
  return undefined;
}

// ---------- Reauth tokens (for sensitive admin/user ops) ----------

export async function createReauthToken(env: Env, userId: string, minutes = 10): Promise<string> {
  const token = randomToken(24);
  const id = await sha256Hex('reauth.' + token);
  await env.DB.prepare('INSERT INTO reauth_tokens (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, now() + minutes * 60000, now())
    .run();
  return token;
}

export async function consumeReauthToken(env: Env, userId: string, token: string): Promise<boolean> {
  if (!token) return false;
  const id = await sha256Hex('reauth.' + token);
  const row = await env.DB.prepare('SELECT expires_at, used_at FROM reauth_tokens WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ expires_at: number; used_at: number | null }>();
  if (!row || row.used_at || row.expires_at < now()) return false;
  await env.DB.prepare('UPDATE reauth_tokens SET used_at = ? WHERE id = ?').bind(now(), id).run();
  return true;
}

// ---------- Signed OAuth state ----------

export async function signState(env: Env, data: string): Promise<string> {
  return hmacSha256('oauth-state:' + (env.APP_SECRET || ''), data);
}

// ---------- Middleware ----------

type Ctx = Context<{ Bindings: Env; Variables: { user: AuthUser | null } }>;

export async function attachUser(c: Context<{ Bindings: Env; Variables: { user: AuthUser | null } }>, next: Next): Promise<void> {
  const token = readSessionCookie(c);
  const user = await getSessionUser(c.env, token);
  c.set('user', user);
  await next();
}

export async function requireUser(c: Ctx, next: Next): Promise<Response | void> {
  const user = c.get('user');
  if (!user) return err(401, 'unauthorized');
  if (!isSafeMutation(c)) return err(403, 'csrf');
  await next();
}

export async function requireAdmin(c: Ctx, next: Next): Promise<Response | void> {
  const user = c.get('user');
  if (!user) return err(401, 'unauthorized');
  if (user.role !== 'admin') return err(403, 'forbidden');
  if (!isSafeMutation(c)) return err(403, 'csrf');
  await next();
}

// Maintenance mode gate for non-admin app endpoints
export async function maintenanceGate(c: Ctx, next: Next): Promise<Response | void> {
  const f = await features(c.env);
  if (f.maintenance_mode) {
    const user = c.get('user');
    if (!user || user.role !== 'admin') return err(503, 'maintenance');
  }
  await next();
}
