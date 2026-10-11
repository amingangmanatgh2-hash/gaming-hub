/**
 * ورودی Worker — همان اپی که روی Cloudflare Pages هم اجرا می‌شود،
 * به‌علاوهٔ سرور سیگنالینگ (Durable Object) در همین فایل.
 */
import { handleApi } from '../shared/api.js';

export { Room } from './room.js';

const htmlHeaders = { 'content-type': 'text/html; charset=utf-8' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API + سیگنالینگ WebSocket
    if (url.pathname.startsWith('/api/')) {
      return handleApi({ request, env, rooms: env.ROOMS });
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
};
