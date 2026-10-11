/**
 * سرور توسعهٔ محلی — بدون نیاز به هیچ سرویس بیرونی
 * ───────────────────────────────────────────────
 * • فایل‌های public/ را سرو می‌کند (مسیر /r/CODE به صفحهٔ اتاق می‌رود)
 * • یک سرور سیگنالینگ «نمونه» روی /api/ws بالا می‌آورد که همان پروتکل
 *   Durable Object را پیاده می‌کند؛ پس همهٔ امکانات (چت، فایل، تخته،
 *   نظرسنجی، اتاق انتظار، میزبانی) بدون هیچ اکانتی قابل آزمایش است.
 * • برای تست واقعی روی کلودفلر:  npm run dev:worker
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { C2S, S2C, ERR, LIMITS, cleanCode, randomCode } from '../shared/protocol.js';
import { iceServers } from '../shared/turn.js';

const PORT = Number(process.env.PORT || 8788);
const ROOT = new URL('../public/', import.meta.url).pathname.replace(/\/$/, '');
const TTL_HOURS = Number(process.env.ROOM_TTL_HOURS || 8);
const GRACE = Number(process.env.EMPTY_GRACE_SECONDS || 90);
const MAX_P = Number(process.env.MAX_PARTICIPANTS || 12);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

/* ───────── اتاق‌ها (نسخهٔ سبک Durable Object) ───────── */
const rooms = new Map();

class MemRoom {
  constructor(code) {
    this.code = code;
    this.meta = null;
    this.clients = new Set();
    this.chat = [];
    this.notes = '';
    this.poll = null;
    this.wb = null;
    this.bans = [];
    this.hostId = null;
    this.emptyAt = Date.now();
    setInterval(() => this.sweep(), 15_000).unref?.();
  }

  sweep() {
    const live = [...this.clients].filter((c) => c.meta?.joined && !c.meta.knock);
    if (live.length) return;
    if (this.meta && Date.now() - this.emptyAt > GRACE * 1000) {
      rooms.delete(this.code);
    }
  }

  created() {
    if (!this.meta || this.meta.createdAt + this.meta.ttlMs < Date.now()) {
      const keep = this.meta?.bans || this.bans || [];
      this.meta = {
        code: this.code, name: `اتاق ${this.code}`, pin: this.meta?.pin || null, locked: !!this.meta?.locked,
        waitingRoom: !!this.meta?.waitingRoom, maxP: this.meta?.maxP || MAX_P,
        ttlMs: (this.meta?.ttlHours || TTL_HOURS) * 3600_000, ttlHours: this.meta?.ttlHours || TTL_HOURS,
        createdAt: Date.now(), bans: keep,
      };
      this.chat = [];
      this.wb = null;
      this.notes = '';
      this.poll = null;
      this.hostId = null;
    }
    return this.meta;
  }

  peers() {
    return [...this.clients].filter((c) => c.meta?.joined && !c.meta.knock).map((c) => this.pub(c));
  }

  pub(c) {
    return { id: c.meta.id, name: c.meta.name, avatar: c.meta.avatar, role: c.meta.role, hand: !!c.meta.hand, state: c.meta.s || {}, joinedAt: c.meta.j, knocked: !!c.meta.knock };
  }

  roomPub() {
    const m = this.meta;
    return {
      code: m.code, name: m.name, locked: !!m.locked, pin: !!m.pin, waitingRoom: !!m.waitingRoom,
      maxP: m.maxP, hostId: this.hostId, ttlLeftMs: Math.max(0, m.createdAt + m.ttlMs - Date.now()),
      ttlHours: m.ttlMs / 3600_000, createdAt: m.createdAt, relayOff: !process.env.TURN_KEY_ID,
    };
  }

  send(c, obj) { try { c.ws.send(JSON.stringify(obj)); } catch { /* ignore */ } }
  bcast(obj, exceptId) {
    for (const c of this.clients) {
      if (!c.meta?.joined || c.meta.knock) continue;
      if (exceptId && c.meta.id === exceptId) continue;
      this.send(c, obj);
    }
  }
  sys(text, kind = 'info') { this.bcast({ t: S2C.SYS, text, kind, ts: Date.now() }); }
  byId(id) { return [...this.clients].find((c) => c.meta?.id === id); }
}

/* ───────── HTTP ───────── */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);

  /* API */
  if (path.startsWith('/api/')) {
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (path === '/api/health') return send(res, json({ ok: true, app: 'hamkalam', runtime: 'node-dev-mock', ts: Date.now(), turn: false }));
    if (path === '/api/config') return send(res, json({ ok: true, ttlHours: TTL_HOURS, grace: GRACE, maxP: MAX_P, turn: false, version: 1 }));
    if (path === '/api/ice') {
      const body = await iceServers(process.env);
      return send(res, json({ ok: true, ...body, iceServers: body.servers }));
    }
    if (path === '/api/room' && req.method === 'POST') {
      const raw = await readBody(req);
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* ignore */ }
      let code = '';
      for (let i = 0; i < 6 && !code; i++) {
        const cand = randomCode(7);
        if (!rooms.has(cand)) code = cand;
      }
      const r = rooms.get(code) || new MemRoom(code);
      rooms.set(code, r);
      r.meta = {
        code, name: String(body.name || '').slice(0, 60) || `اتاق ${code}`,
        pin: body.pin ? String(body.pin).slice(0, 12) : null,
        locked: !!body.locked, waitingRoom: !!body.waitingRoom, maxP: Math.min(MAX_P, Number(body.maxP) || MAX_P),
        ttlMs: Math.min(24, Math.max(0.25, Number(body.ttlHours) || TTL_HOURS)) * 3600_000,
        ttlHours: Math.min(24, Math.max(0.25, Number(body.ttlHours) || TTL_HOURS)),
        createdAt: Date.now(), bans: [],
      };
      return send(res, json({ ok: true, code, created: true, ttlHours: r.meta.ttlHours, maxP: r.meta.maxP }));
    }
    if (path.startsWith('/api/room/') && req.method === 'GET') {
      const code = cleanCode(path.split('/')[3]);
      const r = rooms.get(code);
      if (!r || !r.meta) return send(res, json({ ok: true, code, exists: false, maxP: MAX_P, ttlHours: TTL_HOURS }));
      return send(res, json({ ok: true, code, exists: true, name: r.meta.name, count: r.peers().length, locked: !!r.meta.locked, pin: !!r.meta.pin, waitingRoom: !!r.meta.waitingRoom, ttlLeftMs: Math.max(0, r.meta.createdAt + r.meta.ttlMs - Date.now()), maxP: r.meta.maxP, ttlHours: r.meta.ttlHours }));
    }
    return send(res, json({ ok: false, error: 'not_found' }, 404));
  }

  /* فایل‌های استاتیک */
  if (path === '/' || path === '') path = '/index.html';
  if (path === '/r' || path.startsWith('/r/')) path = '/room/index.html';
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, safe);
  try {
    const st = await stat(file);
    if (st.isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(ROOT, 'index.html');
  }
  try {
    const buf = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=60',
      'access-control-allow-origin': '*',
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('پیدا نشد');
  }
});

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}
function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  response.text().then((t) => res.end(t));
}

/* ───────── WebSocket سیگنالینگ ───────── */
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/api/ws') { socket.destroy(); return; }
  const code = cleanCode(url.searchParams.get('room'));
  if (!code) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const room = rooms.get(code) || new MemRoom(code);
    rooms.set(code, room);
    const client = { ws, meta: { joined: false, knock: false }, rate: { n: 0, t: Date.now() } };
    room.clients.add(client);
    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(data.toString()); } catch { return; }
      handle(room, client, m);
    });
    ws.on('close', () => {
      room.clients.delete(client);
      if (client.meta?.joined) {
        room.bcast({ t: S2C.PLEAVE, id: client.meta.id });
        if (room.hostId === client.meta.id) {
          const rest = [...room.clients].filter((c) => c.meta?.joined && !c.meta.knock);
          if (rest.length) {
            room.hostId = rest[0].meta.id;
            rest[0].meta.role = 'host';
            room.send(rest[0], { t: S2C.ROOM, room: room.roomPub(), you: { role: 'host' } });
            room.sys(`${rest[0].meta.name} میزبان جدید اتاق شد`, 'host');
          }
        }
      }
      if (![...room.clients].some((c) => c.meta?.joined)) room.emptyAt = Date.now();
    });
  });
});

function handle(room, c, m) {
  const t = Date.now();
  if (t - c.rate.t > 60_000) { c.rate = { n: 0, t }; }
  c.rate.n++;
  if (c.rate.n > LIMITS.MSG_PER_MIN) { room.send(c, { t: S2C.ERR, code: ERR.RATE, text: 'سرعت ارسال زیاد است' }); return; }
  if (m.t === C2S.PING) return room.send(c, { t: S2C.PONG, ts: m.ts, srv: t });
  if (!c.meta.joined) {
    if (m.t !== C2S.JOIN) return;
    const meta = room.created();
    if (meta.pin && String(m.pin || '') !== meta.pin) return;
    const live = room.peers();
    if (live.length >= meta.maxP) { room.send(c, { t: S2C.ERR, code: ERR.FULL, text: `اتاق پر است (سقف ${meta.maxP} نفر)`, fatal: true }); return; }
    const isHost = !room.hostId;
    c.meta = {
      joined: false, id: String(m.id || Math.random().toString(36).slice(2, 12)).slice(0, 24),
      name: String(m.name || 'مهمان').slice(0, LIMITS.NAME_LEN), avatar: m.avatar || null,
      role: isHost ? 'host' : 'member', s: { mic: !!(m.s && m.s.mic), cam: !!(m.s && m.s.cam), screen: false },
      j: t, hand: false, knock: meta.waitingRoom && room.hostId && m.knock !== false,
    };
    if (isHost) room.hostId = c.meta.id;
    if (c.meta.knock) {
      room.send(c, { t: S2C.WAITING, room: { name: meta.name, code: meta.code } });
      room.bcast({ t: S2C.KNOCK, peer: { id: c.meta.id, name: c.meta.name, avatar: c.meta.avatar } });
      room.sys(`${c.meta.name} در انتظار پذیرش است`, 'knock');
      return;
    }
    welcome(room, c, meta);
    return;
  }
  const me = c.meta;
  switch (m.t) {
    case C2S.SIGNAL: {
      if (m.to === '*') return room.bcast({ t: S2C.SIGNAL, from: me.id, d: m.d }, me.id);
      const target = room.byId(String(m.to || ''));
      if (target) room.send(target, { t: S2C.SIGNAL, from: me.id, d: m.d });
      break;
    }
    case C2S.CHAT: {
      const msg = {
        id: m.m?.id || Math.random().toString(36).slice(2, 12), from: me.id, name: me.name, photo: me.avatar,
        text: String(m.m?.text || '').slice(0, LIMITS.CHAT_LEN),
        file: m.m?.file ? { ...m.m.file, data: m.m.file.data?.slice(0, 400_000) } : undefined,
        ts: t, reply: m.m?.reply,
      };
      room.chat.push(msg);
      if (room.chat.length > LIMITS.CHAT_HISTORY) room.chat.shift();
      room.bcast({ t: S2C.CHAT, m: msg });
      break;
    }
    case C2S.CHATOP: {
      const i = room.chat.findIndex((x) => x.id === m.id);
      if (i < 0) break;
      const msg = room.chat[i];
      const isHost = room.hostId === me.id;
      if (m.op === 'del' && (msg.from === me.id || isHost)) { room.chat.splice(i, 1); room.bcast({ t: S2C.CHATOP, op: 'del', id: m.id }); }
      else if (m.op === 'edit' && (msg.from === me.id || isHost)) { msg.text = String(m.text || '').slice(0, LIMITS.CHAT_LEN); msg.edited = t; room.bcast({ t: S2C.CHATOP, op: 'edit', m: msg }); }
      else if (m.op === 'pin' && isHost) { msg.pinned = !msg.pinned; room.bcast({ t: S2C.CHATOP, op: 'pin', m: msg }); }
      else if (m.op === 'react') {
        msg.reactions = msg.reactions || {};
        const e = String(m.emoji || '👍').slice(0, 4);
        const arr = new Set(msg.reactions[e] || []);
        arr.has(me.id) ? arr.delete(me.id) : arr.add(me.id);
        msg.reactions[e] = [...arr];
        room.bcast({ t: S2C.CHATOP, op: 'react', m: msg });
      }
      break;
    }
    case C2S.TYPING: room.bcast({ t: S2C.TYPING, id: me.id, on: !!m.on }, me.id); break;
    case C2S.REACT: room.bcast({ t: S2C.REACT, id: me.id, name: me.name, emoji: String(m.emoji || '👍').slice(0, 4), ts: t }); break;
    case C2S.HAND: me.hand = !!m.up; room.bcast({ t: S2C.HAND, id: me.id, up: me.hand }); break;
    case C2S.STATE: me.s = { ...(me.s || {}), ...(m.s || {}) }; room.bcast({ t: S2C.STATE, id: me.id, s: me.s }, me.id); break;
    case C2S.NICK: if (m.name) me.name = String(m.name).slice(0, LIMITS.NAME_LEN); room.bcast({ t: S2C.STATE, id: me.id, name: me.name }); break;
    case C2S.NOTES: room.notes = String(m.text || '').slice(0, LIMITS.NOTES_MAX); room.bcast({ t: S2C.NOTES, text: room.notes, from: me.id }, me.id); break;
    case C2S.POLL: {
      const isHost = room.hostId === me.id;
      if (m.op === 'add' && isHost && m.q && Array.isArray(m.options) && m.options.length >= 2) {
        room.poll = { id: Math.random().toString(36).slice(2, 10), q: String(m.q).slice(0, 160), opts: m.options.slice(0, 8), votes: {}, multi: !!m.multi, open: true, ts: t };
      } else if (m.op === 'vote' && room.poll) {
        const idx = Number(m.i);
        if (room.poll.opts[idx] !== undefined) room.poll.votes[me.id] = [idx];
      } else if (m.op === 'close' && room.poll && isHost) room.poll.open = false;
      else if (m.op === 'clear' && isHost) room.poll = null;
      room.bcast({ t: S2C.POLL, poll: room.poll });
      break;
    }
    case C2S.WB: {
      room.wb = room.wb || { ops: [], w: m.w || 1280, h: m.h || 720 };
      if (m.full && Array.isArray(m.ops)) room.wb.ops = m.ops.slice(-LIMITS.WB_MAX_OPS);
      else if (Array.isArray(m.ops)) {
        room.wb.ops.push(...m.ops);
        if (room.wb.ops.length > LIMITS.WB_MAX_OPS) room.wb.ops = room.wb.ops.slice(-LIMITS.WB_MAX_OPS);
      }
      room.bcast({ t: S2C.WB, ops: m.ops, full: !!m.full, from: me.id, w: room.wb.w, h: room.wb.h }, me.id);
      break;
    }
    case C2S.SUB: room.bcast({ t: S2C.SUB, from: me.id, name: me.name, text: String(m.text || '').slice(0, 600) }, me.id); break;
    case C2S.BYE: c.ws.close(1000, 'bye'); break;
    case C2S.HOST: {
      if (room.hostId !== me.id) break;
      const target = room.byId(String(m.id || ''));
      if (m.op === 'kick' || m.op === 'ban') {
        if (!target) break;
        if (m.op === 'ban') room.bans.push(target.meta.id);
        room.send(target, { t: S2C.BYE, reason: m.op === 'ban' ? 'اخراج و مسدود شدید' : 'توسط میزبان حذف شدید' });
        setTimeout(() => target.ws.close(4001, 'removed'), 200);
      } else if (m.op === 'mute' && target) {
        room.bcast({ t: S2C.STATE, id: target.meta.id, host: { op: 'mute', by: me.name } });
      } else if (m.op === 'muteall') room.bcast({ t: S2C.ROOM, host: { op: 'muteall', by: me.name } });
      else if (m.op === 'cameraoff') room.bcast({ t: S2C.ROOM, host: { op: 'cameraoff', by: me.name } });
      else if (m.op === 'lock') { room.meta.locked = m.on !== false; room.bcast({ t: S2C.ROOM, room: room.roomPub() }); room.sys(room.meta.locked ? 'اتاق قفل شد' : 'قفل اتاق باز شد', 'host'); }
      else if (m.op === 'waitingroom') { room.meta.waitingRoom = m.on !== false; room.bcast({ t: S2C.ROOM, room: room.roomPub() }); }
      else if (m.op === 'setttl') {
        room.meta.ttlHours = Math.min(24, Math.max(0.25, Number(m.hours) || 8));
        room.meta.ttlMs = room.meta.ttlHours * 3600_000;
        room.meta.createdAt = t;
        room.bcast({ t: S2C.ROOM, room: room.roomPub() });
        room.sys(`عمر اتاق روی ${room.meta.ttlHours} ساعت تنظیم شد`, 'host');
      } else if (m.op === 'transfer' && target) {
        room.hostId = target.meta.id;
        for (const cc of room.clients) {
          cc.meta.role = cc.meta.id === room.hostId ? 'host' : 'member';
          if (cc.meta.id === room.hostId) room.send(cc, { t: S2C.ROOM, room: room.roomPub(), you: { role: 'host' } });
        }
        room.sys(`میزبانی به ${target.meta.name} منتقل شد`, 'host');
      } else if (m.op === 'approve' && target) {
        target.meta.knock = false;
        welcome(room, target, room.meta);
      } else if (m.op === 'deny' && target) {
        room.send(target, { t: S2C.BYE, reason: 'میزبان اجازه ورود نداد' });
        setTimeout(() => target.ws.close(4002, 'denied'), 200);
      } else if (m.op === 'end') {
        room.bcast({ t: S2C.BYE, reason: 'میزبان جلسه را پایان داد' });
        setTimeout(() => { for (const cc of room.clients) cc.ws.close(4003, 'ended'); rooms.delete(room.code); }, 300);
      }
      break;
    }
    default: break;
  }
}

function welcome(room, c, meta) {
  c.meta.joined = true;
  c.meta.name = c.meta.name;
  if (!room.hostId) { room.hostId = c.meta.id; c.meta.role = 'host'; }
  room.send(c, {
    t: S2C.WELCOME, app: 'hamkalam',
    you: { id: c.meta.id, name: c.meta.name, avatar: c.meta.avatar, role: c.meta.role },
    room: room.roomPub(),
    peers: room.peers().filter((p) => p.id !== c.meta.id && !p.knocked),
    chat: room.chat, notes: room.notes, poll: room.poll, wb: room.wb, srv: { now: Date.now(), version: 1 },
  });
  room.bcast({ t: S2C.PJOIN, peer: room.pub(c) }, c.meta.id);
  if (room.peers().length > 1) room.sys(`${c.meta.name} وارد اتاق شد`, 'join');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ✅ هم‌کلام (نسخهٔ توسعهٔ محلی) روی http://0.0.0.0:${PORT}  بالا آمد`);
  console.log('     • صفحهٔ خانه:  /');
  console.log('     • اتاق نمونه:  /r/DEMO123');
  console.log('     • سیگنالینگ:   /api/ws  (نمونهٔ Node — همان پروتکل Durable Object)');
  console.log('     • برای نسخهٔ واقعی کلودفلر:  npm run dev:worker\n');
});
