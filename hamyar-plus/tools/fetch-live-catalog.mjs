// گرفتن کاتالوگ زنده از سایت دپلوی‌شده و نشاندن آن به‌عنوان هستهٔ لوکال اپ‌ها.
// در خط لولهٔ CI بعد از دپلوی Cloudflare اجرا می‌شود تا APK/EXE دقیقاً همان
// هستهٔ Pages/Workerِ منتشرشده را داخل خود داشته باشند + نشانی همان سایت.
// اجرا: node tools/fetch-live-catalog.mjs https://hamyar-plus.xxx.workers.dev [--strict]
// بدون --strict اگر سایت پاسخ نداد، با هشدار از کاتالوگ لوکال استفاده می‌شود (بیلد نمی‌شکند).
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function assertCatalog(c) {
  if (!c || c.app !== 'hamyar-plus' || !Array.isArray(c.grades) || c.grades.length !== 12
    || !Array.isArray(c.subjects) || !Array.isArray(c.lessons) || c.lessons.length < 100) {
    throw new Error('پاسخ سایت کاتالوگ معتبر همیار پلاس نیست');
  }
  return c;
}

export function checkOrigin(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/i.test(s)) return s;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(s)) return s; // فقط تست لوکال
  throw new Error('نشانی سایت باید مبدأ عمومی https بدون مسیر باشد');
}

export async function fetchLiveCatalog(origin, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const base = checkOrigin(origin);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const health = await fetchImpl(`${base}/api/health`, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!health.ok) throw new Error(`health HTTP ${health.status}`);
    const h = await health.json();
    if (!h.ok || h.app !== 'hamyar-plus') throw new Error('نقطهٔ /api/health متعلق به همیار پلاس نیست');
    const res = await fetchImpl(`${base}/api/catalog`, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
    return assertCatalog(await res.json());
  } finally { clearTimeout(timer); }
}

export async function applyLiveCatalog(origin, publicDir, opts) {
  const catalog = await fetchLiveCatalog(origin, opts);
  const dataDir = join(publicDir, 'data');
  await mkdir(dataDir, { recursive: true });
  const json = JSON.stringify(catalog);
  await writeFile(join(dataDir, 'catalog.json'), json + '\n');
  await writeFile(join(dataDir, 'catalog.js'), `// هستهٔ زندهٔ سایت — دریافت خودکار با fetch-live-catalog از ${checkOrigin(origin)}\nwindow.__HAMYAR_CATALOG__ = ${json};\n`);
  const qa = catalog.lessons.reduce((n, l) => n + l.qa.length + (l.pages || []).reduce((m, x) => m + x.qa.length, 0), 0);
  return { version: catalog.version, lessons: catalog.lessons.length, qa };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const origin = process.argv[2] || process.env.HAMYAR_SITE_ORIGIN || '';
  const strict = process.argv.includes('--strict');
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  if (!origin) { console.log('ℹ️ نشانی سایت داده نشده؛ کاتالوگ لوکال دست نخورده می‌ماند.'); process.exit(0); }
  try {
    const st = await applyLiveCatalog(origin, publicDir);
    console.log(`✅ هستهٔ زندهٔ سایت داخل برنامه نشست: نسخهٔ کاتالوگ ${st.version}، ${st.lessons} فصل، ${st.qa} پرسش‌وپاسخ از ${origin}`);
  } catch (e) {
    console.log(`::warning::گرفتن کاتالوگ زنده از ${origin} نشد (${e.message})؛ از کاتالوگ لوکال همین کد استفاده می‌شود.`);
    console.log('⚠️ ادامه با کاتالوگ لوکال (محتوای همین کامیت).');
    if (strict) process.exit(1);
  }
}
