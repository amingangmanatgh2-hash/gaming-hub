// Typed API client. Every mutation carries the anti-CSRF custom header;
// cookies are same-site so no credentials flag juggling is needed.

export interface ApiError {
  code: string;
  message_fa: string;
  [k: string]: unknown;
}

export class ApiException extends Error {
  status: number;
  code: string;
  fa: string;
  extra: Record<string, unknown>;
  constructor(status: number, e: ApiError) {
    super(e.code);
    this.status = status;
    this.code = e.code;
    this.fa = e.message_fa || '';
    this.extra = e;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiException(0, { code: 'network', message_fa: 'اتصال برقرار نشد. اینترنت خود را بررسی کنید.' });
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const e = (body as { error?: ApiError })?.error || { code: 'internal', message_fa: 'خطای داخلی رخ داد.' };
    throw new ApiException(res.status, e);
  }
  return (body as { data: T }).data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    const headers = new Headers({ 'X-Requested-With': 'XMLHttpRequest' });
    const res = await fetch(path, { method: 'POST', body: form, headers });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: unknown; error?: ApiError } | null;
    if (!res.ok) throw new ApiException(res.status, body?.error || { code: 'internal', message_fa: 'خطای داخلی رخ داد.' });
    return body?.data as T;
  },
};

// ---------- Shared types ----------

export interface PublicConfig {
  site: { name_fa: string; name_en: string; tagline_fa: string; tagline_en: string; default_locale: string; logo_text: string };
  countries: Array<{ code: string; fa: string; en: string; currency: string; locales: string[]; features: Record<string, boolean> }>;
  features: Record<string, boolean>;
  google: { configured: boolean; enabled: boolean };
  payments: {
    provider: string; zarinpal_configured: boolean; currencies: string[];
    manual: { enabled: boolean; card_number: string; card_holder: string; bank_name: string; note_fa: string };
    refund_policy_fa: string;
  };
  email: { configured: boolean };
  models: { chat: ModelInfo[]; video: ModelInfo[] };
  plans: PlanInfo[];
  quota_policy: { day_timezone: string };
  maintenance: boolean;
}

export interface ModelInfo {
  id: string; key: string; name: string; tier: 'basic' | 'plus' | 'pro'; provider?: string;
  available?: boolean;
  config?: { durations?: number[]; ratios?: string[]; cost_hint?: string };
}

export interface PlanInfo {
  id: string; slug: string; name_fa: string; name_en: string; description_fa: string; description_en: string;
  price_irr: number; price_usd_cents: number; duration_days: number;
  daily_message_limit: number; daily_video_limit_default: number; daily_video_limit_ir: number;
  upload_limit_mb: number; conversation_storage_limit: number; model_tier: 'basic' | 'plus' | 'pro';
  features: Record<string, unknown>; is_active: number; is_free: number; sort_order: number;
}

export interface MeResponse {
  user: { id: string; email: string; name: string; role: 'user' | 'admin'; locale: string; country_code: string; country_verified: string; email_verified: boolean; avatar_url: string } | null;
  plan?: { slug: string; name_fa: string; name_en: string; model_tier: string; price_irr: number; duration_days: number };
  subscription?: { id: string; status: string; starts_at: number; ends_at: number | null; source: string } | null;
  usage?: { day: string; message: number; video: number; message_limit: number; video_limit: number };
}
