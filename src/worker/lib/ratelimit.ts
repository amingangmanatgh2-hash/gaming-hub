import type { Env } from '../env';

export interface RateResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** Distributed fixed-window rate limiting backed by a Durable Object per key. */
export async function rateLimit(env: Env, key: string, limit: number, windowMs: number): Promise<RateResult> {
  try {
    const id = env.RATE_LIMITER.idFromName(key.slice(0, 200));
    const stub = env.RATE_LIMITER.get(id);
    const res = await stub.fetch('https://do.internal/limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, windowMs }),
    });
    const data = (await res.json()) as RateResult;
    return data;
  } catch {
    // Fail closed-ish: allow but rely on per-route loops small. Better than
    // taking the whole API down if DO is unavailable in local dev.
    return { allowed: true, remaining: limit - 1, resetAt: Date.now() + windowMs };
  }
}
