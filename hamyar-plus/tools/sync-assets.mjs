// کپی نسخهٔ لوکال سبک (public/) به داخل APK و EXE + تزریق آدرس سایت
// اجرا:  HAMYAR_SITE_ORIGIN=https://hamyar-plus.pages.dev node tools/sync-assets.mjs
// بدون متغیر هم کار می‌کند؛ اپ‌ها لوکال بالا می‌آیند و آدرس از تنظیمات داخل اپ قابل ورود است.
import { cp, mkdir, rm, writeFile, stat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pub = join(root, 'public');
const origin = (process.env.HAMYAR_SITE_ORIGIN || '').trim().replace(/\/+$/, '');
if (origin && !/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/i.test(origin)) {
  console.error('❌ HAMYAR_SITE_ORIGIN باید نشانی عمومی https بدون مسیر باشد؛ مثل https://hamyar-plus.pages.dev');
  process.exit(1);
}
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;

const configFor = (appMode) => `// تولید خودکار توسط tools/sync-assets.mjs — دستی ویرایش نکنید
window.HAMYAR_CONFIG = {
  siteOrigin: ${JSON.stringify(origin)},
  appMode: ${JSON.stringify(appMode)},
  version: ${JSON.stringify(version)},
};
`;

async function syncTo(dest, appMode) {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(pub, dest, { recursive: true, filter: (src) => !src.endsWith('_headers') });
  await writeFile(join(dest, 'config.js'), configFor(appMode));
  let bytes = 0;
  const walk = async (d) => { for (const name of await readdir(d, { withFileTypes: true })) { const f = join(d, name.name); if (name.isDirectory()) await walk(f); else bytes += (await stat(f)).size; } };
  await walk(dest);
  console.log(`✅ ${appMode}: نسخهٔ لوکال (${Math.round(bytes / 1024)}KB) → ${dest.replace(root, '')} ${origin ? '· سایت: ' + origin : '· بدون سایتِ پیش‌فرض (کاملاً لوکال)'}`);
}

await syncTo(join(root, 'clients', 'android', 'app', 'src', 'main', 'assets', 'www'), 'android');
await syncTo(join(root, 'clients', 'desktop', 'app'), 'desktop');
console.log('تمام شد. اپ آنلاین باشد از سایت باز می‌شود، نباشد همین نسخهٔ لوکال بالا می‌آید.');
