import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, DEFAULT_PRODUCTS, InputError, tomanPrice, publicCatalog, validateSettings, validateProduct, normalizeAiProposal, isSafeDestination, parseVlessHeader, vlessLinks } from '../shared/market.js';

const plan = { ...DEFAULT_PRODUCTS[1], features: [...DEFAULT_PRODUCTS[1].features] };

test('دلاری به تومان: قیمت پایه و تغییر نرخ بدون تغییر سفارش قدیمی', () => {
  assert.equal(tomanPrice(3.9, 90000), 351000);
  assert.equal(tomanPrice(3.9, 100000), 390000);
  assert.equal(tomanPrice(0, 90000), 0);
  const disabled = validateSettings({ freeEnabled: false }, DEFAULT_SETTINGS);
  assert.equal(publicCatalog(disabled, DEFAULT_PRODUCTS).some((p) => p.tier === 'free'), false);
  assert.throws(() => validateSettings({ usdToToman: 0 }), InputError);
  assert.throws(() => validateSettings({ botToken: 'leak' }), InputError);
});

test('طرح‌ها و پیشنهاد AI فقط فیلدهای مجاز را تغییر می‌دهند', () => {
  assert.equal(validateProduct({ ...plan, priceUSD: 4.2 }).priceUSD, 4.2);
  assert.throws(() => validateProduct({ ...plan, tier: 'free', priceUSD: 4 }), InputError);
  assert.throws(() => validateProduct({ ...plan, features: Array(9).fill('x') }), InputError);
  const proposal = normalizeAiProposal({ reply: 'انجام شد', changes: { settings: { freeEnabled: false }, products: [{ id: 'plus', priceUSD: 4.2 }] } }, DEFAULT_SETTINGS, DEFAULT_PRODUCTS);
  assert.equal(proposal.changes.settings.freeEnabled, false);
  assert.equal(proposal.changes.products[0].priceUSD, 4.2);
  assert.throws(() => normalizeAiProposal({ changes: { settings: { SETUP_KEY: 'oops' } } }, DEFAULT_SETTINGS, DEFAULT_PRODUCTS), InputError);
  assert.throws(() => normalizeAiProposal({ changes: { products: [{ id: 'missing', enabled: true }] } }, DEFAULT_SETTINGS, DEFAULT_PRODUCTS), InputError);
});

test('مقصد TCP: فقط دامنهٔ عمومی و پورت‌های ۸۰/۴۴۳', () => {
  for (const host of ['github.com', 'registry.npmjs.org']) assert.ok(isSafeDestination(host, 443));
  for (const host of ['localhost', '169.254.169.254', '0x7f.0.0.1', 'metadata.google.internal', 'foo.local', 'test.example', 'foo.localhost', 'foo.nip.123', 'example.com-']) assert.equal(isSafeDestination(host, 443), false, host);
  assert.equal(isSafeDestination('github.com', 22), false);
});

function packet({ uuid = 'b513d769-478f-444f-9a49-f39abb1579f6', command = 1, port = 443, type = 2, domain = 'github.com', payload = [1, 2, 3] } = {}) {
  const id = uuid.replaceAll('-', '');
  const host = new TextEncoder().encode(domain);
  const bytes = new Uint8Array(23 + host.length + payload.length);
  bytes[0] = 0;
  for (let i = 0; i < 16; i++) bytes[i + 1] = parseInt(id.slice(i * 2, i * 2 + 2), 16);
  bytes[17] = 0; bytes[18] = command; bytes[19] = port >> 8; bytes[20] = port & 255;
  bytes[21] = type; bytes[22] = host.length; bytes.set(host, 23); bytes.set(payload, 23 + host.length);
  return bytes;
}

test('هدر VLESS: تکه‌تکه، TCP، دامنه و UUID درست تجزیه می‌شوند', () => {
  const data = packet();
  assert.equal(parseVlessHeader(data.subarray(0, 12)), null);
  assert.equal(parseVlessHeader(data.subarray(0, 24)), null);
  const header = parseVlessHeader(data);
  assert.equal(header.uuid, 'b513d769-478f-444f-9a49-f39abb1579f6');
  assert.equal(header.domain, 'github.com');
  assert.equal(header.port, 443);
  assert.deepEqual([...header.payload], [1, 2, 3]);
  assert.throws(() => parseVlessHeader(packet({ command: 2 })), InputError);
  assert.throws(() => parseVlessHeader(packet({ port: 22 })), InputError);
  assert.throws(() => parseVlessHeader(packet({ type: 1 })), InputError);
  assert.throws(() => parseVlessHeader(packet({ domain: 'host.local' })), InputError);
});

test('اشتراک شامل چهار پروفایل با یک hostname واقعی است، نه سرورهای ساختگی', () => {
  const links = vlessLinks({ uuid: 'b513d769-478f-444f-9a49-f39abb1579f6', hostname: 'madar.example.com' });
  assert.equal(links.length, 4);
  const params = new URL(links[0]).searchParams;
  assert.equal(params.get('security'), 'tls');
  assert.equal(params.get('type'), 'ws');
  assert.equal(params.get('path'), '/edge?profile=auto');
  assert.ok(links.every((l) => l.includes('@madar.example.com:443')));
});
