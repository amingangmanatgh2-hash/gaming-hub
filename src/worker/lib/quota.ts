import type { Env } from '../env';
import { now } from '../env';
import { quotaPolicy, dayKey, userPlan, type Plan } from './db';

export type QuotaKind = 'message' | 'video';

export interface QuotaCheck {
  allowed: boolean;
  count: number;
  limit: number;
  day: string;
}

async function callDO(env: Env, userId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = env.QUOTA.idFromName('user:' + userId);
  const stub = env.QUOTA.get(id);
  const res = await stub.fetch('https://do.internal/quota', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

/** Daily limit for a user kind — derived from plan + verified country. Never trusts client input. */
export async function limitFor(env: Env, userId: string, kind: QuotaKind, plan?: Plan, countryVerified?: string): Promise<number> {
  const p = plan || (await userPlan(env, userId));
  if (kind === 'message') return p.daily_message_limit;
  // Video: verified IR residency gets the (configurable) higher allowance.
  let cv = countryVerified;
  if (cv === undefined) {
    const row = await env.DB.prepare('SELECT country_verified FROM users WHERE id = ?').bind(userId).first<{ country_verified: string }>();
    cv = row?.country_verified ?? '';
  }
  return cv === 'IR' ? p.daily_video_limit_ir : p.daily_video_limit_default;
}

export async function checkQuota(env: Env, userId: string, kind: QuotaKind, limit: number): Promise<QuotaCheck> {
  const qp = await quotaPolicy(env);
  const day = dayKey(qp.day_timezone);
  const r = await callDO(env, userId, { action: 'check', kind, day, limit });
  return { allowed: Boolean(r.allowed), count: Number(r.count ?? 0), limit, day };
}

/** Atomic check+increment. Only call when the action will actually be attempted. */
export async function reserveQuota(env: Env, userId: string, kind: QuotaKind, limit: number): Promise<QuotaCheck> {
  const qp = await quotaPolicy(env);
  const day = dayKey(qp.day_timezone);
  const r = await callDO(env, userId, { action: 'reserve', kind, day, limit });
  const out = { allowed: Boolean(r.allowed), count: Number(r.count ?? 0), limit, day };
  if (out.allowed) mirrorUsage(env, userId, day, kind, out.count);
  return out;
}

export async function releaseQuota(env: Env, userId: string, kind: QuotaKind, day?: string): Promise<void> {
  const qp = await quotaPolicy(env);
  const d = day || dayKey(qp.day_timezone);
  const r = await callDO(env, userId, { action: 'release', kind, day: d });
  mirrorUsage(env, userId, d, kind, Number(r.count ?? 0));
}

export async function usageToday(env: Env, userId: string): Promise<{ day: string; message: number; video: number }> {
  const qp = await quotaPolicy(env);
  const day = dayKey(qp.day_timezone);
  try {
    const r = await callDO(env, userId, { action: 'usage', day });
    return { day, message: Number(r.message ?? 0), video: Number(r.video ?? 0) };
  } catch {
    // Fallback to the D1 mirror if DO call failed
    const rows = await env.DB.prepare('SELECT kind, count FROM quota_usage WHERE user_id = ? AND day = ?')
      .bind(userId, day)
      .all<{ kind: string; count: number }>();
    let message = 0; let video = 0;
    for (const row of rows.results || []) {
      if (row.kind === 'message') message = row.count;
      if (row.kind === 'video') video = row.count;
    }
    return { day, message, video };
  }
}

function mirrorUsage(env: Env, userId: string, day: string, kind: QuotaKind, count: number): void {
  env.DB.prepare(
    `INSERT INTO quota_usage (user_id, day, kind, count, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, day, kind) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at`,
  )
    .bind(userId, day, kind, count, now())
    .run()
    .catch(() => {});
}
