// همیار پلاس روی Cloudflare Workers: API + فایل‌های استاتیک سایت (public/)
// دپلوی:  npx wrangler deploy   (از پوشهٔ hamyar-plus)
import catalog from '../public/data/catalog.json';
import { handleApi } from './api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, catalog);

    // دارایی‌های استاتیک (همان فایل‌هایی که داخل APK و EXE هم هست)
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set('x-content-type-options', 'nosniff');
      out.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
      out.headers.set('x-frame-options', 'SAMEORIGIN');
      if (url.pathname.startsWith('/data/')) out.headers.set('cache-control', 'public, max-age=3600');
      if (url.pathname.startsWith('/fonts/')) { out.headers.set('cache-control', 'public, max-age=31536000, immutable'); out.headers.set('access-control-allow-origin', '*'); }
      if (url.pathname.endsWith('/sw.js') || url.pathname === '/sw.js') out.headers.set('cache-control', 'no-cache');
      return out;
    }
    return new Response(JSON.stringify({ ok: false, error: 'assets_not_configured', hint: 'wrangler.toml بخش [assets] را بررسی کنید' }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } });
  },
};
