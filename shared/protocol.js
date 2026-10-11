/**
 * پروتکل مشترک بین کلاینت (مرورگر) و سرور (Worker/Pages Functions)
 * پیام‌ها JSON و کوتاه هستند تا روی اینترنت ضعیف هم کم‌هزینه باشند.
 */

export const APP = 'hamkalam';
export const VERSION = 1;

/** انواع پیام از کلاینت به سرور */
export const C2S = {
  JOIN: 'join',
  SIGNAL: 's',
  CHAT: 'chat',
  CHATOP: 'chatop',   // ویرایش/حذف/سنجاق پیام
  TYPING: 'typing',
  REACT: 'react',
  HAND: 'hand',
  STATE: 'state',     // میکروفن/دوربین/اشتراک صفحه
  HOST: 'host',       // دستورهای میزبان: kick, ban, mute, transfer, lock, approve, deny, ttl
  POLL: 'poll',
  NOTES: 'notes',
  WB: 'wb',           // تخته سفید
  SUB: 'sub',         // خط زیرنویس خودکار (فقط پخش زنده، ذخیره نمی‌شود)
  NICK: 'nick',
  PING: 'ping',
  PONG: 'pong',
  BYE: 'bye',
};

/** انواع پیام از سرور به کلاینت */
export const S2C = {
  WELCOME: 'welcome',
  PJOIN: 'pjoin',
  PLEAVE: 'pleave',
  SIGNAL: 's',
  CHAT: 'chat',
  CHATOP: 'chatop',
  TYPING: 'typing',
  REACT: 'react',
  HAND: 'hand',
  STATE: 'state',
  KNOCK: 'knock',
  WAITING: 'waiting',
  ROOM: 'room',
  POLL: 'poll',
  NOTES: 'notes',
  WB: 'wb',
  SUB: 'sub',
  PONG: 'pong',
  SYS: 'sys',
  ERR: 'err',
  BYE: 'bye',
};

export const ERR = {
  PIN: 'bad_pin',
  LOCKED: 'locked',
  BANNED: 'banned',
  FULL: 'full',
  EXPIRED: 'expired',
  NO_ROOM: 'no_room',
  RATE: 'rate_limited',
  BAD: 'bad_request',
};

/** سقف‌های محافظتی (ضد سوءاستفاده، برای رایگان‌ماندن) */
export const LIMITS = {
  ROOM_CODE_LEN: 24,
  NAME_LEN: 32,
  CHAT_LEN: 4000,
  CHAT_HISTORY: 200,
  MAX_MSG_BYTES: 64 * 1024,
  MSG_PER_MIN: 400,
  PARTICIPANTS_HARD: 16,
  NOTES_MAX: 200 * 1024,
  WB_MAX_OPS: 2500,
  WB_MAX: 300 * 1024,
  TTL_MAX_HOURS: 24,
  TTL_DEFAULT_HOURS: 8,
  GRACE_DEFAULT_SEC: 90,
};

export function cleanCode(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, LIMITS.ROOM_CODE_LEN);
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون حروف/اعداد گیج‌کننده
export function randomCode(len = 7) {
  const a = new Uint8Array(len);
  (globalThis.crypto || {}).getRandomValues?.(a);
  let out = '';
  for (let i = 0; i < len; i++) {
    const r = a[i] !== undefined ? a[i] : Math.floor(Math.random() * 256);
    // 0x80 تا 0xFF را رد می‌کنیم تا توزیع یکنواخت بماند (modulo bias)
    out += ALPHA[(r < 0x80 ? r : r % ALPHA.length) % ALPHA.length];
  }
  return out;
}

export function randomId(len = 12) {
  const a = new Uint8Array(len);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, len);
}
