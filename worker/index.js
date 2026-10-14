/**
 * ورودی Worker — همان اپی که روی Cloudflare Pages هم اجرا می‌شود،
 * به‌علاوهٔ سرور سیگنالینگ (Durable Object) در همین فایل.
 */
import { handleApi } from '../shared/api.js';
import { handleMarket, updateExchangeRate } from './market-api.js';

export { Room } from './room.js';
export { MarketState } from './market-state.js';

const htmlHeaders = { 'content-type': 'text/html; charset=utf-8' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // New storefront, admin and narrow TCP bridge. Legacy meeting routes remain available.
    if (url.pathname.startsWith('/api/v1/') || url.pathname === '/edge') {
      return handleMarket(request, env, ctx);
    }
    if (url.pathname.startsWith('/api/')) {
      return handleApi({ request, env, rooms: env.ROOMS });
    }

    // Extensionless URLs must resolve to actual HTML on both Workers and Pages.
    const pages = { '/panel': '/panel/index.html', '/app': '/app/index.html', '/setup': '/setup/index.html', '/meet': '/meet/index.html' };
    if (pages[url.pathname] && env.ASSETS) {
      const target = new URL(request.url);
      target.pathname = pages[url.pathname];
      const response = await env.ASSETS.fetch(new Request(target, { headers: request.headers }));
      return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), 'cache-control': 'no-store' } });
    }

    // صفحهٔ اتاق: /r/CODE  →  /room/index.html
    // (چون فایل استاتیک نیست، خودمان از binding می‌خوانیم)
    if (url.pathname === '/r' || url.pathname.startsWith('/r/')) {
      if (!env.ASSETS) return new Response('ASSETS binding missing', { status: 500 });
      const u = new URL(request.url);
      u.pathname = '/room/index.html';
      u.search = '';
      const res = await env.ASSETS.fetch(new Request(u.toString(), { headers: request.headers }));
      const body = await res.text();
      return new Response(body, { status: 200, headers: { ...htmlHeaders, 'cache-control': 'no-cache' } });
    }

    // بقیهٔ درخواست‌ها = فایل‌های استاتیک (public/)
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  },
  async scheduled(_event, env, ctx) {
    if (env.FX_RATE_URL) ctx.waitUntil(updateExchangeRate(env).catch(() => { /* keep last known rate */ }));
  },
};
