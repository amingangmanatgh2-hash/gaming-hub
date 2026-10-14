/* Shared, side-effect-free validation and formatting for the Madar storefront. */
export const DEFAULT_SETTINGS = Object.freeze({
  siteName: 'مدار',
  tagline: 'اتصال ساده، انتخاب روشن.',
  announcement: 'هر مسیر، یک شروع تازه.',
  usdToToman: 90000,
  rateSource: 'manual',
  rateUpdatedAt: null,
  supportUsername: '',
  accent: 'mint',
  freeEnabled: true,
  paidEnabled: true,
});

export const DEFAULT_PRODUCTS = Object.freeze([
  { id: 'free', name: 'شروع آزاد', description: 'برای آشنایی با مدار و بررسی کیفیت اتصال.', tier: 'free', priceUSD: 0, durationDays: 1, enabled: true, features: ['یک روز دسترسی آزمایشی', 'مرور وب روی TCP', 'پشتیبانی از کلاینت سازگار'] },
  { id: 'plus', name: 'مدار پلاس', description: 'برای استفادهٔ روزانه و تماشای ویدئو.', tier: 'paid', priceUSD: 3.9, durationDays: 30, enabled: true, features: ['۳۰ روز دسترسی', 'پروفایل‌های مرور و ویدئو', 'اولویت در پشتیبانی'] },
  { id: 'pro', name: 'مدار پرو', description: 'برای کسانی که زمان بیشتری آنلاین هستند.', tier: 'paid', priceUSD: 7.9, durationDays: 60, enabled: true, features: ['۶۰ روز دسترسی', 'تمام پروفایل‌های TCP', 'اولویت در پشتیبانی'] },
]);

export const PROFILES = Object.freeze([
  { id: 'auto', name: 'خودکار', icon: '✦', detail: 'مسیریابی خودکار Cloudflare به نزدیک‌ترین لبهٔ در دسترس' },
  { id: 'browse', name: 'وب‌گردی', icon: '◎', detail: 'اتصال TCP مناسب وب و شبکه‌های اجتماعی' },
  { id: 'video', name: 'ویدئو', icon: '▷', detail: 'پروفایل TCP برای پخش ویدئو؛ سرعت به شبکه بستگی دارد' },
  { id: 'game', name: 'بازی (فقط TCP)', icon: '◇', detail: 'ترافیک UDP بازی از این تونل عبور نمی‌کند' },
]);

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function str(value, max, label, min = 0) {
  if (typeof value !== 'string') throw new InputError(`${label} باید متن باشد.`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new InputError(`${label} باید بین ${min} تا ${max} نویسه باشد.`);
  return text;
}

export function validateSettings(input, previous = DEFAULT_SETTINGS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('تنظیمات نامعتبر است.');
  const allowed = ['siteName', 'tagline', 'announcement', 'usdToToman', 'supportUsername', 'accent', 'freeEnabled', 'paidEnabled'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new InputError('فیلد تنظیمات ناشناخته است.');
  const next = { ...previous };
  if ('siteName' in input) next.siteName = str(input.siteName, 40, 'نام فروشگاه', 2);
  if ('tagline' in input) next.tagline = str(input.tagline, 140, 'توضیح کوتاه', 2);
  if ('announcement' in input) next.announcement = str(input.announcement, 220, 'اطلاعیه');
  if ('supportUsername' in input) {
    const username = str(input.supportUsername, 32, 'شناسهٔ پشتیبانی').replace(/^@/, '');
    if (username && !/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new InputError('شناسهٔ تلگرام معتبر نیست.');
    next.supportUsername = username;
  }
  if ('accent' in input) {
    if (!['mint', 'violet', 'amber'].includes(input.accent)) throw new InputError('رنگ نامعتبر است.');
    next.accent = input.accent;
  }
  for (const key of ['freeEnabled', 'paidEnabled']) {
    if (key in input) {
      if (typeof input[key] !== 'boolean') throw new InputError('مقدار فعال/غیرفعال باید درست یا نادرست باشد.');
      next[key] = input[key];
    }
  }
  if ('usdToToman' in input) {
    const rate = input.usdToToman;
    if (!Number.isSafeInteger(rate) || rate < 1000 || rate > 20_000_000) throw new InputError('نرخ دلار به تومان باید عدد صحیح بین ۱٬۰۰۰ تا ۲۰٬۰۰۰٬۰۰۰ باشد.');
    next.usdToToman = rate;
    next.rateUpdatedAt = new Date().toISOString();
    next.rateSource = 'manual';
  }
  return next;
}

export function validateProduct(input, id) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('اطلاعات محصول نامعتبر است.');
  const slug = id || input.id;
  if (typeof slug !== 'string' || !/^[a-z][a-z0-9-]{1,23}$/.test(slug)) throw new InputError('شناسهٔ محصول باید انگلیسی و ۲ تا ۲۴ نویسه باشد.');
  if (id && input.id && input.id !== id) throw new InputError('شناسهٔ محصول قابل تغییر نیست.');
  const tier = input.tier;
  if (!['free', 'paid'].includes(tier)) throw new InputError('نوع محصول باید رایگان یا پولی باشد.');
  const price = Number(input.priceUSD);
  if (!Number.isFinite(price) || price < 0 || price > 1000 || Math.round(price * 100) !== price * 100 || (tier === 'free' && price !== 0) || (tier === 'paid' && price === 0)) {
    throw new InputError('قیمت دلاری با نوع طرح مطابقت ندارد (حداکثر دو رقم اعشار).');
  }
  if (!Number.isSafeInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 365) throw new InputError('مدت طرح باید بین ۱ تا ۳۶۵ روز باشد.');
  if (typeof input.enabled !== 'boolean') throw new InputError('وضعیت طرح نامعتبر است.');
  if (!Array.isArray(input.features) || input.features.length > 8 || input.features.some((f) => typeof f !== 'string')) throw new InputError('حداکثر ۸ ویژگی برای هر طرح مجاز است.');
  return {
    id: slug,
    name: str(input.name, 50, 'نام محصول', 2),
    description: str(input.description, 180, 'توضیح محصول'),
    tier,
    priceUSD: price,
    durationDays: input.durationDays,
    enabled: input.enabled,
    features: input.features.map((f) => str(f, 80, 'ویژگی', 1)),
  };
}

export function tomanPrice(priceUSD, rate) {
  // Work in cents to avoid unexpected floating-point rounding in the displayed price.
  return Math.round(Math.round(priceUSD * 100) * rate / 100);
}

export function publicCatalog(settings, products) {
  return products.filter((p) => p.enabled && (p.tier === 'free' ? settings.freeEnabled : settings.paidEnabled));
}

export function normalizeAiProposal(raw, settings, products) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('پیشنهاد هوش مصنوعی معتبر نیست.');
  const changes = raw.changes || {};
  if (typeof changes !== 'object' || Array.isArray(changes)) throw new InputError('ساختار تغییرات نامعتبر است.');
  if (Object.keys(changes).some((k) => !['settings', 'products'].includes(k))) throw new InputError('تغییر ناشناخته است.');
  const clean = {};
  if (changes.settings) {
    const validated = validateSettings(changes.settings, settings);
    clean.settings = Object.fromEntries(Object.keys(changes.settings).map((key) => [key, validated[key]]));
  }
  if (changes.products) {
    if (!Array.isArray(changes.products) || changes.products.length > 12) throw new InputError('فهرست طرح‌ها نامعتبر است.');
    clean.products = changes.products.map((item) => {
      const current = products.find((p) => p.id === item.id);
      if (!current || Object.keys(item).some((k) => !['id', 'priceUSD', 'enabled'].includes(k))) throw new InputError('فقط قیمت و وضعیت طرح‌های موجود قابل تغییر است.');
      const normalized = validateProduct({ ...current, ...item }, current.id);
      return { id: current.id, ...('priceUSD' in item ? { priceUSD: normalized.priceUSD } : {}), ...('enabled' in item ? { enabled: normalized.enabled } : {}) };
    });
  }
  if (!Object.keys(clean).length) throw new InputError('تغییری پیشنهاد نشده است.');
  return { reply: str(String(raw.reply || 'پیشنهاد آماده است.'), 500, 'توضیح پیشنهاد'), changes: clean };
}

export function isSafeDestination(host, port) {
  if (![80, 443].includes(port) || typeof host !== 'string' || host.length > 253 || host.length < 4) return false;
  const domain = host.toLowerCase();
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) return false;
  if (domain.split('.').some((part) => part.startsWith('-') || part.endsWith('-') || part.length > 63)) return false;
  if (!/\.[a-z]{2,63}$/.test(domain) || /\.(?:local|localhost|lan|home|internal|test|invalid|example|onion|arpa)$/.test(domain)) return false;
  return !['localhost', 'metadata.google.internal'].includes(domain);
}

export function parseVlessHeader(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 18) return null;
  if (data[0] !== 0) throw new InputError('نسخهٔ VLESS پشتیبانی نمی‌شود.');
  const uuidBytes = data.slice(1, 17);
  const h = [...uuidBytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  let cursor = 18 + data[17];
  if (data.length < cursor + 4) return null;
  if (data[cursor++] !== 1) throw new InputError('فقط TCP پشتیبانی می‌شود.');
  const port = (data[cursor++] << 8) | data[cursor++];
  if (data[cursor++] !== 2) throw new InputError('برای جلوگیری از دسترسی به IP داخلی، مقصد باید نام دامنه باشد.');
  if (data.length < cursor + 1) return null;
  const len = data[cursor++];
  if (len === 0) throw new InputError('دامنه خالی است.');
  if (data.length < cursor + len) return null;
  const domain = new TextDecoder('utf-8', { fatal: true }).decode(data.slice(cursor, cursor + len)).toLowerCase();
  if (!isSafeDestination(domain, port)) throw new InputError('مقصد یا پورت مجاز نیست.');
  return { uuid, domain, port, payload: data.slice(cursor + len), version: data[0] };
}

export function vlessLinks({ uuid, hostname, siteName = 'Madar' }) {
  const host = String(hostname || '').toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || host.length > 253) throw new InputError('نام میزبان معتبر نیست.');
  return PROFILES.map((profile) => {
    const qs = new URLSearchParams({ encryption: 'none', security: 'tls', type: 'ws', host, path: `/edge?profile=${profile.id}` });
    return `vless://${uuid}@${host}:443?${qs}#${encodeURIComponent(`${siteName} · ${profile.name}`)}`;
  });
}
