/**
 * ساخت بستهٔ نهایی: src/ → public/build/*.js
 * چرا باندل؟ چون روی اینترنت با تأخیر بالا، ۱۰ درخواست کوچک خیلی گران‌تر از
 * ۱ درخواست است. کل اپ بعد از باندل زیر ۱۰۰ کیلوبایت می‌ماند.
 */
import { build } from 'esbuild';
import { statSync, mkdirSync } from 'node:fs';

mkdirSync('public/build', { recursive: true });

const entries = [
  { in: 'src/ui/home.js', out: 'public/build/home.js' },
  { in: 'src/ui/room.js', out: 'public/build/room.js' },
];

const t0 = Date.now();
for (const e of entries) {
  await build({
    entryPoints: [e.in],
    outfile: e.out,
    bundle: true,
    minify: true,
    format: 'esm',
    target: ['es2020', 'chrome90', 'firefox90', 'safari15'],
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'warning',
    banner: { js: `/* هم‌کلام | Hamkalam — کد فشرده‌شده. منبع: ${e.in} */` },
  });
  const kb = (statSync(e.out).size / 1024).toFixed(1);
  console.log(`✓ ${e.out}  (${kb} KB)`);
}
const total = entries.reduce((a, e) => a + statSync(e.out).size, 0);
const css = statSync('public/styles.css').size;
console.log(`✓ مجموع JS: ${(total / 1024).toFixed(1)} KB · CSS: ${(css / 1024).toFixed(1)} KB · زمان: ${Date.now() - t0}ms`);
console.log('  (همه با gzip کلودفلر خودکار فشرده می‌شوند؛ حجم واقعی روی شبکه کمتر است)');
