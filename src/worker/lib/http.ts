import type { Context } from 'hono';

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data }, init);
}

export function err(status: number, code: string, messageFa?: string, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, error: { code, message_fa: messageFa || defaultMessageFa(code), ...extra } }, { status });
}

export function defaultMessageFa(code: string): string {
  const map: Record<string, string> = {
    unauthorized: 'برای دسترسی به این بخش وارد حساب کاربری شوید.',
    forbidden: 'شما مجوز دسترسی به این بخش را ندارید.',
    not_found: 'مورد درخواستی یافت نشد.',
    rate_limited: 'تعداد تلاش‌های شما بیش از حد مجاز است. کمی بعد دوباره امتحان کنید.',
    validation: 'اطلاعات ارسالی معتبر نیست.',
    maintenance: 'سامانه موقتاً در حال به‌روزرسانی است. لطفاً بعداً مراجعه کنید.',
    feature_disabled: 'این قابلیت در حال حاضر غیرفعال است.',
    quota_exceeded: 'سهمیه روزانه شما برای این قابلیت به پایان رسیده است.',
    csrf: 'درخواست از نظر امنیتی معتبر نیست. صفحه را تازه‌سازی کنید.',
    locked: 'حساب شما به دلیل تلاش‌های ناموفق موقتاً قفل شده است.',
    payment_not_configured: 'درگاه پرداخت هنوز پیکربندی نشده است.',
    provider_not_configured: 'هنوز هیچ ارائه‌دهنده هوش مصنوعی پیکربندی نشده است.',
    region_unavailable: 'این قابلیت در منطقه/کشور حساب شما در دسترس نیست.',
    setup_required: 'راه‌اندازی اولیه سامانه هنوز انجام نشده است.',
    setup_completed: 'راه‌اندازی اولیه قبلاً انجام شده و دیگر در دسترس نیست.',
    reauth_required: 'برای انجام این عملیات حساس، تأیید مجدد گذرواژه لازم است.',
    conflict: 'درخواست با وضعیت فعلی ناسازگار است.',
    internal: 'خطای داخلی رخ داد. لطفاً بعداً دوباره تلاش کنید.',
  };
  return map[code] || 'خطایی رخ داد.';
}

export function clientIp(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    (c.req.header('X-Forwarded-For') || '').split(',')[0].trim() ||
    ''
  );
}

// CSRF / origin defense for cookie-authenticated mutating requests:
// require a custom header + matching Origin when Origin is present.
// Safe methods (GET/HEAD/OPTIONS) pass unconditionally.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMutation(c: Context): boolean {
  if (SAFE_METHODS.has(c.req.method)) return true;
  if (c.req.header('X-Requested-With') !== 'XMLHttpRequest') return false;
  const origin = c.req.header('Origin');
  if (origin) {
    try {
      const o = new URL(origin);
      const host = c.req.header('Host') || new URL(c.req.url).host;
      if (o.host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}
