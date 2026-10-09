import type { Env } from '../env';
import { now } from '../env';

const SENSITIVE_KEYS = ['password', 'api_key', 'secret', 'token', 'merchant_id', 'code', 'card'];
const SECRET_PLACEHOLDER = '<redacted>';

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return SECRET_PLACEHOLDER;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lk.includes(s))) {
        out[k] = typeof v === 'string' && v.length > 4 ? `<redacted:${v.length} chars>` : SECRET_PLACEHOLDER;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '…';
  return value;
}

export async function audit(
  env: Env,
  action: string,
  opts: { actorId?: string | null; actorRole?: string; target?: string; meta?: unknown; ip?: string } = {},
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor_user_id, actor_role, action, target, meta_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        opts.actorId ?? null,
        opts.actorRole ?? '',
        action,
        opts.target ?? '',
        JSON.stringify(redact(opts.meta ?? {})),
        opts.ip ?? '',
        now(),
      )
      .run();
  } catch {
    // Auditing must never break the main flow.
  }
}
