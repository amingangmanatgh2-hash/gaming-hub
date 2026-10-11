/** آزمون پروتکل، ICE، تولید کد اتاق و فهرست قابلیت‌ها */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCode, randomCode, randomId, LIMITS, C2S, S2C } from '../shared/protocol.js';
import { iceServers, DEFAULT_STUN } from '../shared/turn.js';
import { FEATURES, FEATURE_COUNT, CATEGORIES } from '../src/features/registry.js';

test('کد اتاق فقط نویسه‌های مجاز و طول درست دارد', () => {
  const c = randomCode(7);
  assert.equal(c.length, 7);
  assert.match(c, /^[A-Z2-9]+$/);
  assert.equal(cleanCode(' ab-cd_12$$ '), 'AB-CD_12');
  assert.equal(cleanCode('x'.repeat(60)).length, LIMITS.ROOM_CODE_LEN);
  assert.ok(randomId(12).length === 12);
});

test('کدهای تصادفی تکرار معنادار ندارند', () => {
  const set = new Set(Array.from({ length: 800 }, () => randomCode(7)));
  assert.ok(set.size > 780, `تعداد یکتا: ${set.size}`);
});

test('بدون کلید TURN فقط STUN برمی‌گردد (کم‌مصرف‌ترین حالت)', async () => {
  const r = await iceServers({});
  assert.equal(r.relay, false);
  assert.equal(r.servers.length, 1);
  assert.deepEqual(r.servers[0].urls, DEFAULT_STUN);
  assert.ok(r.servers[0].urls.some((u) => u.includes('cloudflare')));
});

test('TURN دستی (سازگاری با نسخه‌های قدیمی) پشتیبانی می‌شود', async () => {
  const r = await iceServers({ TURN_URLS: 'turn:a.example:3478,turns:b.example:5349', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' });
  assert.equal(r.relay, true);
  assert.equal(r.source, 'custom-turn');
  assert.equal(r.servers[1].username, 'u');
});

test('ویژگی‌های پروتکل ثابت و بدون تکرار هستند', () => {
  const c2s = Object.values(C2S);
  const s2c = Object.values(S2C);
  assert.equal(new Set(c2s).size, c2s.length);
  assert.equal(new Set(s2c).size, s2c.length);
  for (const k of ['join', 'chat', 's', 'host', 'wb', 'poll', 'notes', 'sub']) assert.ok(c2s.includes(k), k);
});

test('فهرست قابلیت‌ها حداقل ۱۲۰ مورد یکتا دارد و هر دسته پُر است', () => {
  assert.ok(FEATURE_COUNT >= 120, `تعداد: ${FEATURE_COUNT}`);
  const titles = FEATURES.map((f) => f.t);
  assert.equal(new Set(titles).size, titles.length, 'عنوان‌ها تکراری‌اند');
  for (const c of CATEGORIES) {
    assert.ok(FEATURES.some((f) => f.cat === c.id), `دستهٔ خالی: ${c.id}`);
  }
  assert.equal(FEATURES[0].n, 1);
  assert.equal(FEATURES[FEATURE_COUNT - 1].n, FEATURE_COUNT);
});
