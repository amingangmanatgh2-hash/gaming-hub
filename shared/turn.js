/**
 * سرورهای ICE (STUN/TURN) — بهینه برای ایران:
 *  • پیش‌فرض فقط STUN است، یعنی ترافیک صوتی/تصویری مستقیم بین کاربران می‌رود
 *    و از هیچ سرور خارجی عبور نمی‌کند (کم‌مصرف، کم‌تأخیر، بدون هزینه).
 *  • اگر پشت NAT سخت / CGNAT (اینترنت موبایل) هستید، TURN کلودفلر رایگان
 *    (۱ ترابایت در ماه) وصل می‌شود؛ فقط کافی است TURN_KEY_ID و
 *    TURN_KEY_API_TOKEN را ست کنید.
 */

export const DEFAULT_STUN = [
  'stun:stun.cloudflare.com:3478',
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
];

/** پورت ۵۳ را حذف می‌کنیم؛ کروم و فایرفاکس آن را رد می‌کنند. */
function dropPort53(urls) {
  return (urls || []).filter((u) => typeof u === 'string' && !/:(53)(\?|$)/.test(u));
}

/**
 * @param {any} env  محیط Worker (TURN_KEY_ID / TURN_KEY_API_TOKEN اختیاری)
 * @returns {Promise<{servers:any[], relay:boolean, source:string, cached?:boolean}>}
 */
export async function iceServers(env = {}) {
  const keyId = env.TURN_KEY_ID;
  const token = env.TURN_KEY_API_TOKEN;
  const base = { servers: [{ urls: DEFAULT_STUN }], relay: false, source: 'stun-only' };

  if (!keyId || !token) {
    if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
      return {
        servers: [
          { urls: DEFAULT_STUN },
          { urls: String(env.TURN_URLS).split(','), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL },
        ],
        relay: true,
        source: 'custom-turn',
      };
    }
    return base;
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
      },
    );
    if (!res.ok) return { ...base, source: `turn-error-${res.status}` };
    const data = await res.json();
    const raw = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    const servers = [];
    let relay = false;
    for (const s of raw) {
      if (!s) continue;
      const urls = dropPort53(Array.isArray(s.urls) ? s.urls : [s.urls]);
      if (!urls.length) continue;
      if (s.username) relay = true;
      servers.push(s.username ? { urls, username: s.username, credential: s.credential } : { urls });
    }
    if (!servers.length) return base;
    // مطمئن می‌شویم حداقل یک STUN ساده هم هست
    if (!servers.some((s) => !s.username)) servers.unshift({ urls: DEFAULT_STUN });
    return { servers, relay, source: 'cloudflare-turn' };
  } catch (e) {
    return { ...base, source: 'turn-exception' };
  }
}

/** کش سادهٔ ۱ ساعته در حافظهٔ ایزوله (برای صرفه‌جویی در درخواست به API) */
const cache = new Map();
export async function iceServersCached(env = {}) {
  const hit = cache.get('ice');
  if (hit && hit.exp > Date.now()) return { ...hit.val, cached: true };
  const val = await iceServers(env);
  cache.set('ice', { val, exp: Date.now() + 3600_000 });
  return val;
}
