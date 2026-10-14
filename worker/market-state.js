import { DEFAULT_SETTINGS, DEFAULT_PRODUCTS, InputError, validateSettings, validateProduct, publicCatalog, tomanPrice, normalizeAiProposal } from '../shared/market.js';

const te = new TextEncoder();
const SESSION_MS = 7 * 86_400_000;
const MAX_BODY = 16_384;
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const reply = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extra } });
const fail = (message, status = 400) => reply({ ok: false, error: message }, status);

async function body(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InputError('درخواست باید JSON باشد.', 415);
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new InputError('درخواست بیش از حد بزرگ است.', 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new InputError('درخواست بیش از حد بزرگ است.', 413);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('bad');
    return value;
  } catch { throw new InputError('JSON نامعتبر است.'); }
}
function random(bytes = 32) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function digest(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) { return Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16))); }
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt), iterations: 150_000 }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function cookie(value, ttl = 604800) { return `madar_session=${value}; Path=/; Max-Age=${ttl}; Secure; HttpOnly; SameSite=Strict`; }
function trimText(value, max, label, required = false) {
  if (typeof value !== 'string') throw new InputError(`${label} باید متن باشد.`);
  const text = value.trim();
  if (text.length > max || (required && text.length < 2)) throw new InputError(`${label} طول نامعتبری دارد.`);
  return text;
}

/** One SQLite-backed Durable Object per shop. Only this Worker may address this object. */
export class MarketState {
  constructor(state) {
    this.storage = state.storage;
    // Serialize read-modify-write sequences (DO requests may otherwise interleave at awaits).
    this.queue = Promise.resolve();
  }

  async locked(fn) {
    const last = this.queue;
    let release;
    this.queue = new Promise((resolve) => { release = resolve; });
    await last;
    try { return await fn(); } finally { release(); }
  }
  async config() {
    const [settings, products] = await Promise.all([this.storage.get('settings'), this.storage.get('products')]);
    return { settings: settings || { ...DEFAULT_SETTINGS }, products: products || DEFAULT_PRODUCTS.map((p) => ({ ...p, features: [...p.features] })) };
  }
  async session(request, requireCsrf = false) {
    const token = /(?:^|;\s*)madar_session=([A-Za-z0-9_-]{40,60})(?:;|$)/.exec(request.headers.get('cookie') || '')?.[1];
    if (!token) return null;
    const record = await this.storage.get(`session:${await digest(token)}`);
    if (!record || record.expiresAt < Date.now()) return null;
    if (requireCsrf && !equal(record.csrf, request.headers.get('x-csrf-token'))) return null;
    return record;
  }
  async newSession() {
    const token = random();
    const csrf = random(24);
    await this.storage.put(`session:${await digest(token)}`, { csrf, expiresAt: Date.now() + SESSION_MS });
    return { token, csrf };
  }
  async fetch(request) {
    try { return await this.route(request); }
    catch (err) {
      if (err instanceof InputError) return fail(err.message, err.status);
      // Do not return the error or any stored secrets to the caller.
      return fail('خطای موقت سرویس. دوباره تلاش کنید.', 500);
    }
  }

  async route(request) {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (path === '/status' && method === 'GET') return reply({ ok: true, initialized: !!(await this.storage.get('admin')) });
    if (path === '/public' && method === 'GET') {
      const { settings, products } = await this.config();
      return reply({ ok: true, initialized: !!(await this.storage.get('admin')), settings, products: publicCatalog(settings, products).map((p) => ({ ...p, priceToman: tomanPrice(p.priceUSD, settings.usdToToman) })) });
    }
    if (path === '/setup' && method === 'POST') return this.setup(request);
    if (path === '/login' && method === 'POST') return this.login(request);
    if (path === '/orders' && method === 'POST') return this.order(request);
    if (path.startsWith('/orders/') && path.endsWith('/status') && method === 'POST') return this.orderStatus(request, path.slice('/orders/'.length, -'/status'.length));
    if (path === '/activate/free' && method === 'POST') return this.activateFree(request);
    if (path.startsWith('/sub/') && method === 'GET') return this.subscription(path.slice('/sub/'.length));

    // These paths are only ever called from the Worker; not publicly forwarded.
    if (path.startsWith('/internal/')) return this.internal(request, path);

    if (!path.startsWith('/admin/')) return fail('پیدا نشد.', 404);
    const auth = await this.session(request, !['GET', 'HEAD'].includes(method));
    if (!auth) return fail('نشست معتبر نیست؛ دوباره وارد شوید.', 401);
    if (path === '/admin/me' && method === 'GET') return reply({ ok: true, csrf: auth.csrf });
    if (path === '/admin/logout' && method === 'POST') {
      const token = /madar_session=([A-Za-z0-9_-]+)/.exec(request.headers.get('cookie') || '')?.[1];
      if (token) await this.storage.delete(`session:${await digest(token)}`);
      return reply({ ok: true }, 200, { 'set-cookie': cookie('', 0) });
    }
    if (path === '/admin/state' && method === 'GET') {
      const { settings, products } = await this.config();
      const ids = (await this.storage.get('orderIndex')) || [];
      const orders = (await Promise.all(ids.slice(0, 200).map((id) => this.storage.get(`order:${id}`)))).filter(Boolean).map(({ receiptHash, accessToken, ...safe }) => safe);
      return reply({ ok: true, settings, products, orders, bot: (await this.storage.get('bot')) ? { enabled: true, status: (await this.storage.get('botStatus')) || 'تنظیم نشده' } : { enabled: false, status: 'تنظیم نشده' }, aiHistory: (await this.storage.get('aiHistory')) || [] });
    }
    if (path === '/admin/settings' && method === 'PUT') return this.updateSettings(request);
    if (path === '/admin/password' && method === 'POST') return this.changePassword(request);
    if (path === '/admin/products' && method === 'POST') return this.updateProduct(request);
    if (path.startsWith('/admin/products/') && ['PUT', 'DELETE'].includes(method)) return this.updateProduct(request, path.slice('/admin/products/'.length));
    if (path.startsWith('/admin/orders/') && method === 'PATCH') return this.reviewOrder(request, path.slice('/admin/orders/'.length));
    if (path === '/admin/bot' && method === 'POST') return this.updateBot(request);
    if (path === '/admin/ai/context' && method === 'GET') {
      const { settings, products } = await this.config();
      return reply({ ok: true, settings, products, history: (await this.storage.get('aiHistory')) || [] });
    }
    if (path === '/admin/ai/history' && method === 'POST') {
      const { message, reply: answer } = await body(request);
      const next = [...((await this.storage.get('aiHistory')) || []), { role: 'user', text: trimText(message, 450, 'پیام', true) }, { role: 'assistant', text: trimText(answer, 500, 'پاسخ') }].slice(-3);
      await this.storage.put('aiHistory', next);
      return reply({ ok: true, history: next });
    }
    if (path === '/admin/ai/apply' && method === 'POST') return this.applyProposal(request);
    return fail('پیدا نشد.', 404);
  }

  async setup(request) {
    const data = await body(request);
    if (data.setupAuthorized !== true) return fail('کلید نصب معتبر نیست.', 403);
    if (typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) throw new InputError('رمز مدیریت باید حداقل ۸ نویسه و حداکثر ۱۲۸ نویسه باشد.');
    return this.locked(async () => {
      if (await this.storage.get('admin')) return fail('نصب قبلاً انجام شده است.', 409);
      const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const hash = await passwordHash(data.password, salt);
      const settings = validateSettings({ siteName: data.siteName || DEFAULT_SETTINGS.siteName, usdToToman: data.usdToToman || DEFAULT_SETTINGS.usdToToman });
      await this.storage.put('settings', settings);
      await this.storage.put('products', DEFAULT_PRODUCTS.map((p) => ({ ...p, features: [...p.features] })));
      if (data.botCipher && data.webhookSecret) await this.storage.put('bot', { cipher: data.botCipher, webhookSecret: data.webhookSecret });
      await this.storage.put('admin', { salt, hash }); // last: never mark initialized before all writes succeed
      const session = await this.newSession();
      return reply({ ok: true, csrf: session.csrf, botConfigured: !!data.botCipher }, 201, { 'set-cookie': cookie(session.token) });
    });
  }

  async login(request) {
    const { password } = await body(request);
    const ip = await digest(String(request.headers.get('x-market-ip') || 'unknown'));
    return this.locked(async () => {
      const throttleKey = `login:${ip}`;
      const throttle = (await this.storage.get(throttleKey)) || { count: 0, until: 0 };
      if (throttle.until > Date.now() && throttle.count >= 5) return fail('ورود موقتاً محدود شده؛ ۱۵ دقیقهٔ دیگر امتحان کنید.', 429);
      const admin = await this.storage.get('admin');
      if (!admin) return fail('ابتدا نصب اولیه را انجام دهید.', 409);
      const hash = typeof password === 'string' ? await passwordHash(password, admin.salt) : '';
      if (!equal(hash, admin.hash)) {
        const fresh = throttle.until > Date.now() ? throttle.count : 0;
        await this.storage.put(throttleKey, { count: fresh + 1, until: Date.now() + 15 * 60_000 });
        return fail('رمز نادرست است.', 401);
      }
      await this.storage.delete(throttleKey);
      const session = await this.newSession();
      return reply({ ok: true, csrf: session.csrf }, 200, { 'set-cookie': cookie(session.token) });
    });
  }

  async updateSettings(request) {
    const data = await body(request);
    return this.locked(async () => {
      const { settings } = await this.config();
      const updated = validateSettings(data, settings);
      await this.storage.put('settings', updated);
      return reply({ ok: true, settings: updated });
    });
  }

  async changePassword(request) {
    const { currentPassword, newPassword } = await body(request);
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) throw new InputError('رمز جدید باید ۸ تا ۱۲۸ نویسه داشته باشد.');
    return this.locked(async () => {
      const admin = await this.storage.get('admin');
      const currentHash = typeof currentPassword === 'string' ? await passwordHash(currentPassword, admin.salt) : '';
      if (!equal(currentHash, admin.hash)) return fail('رمز فعلی نادرست است.', 403);
      const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      await this.storage.put('admin', { salt, hash: await passwordHash(newPassword, salt) });
      const sessions = await this.storage.list({ prefix: 'session:' });
      await Promise.all([...sessions.keys()].map((key) => this.storage.delete(key)));
      return reply({ ok: true, message: 'رمز تغییر کرد؛ تمام نشست‌ها خارج شدند.' }, 200, { 'set-cookie': cookie('', 0) });
    });
  }

  async updateProduct(request, id = '') {
    const data = request.method === 'DELETE' ? null : await body(request);
    return this.locked(async () => {
      const { products } = await this.config();
      if (request.method === 'DELETE') {
        if (!products.some((p) => p.id === id)) return fail('طرح پیدا نشد.', 404);
        await this.storage.put('products', products.filter((p) => p.id !== id));
        return reply({ ok: true });
      }
      if (id && !products.some((p) => p.id === id)) return fail('طرح پیدا نشد.', 404);
      if (!id && products.length >= 12) return fail('حداکثر ۱۲ طرح مجاز است.', 409);
      const product = validateProduct(data, id || undefined);
      if (!id && products.some((p) => p.id === product.id)) return fail('شناسهٔ تکراری است.', 409);
      await this.storage.put('products', id ? products.map((p) => p.id === id ? product : p) : [...products, product]);
      return reply({ ok: true, product }, id ? 200 : 201);
    });
  }

  async order(request) {
    if (!(await this.storage.get('admin'))) return fail('ابتدا فروشگاه را راه‌اندازی کنید.', 409);
    const data = await body(request);
    const name = trimText(data.name, 70, 'نام', true);
    const contact = trimText(data.contact, 100, 'راه ارتباطی', true);
    const note = trimText(data.note || '', 300, 'یادداشت');
    const ip = await digest(String(request.headers.get('x-market-ip') || 'unknown'));
    return this.locked(async () => {
      const { settings, products } = await this.config();
      const plan = publicCatalog(settings, products).find((p) => p.id === data.productId && p.tier === 'paid');
      if (!plan) return fail('طرح پولی در دسترس نیست.', 404);
      const currentPrice = tomanPrice(plan.priceUSD, settings.usdToToman);
      if (!Number.isSafeInteger(data.expectedPriceToman) || data.expectedPriceToman !== currentPrice) return fail('قیمت طرح تغییر کرده است؛ قیمت تازه را بررسی و دوباره ثبت کنید.', 409);
      const key = `orderLimit:${ip}`;
      const limit = (await this.storage.get(key)) || { count: 0, until: 0 };
      if (limit.until > Date.now() && limit.count >= 3) return fail('برای ثبت سفارش جدید یک ساعت صبر کنید.', 429);
      const index = (await this.storage.get('orderIndex')) || [];
      if (index.length >= 2000) return fail('ظرفیت سفارش‌های این استقرار پر است؛ با پشتیبانی تماس بگیرید.', 503);
      const id = random(9);
      const receipt = random(32);
      const order = { id, productId: plan.id, productName: plan.name, tier: 'paid', durationDays: plan.durationDays, priceUSD: plan.priceUSD, priceToman: currentPrice, exchangeRate: settings.usdToToman, name, contact, note, status: 'pending', createdAt: new Date().toISOString(), receiptHash: await digest(receipt) };
      await this.storage.put(`order:${id}`, order);
      await this.storage.put('orderIndex', [id, ...index]);
      await this.storage.put(key, { count: limit.until > Date.now() ? limit.count + 1 : 1, until: Date.now() + 3_600_000 });
      return reply({ ok: true, id, receipt, status: 'pending', priceToman: order.priceToman, message: 'پرداخت خودکار فعال نیست؛ سفارش پس از بررسی دستی تأیید می‌شود. کد پیگیری را نگه دارید.' }, 201);
    });
  }

  async orderStatus(request, id) {
    if (!/^[A-Za-z0-9_-]{12}$/.test(id)) return fail('سفارش پیدا نشد.', 404);
    const { receipt = '' } = await body(request);
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(receipt)) return fail('کد پیگیری معتبر نیست.', 403);
    const order = await this.storage.get(`order:${id}`);
    if (!order || !equal(order.receiptHash, await digest(receipt))) return fail('سفارش پیدا نشد.', 404);
    const { receiptHash, accessToken, ...safe } = order;
    return reply({ ok: true, order: { ...safe, ...(accessToken ? { subscriptionUrl: `/api/v1/sub/${accessToken}` } : {}) } });
  }

  async reviewOrder(request, id) {
    const { status } = await body(request);
    if (!['approved', 'rejected', 'revoked'].includes(status)) throw new InputError('وضعیت نامعتبر است.');
    return this.locked(async () => {
      const order = await this.storage.get(`order:${id}`);
      if (!order) return fail('سفارش پیدا نشد.', 404);
      if (status === 'revoked') {
        if (order.status !== 'approved') return fail('فقط دسترسی تأییدشده قابل لغو است.', 409);
        const subKey = `sub:${await digest(order.accessToken)}`;
        const access = await this.storage.get(subKey);
        if (access) await this.storage.delete(`access:${access.uuid}`);
        await this.storage.delete(subKey);
        delete order.accessToken;
        order.status = 'revoked';
        order.reviewedAt = new Date().toISOString();
        await this.storage.put(`order:${id}`, order);
        return reply({ ok: true, id, status: 'revoked' });
      }
      if (order.status !== 'pending') return fail('این سفارش قبلاً بررسی شده است.', 409);
      order.status = status;
      order.reviewedAt = new Date().toISOString();
      if (status === 'approved') {
        const uuid = crypto.randomUUID();
        const accessToken = random(32);
        const expiresAt = Date.now() + order.durationDays * 86_400_000;
        await this.storage.put(`access:${uuid}`, { uuid, tier: 'paid', expiresAt });
        await this.storage.put(`sub:${await digest(accessToken)}`, { uuid, tier: 'paid', expiresAt });
        order.accessToken = accessToken;
        order.expiresAt = new Date(expiresAt).toISOString();
      }
      await this.storage.put(`order:${id}`, order);
      return reply({ ok: true, id, status, expiresAt: order.expiresAt || null });
    });
  }

  async activateFree(request) {
    if (!(await this.storage.get('admin'))) return fail('ابتدا فروشگاه را راه‌اندازی کنید.', 409);
    const ip = await digest(String(request.headers.get('x-market-ip') || 'unknown'));
    return this.locked(async () => {
      const { settings, products } = await this.config();
      const plan = publicCatalog(settings, products).find((p) => p.tier === 'free');
      if (!plan) return fail('طرح رایگان فعال نیست.', 404);
      const key = `freeLimit:${ip}`;
      const last = await this.storage.get(key);
      if (last && last > Date.now()) return fail('دسترسی آزمایشی این شبکه قبلاً فعال شده است؛ بعداً دوباره امتحان کنید.', 429);
      const uuid = crypto.randomUUID();
      const token = random(32);
      const expiresAt = Date.now() + plan.durationDays * 86_400_000;
      await this.storage.put(`access:${uuid}`, { uuid, tier: 'free', expiresAt });
      await this.storage.put(`sub:${await digest(token)}`, { uuid, tier: 'free', expiresAt });
      await this.storage.put(key, Date.now() + 86_400_000);
      return reply({ ok: true, subscriptionUrl: `/api/v1/sub/${token}`, expiresAt: new Date(expiresAt).toISOString(), note: 'برای استفادهٔ واقعی، کانفیگ را در کلاینت VLESS سازگار وارد کنید.' }, 201);
    });
  }

  async subscription(token) {
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return fail('اشتراک پیدا نشد.', 404);
    const access = await this.storage.get(`sub:${await digest(token)}`);
    const { settings } = await this.config();
    if (!access || access.expiresAt < Date.now() || !(await this.storage.get(`access:${access.uuid}`)) || !(access.tier === 'free' ? settings.freeEnabled : settings.paidEnabled)) return fail('اشتراک نامعتبر یا منقضی است.', 403);
    return reply({ ok: true, uuid: access.uuid, tier: access.tier, expiresAt: new Date(access.expiresAt).toISOString(), siteName: settings.siteName });
  }

  async updateBot(request) {
    const { botCipher, webhookSecret, clear } = await body(request);
    if (!clear && (!botCipher?.data || !botCipher?.iv || !webhookSecret)) throw new InputError('اطلاعات ربات نامعتبر است.');
    await this.storage.put('botStatus', clear ? 'غیرفعال' : 'در انتظار ثبت webhook');
    if (clear) await this.storage.delete('bot');
    else await this.storage.put('bot', { cipher: botCipher, webhookSecret });
    return reply({ ok: true, enabled: !clear });
  }

  async applyProposal(request) {
    const data = await body(request);
    return this.locked(async () => {
      const { settings, products } = await this.config();
      const proposal = normalizeAiProposal(data, settings, products);
      let nextSettings = settings;
      let nextProducts = products;
      if (proposal.changes.settings) nextSettings = validateSettings(proposal.changes.settings, settings);
      if (proposal.changes.products) nextProducts = products.map((p) => {
        const change = proposal.changes.products.find((c) => c.id === p.id);
        return change ? validateProduct({ ...p, ...change }, p.id) : p;
      });
      await this.storage.put('settings', nextSettings);
      await this.storage.put('products', nextProducts);
      return reply({ ok: true, settings: nextSettings, products: nextProducts });
    });
  }

  async internal(request, path) {
    if (path === '/internal/access' && request.method === 'POST') {
      const { uuid } = await body(request);
      const entry = await this.storage.get(`access:${uuid}`);
      const { settings } = await this.config();
      return reply({ ok: true, allowed: !!entry && entry.expiresAt > Date.now() && (entry.tier === 'free' ? settings.freeEnabled : settings.paidEnabled) });
    }
    if (path === '/internal/bot' && request.method === 'GET') return reply({ ok: true, bot: (await this.storage.get('bot')) || null });
    if (path === '/internal/bot/status' && request.method === 'POST') {
      const { status } = await body(request);
      await this.storage.put('botStatus', trimText(status, 180, 'وضعیت ربات'));
      return reply({ ok: true });
    }
    if (path === '/internal/rate' && request.method === 'POST') {
      const { usdToToman } = await body(request);
      return this.locked(async () => {
        const { settings } = await this.config();
        const updated = validateSettings({ usdToToman }, settings);
        updated.rateSource = 'provider';
        await this.storage.put('settings', updated);
        return reply({ ok: true, usdToToman });
      });
    }
    return fail('پیدا نشد.', 404);
  }
}
