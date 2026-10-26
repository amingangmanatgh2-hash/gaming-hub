// ساخت build-config.json از متغیر محیطی HAMYAR_SITE_ORIGIN (فقط نشانی عمومی سایت)
const { writeFileSync } = require('node:fs');
const { safeOrigin } = require('./endpoint.cjs');
const raw = (process.env.HAMYAR_SITE_ORIGIN || '').trim();
const origin = safeOrigin(raw);
if (raw && !origin) { console.error('❌ HAMYAR_SITE_ORIGIN معتبر نیست (باید نشانی https عمومی بدون مسیر باشد)'); process.exit(1); }
writeFileSync('build-config.json', JSON.stringify({ siteOrigin: origin }, null, 2) + '\n');
console.log(origin ? `✅ build-config ساخته شد — سایت پیش‌فرض: ${origin}` : '✅ build-config ساخته شد — بدون سایت پیش‌فرض (کاملاً لوکال؛ نشانی از داخل برنامه قابل تنظیم است)');
