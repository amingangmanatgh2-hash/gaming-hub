// بررسی واقعی خروجی بسته‌بندی: وجود نسخهٔ لوکال داخل ASAR و نشانی سایتِ سوار شده
const { readFileSync, existsSync, statSync, readdirSync } = require('node:fs');
const { safeOrigin } = require('./endpoint.cjs');

const fail = (m) => { console.error('❌ ' + m); process.exit(1); };
const release = 'release';
const asarPath = require('node:path').join(release, 'win-unpacked', 'resources', 'app.asar');
if (!existsSync(asarPath)) fail(`فایل بسته پیدا نشد: ${asarPath}`);
const asar = readFileSync(asarPath, 'latin1').slice(0, 2 * 1024 * 1024); // هدر ASAR فهرست فایل‌هاست
for (const name of ['catalog.js', 'index.html', 'app.js', 'main.cjs']) {
  if (!asar.includes(name)) fail(`در بستهٔ نهایی نیست: ${name}`);
}
const exe = readdirSync(release).find((f) => /^HamyarPlus-Setup-.*\.exe$/.test(f));
if (!exe) fail('فایل نصب HamyarPlus-Setup-*.exe در release نیست');
const exeSize = statSync(require('node:path').join(release, exe)).size;
if (exeSize < 10 * 1024 * 1024) fail(`حجم فایل نصب مشکوک است: ${exeSize}`);

const expected = safeOrigin(process.env.HAMYAR_SITE_ORIGIN || '');
const cfg = JSON.parse(readFileSync('build-config.json', 'utf8'));
if ((cfg.siteOrigin || '') !== expected) fail(`نشانی سایت در build-config (${cfg.siteOrigin}) با محیط (${expected}) یکی نیست`);
console.log(`✅ خروجی تأیید شد: ${exe} — نسخهٔ لوکال داخل بسته هست${expected ? ' — سایت پیش‌فرض: ' + expected : ' — حالت کاملاً لوکال'}`);
