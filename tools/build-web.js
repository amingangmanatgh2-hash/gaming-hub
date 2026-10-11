/*
 * تکاور ریسینگ — ساخت نسخه‌ی وب تک‌فایلی
 * یک فایل HTML مستقل می‌سازد (CSS + همه‌ی JS داخلش inline) که با دوبار کلیک
 * در مرورگر باز می‌شود و کل بازی را پیش‌نمایش می‌دهد. بدون نیاز به سرور.
 *   node tools/build-web.js  →  dist/takavar-web.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'takavar-web.html');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

/* ترتیب اسکریپت‌ها را از خود index.html بخوان */
const srcs = [];
html.replace(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/g, (m, src) => { srcs.push(src); return m; });
if (!srcs.length) throw new Error('هیچ اسکریپتی در index.html پیدا نشد');

const js = srcs.map(s => {
  const p = path.join(ROOT, s);
  return '\n/* ===== ' + s + ' ===== */\n' + fs.readFileSync(p, 'utf8');
}).join('\n');

/* جایگزینی لینک CSS با استایل inline */
html = html.replace(/<link[^>]+rel="stylesheet"[^>]+href="css\/style\.css"[^>]*>/,
  '<style>\n' + css + '\n</style>');

/* اولین تگ اسکریپت را با اسکریپت inline ترکیبی عوض کن، بقیه را حذف کن */
let first = true;
html = html.replace(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/g, () => {
  if (first) { first = false; return '<script>\n' + js + '\n</script>'; }
  return '';
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

/* صحت‌سنجی: JS ترکیبی باید پارس شود */
const tmp = path.join(ROOT, 'dist', '_check.js');
fs.writeFileSync(tmp, js, 'utf8');
try { require('child_process').execSync('node --check ' + JSON.stringify(tmp), { stdio: 'inherit' }); }
finally { try { fs.unlinkSync(tmp); } catch (e) {} }

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log('✓ ساخته شد: dist/takavar-web.html  (' + kb + ' KB, ' + srcs.length + ' ماژول inline)');
