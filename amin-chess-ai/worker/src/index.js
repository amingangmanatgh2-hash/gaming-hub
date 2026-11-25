/* AMIN CHESS AI — بک‌اند امن اختیاری روی Cloudflare Workers
 *
 * چرا؟ اگر کاربر نخواهد توکن‌ها در مرورگر (IndexedDB) بمانند، می‌تواند این
 * Worker را با Secrets خودش مستقر کند؛ اپلیکیشن به‌جای فراخوانی مستقیم
 * Cloudflare/Groq از این پروکسی امن استفاده می‌کند. توکن‌ها هرگز به کلاینت
 * برنمی‌گردند.
 *
 * مستقرسازی:
 *   1) wrangler secret put CF_ACCOUNT_ID
 *   2) wrangler secret put CF_API_TOKEN
 *   3) wrangler secret put GROQ_API_KEY      (اختیاری)
 *   4) wrangler deploy
 *
 * امنیت: CORS فقط برای دامنه‌های مجاز؛ rate-limit ساده در حافظه.
 */

const ALLOWED_ORIGINS = ['*']; /* برای توسعه؛ در استقرار واقعی دامنه خودت را بگذار */

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes('*') ? '*' : origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

/* rate limit ساده برای هر IP */
const hits = new Map();
function limited(env, req) {
  const ip = req.headers.get('cf-connecting-ip') || 'x';
  const now = Date.now();
  const win = 60000, max = 20;
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > win) { rec.n = 0; rec.t = now; }
  rec.n++;
  hits.set(ip, rec);
  if (hits.size > 5000) hits.clear();
  return rec.n > max;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, name: 'amin-chess-ai-proxy' }), { headers: cors(origin) });
    }
    if (request.method !== 'POST' || url.pathname !== '/api/chat') {
      return new Response(JSON.stringify({ error: 'یافت نشد' }), { status: 404, headers: cors(origin) });
    }
    if (limited(env, request)) {
      return new Response(JSON.stringify({ error: 'درخواست‌های بیش از حد — کمی صبر کن' }), { status: 429, headers: cors(origin) });
    }

    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: 'JSON نامعتبر' }), { status: 400, headers: cors(origin) });
    }
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : null;
    if (!messages) {
      return new Response(JSON.stringify({ error: 'messages لازم است' }), { status: 400, headers: cors(origin) });
    }

    /* انتخاب سرویس: ترجیح Groq اگر تنظیم شده، در غیر این صورت Cloudflare */
    if (env.GROQ_API_KEY) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: body.model || 'llama-3.1-8b-instant', messages, max_tokens: body.max_tokens || 700 })
        });
        const j = await r.json();
        const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (text) return new Response(JSON.stringify({ text, provider: 'groq' }), { headers: cors(origin) });
      } catch (e) { /* به Cloudflare می‌رویم */ }
    }
    if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
      try {
        const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID + '/ai/run/@cf/meta/llama-3.1-8b-instruct', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.CF_API_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, max_tokens: body.max_tokens || 700 })
        });
        const j = await r.json();
        const text = j.result && (j.result.response || j.result.text);
        if (text) return new Response(JSON.stringify({ text, provider: 'cloudflare' }), { headers: cors(origin) });
      } catch (e) { /* پایین */ }
    }
    return new Response(JSON.stringify({ error: 'هیچ سرویسی روی Worker تنظیم نشده است' }), { status: 503, headers: cors(origin) });
  }
};
