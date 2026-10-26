// تست‌های همیار پلاس: صحت بانک محتوا + API + منطق نشانی سایت
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { handleApi, catalogStats } from '../worker/api.js';
import { fetchLiveCatalog, assertCatalog, checkOrigin } from '../tools/fetch-live-catalog.mjs';

const catalog = JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url), 'utf8'));
const require = createRequire(import.meta.url);
const { safeOrigin, parseBootstrap, fetchBootstrap } = require('../clients/desktop/endpoint.cjs');

test('کاتالوگ: هر ۱۲ پایه و حداقل‌های محتوا', () => {
  assert.equal(catalog.grades.length, 12);
  assert.deepEqual(catalog.grades.map((g) => g.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const stats = catalogStats(catalog);
  assert.ok(stats.subjects >= 80, 'درس‌های کافی نیست: ' + stats.subjects);
  assert.ok(stats.lessons >= 350, 'فصل‌های کافی نیست: ' + stats.lessons);
  assert.ok(stats.qa >= 3000, 'پرسش‌های کافی نیست: ' + stats.qa);
  for (const g of catalog.grades) assert.ok(g.subjects.length >= 5, `پایهٔ ${g.id} درس کم دارد`);
});

test('کاتالوگ: پیوندها سالم‌اند و هر پرسش جواب دارد', () => {
  const subjects = new Map(catalog.subjects.map((s) => [s.id, s]));
  const seen = new Set();
  for (const l of catalog.lessons) {
    assert.ok(!seen.has(l.id), 'تکراری: ' + l.id); seen.add(l.id);
    assert.ok(subjects.has(l.subject), 'درس ناموجود برای: ' + l.id);
    assert.ok(subjects.get(l.subject).lessons.includes(l.id));
    assert.ok(l.title && l.summary);
    for (const item of l.qa) { assert.ok(item.q.length > 2); assert.ok(item.a.length > 0); }
  }
});

test('API: سلامت، bootstrap اپ‌ها و جستجو', async () => {
  const req = (path) => new Request('https://hamyar-plus.pages.dev' + path);
  const health = await handleApi(req('/api/health'), catalog).json();
  assert.equal(health.ok, true); assert.equal(health.app, 'hamyar-plus'); assert.equal(health.grades, 12);

  const boot = await handleApi(req('/api/v1/client/bootstrap'), catalog).json();
  assert.equal(boot.origin, 'https://hamyar-plus.pages.dev');
  assert.equal(boot.appUrl, 'https://hamyar-plus.pages.dev/');
  // اپ‌ها دقیقاً همین پاسخ را اعتبارسنجی می‌کنند:
  assert.equal(parseBootstrap(boot, boot.origin).ok, true);
  assert.throws(() => parseBootstrap({ ...boot, app: 'other' }, boot.origin));
  assert.throws(() => parseBootstrap(boot, 'https://evil.example.com'));

  const found = await handleApi(req('/api/search?q=' + encodeURIComponent('فیثاغورس')), catalog).json();
  assert.ok(found.results.length >= 1, 'جستجوی فیثاغورس باید نتیجه بدهد');

  const one = catalog.lessons[0];
  const got = await handleApi(req('/api/lesson/' + one.id), catalog).json();
  assert.equal(got.lesson.id, one.id);

  const missing = handleApi(req('/api/lesson/nope'), catalog);
  assert.equal(missing.status, 404);
  const cors = handleApi(new Request('https://x.dev/api/health', { method: 'OPTIONS' }), catalog);
  assert.equal(cors.status, 204);
  assert.equal(cors.headers.get('access-control-allow-origin'), '*');
});

test('نشانی سایت: فقط مبدأ https عمومی بدون مسیر پذیرفته می‌شود', () => {
  assert.equal(safeOrigin('https://hamyar-plus.pages.dev'), 'https://hamyar-plus.pages.dev');
  assert.equal(safeOrigin('https://hamyar-plus.pages.dev/'), 'https://hamyar-plus.pages.dev');
  assert.equal(safeOrigin('http://hamyar-plus.pages.dev'), '');
  assert.equal(safeOrigin('https://hamyar-plus.pages.dev/app'), '');
  assert.equal(safeOrigin('https://user:pass@hamyar-plus.pages.dev'), '');
  assert.equal(safeOrigin('https://localhost'), '');
  assert.equal(safeOrigin('https://x.test'), '');
  assert.equal(safeOrigin(''), '');
  assert.equal(safeOrigin(undefined), '');
});

test('fetchBootstrap: پاسخ سالم/خراب/شبکهٔ قطع', async () => {
  const good = {
    ok: true, json: null, headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ ok: true, app: 'hamyar-plus', origin: 'https://a.dev', appUrl: 'https://a.dev/', siteName: 'همیار پلاس', catalogVersion: 1 }),
  };
  const ok = await fetchBootstrap('https://a.dev', { fetchImpl: async () => good });
  assert.equal(ok.ok, true);
  const down = await fetchBootstrap('https://a.dev', { fetchImpl: async () => { throw new Error('net down'); } });
  assert.equal(down.ok, false);
  const badOrigin = await fetchBootstrap('http://a.dev', { fetchImpl: async () => good });
  assert.equal(badOrigin.ok, false);
});

test('بخش‌بندی صفحه‌ای: فعالیت، کار در کلاس و تمرین برای فصل‌ها', () => {
  const withPages = catalog.lessons.filter((l) => Array.isArray(l.pages) && l.pages.length >= 2);
  assert.ok(withPages.length >= 150, 'فصل‌های صفحه‌بندی‌شده کم است: ' + withPages.length);
  for (const l of withPages) for (const sec of l.pages) {
    assert.ok(['فعالیت', 'کار در کلاس', 'تمرین'].includes(sec.t), 'عنوان بخش نامعتبر: ' + sec.t);
    for (const item of sec.qa) { assert.ok(item.q && item.a); }
  }
  assert.ok(catalog.lessons.some((l) => l.title.includes('بخش‌پذیری')));
  assert.ok(catalog.lessons.some((l) => l.title.includes('فشار و آثار آن')));
});

test('هستهٔ زندهٔ سایت: واکشی و اعتبارسنجی کاتالوگ برای تزریق به اپ', async () => {
  assert.equal(checkOrigin('https://hamyar-plus.pages.dev/'), 'https://hamyar-plus.pages.dev');
  assert.equal(checkOrigin('http://127.0.0.1:8899'), 'http://127.0.0.1:8899');
  assert.throws(() => checkOrigin('https://x.dev/app'));
  assert.throws(() => assertCatalog({ app: 'other', grades: [], subjects: [], lessons: [] }));
  const routes = {
    '/api/health': { ok: true, app: 'hamyar-plus', version: 4 },
    '/api/catalog': catalog,
  };
  const fakeFetch = async (url) => {
    const path = new URL(url).pathname;
    if (!routes[path]) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => routes[path] };
  };
  const got = await fetchLiveCatalog('https://hamyar-plus.pages.dev', { fetchImpl: fakeFetch });
  assert.equal(got.grades.length, 12);
  await assert.rejects(() => fetchLiveCatalog('https://hamyar-plus.pages.dev', { fetchImpl: async () => { throw new Error('down'); } }));
});

test('بانک آفلاین پرحجم ولی بهینه است (کل کاتالوگ زیر ۳ مگابایت)', () => {
  const raw = readFileSync(new URL('../public/data/catalog.json', import.meta.url));
  assert.ok(raw.length < 3 * 1024 * 1024, 'کاتالوگ سنگین شده: ' + raw.length);
});
