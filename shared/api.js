/**
 * مسیرهای API مشترک بین Workers و Pages Functions (یک کد، دو بستر اجرا)
 */
import { cleanCode, randomCode, LIMITS } from './protocol.js';
import { iceServersCached } from './turn.js';

const NO_STORE = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: NO_STORE });

export async function handleApi({ request, env, rooms, params }) {
  const url = new URL(request.url);
  const path = '/' + (Array.isArray(params?.path) ? params.path.join('/') : url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, ''));
  const p = path === '/' ? '/api' : `/api${path}`;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: NO_STORE });

  const cfg = {
    ttlHours: Number(env.ROOM_TTL_HOURS || LIMITS.TTL_DEFAULT_HOURS),
    grace: Number(env.EMPTY_GRACE_SECONDS || LIMITS.GRACE_DEFAULT_SEC),
    maxP: Number(env.MAX_PARTICIPANTS || 12),
    turn: !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN),
  };

  if (p === '/api/health') {
    return json({
      ok: true,
      app: 'hamkalam',
      ts: Date.now(),
      runtime: rooms ? 'workers-durable-objects' : 'no-durable-objects',
      turn: cfg.turn,
    });
  }

  if (p === '/api/config') {
    return json({ ok: true, ...cfg, maxP: Math.min(cfg.maxP, LIMITS.PARTICIPANTS_HARD), version: 1 });
  }

  if (p === '/api/ice') {
    const ice = await iceServersCached(env);
    return json({ ok: true, ...ice, iceServers: ice.servers });
  }

  // ساخت اتاق
  if (p === '/api/room' && request.method === 'POST') {
    if (!rooms) {
      // بدون Durable Object: کد تصادفی برمی‌گردانیم و اتاق در اولین اتصال ساخته می‌شود
      return json({ ok: true, code: randomCode(7), degraded: true, ttlHours: cfg.ttlHours, maxP: cfg.maxP });
    }
    let body = {};
    try {
      body = await request.json();
    } catch { /* ignore */ }
    let code = '';
    for (let i = 0; i < 6; i++) {
      const cand = randomCode(body.words ? 5 : 7);
      const stub = rooms.get(rooms.idFromName(cand));
      const r = await stub.fetch(`https://room/room/${cand}?info=1`);
      const info = await r.json().catch(() => ({}));
      if (!info.exists) {
        code = cand;
        break;
      }
    }
    if (!code) return json({ ok: false, error: 'collision' }, 500);
    const stub = rooms.get(rooms.idFromName(code));
    const r = await stub.fetch(`https://room/room/${code}?create=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return json({ ok: true, ...data, ttlHours: cfg.ttlHours, maxP: cfg.maxP });
  }

  // وضعیت اتاق
  if (p.startsWith('/api/room/') && request.method === 'GET') {
    const code = cleanCode(p.split('/')[3]);
    if (!code) return json({ ok: false, error: 'bad_code' }, 400);
    if (!rooms) return json({ ok: true, code, exists: null, degraded: true });
    const stub = rooms.get(rooms.idFromName(code));
    const r = await stub.fetch(`https://room/room/${code}?info=1`);
    const info = await r.json();
    return json({ ok: true, code, ...info, maxP: cfg.maxP, ttlHours: cfg.ttlHours });
  }

  // سیگنالینگ WebSocket
  if (p === '/api/ws') {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ ok: false, error: 'expected_websocket' }, 426);
    }
    const code = cleanCode(url.searchParams.get('room'));
    if (!code) return json({ ok: false, error: 'room_required' }, 400);
    if (!rooms) {
      return new Response('سیگنالینگ روی این استقرار فعال نیست (Durable Objects لازم است)', { status: 501, headers: NO_STORE });
    }
    const stub = rooms.get(rooms.idFromName(code));
    return stub.fetch(request);
  }

  return json({ ok: false, error: 'not_found', path: p }, 404);
}

export { json, NO_STORE };
