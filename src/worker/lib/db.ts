import type { Env } from '../env';
import { now } from '../env';

// ---------- Settings ----------

export async function getSetting<T = unknown>(env: Env, key: string, fallback: T): Promise<T> {
  const row = await env.DB.prepare('SELECT value_json FROM settings WHERE key = ?').bind(key).first<{ value_json: string }>();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(env: Env, key: string, value: unknown, updatedBy?: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
    .bind(key, JSON.stringify(value), now(), updatedBy || null)
    .run();
}

// ---------- Typed settings ----------

export interface SiteSettings {
  name_fa: string; name_en: string; tagline_fa: string; tagline_en: string;
  default_locale: string; logo_text: string;
}

export interface CountryConfig {
  code: string; fa: string; en: string; currency: string; locales: string[];
  features: Record<string, boolean>; default?: boolean;
}

export interface FeatureFlags {
  chat: boolean; video: boolean; payments: boolean; registration: boolean;
  google_auth: boolean; manual_transfer: boolean; maintenance_mode: boolean;
  [k: string]: boolean;
}

export interface PaymentSettings {
  provider: string;
  zarinpal: { merchant_id: string; sandbox: boolean; base_url: string };
  callback_base: string;
  success_path: string; failure_path: string;
  currencies: string[];
  manual: { enabled: boolean; card_number: string; card_holder: string; bank_name: string; note_fa: string };
  refund_policy_fa: string;
}

export interface AuthPolicy {
  require_email_verification: boolean;
  allow_dev_code_echo: boolean;
  session_days: number;
  max_login_attempts: number;
  lockout_minutes: number;
}

export interface QuotaPolicy {
  video_count_only_successful: boolean;
  message_count_each: boolean;
  day_timezone: string;
}

export async function siteSettings(env: Env): Promise<SiteSettings> {
  return getSetting<SiteSettings>(env, 'site', {
    name_fa: 'امین‌ای‌آی الترا', name_en: 'AMIN AI ULTRA',
    tagline_fa: '', tagline_en: '', default_locale: 'fa', logo_text: 'AMIN',
  });
}

export async function countries(env: Env): Promise<CountryConfig[]> {
  return getSetting<CountryConfig[]>(env, 'countries', []);
}

export async function features(env: Env): Promise<FeatureFlags> {
  return getSetting<FeatureFlags>(env, 'features', {
    chat: true, video: true, payments: true, registration: true,
    google_auth: true, manual_transfer: true, maintenance_mode: false,
  });
}

export async function paymentSettings(env: Env): Promise<PaymentSettings> {
  return getSetting<PaymentSettings>(env, 'payments', {
    provider: 'disabled',
    zarinpal: { merchant_id: '', sandbox: false, base_url: 'https://api.zarinpal.com/pg/v4' },
    callback_base: '', success_path: '/pay/result?status=ok', failure_path: '/pay/result?status=failed',
    currencies: ['IRR'],
    manual: { enabled: true, card_number: '', card_holder: '', bank_name: '', note_fa: '' },
    refund_policy_fa: '',
  });
}

export async function authPolicy(env: Env): Promise<AuthPolicy> {
  return getSetting<AuthPolicy>(env, 'auth_policy', {
    require_email_verification: false, allow_dev_code_echo: true,
    session_days: 30, max_login_attempts: 5, lockout_minutes: 15,
  });
}

export async function quotaPolicy(env: Env): Promise<QuotaPolicy> {
  return getSetting<QuotaPolicy>(env, 'quota_policy', {
    video_count_only_successful: true, message_count_each: true, day_timezone: 'Asia/Tehran',
  });
}

// ---------- Plans / subscriptions / entitlements ----------

export interface Plan {
  id: string; slug: string; name_fa: string; name_en: string;
  description_fa: string; description_en: string;
  price_irr: number; price_usd_cents: number; duration_days: number;
  daily_message_limit: number; daily_video_limit_default: number; daily_video_limit_ir: number;
  upload_limit_mb: number; conversation_storage_limit: number;
  model_tier: 'basic' | 'plus' | 'pro';
  features_json: string; is_active: number; is_free: number; sort_order: number;
}

const TIER_RANK: Record<string, number> = { basic: 0, plus: 1, pro: 2 };

export function tierAtLeast(tier: string, min: string): boolean {
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[min] ?? 0);
}

export async function getPlan(env: Env, idOrSlug: string): Promise<Plan | null> {
  const row = await env.DB.prepare('SELECT * FROM plans WHERE id = ? OR slug = ?').bind(idOrSlug, idOrSlug).first<Plan>();
  return row ?? null;
}

export async function freePlan(env: Env): Promise<Plan | null> {
  const row = await env.DB.prepare('SELECT * FROM plans WHERE is_free = 1 AND is_active = 1 ORDER BY sort_order LIMIT 1').first<Plan>();
  return row ?? null;
}

export async function userPlan(env: Env, userId: string): Promise<Plan> {
  const row = await env.DB.prepare(
    `SELECT p.* FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = ? AND s.status = 'active' AND (s.ends_at IS NULL OR s.ends_at > ?)
     ORDER BY p.sort_order DESC LIMIT 1`,
  )
    .bind(userId, now())
    .first<Plan>();
  if (row) return row;
  const fp = await freePlan(env);
  if (fp) return fp;
  // Absolute fallback if admin deleted every plan: a minimal synthetic free plan.
  return {
    id: 'synthetic_free', slug: 'free', name_fa: 'رایگان', name_en: 'FREE',
    description_fa: '', description_en: '', price_irr: 0, price_usd_cents: 0, duration_days: 36500,
    daily_message_limit: 10, daily_video_limit_default: 1, daily_video_limit_ir: 2,
    upload_limit_mb: 5, conversation_storage_limit: 10, model_tier: 'basic',
    features_json: '{}', is_active: 1, is_free: 1, sort_order: 0,
  };
}

export async function activateSubscription(
  env: Env, userId: string, planId: string, source: 'zarinpal' | 'manual' | 'admin' | 'system',
): Promise<void> {
  const plan = await getPlan(env, planId);
  if (!plan) throw new Error('plan_not_found');
  const t = now();
  const ends = plan.is_free ? null : t + plan.duration_days * 86400000;
  await env.DB.prepare(
    `UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE user_id = ? AND status = 'active'`,
  )
    .bind(t, userId)
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, user_id, plan_id, status, source, starts_at, ends_at, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), userId, plan.id, source, t, ends, t, t)
    .run();
}

export async function usageRowsForUser(env: Env, userId: string, days: number): Promise<Array<{ day: string; message: number; video: number }>> {
  const rows = await env.DB.prepare(
    `SELECT day, kind, count FROM quota_usage WHERE user_id = ? ORDER BY day DESC LIMIT ?`,
  ).bind(userId, days * 2).all<{ day: string; kind: string; count: number }>();
  const byDay = new Map<string, { day: string; message: number; video: number }>();
  for (const r of rows.results || []) {
    const e = byDay.get(r.day) || { day: r.day, message: 0, video: 0 };
    if (r.kind === 'message') e.message = r.count;
    if (r.kind === 'video') e.video = r.count;
    byDay.set(r.day, e);
  }
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

// ---------- Misc ----------

export function dayKey(timezone: string, when = new Date()): string {
  // YYYY-MM-DD in the configured platform timezone
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(when);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}
