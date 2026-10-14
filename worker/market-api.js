import { InputError, normalizeAiProposal, vlessLinks } from '../shared/market.js';
import { handleEdge } from './edge.js';

const encoder = new TextEncoder();
const API_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: API_HEADERS });
const error = (message, status = 400) => json({ ok: false, error: message }, status);
const random = (n = 32) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function stubFor(env) {
  return env.MARKET?.get(env.MARKET.idFromName('shop')) || null;
}
async function forward(stub, request, path, extra = null, method = request.method) {
  const headers = new Headers(request.headers);
  // Never trust a client-supplied x-market-ip. Cloudflare sets cf-connecting-ip at its edge.
  headers.set('x-market-ip', request.headers.get('cf-connecting-ip') || 'local-preview');
  headers.delete('content-length');
  headers.delete('transfer-encoding');
  if (extra) headers.set('content-type', 'application/json');
  let payload;
  if (!['GET', 'HEAD'].includes(method)) {
    if (extra) payload = JSON.stringify(extra);
    else {
      if (Number(request.headers.get('content-length')) > 16_384) throw new InputError('درخواست بیش از حد بزرگ است.', 413);
      const reader = request.body?.getReader();
      const chunks = []; let size = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16_384) { await reader.cancel(); throw new InputError('درخواست بیش از حد بزرگ است.', 413); }
          chunks.push(value);
        }
      }
      const bytes = new Uint8Array(size); let cursor = 0;
      for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.byteLength; }
      payload = bytes;
    }
  }
  return stub.fetch(new Request(`https://state${path}`, { method, headers, body: payload }));
}
async function readBody(request, max = 16_384) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InputError('JSON لازم است.', 415);
  if (Number(request.headers.get('content-length')) > max) throw new InputError('درخواست بیش از حد بزرگ است.', 413);
  const raw = await request.text();
  if (raw.length > max) throw new InputError('درخواست بیش از حد بزرگ است.', 413);
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad');
    return data;
  } catch { throw new InputError('JSON نامعتبر است.'); }
}
function secretReady(env) { return typeof env.APP_SECRET === 'string' && env.APP_SECRET.length >= 32; }
async function aesKey(env) {
  if (!secretReady(env)) throw new InputError('برای ذخیرهٔ توکن ربات، APP_SECRET را به‌صورت Secret با حداقل ۳۲ نویسه تنظیم کنید.', 503);
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(env.APP_SECRET));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function fromBase64(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
}
function toBase64(value) { return btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
async function encryptBot(env, token) {
  if (!/^\d{5,12}:[A-Za-z0-9_-]{30,}$/.test(token)) throw new InputError('فرمت توکن BotFather معتبر نیست.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), encoder.encode(token));
  return { iv: toBase64(iv), data: toBase64(data) };
}
async function decryptBot(env, cipher) {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(cipher.iv) }, await aesKey(env), fromBase64(cipher.data));
  return new TextDecoder().decode(plaintext);
}
async function botStatus(stub, status) {
  await stub.fetch('https://state/internal/bot/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
}
async function telegramCall(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || !result.ok) throw new Error('Telegram API rejected request');
  return result;
}
async function registerWebhook(token, secret, origin, stub) {
  try {
    if (!origin.startsWith('https://')) throw new Error('HTTPS required');
    await telegramCall(token, 'setWebhook', {
      url: `${origin}/api/v1/telegram/webhook`, secret_token: secret,
      allowed_updates: ['message'], drop_pending_updates: false,
    });
    await botStatus(stub, 'وب‌هوک فعال است');
  } catch { await botStatus(stub, 'ثبت webhook ناموفق بود؛ دامنهٔ HTTPS و توکن را بررسی کنید.'); }
}
async function telegramWebhook(request, env, stub, ctx) {
  const record = await (await stub.fetch('https://state/internal/bot')).json();
  if (!record.bot || !safeEqual(request.headers.get('x-telegram-bot-api-secret-token'), record.bot.webhookSecret)) return error('دسترسی غیرمجاز.', 403);
  const update = await readBody(request, 16_384);
  const msg = update.message;
  if (!msg?.chat?.id || typeof msg.text !== 'string' || msg.text.length > 500) return json({ ok: true });
  const botToken = await decryptBot(env, record.bot.cipher);
  const catalog = await (await stub.fetch('https://state/public')).json();
  const shop = catalog.settings.siteName;
  const origin = new URL(request.url).origin;
  const command = msg.text.split(/\s+/)[0].split('@')[0].toLowerCase();
  let text = `${shop} ✦\nبرای دیدن طرح‌ها /plans و برای راهنما /help را بفرستید.`;
  if (command === '/plans') {
    text = `${shop} | طرح‌های فعال\n\n${catalog.products.map((p) => `${p.name}: ${p.tier === 'free' ? 'رایگان' : `${new Intl.NumberFormat('fa-IR').format(p.priceToman)} تومان`} (${p.durationDays} روز)`).join('\n') || 'فعلاً طرح فعالی وجود ندارد.'}\n\nسفارش و دریافت کانفیگ: ${origin}`;
  } else if (command === '/help') {
    text = `سفارش‌ها در ${origin} ثبت می‌شوند و پس از بررسی دستی فعال می‌شوند. برای اتصال، کلاینت سازگار با VLESS/TLS/WebSocket لازم است. این سرویس دسترسی روی شبکهٔ داخلیِ جداشده را تضمین نمی‌کند.`;
  }
  ctx.waitUntil(telegramCall(botToken, 'sendMessage', { chat_id: msg.chat.id, text, disable_web_page_preview: true }).catch(() => {}));
  return json({ ok: true });
}

async function aiSuggestion(request, env, stub) {
  const { message } = await readBody(request); // drain the request even when AI is unavailable
  if (typeof message !== 'string' || message.trim().length < 3 || message.length > 450) throw new InputError('فرمان باید بین ۳ تا ۴۵۰ نویسه باشد.');
  // Verify admin session before spending inference quota.
  const contextResponse = await forward(stub, request, '/admin/ai/context', null, 'GET');
  if (!contextResponse.ok) return contextResponse;
  if (!env.AI) return error('Workers AI متصل نیست. Binding با نام AI را فعال کنید.', 503);
  const context = await contextResponse.json();
  const system = `You are a shop settings assistant. Respond with ONLY a valid JSON object: {"reply":"short Persian explanation","changes":{"settings":{},"products":[]}}. Only use these settings keys: siteName, tagline, announcement, usdToToman (integer tomans per USD 1000..20000000), supportUsername, accent (mint|violet|amber), freeEnabled, paidEnabled. Products changes can ONLY include id and priceUSD or enabled. IDs MUST be existing. No code, no other keys, no markdown. If ambiguous explain in reply and use empty changes. Never claim a VPN can bypass a disconnected national network. Do not invent exchange rates or imply real-time FX. No change takes effect until admin confirms.`;
  let result;
  try {
    result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ recent: context.history.slice(-3), settings: context.settings, products: context.products.map(({ id, name, tier, priceUSD, enabled }) => ({ id, name, tier, priceUSD, enabled })), instruction: message }) },
      ], max_tokens: 450,
    });
  } catch { return error('سرویس Workers AI در دسترس نیست؛ تنظیمات را دستی تغییر دهید.', 503); }
  const raw = typeof result === 'string' ? result : result?.response;
  if (typeof raw !== 'string') return error('پاسخ AI قابل تفسیر نبود.', 422);
  let suggestion;
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    suggestion = normalizeAiProposal(parsed, context.settings, context.products);
  } catch { return error('تغییر قابل‌اعمالی پیشنهاد نشد؛ فرمان را دقیق‌تر بنویسید.', 422); }
  await forward(stub, request, '/admin/ai/history', { message, reply: suggestion.reply }, 'POST');
  return json({ ok: true, proposal: suggestion, notice: 'این فقط پیش‌نمایش است؛ برای اعمال، تأیید مدیر لازم است.' });
}

export async function handleMarket(request, env, ctx) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const stub = stubFor(env);
    if (!stub) return error('اتصال MARKET به Durable Object تنظیم نشده است.', 503);
    if (path === '/edge') return handleEdge(request, stub, ctx);
    if (!path.startsWith('/api/v1/')) return error('پیدا نشد.', 404);
    const route = path.slice('/api/v1'.length);
    if (route === '/health' && request.method === 'GET') return json({ ok: true, app: 'madar', runtime: 'cloudflare-worker', tcpOnly: true, now: new Date().toISOString() });
    if (route === '/ping' && request.method === 'GET') return json({ ok: true, colo: request.cf?.colo || 'unknown', now: Date.now() });
    if (route === '/setup/status' && request.method === 'GET') {
      const status = await (await stub.fetch('https://state/status')).json();
      return json({ ...status, setupKeyConfigured: typeof env.SETUP_KEY === 'string' && env.SETUP_KEY.length >= 24, botEncryptionConfigured: secretReady(env), aiConfigured: !!env.AI });
    }
    if (route === '/telegram/webhook' && request.method === 'POST') return telegramWebhook(request, env, stub, ctx);
    // JSON mutation endpoints are same-origin only. CSRF token is independently verified by the DO.
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return error('مبدأ درخواست معتبر نیست.', 403);
      if (request.headers.get('sec-fetch-site') === 'cross-site') return error('درخواست از سایت دیگر مجاز نیست.', 403);
    }
    if (route === '/setup' && request.method === 'POST') {
      if (typeof env.SETUP_KEY !== 'string' || env.SETUP_KEY.length < 24) return error('قبل از نصب، SETUP_KEY با حداقل ۲۴ نویسه را در Secretهای Worker تنظیم کنید.', 503);
      const data = await readBody(request);
      if (!safeEqual(data.setupKey, env.SETUP_KEY)) return error('کلید نصب معتبر نیست.', 403);
      const token = data.botToken?.trim();
      const extra = { setupAuthorized: true, password: data.password, siteName: data.siteName, usdToToman: data.usdToToman };
      if (token) {
        extra.botCipher = await encryptBot(env, token);
        extra.webhookSecret = random(32);
      }
      const response = await forward(stub, request, '/setup', extra);
      if (response.ok && token) ctx.waitUntil(registerWebhook(token, extra.webhookSecret, url.origin, stub));
      return response;
    }
    if (route === '/admin/bot' && request.method === 'POST') {
      const data = await readBody(request);
      const token = data.token?.trim();
      const extra = data.clear ? { clear: true } : { botCipher: await encryptBot(env, token), webhookSecret: random(32) };
      const response = await forward(stub, request, '/admin/bot', extra);
      if (response.ok && token) ctx.waitUntil(registerWebhook(token, extra.webhookSecret, url.origin, stub));
      return response;
    }
    if (route === '/admin/ai' && request.method === 'POST') return aiSuggestion(request, env, stub);
    if (route.startsWith('/sub/') && request.method === 'GET') {
      const response = await forward(stub, request, route);
      if (!response.ok) return response;
      const access = await response.json();
      const host = String(env.EDGE_HOST || url.hostname).toLowerCase();
      const links = vlessLinks({ uuid: access.uuid, hostname: host, siteName: access.siteName });
      if (url.searchParams.get('format') === 'json') return json({ ok: true, links, expiresAt: access.expiresAt, tier: access.tier, endpoint: host });
      const plain = links.join('\n');
      const encoded = btoa(String.fromCharCode(...encoder.encode(plain)));
      return new Response(url.searchParams.get('format') === 'plain' ? plain : encoded, {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline; filename="madar-subscription.txt"' },
      });
    }
    const paths = [
      ['/public', 'GET'], ['/login', 'POST'], ['/orders', 'POST'], ['/activate/free', 'POST'],
      ['/admin/me', 'GET'], ['/admin/logout', 'POST'], ['/admin/state', 'GET'], ['/admin/settings', 'PUT'], ['/admin/password', 'POST'],
      ['/admin/products', 'POST'], ['/admin/ai/apply', 'POST'],
    ];
    if (paths.some(([p, m]) => route === p && request.method === m)
      || (/^\/orders\/[A-Za-z0-9_-]{12}\/status$/.test(route) && request.method === 'POST')
      || (/^\/admin\/products\/[a-z0-9-]{2,24}$/.test(route) && ['PUT', 'DELETE'].includes(request.method))
      || (/^\/admin\/orders\/[A-Za-z0-9_-]{12}$/.test(route) && request.method === 'PATCH')) {
      return forward(stub, request, route + (route.startsWith('/orders/') ? url.search : ''));
    }
    return error('پیدا نشد.', 404);
  } catch (err) {
    return err instanceof InputError ? error(err.message, err.status) : error('خطای موقت سرویس.', 500);
  }
}

export async function updateExchangeRate(env) {
  if (!env.FX_RATE_URL) return { ok: false, reason: 'FX_RATE_URL is not configured' };
  const url = new URL(env.FX_RATE_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('FX_RATE_URL must be HTTPS');
  const res = await fetch(url.toString(), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('FX provider unavailable');
  const raw = await res.text();
  if (raw.length > 4096) throw new Error('FX provider response too large');
  const rate = JSON.parse(raw).usdToToman;
  const stub = stubFor(env);
  if (!stub) throw new Error('MARKET binding missing');
  const updated = await stub.fetch('https://state/internal/rate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usdToToman: rate }) });
  if (!updated.ok) throw new Error('Invalid FX rate');
  return { ok: true, rate };
}
