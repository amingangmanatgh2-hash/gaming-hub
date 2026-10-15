import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { probeWorker, subscriptionIsInvalid } from '../public/connectivity.js';

const require = createRequire(import.meta.url);
const { safeOrigin, parseBootstrap, fetchBootstrap } = require('../clients/desktop/endpoint.cjs');
const ORIGIN = 'https://gaming-hub.account.workers.dev';
const manifest = { ok: true, version: 1, initialized: true, origin: ORIGIN, appUrl: `${ORIGIN}/app`, transport: 'vless-ws-tcp', siteName: 'مدار' };

test('آدرس embed فقط میزبان عمومی HTTPS است؛ هیچ رمز/توکن/مسیر نباید در binary بماند', () => {
  assert.equal(safeOrigin(`${ORIGIN}/`), ORIGIN);
  assert.equal(safeOrigin('HTTPS://WORKER.EXAMPLE.COM:443/'), 'https://worker.example.com'); // parsing only; no DNS availability claim
  for (const url of [
    'http://gaming-hub.account.workers.dev', 'https://user:pass@site.com', 'https://site.com/setup',
    'https://site.com/?token=secret', 'https://site.com/#x', 'https://127.0.0.1',
    'https://localhost', 'https://shop.internal', 'https://site.local', 'https://a..com',
    'https://site.com:8443', 'file:///etc/passwd', 'https://x.example',
  ]) assert.equal(safeOrigin(url), '', url);
});

test('native bootstrap waits for setup, checks exact origin and rejects alien redirects/manifests', async () => {
  const waiting = await fetchBootstrap(ORIGIN, { fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.accept, 'application/json');
    return new Response(JSON.stringify({ code: 'setup_required' }), { status: 409 });
  } });
  assert.equal(waiting.pending, true);
  const ok = await fetchBootstrap(ORIGIN, { fetchImpl: async (url) => {
    assert.equal(url, `${ORIGIN}/api/v1/client/bootstrap`);
    return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } });
  } });
  assert.deepEqual(ok, { ok: true, appUrl: `${ORIGIN}/app`, siteName: 'مدار' });
  assert.throws(() => parseBootstrap({ ...manifest, origin: 'https://another.workers.dev' }, ORIGIN), /Invalid/);
  assert.throws(() => parseBootstrap({ ...manifest, appUrl: 'https://evil.example/app' }, ORIGIN), /Invalid/);
  assert.throws(() => parseBootstrap({ ...manifest, version: 2 }, ORIGIN), /Invalid/);
  const invalid = await fetchBootstrap(ORIGIN, { fetchImpl: async () => new Response(JSON.stringify({ ...manifest, origin: 'https://other.workers.dev' }), { headers: { 'content-type': 'application/json' } }) });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.pending, false);
  const offline = await fetchBootstrap(ORIGIN, { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(offline.ok, false);
  assert.equal(offline.pending, false);
});

test('قطعی گذرا/خطای ۵۰۰ لینک اشتراک را پاک نمی‌کند ولی لغو یا نبودن اشتراک پاک می‌کند', () => {
  for (const status of [undefined, 0, 408, 429, 500, 503]) assert.equal(subscriptionIsInvalid(status), false);
  for (const status of [403, 404, 410]) assert.equal(subscriptionIsInvalid(status), true);
});

test('ده آزمایش HTTPS نتیجهٔ واقعی ۸/۱۰ یا ۰/۱۰ را نشان می‌دهد؛ هیچ تضمینی اختراع نمی‌کند', async () => {
  let calls = 0;
  const progress = [];
  const result = await probeWorker({ count: 10, pause: async () => {}, onProgress: (p) => progress.push(p), fetchFn: async () => {
    calls++;
    if (calls === 2 || calls === 7) throw new Error('offline');
    return new Response(JSON.stringify({ ok: true, colo: 'FRA' }), { headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(result.successes, 8);
  assert.equal(result.total, 10);
  assert.equal(result.colo, 'FRA');
  assert.equal(progress.length, 10);
  assert.equal(progress.at(-1).successes, 8);
  const allBlocked = await probeWorker({ count: 3, pause: async () => {}, fetchFn: async () => { throw new Error('blocked'); } });
  assert.deepEqual(allBlocked, { successes: 0, total: 3, medianMs: null, colo: '—' });
  await assert.rejects(probeWorker({ count: 11 }), RangeError);
});
