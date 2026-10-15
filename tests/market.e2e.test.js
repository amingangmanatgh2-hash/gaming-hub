import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { WebSocket } from 'ws';

const PORT = 8809;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const KEY = 'integration-only-setup-key-long-enough';
const PERSIST = join(process.cwd(), '.wrangler', `market-test-${process.pid}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready(child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Wrangler exited before becoming ready');
    try { if ((await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(500) })).ok) return; } catch { /* waiting for port */ }
    await sleep(200);
  }
  throw new Error('Wrangler did not become ready');
}

// Real Worker + real SQLite-backed DO, using a separate ephemeral local state directory.
test('فروشگاه: نصب، امنیت، قیمت، سفارش، اشتراک و لغو دسترسی', { timeout: 65_000 }, async () => {
  const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', PERSIST,
    '--var', `SETUP_KEY:${KEY}`, '--var', 'APP_SECRET:integration-only-encryption-key-32-characters'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stderr.on('data', (data) => { logs = (logs + data.toString()).slice(-8000); });
  child.stdout.on('data', (data) => { logs = (logs + data.toString()).slice(-8000); });
  let cookie = '', csrf = '';
  async function request(path, method = 'GET', data, headers = {}) {
    const response = await fetch(BASE + path, {
      method, headers: { ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json().catch(() => ({}));
    return { response, result };
  }
  try {
    await ready(child);
    assert.equal((await request('/setup/status')).result.initialized, false);
    const beforeBootstrap = await request('/client/bootstrap');
    assert.equal(beforeBootstrap.response.status, 409);
    assert.equal(beforeBootstrap.result.code, 'setup_required');
    assert.equal((await request('/orders', 'POST', { productId: 'plus', name: 'کاربر تست', contact: '@user_test' })).response.status, 409);
    assert.equal((await request('/setup', 'POST', { setupKey: 'wrong', password: 'GoodPass123' })).response.status, 403);
    const installed = await request('/setup', 'POST', { setupKey: KEY, password: 'GoodPass123', usdToToman: 90000, siteName: 'مدار تست' });
    assert.equal(installed.response.status, 201, JSON.stringify(installed.result));
    cookie = installed.response.headers.get('set-cookie').split(';')[0]; csrf = installed.result.csrf;
    const bootstrap = await request('/client/bootstrap');
    assert.equal(bootstrap.response.status, 200);
    assert.equal(bootstrap.response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(bootstrap.result, {
      ok: true, version: 1, initialized: true, origin: `http://127.0.0.1:${PORT}`,
      appUrl: `http://127.0.0.1:${PORT}/app`, siteName: 'مدار تست', transport: 'vless-ws-tcp',
    });
    assert.equal(bootstrap.response.headers.get('set-cookie'), null);
    assert.equal((await request('/setup', 'POST', { setupKey: KEY, password: 'AgainPass123' })).response.status, 409);
    assert.equal((await request('/admin/settings', 'PUT', { usdToToman: 100000 }, { 'x-csrf-token': 'wrong' })).response.status, 401);
    assert.equal((await request('/admin/settings', 'PUT', { usdToToman: 100000 }, { origin: 'https://another.example' })).response.status, 403);
    assert.equal((await request('/orders', 'POST', { productId: 'plus', name: 'کاربر تست', contact: '@user_test', expectedPriceToman: 1 })).response.status, 409);
    const order = await request('/orders', 'POST', { productId: 'plus', name: 'کاربر تست', contact: '@user_test', expectedPriceToman: 351000 });
    assert.equal(order.response.status, 201);
    assert.equal(order.result.priceToman, 351000);
    const changed = await request('/admin/settings', 'PUT', { usdToToman: 100000, siteName: 'مدار نو' });
    assert.equal(changed.response.status, 200);
    assert.equal((await request('/public')).result.products.find((p) => p.id === 'plus').priceToman, 390000);
    assert.equal((await request('/client/bootstrap')).result.siteName, 'مدار نو', 'bootstrap updates without rebuilding native apps');
    const tracked = await request(`/orders/${order.result.id}/status`, 'POST', { receipt: order.result.receipt });
    assert.equal(tracked.result.order.priceToman, 351000, 'old orders keep their price snapshot');
    assert.equal((await request(`/orders/${order.result.id}/status`, 'POST', { receipt: 'not-a-receipt' })).response.status, 403);
    const approval = await request(`/admin/orders/${order.result.id}`, 'PATCH', { status: 'approved' });
    assert.equal(approval.response.status, 200);
    const approved = await request(`/orders/${order.result.id}/status`, 'POST', { receipt: order.result.receipt });
    const sub = approved.result.order.subscriptionUrl.slice('/api/v1'.length);
    const subscription = await request(sub + '?format=json');
    assert.equal(subscription.result.links.length, 4);
    assert.ok(subscription.result.links.every((link) => link.startsWith('vless://')));
    assert.equal(subscription.response.headers.get('access-control-allow-origin'), null);
    const free = await request('/activate/free', 'POST', {});
    assert.equal(free.response.status, 201);
    assert.equal((await request('/activate/free', 'POST', {})).response.status, 429);
    const freeSub = free.result.subscriptionUrl.slice('/api/v1'.length);
    assert.equal((await request(freeSub + '?format=json')).response.status, 200);
    await request('/admin/settings', 'PUT', { freeEnabled: false });
    assert.equal((await request(freeSub + '?format=json')).response.status, 403);
    const revoked = await request(`/admin/orders/${order.result.id}`, 'PATCH', { status: 'revoked' });
    assert.equal(revoked.response.status, 200);
    assert.equal((await request(sub + '?format=json')).response.status, 403);
    assert.equal((await request('/admin/ai', 'POST', { message: 'نرخ را تغییر بده' })).response.status, 503, 'AI must not be faked without binding');
    assert.equal((await request('/admin/bot', 'POST', { token: 'invalid' })).response.status, 400);
    assert.equal((await request('/telegram/webhook', 'POST', { message: { text: '/start', chat: { id: 1 } } })).response.status, 403);
    const password = await request('/admin/password', 'POST', { currentPassword: 'GoodPass123', newPassword: 'StrongerPass456' });
    assert.equal(password.response.status, 200);
    assert.equal((await request('/admin/me')).response.status, 401);
    assert.equal((await request('/login', 'POST', { password: 'GoodPass123' })).response.status, 401);
    const loggedIn = await request('/login', 'POST', { password: 'StrongerPass456' });
    assert.equal(loggedIn.response.status, 200);

    // Invalid UUID is rejected *before* any outbound TCP connection is opened.
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/edge`);
    const closeCode = await new Promise((resolve, reject) => {
      ws.once('open', () => {
        const header = new Uint8Array(23 + 'github.com'.length);
        header[0] = 0; crypto.getRandomValues(header.subarray(1, 17));
        header[18] = 1; header[19] = 1; header[20] = 187; header[21] = 2; header[22] = 10;
        header.set(new TextEncoder().encode('github.com'), 23);
        ws.send(header);
      });
      ws.once('close', (code) => resolve(code));
      ws.once('error', reject);
    });
    assert.equal(closeCode, 1008);
  } catch (error) {
    throw new Error(`${error.message}\nWrangler tail:\n${logs.slice(-2000)}`);
  } finally {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(3000)]);
    await rm(PERSIST, { recursive: true, force: true });
  }
});
