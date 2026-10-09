export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  QUOTA: DurableObjectNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  APP_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: string;
  locale: string;
  country_code: string;
  country_verified: string;
  email_verified_at: number | null;
  avatar_url: string;
}

export const DAY_MS = 86400000;

export function now(): number {
  return Date.now();
}

export function appSecret(env: Env): string {
  const s = env.APP_SECRET || '';
  if (!s || s.length < 16) return 'dev-only-insecure-secret-change-me';
  return s;
}

export function uid(): string {
  return crypto.randomUUID();
}
