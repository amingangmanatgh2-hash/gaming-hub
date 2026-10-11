/**
 * آزمون سرتاسری سیگنالینگ — با سرور توسعهٔ محلی (که همان پروتکل Durable Object
 * را پیاده کرده) دو کاربر واقعی وصل می‌شوند و مسیرهای اصلی تست می‌شوند.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
let child;

before(async () => {
  child = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await Promise.race([
    new Promise((res) => {
      child.stdout.on('data', (d) => { if (String(d).includes('بالا آمد')) res(); });
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('سرور بالا نیامد')), 15_000)),
  ]);
});

after(() => { child?.kill('SIGKILL'); });

function connect(code, joinPayload) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/ws?room=${code}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    inbox.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(m)) { waiters[i].resolve(m); waiters.splice(i, 1); }
    }
  });
  const api = {
    ws,
    inbox,
    send: (o) => ws.send(JSON.stringify(o)),
    wait: (pred, ms = 5000) => {
      const hit = inbox.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('منتظر ماندیم و نیامد: ' + pred.toString())), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
      });
    },
    close: () => ws.close(),
  };
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      if (joinPayload) api.send({ t: 'join', ...joinPayload });
      resolve(api);
    });
    ws.on('error', reject);
  });
}

test('سلامت سرویس و ساخت اتاق', async () => {
  const h = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(h.ok, true);
  const r = await (await fetch(`${BASE}/api/room`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'اتاق تست', maxP: 4, ttlHours: 2 }) })).json();
  assert.equal(r.ok, true);
  assert.match(r.code, /^[A-Z2-9]{7}$/);
  const info = await (await fetch(`${BASE}/api/room/${r.code}`)).json();
  assert.equal(info.exists, true);
  assert.equal(info.name, 'اتاق تست');
  assert.ok(info.ttlLeftMs > 0);
});

test('دو کاربر: ورود، همتاها، چت، تایپ، دست، وضعیت، واکنش', async () => {
  const code = 'TEST' + Math.floor(Math.random() * 900 + 100);
  const a = await connect(code, { id: 'aaa', name: 'آرش', s: { mic: true, cam: true } });
  const wa = await a.wait((m) => m.t === 'welcome');
  assert.equal(wa.room.code, code);
  assert.equal(wa.you.role, 'host', 'اولین نفر میزبان است');

  const b = await connect(code, { id: 'bbb', name: 'بهار', s: { mic: false, cam: false } });
  const wb = await b.wait((m) => m.t === 'welcome');
  assert.equal(wb.you.role, 'member');
  assert.equal(wb.peers.length, 1, 'بهار باید آرش را ببیند');
  assert.equal(wb.peers[0].name, 'آرش');
  await a.wait((m) => m.t === 'pjoin' && m.peer.id === 'bbb');

  // چت
  a.send({ t: 'chat', m: { id: 'm1', text: 'سلام بهار 👋' } });
  const chat = await b.wait((m) => m.t === 'chat' && m.m.id === 'm1');
  assert.equal(chat.m.text, 'سلام بهار 👋');
  assert.equal(chat.m.name, 'آرش');

  // تایپ، دست، وضعیت
  a.send({ t: 'typing', on: true });
  await b.wait((m) => m.t === 'typing' && m.on === true);
  a.send({ t: 'hand', up: true });
  await b.wait((m) => m.t === 'hand' && m.up === true);
  b.send({ t: 'state', s: { mic: true } });
  await a.wait((m) => m.t === 'state' && m.id === 'bbb' && m.s.mic === true);

  // واکنش
  a.send({ t: 'react', emoji: '🎉' });
  await b.wait((m) => m.t === 'react' && m.emoji === '🎉');

  // سیگنالینگ WebRTC (offer/answer/candidate)
  a.send({ t: 's', to: 'bbb', d: { sdp: { type: 'offer', sdp: 'v=0' } } });
  const sig = await b.wait((m) => m.t === 's' && m.from === 'aaa');
  assert.equal(sig.d.sdp.type, 'offer');
  b.send({ t: 's', to: 'aaa', d: { cand: { candidate: 'candidate:1 1 udp 1 1.1.1.1 1 typ host' } } });
  await a.wait((m) => m.t === 's' && m.from === 'bbb');

  // پخش فایل زنده با «*»
  a.send({ t: 's', to: '*', d: { f: { id: 'F1', i: -1, n: 'a.png', s: 10, mime: 'image/png', parts: 1 } } });
  const start = await b.wait((m) => m.t === 's' && m.d?.f?.id === 'F1');
  assert.equal(start.from, 'aaa');
  assert.equal(start.d.f.i, -1);

  // نظرسنجی توسط میزبان
  a.send({ t: 'poll', op: 'add', q: 'کجا بسازیم؟', options: ['تهران', 'شیراز'] });
  const poll = await b.wait((m) => m.t === 'poll' && m.poll?.q === 'کجا بسازیم؟');
  b.send({ t: 'poll', op: 'vote', i: 1 });
  const voted = await a.wait((m) => m.t === 'poll' && m.poll?.votes?.bbb?.[0] === 1);
  assert.ok(voted);

  // یادداشت مشترک
  b.send({ t: 'notes', text: 'صورت‌جلسه تست' });
  const notes = await a.wait((m) => m.t === 'notes' && m.text === 'صورت‌جلسه تست');
  assert.equal(notes.from, 'bbb');

  // تخته سفید
  a.send({ t: 'wb', ops: [{ t: 'pen', pts: [{ x: 1, y: 2 }], color: '#fff', size: 3 }] });
  const wbMsg = await b.wait((m) => m.t === 'wb' && Array.isArray(m.ops));
  assert.equal(wbMsg.ops[0].t, 'pen');

  // انتقال میزبانی
  a.send({ t: 'host', op: 'transfer', id: 'bbb' });
  const you = await b.wait((m) => m.t === 'room' && m.you?.role === 'host');
  assert.ok(you);

  // خروج بهار → آرش میزبان می‌شود + پیام خروج
  b.close();
  await a.wait((m) => m.t === 'pleave' && m.id === 'bbb');

  // زیرنویس زنده
  a.send({ t: 'sub', text: 'این یک خط زیرنویس است' });
  a.send({ t: 'host', op: 'setttl', hours: 3 });
  const room = await a.wait((m) => m.t === 'room' && m.room?.ttlHours === 3);
  assert.equal(room.room.ttlHours, 3);
  a.close();
});

test('اتاق انتظار و رمز اتاق درست کار می‌کند', async () => {
  const code = 'WAIT' + Math.floor(Math.random() * 900 + 100);
  const host = await connect(code, { id: 'h1', name: 'میزبان' });
  await host.wait((m) => m.t === 'welcome');
  host.send({ t: 'host', op: 'waitingroom', on: true });
  await host.wait((m) => m.t === 'room' && m.room.waitingRoom === true);

  const guest = await connect(code, { id: 'g1', name: 'مهمان' });
  const waiting = await guest.wait((m) => m.t === 'waiting');
  assert.ok(waiting);
  const knock = await host.wait((m) => m.t === 'knock' && m.peer.id === 'g1');
  assert.equal(knock.peer.name, 'مهمان');
  host.send({ t: 'host', op: 'approve', id: 'g1' });
  const w = await guest.wait((m) => m.t === 'welcome');
  assert.equal(w.you.id, 'g1');
  host.close();
  guest.close();
});

test('میزبان می‌تواند اخراج کند و اعمال قفل/عمر اتاق', async () => {
  const code = 'KICK' + Math.floor(Math.random() * 900 + 100);
  const host = await connect(code, { id: 'h2', name: 'مدیر' });
  await host.wait((m) => m.t === 'welcome');
  const guest = await connect(code, { id: 'g2', name: 'شیطون' });
  await guest.wait((m) => m.t === 'welcome');
  host.send({ t: 'host', op: 'kick', id: 'g2' });
  const bye = await guest.wait((m) => m.t === 'bye');
  assert.match(bye.reason, /میزبان/);
  host.send({ t: 'host', op: 'lock', on: true });
  const r = await host.wait((m) => m.t === 'room' && m.room?.locked === true);
  assert.ok(r);
  host.close(); guest.close();
});

test('فایل‌های استاتیک و صفحهٔ اتاق سرو می‌شوند', async () => {
  const home = await fetch(`${BASE}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /هم‌کلام/);
  const room = await fetch(`${BASE}/r/ABC1234`);
  assert.equal(room.status, 200);
  assert.match(await room.text(), /ورود به اتاق/);
  const js = await fetch(`${BASE}/build/room.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type') || '', /javascript/);
  const ice = await (await fetch(`${BASE}/api/ice`)).json();
  assert.ok(Array.isArray(ice.iceServers));
});
