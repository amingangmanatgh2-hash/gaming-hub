/**
 * اتاق = یک Durable Object با WebSocket Hibernation
 * ─────────────────────────────────────────────────
 * چرا Hibernation؟ چون وقتی کسی حرف نمی‌زند/تایپ نمی‌کند، آبجکت از حافظه
 * خارج می‌شود و هزینه‌ای مصرف نمی‌شود؛ اما سوکت‌ها باز می‌مانند و اتاق
 * همان‌طور که خواستید تا وقتی همه خارج نشده‌اند زنده می‌ماند (تا سقف ۸ ساعت).
 */
import { C2S, S2C, ERR, LIMITS } from '../shared/protocol.js';

const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function attachBook(ws) {
  try {
    return ws.deserializeAttachment() || {};
  } catch {
    return {};
  }
}
function attachWrite(ws, book) {
  try {
    ws.serializeAttachment(book);
  } catch { /* ignore */ }
}

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.st = state.storage;
    this.roomCache = null;
    this.rate = new Map();
    this.lastTyping = new Map();
  }

  /* ─────────────── کمکی‌ها ─────────────── */

  cfg() {
    const env = this.env || {};
    return {
      ttlHours: clamp(Number(env.ROOM_TTL_HOURS || LIMITS.TTL_DEFAULT_HOURS), 0.25, LIMITS.TTL_MAX_HOURS),
      grace: clamp(Number(env.EMPTY_GRACE_SECONDS || LIMITS.GRACE_DEFAULT_SEC), 10, 3600),
      maxP: clamp(Number(env.MAX_PARTICIPANTS || 12), 2, LIMITS.PARTICIPANTS_HARD),
    };
  }

  async room() {
    if (this.roomCache) return this.roomCache;
    const r = await this.st.get('room');
    this.roomCache = r || null;
    return this.roomCache;
  }

  async saveRoom(r) {
    this.roomCache = r;
    await this.st.put('room', r);
  }

  sockets() {
    return this.state.getWebSockets();
  }

  peers() {
    const out = [];
    for (const ws of this.sockets()) {
      const b = attachBook(ws);
      if (!b || b.joined === false || !b.id) continue;
      out.push(this.pub(b));
    }
    return out;
  }

  pub(b) {
    return {
      id: b.id,
      name: b.name,
      avatar: b.avatar || null,
      role: b.role || 'member',
      hand: !!b.hand,
      state: b.s || {},
      joinedAt: b.j || 0,
      knocked: !!b.knock,
    };
  }

  byId(id) {
    for (const ws of this.sockets()) {
      const b = attachBook(ws);
      if (b && b.id === id) return ws;
    }
    return null;
  }

  send(ws, obj) {
    try {
      ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    } catch { /* socket مرده */ }
  }

  bcast(obj, exceptId) {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    let n = 0;
    for (const ws of this.sockets()) {
      const b = attachBook(ws);
      if (!b || b.joined === false || !b.id) continue;
      if (exceptId && b.id === exceptId) continue;
      if (b.knock) continue; // در انتظار پذیرش، پیام‌ها را نمی‌بیند
      try {
        ws.send(s);
        n++;
      } catch { /* ignore */ }
    }
    return n;
  }

  sys(text, kind = 'info') {
    this.bcast({ t: S2C.SYS, text, kind, ts: now() }, null);
  }

  rateOk(b, cost = 1) {
    const t = now();
    let e = this.rate.get(b.id);
    if (!e || t - e.t > 60_000) {
      e = { n: 0, t };
      this.rate.set(b.id, e);
    }
    e.n += cost;
    return e.n <= LIMITS.MSG_PER_MIN;
  }

  async ensureAlarm(at) {
    const cur = await this.st.getAlarm();
    if (!cur || Math.abs(cur - at) > 60_000) await this.st.setAlarm(at);
  }

  /* ─────────────── WebSocket ─────────────── */

  async fetch(request) {
    const url = new URL(request.url);

    // مسیر اطلاعاتی (بدون WebSocket): برای صفحهٔ هوم و بررسی عمر اتاق
    if (url.searchParams.get('info') === '1') {
      const r = await this.room();
      const socks = this.sockets();
      const live = socks.length;
      return Response.json({
        exists: !!r,
        code: r ? r.code : null,
        name: r ? r.name : null,
        count: live,
        locked: !!(r && r.locked),
        pin: !!(r && r.pin),
        waitingRoom: !!(r && r.waitingRoom),
        maxP: (r && r.maxP) || this.cfg().maxP,
        createdAt: r ? r.createdAt : null,
        ttlHours: r ? r.ttlMs / 3600_000 : this.cfg().ttlHours,
        ttlLeftMs: r ? Math.max(0, r.createdAt + r.ttlMs - now()) : null,
      });
    }

    // ساخت اتاق از سمت صفحهٔ هوم (REST)
    if (request.method === 'POST' && url.searchParams.get('create') === '1') {
      let body = {};
      try {
        body = await request.json();
      } catch { /* ignore */ }
      const cfg = this.cfg();
      const code = url.pathname.split('/').pop().toUpperCase();
      const existing = await this.room();
      if (existing) {
        if (body.regenerate !== true) {
          return Response.json({ ok: true, code, exists: true, ttlLeftMs: existing.createdAt + existing.ttlMs - now() });
        }
      }
      const ttlHours = clamp(Number(body.ttlHours ?? cfg.ttlHours), 0.25, LIMITS.TTL_MAX_HOURS);
      const room = {
        code,
        name: String(body.name || '').slice(0, 60) || `اتاق ${code}`,
        pin: body.pin ? String(body.pin).slice(0, 12) : null,
        locked: !!body.locked,
        waitingRoom: !!body.waitingRoom,
        hostId: null,
        maxP: clamp(Number(body.maxP ?? cfg.maxP), 2, LIMITS.PARTICIPANTS_HARD),
        ttlMs: Math.round(ttlHours * 3600_000),
        ttlHours,
        createdAt: now(),
        bans: existing && body.regenerate ? existing.bans || [] : [],
      };
      await this.saveRoom(room);
      await this.ensureAlarm(room.createdAt + room.ttlMs);
      return Response.json({ ok: true, code, created: true, room: { ...room, ttlLeftMs: room.ttlMs } });
    }

    // WebSocket
    if (request.headers.get('Upgrade') !== 'websocket') {
      const r = await this.room();
      return Response.json({ ok: true, exists: !!r }, { status: 200 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // hibernation accept: سوکت بدون نگه‌داشتن آبجکت در حافظه زنده می‌ماند
    this.state.acceptWebSocket(server);
    attachWrite(server, { joined: false, since: now() });
    // اگر تا ۲۰ ثانیه پیام join نیامد، سوکت بسته می‌شود
    this.state.waitUntil?.(this.st.setAlarm(await this.alarmTarget(20_000)));

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarmTarget(graceForIdle = null) {
    const r = await this.room();
    const t = now();
    if (graceForIdle) return t + graceForIdle;
    if (!r) return t + 3600_000;
    return r.createdAt + r.ttlMs;
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > LIMITS.MAX_MSG_BYTES) return;
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const b = attachBook(ws) || {};

    if (m.t === C2S.PING) return this.send(ws, { t: S2C.PONG, ts: m.ts || now(), srv: now() });
    if (m.t === C2S.PONG) return;

    if (!b.joined) {
      if (m.t === C2S.JOIN) return this.onJoin(ws, m);
      if (m.t === C2S.PONG) return;
      return this.send(ws, { t: S2C.ERR, code: ERR.BAD, text: 'اول باید وارد اتاق شوید' });
    }

    if (!this.rateOk(b, m.t === C2S.WB ? 2 : 1)) {
      return this.send(ws, { t: S2C.ERR, code: ERR.RATE, text: 'سرعت ارسال پیام زیاد است' });
    }

    switch (m.t) {
      case C2S.SIGNAL:
        return this.onSignal(ws, b, m);
      case C2S.CHAT:
        return this.onChat(ws, b, m);
      case C2S.CHATOP:
        return this.onChatOp(ws, b, m);
      case C2S.TYPING: {
        const t = now();
        const last = this.lastTyping.get(b.id) || 0;
        if (!m.on || t - last > 400) {
          this.lastTyping.set(b.id, t);
          this.bcast({ t: S2C.TYPING, id: b.id, on: !!m.on }, b.id);
        }
        return;
      }
      case C2S.REACT:
        return this.bcast({ t: S2C.REACT, id: b.id, name: b.name, emoji: String(m.emoji || '👍').slice(0, 4), ts: now() });
      case C2S.HAND: {
        b.hand = !!m.up;
        attachWrite(ws, b);
        return this.bcast({ t: S2C.HAND, id: b.id, up: !!m.up });
      }
      case C2S.STATE: {
        b.s = { ...(b.s || {}), ...(m.s || {}) };
        attachWrite(ws, b);
        return this.bcast({ t: S2C.STATE, id: b.id, s: b.s }, b.id);
      }
      case C2S.NICK: {
        if (m.name) b.name = String(m.name).slice(0, LIMITS.NAME_LEN);
        if (m.avatar !== undefined) b.avatar = m.avatar ? String(m.avatar).slice(0, 64) : null;
        attachWrite(ws, b);
        return this.bcast({ t: S2C.STATE, id: b.id, name: b.name, avatar: b.avatar });
      }
      case C2S.HOST:
        return this.onHost(ws, b, m);
      case C2S.POLL:
        return this.onPoll(ws, b, m);
      case C2S.NOTES: {
        const text = String(m.text || '');
        if (text.length > LIMITS.NOTES_MAX) return this.send(ws, { t: S2C.ERR, code: ERR.BAD, text: 'یادداشت خیلی بزرگ است' });
        await this.st.put('notes', text);
        return this.bcast({ t: S2C.NOTES, text, from: b.id }, b.id);
      }
      case C2S.WB:
        return this.onWhiteboard(ws, b, m);
      case C2S.SUB:
        // زیرنویس زنده: فقط پخش می‌شود و ذخیره نمی‌شود (کم‌هزینه)
        return this.bcast({ t: S2C.SUB, from: b.id, name: b.name, text: String(m.text || '').slice(0, 600) }, b.id);
      case C2S.BYE:
        try { ws.close(1000, 'bye'); } catch { /* ignore */ }
        return;
      default:
        return;
    }
  }

  async webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch { /* ignore */ }
    const b = attachBook(ws) || {};
    if (!b.id || b.joined === false) {
      await this.afterLeave();
      return;
    }
    this.bcast({ t: S2C.PLEAVE, id: b.id });
    const r = await this.room();
    if (r && r.hostId === b.id) {
      const rest = this.sockets()
        .map(attachBook)
        .filter((x) => x && x.id && x.id !== b.id && x.joined !== false && !x.knock)
        .sort((x, y) => (x.j || 0) - (y.j || 0));
      if (rest.length) {
        const nb = rest[0];
        r.hostId = nb.id;
        await this.saveRoom(r);
        const nws = this.byId(nb.id);
        if (nws) {
          const nbk = attachBook(nws);
          nbk.role = 'host';
          attachWrite(nws, nbk);
          this.send(nws, { t: S2C.ROOM, room: this.roomPub(r), you: { role: 'host' } });
        }
        this.sys(`${nb.name} میزبان جدید اتاق شد`, 'host');
      }
    }
    await this.afterLeave();
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011, 'error');
  }

  async afterLeave() {
    const live = this.sockets().filter((ws) => {
      const x = attachBook(ws);
      return x && x.id && x.joined !== false && !x.knock;
    }).length;
    if (live > 0) return;
    // اتاق خالی شد → مهلت کوتاه؛ اگر برنگشتند پاک می‌شود
    const { grace } = this.cfg();
    await this.st.put('emptyAt', now());
    await this.st.setAlarm(now() + grace * 1000);
  }

  /* ─────────────── ورود ─────────────── */

  async onJoin(ws, m) {
    const cfg = this.cfg();
    let r = await this.room();

    if (r && r.createdAt + r.ttlMs <= now()) {
      await this.wipe();
      r = null;
    }

    if (!r) {
      r = {
        code: String(m.code || '').toUpperCase(),
        name: `اتاق ${String(m.code || '').toUpperCase()}`,
        pin: null,
        locked: false,
        waitingRoom: !!m.wr,
        hostId: null,
        maxP: clamp(Number(m.maxP ?? cfg.maxP), 2, LIMITS.PARTICIPANTS_HARD),
        ttlMs: Math.round(clamp(Number(m.ttlHours ?? cfg.ttlHours), 0.25, LIMITS.TTL_MAX_HOURS) * 3600_000),
        createdAt: now(),
        bans: [],
      };
      r.ttlHours = r.ttlMs / 3600_000;
      await this.saveRoom(r);
    }

    if (r.locked && !r.pin) {
      // قفل بدون رمز = فقط با دعوت میزبان
    }
    if (r.pin && String(m.pin || '') !== r.pin) {
      return this.reject(ws, ERR.PIN, 'رمز اتاق اشتباه است');
    }
    if (r.bans && r.bans.includes(this.keyOf(m))) {
      return this.reject(ws, ERR.BANNED, 'شما از این اتاق مسدود شده‌اید');
    }

    const live = this.peers().filter((p) => !p.knocked);
    if (live.length >= r.maxP) {
      return this.reject(ws, ERR.FULL, `اتاق پر است (سقف ${r.maxP} نفر)`);
    }

    // اگر میزبان قبلی رفته باشد (مثلاً اتاق یک‌بار خالی شده)، میزبانی به نفر تازه می‌رسد
    const hostAlive = r.hostId && this.sockets().some((s) => (attachBook(s) || {}).id === r.hostId);
    if (!hostAlive) r.hostId = null;

    const b = {
      id: String(m.id || '').replace(/[^\w-]/g, '').slice(0, 24) || Math.random().toString(36).slice(2, 12),
      name: String(m.name || 'مهمان').slice(0, LIMITS.NAME_LEN) || 'مهمان',
      avatar: m.avatar ? String(m.avatar).slice(0, 64) : null,
      role: r.hostId ? 'member' : 'host',
      s: { mic: !!(m.s && m.s.mic), cam: !!(m.s && m.s.cam), screen: false, audio: !!(m.s && m.s.audio) },
      joinedAt: now(),
      j: now(),
      hand: false,
      knock: !!(r.waitingRoom && r.hostId && m.knock !== false && r.hostId !== b.hostId),
      joined: false,
      ip: this.keyOf(m),
    };
    if (!r.hostId) {
      r.hostId = b.id;
      b.role = 'host';
    }

    if (b.knock) {
      b.joined = false;
      attachWrite(ws, b);
      this.send(ws, { t: S2C.WAITING, room: { name: r.name, code: r.code } });
      this.bcast({ t: S2C.KNOCK, peer: { id: b.id, name: b.name, avatar: b.avatar } });
      this.sys(`${b.name} در انتظار پذیرش است`, 'knock');
      return;
    }

    b.joined = true;
    attachWrite(ws, b);

    const [chat, notes, poll, wb] = await Promise.all([
      this.st.get('chat'),
      this.st.get('notes'),
      this.st.get('poll'),
      this.st.get('wb'),
    ]);

    this.send(ws, {
      t: S2C.WELCOME,
      app: 'hamkalam',
      you: { id: b.id, name: b.name, avatar: b.avatar, role: b.role },
      room: this.roomPub(r),
      peers: this.peers().filter((p) => p.id !== b.id && !p.knocked),
      chat: Array.isArray(chat) ? chat : [],
      notes: notes || '',
      poll: poll || null,
      wb: wb || null,
      srv: { now: now(), version: 1 },
    });

    this.bcast({ t: S2C.PJOIN, peer: this.pub(b) }, b.id);
    if (live.length) this.sys(`${b.name} وارد اتاق شد`, 'join');
    await this.ensureAlarm(r.createdAt + r.ttlMs);
  }

  keyOf(m) {
    // کلید سادهٔ ضدبن بر اساس شناسهٔ مرورگر + نام (بدون نگه‌داشتن IP)
    return `k:${String(m.id || '').slice(0, 24)}`;
  }

  reject(ws, code, text) {
    this.send(ws, { t: S2C.ERR, code, text, fatal: true });
    setTimeout(() => {
      try { ws.close(4000 + (code === ERR.FULL ? 3 : 1), code); } catch { /* ignore */ }
    }, 150);
  }

  roomPub(r) {
    return {
      code: r.code,
      name: r.name,
      locked: !!r.locked,
      pin: !!r.pin,
      waitingRoom: !!r.waitingRoom,
      maxP: r.maxP,
      hostId: r.hostId,
      ttlLeftMs: Math.max(0, r.createdAt + r.ttlMs - now()),
      ttlHours: r.ttlMs / 3600_000,
      createdAt: r.createdAt,
      relayOff: !this.env?.TURN_KEY_ID,
    };
  }

  /* ─────────────── سیگنالینگ WebRTC ─────────────── */

  onSignal(ws, b, m) {
    const to = String(m.to || '');
    if (!to) return;
    // «*» = پخش برای همه (قطعه‌های فایل زنده) — ذخیره نمی‌شود
    if (to === '*') {
      this.bcast({ t: S2C.SIGNAL, from: b.id, d: m.d }, b.id);
      return;
    }
    const target = this.byId(to);
    if (!target) return this.send(ws, { t: S2C.SYS, kind: 'warn', text: 'طرف مقابل در اتاق نیست' });
    this.send(target, { t: S2C.SIGNAL, from: b.id, d: m.d });
  }

  /* ─────────────── چت ─────────────── */

  async onChat(ws, b, m) {
    const text = String((m.m && m.m.text) || '').slice(0, LIMITS.CHAT_LEN);
    const file = m.m && m.m.file ? m.m.file : null;
    if (!text && !file) return;
    const msg = {
      id: String((m.m && m.m.id) || '').slice(0, 24) || Math.random().toString(36).slice(2, 12),
      from: b.id,
      name: b.name,
      photo: b.avatar,
      text,
      file: file
        ? {
            n: String(file.n || 'file').slice(0, 120),
            s: Number(file.s) || 0,
            mime: String(file.mime || '').slice(0, 80),
            data: typeof file.data === 'string' ? file.data : undefined,
            isImage: !!file.isImage,
            isAudio: !!file.isAudio,
            w: Number(file.w) || 0,
            h: Number(file.h) || 0,
            d: Number(file.d) || 0,
          }
        : undefined,
      ts: now(),
      reply: m.m && m.m.reply ? String(m.m.reply).slice(0, 24) : undefined,
    };
    const chat = (await this.st.get('chat')) || [];
    chat.push(msg);
    while (chat.length > LIMITS.CHAT_HISTORY) chat.shift();
    await this.st.put('chat', chat);
    this.bcast({ t: S2C.CHAT, m: msg });
  }

  async onChatOp(ws, b, m) {
    const chat = (await this.st.get('chat')) || [];
    const i = chat.findIndex((x) => x.id === m.id);
    if (i < 0) return;
    const msg = chat[i];
    const isHost = !!this.roomCache && this.roomCache.hostId === b.id;
    switch (m.op) {
      case 'edit':
        if (msg.from !== b.id && !isHost) return;
        msg.text = String(m.text || '').slice(0, LIMITS.CHAT_LEN);
        msg.edited = now();
        break;
      case 'del':
        if (msg.from !== b.id && !isHost) return;
        chat.splice(i, 1);
        break;
      case 'pin':
        if (!isHost) return;
        msg.pinned = !msg.pinned;
        break;
      case 'react': {
        msg.reactions = msg.reactions || {};
        const e = String(m.emoji || '👍').slice(0, 4);
        const arr = new Set(msg.reactions[e] || []);
        if (arr.has(b.id)) arr.delete(b.id);
        else arr.add(b.id);
        msg.reactions[e] = [...arr];
        break;
      }
      default:
        return;
    }
    await this.st.put('chat', chat);
    if (m.op === 'del') this.bcast({ t: S2C.CHATOP, op: 'del', id: m.id });
    else this.bcast({ t: S2C.CHATOP, op: m.op, m: msg });
  }

  /* ─────────────── دستورهای میزبان ─────────────── */

  async onHost(ws, b, m) {
    const r = await this.room();
    if (!r) return;
    const isHost = r.hostId === b.id;
    if (!isHost) return this.send(ws, { t: S2C.ERR, code: ERR.BAD, text: 'فقط میزبان' });
    const target = m.id ? this.byId(m.id) : null;
    switch (m.op) {
      case 'kick':
      case 'ban': {
        if (!target || target === ws) return;
        const tb = attachBook(target);
        if (m.op === 'ban') {
          r.bans = [...new Set([...(r.bans || []), tb.ip || `k:${tb.id}`])].slice(-100);
          await this.saveRoom(r);
        }
        this.send(target, { t: S2C.BYE, reason: m.op === 'ban' ? 'اخراج و مسدود شدید' : 'توسط میزبان حذف شدید' });
        setTimeout(() => {
          try { target.close(4001, 'removed'); } catch { /* ignore */ }
        }, 200);
        this.sys(`${tb.name} ${m.op === 'ban' ? 'مسدود' : 'اخراج'} شد`, 'host');
        break;
      }
      case 'mute': {
        if (!target) return;
        tb.kickState = true;
        this.send(target, { t: S2C.ROOM, host: { op: 'mute', by: b.name } });
        this.bcast({ t: S2C.STATE, id: tb.id, host: { op: 'mute', by: b.name } });
        this.sys(`${b.name} میکروفن ${tb.name} را بست`, 'host');
        break;
      }
      case 'muteall':
        this.bcast({ t: S2C.ROOM, host: { op: 'muteall', by: b.name } });
        this.sys(`${b.name} میکروفن همه را بست`, 'host');
        break;
      case 'cameraoff':
        this.bcast({ t: S2C.ROOM, host: { op: 'cameraoff', by: b.name } });
        break;
      case 'lock':
        r.locked = m.on !== false;
        await this.saveRoom(r);
        this.bcast({ t: S2C.ROOM, room: this.roomPub(r) });
        this.sys(r.locked ? 'اتاق قفل شد' : 'قفل اتاق باز شد', 'host');
        break;
      case 'waitingroom':
        r.waitingRoom = m.on !== false;
        await this.saveRoom(r);
        this.bcast({ t: S2C.ROOM, room: this.roomPub(r) });
        break;
      case 'setttl': {
        const h = clamp(Number(m.hours) || 8, 0.25, LIMITS.TTL_MAX_HOURS);
        r.ttlMs = Math.round(h * 3600_000);
        r.ttlHours = h;
        r.createdAt = now();
        await this.saveRoom(r);
        await this.ensureAlarm(r.createdAt + r.ttlMs);
        this.bcast({ t: S2C.ROOM, room: this.roomPub(r) });
        this.sys(`عمر اتاق روی ${h} ساعت تنظیم شد`, 'host');
        break;
      }
      case 'transfer': {
        if (!target) return;
        r.hostId = attachBook(target).id;
        await this.saveRoom(r);
        for (const s of this.sockets()) {
          const sb = attachBook(s);
          if (!sb.id) continue;
          if (s === target) {
            sb.role = 'host';
            attachWrite(s, sb);
            this.send(s, { t: S2C.ROOM, room: this.roomPub(r), you: { role: 'host' } });
          } else if (sb.role === 'host') {
            sb.role = 'member';
            attachWrite(s, sb);
            this.send(s, { t: S2C.ROOM, room: this.roomPub(r), you: { role: 'member' } });
          }
        }
        this.sys(`میزبانی به ${attachBook(target).name} منتقل شد`, 'host');
        break;
      }
      case 'approve':
      case 'deny': {
        if (!target) return;
        const tb = attachBook(target);
        if (m.op === 'deny') {
          this.send(target, { t: S2C.BYE, reason: 'میزبان اجازه ورود نداد' });
          setTimeout(() => {
            try { target.close(4002, 'denied'); } catch { /* ignore */ }
          }, 200);
          return;
        }
        tb.knock = false;
        attachWrite(target, tb);
        const [chat, notes, poll, wb] = await Promise.all([
          this.st.get('chat'),
          this.st.get('notes'),
          this.st.get('poll'),
          this.st.get('wb'),
        ]);
        this.send(target, {
          t: S2C.WELCOME,
          you: { id: tb.id, name: tb.name, avatar: tb.avatar, role: tb.role },
          room: this.roomPub(r),
          peers: this.peers().filter((p) => p.id !== tb.id && !p.knocked),
          chat: chat || [],
          notes: notes || '',
          poll: poll || null,
          wb: wb || null,
          srv: { now: now() },
        });
        this.bcast({ t: S2C.PJOIN, peer: this.pub(tb) }, tb.id);
        this.sys(`${tb.name} پذیرفته شد`, 'join');
        break;
      }
      case 'end': {
        this.bcast({ t: S2C.BYE, reason: 'میزبان جلسه را پایان داد' });
        for (const s of this.sockets()) {
          try { s.close(4003, 'ended'); } catch { /* ignore */ }
        }
        await this.wipe();
        break;
      }
      default:
        break;
    }
  }

  async wipe() {
    this.roomCache = null;
    this.rate.clear();
    try { await this.st.deleteAll(); } catch { /* ignore */ }
  }

  /* ─────────────── نظرسنجی / تخته سفید ─────────────── */

  async onPoll(ws, b, m) {
    const isHost = this.roomCache && this.roomCache.hostId === b.id;
    let poll = (await this.st.get('poll')) || null;
    if (m.op === 'add') {
      if (!isHost) return;
      const opts = (m.options || []).map((o) => String(o).slice(0, 80)).filter(Boolean).slice(0, 8);
      if (m.q && opts.length >= 2) {
        poll = { id: Math.random().toString(36).slice(2, 10), q: String(m.q).slice(0, 160), opts, votes: {}, multi: !!m.multi, open: true, ts: now() };
      }
    } else if (m.op === 'vote' && poll) {
      const idx = Number(m.i);
      if (poll.opts[idx]) {
        if (poll.multi) {
          const cur = new Set((poll.votes[b.id] || []).map(Number));
          cur.has(idx) ? cur.delete(idx) : cur.add(idx);
          poll.votes[b.id] = [...cur];
        } else {
          poll.votes[b.id] = [idx];
        }
      }
    } else if (m.op === 'close' && poll && isHost) {
      poll.open = false;
    } else if (m.op === 'clear' && isHost) {
      poll = null;
    }
    await this.st.put('poll', poll);
    this.bcast({ t: S2C.POLL, poll });
  }

  async onWhiteboard(ws, b, m) {
    let wb = (await this.st.get('wb')) || { ops: [], w: 1280, h: 720 };
    if (m.full && Array.isArray(m.ops)) {
      wb.ops = m.ops.slice(-LIMITS.WB_MAX_OPS);
    } else if (Array.isArray(m.ops)) {
      wb.ops.push(...m.ops);
      if (wb.ops.length > LIMITS.WB_MAX_OPS) wb.ops = wb.ops.slice(-LIMITS.WB_MAX_OPS);
      if (m.w) wb.w = m.w;
      if (m.h) wb.h = m.h;
    }
    const str = JSON.stringify(wb);
    if (str.length > LIMITS.WB_MAX) wb.ops = wb.ops.slice(-Math.floor(LIMITS.WB_MAX_OPS / 2));
    await this.st.put('wb', wb);
    this.bcast({ t: S2C.WB, ops: m.ops, full: !!m.full, from: b.id, w: wb.w, h: wb.h }, b.id);
  }

  /* ─────────────── ساعت زنگ‌دار: عمر اتاق و پاک‌سازی ─────────────── */

  async alarm() {
    const r = await this.room();
    const live = this.sockets().filter((ws) => {
      const b = attachBook(ws);
      return b && b.id && b.joined !== false && !b.knock;
    }).length;

    if (!r) {
      if (live === 0) return this.wipe();
      return this.ensureAlarm(now() + 3600_000);
    }

    if (live === 0) {
      const emptyAt = (await this.st.get('emptyAt')) || now();
      const { grace } = this.cfg();
      if (now() < emptyAt + grace * 1000) {
        return this.st.setAlarm(emptyAt + grace * 1000);
      }
      // اتاق دیگر لازم نیست → کامل پاک می‌شود (کم‌هزینه و خودکار)
      return this.wipe();
    }

    const expire = r.createdAt + r.ttlMs;
    const left = expire - now();
    if (left <= 0) {
      this.bcast({ t: S2C.BYE, reason: 'عمر اتاق تمام شد' });
      for (const s of this.sockets()) {
        try { s.close(4004, 'expired'); } catch { /* ignore */ }
      }
      return this.wipe();
    }
    if (left <= 5 * 60_000) {
      this.bcast({ t: S2C.ROOM, room: this.roomPub(r), warn: 'expiring' });
    }
    await this.st.setAlarm(expire);
  }
}
