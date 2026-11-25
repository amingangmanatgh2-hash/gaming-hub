/* اسکریپت ساخت نسخه وب: کپی همه فایل‌های لازم به www/ (برای Capacitor و استقرار استاتیک) */
import { cpSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WWW = join(ROOT, 'www');

const DIRS = [
  'css', 'js', 'vendor/chessjs', 'vendor/stockfish', 'fonts', 'icons'
];
const FILES = [
  'index.html', 'manifest.json', 'sw.js'
];

mkdirSync(WWW, { recursive: true });
DIRS.forEach(function (d) {
  const src = join(ROOT, d);
  if (existsSync(src)) cpSync(src, join(WWW, d), { recursive: true });
});
FILES.forEach(function (f) {
  const src = join(ROOT, f);
  if (existsSync(src)) cpSync(src, join(WWW, f));
});

function count(dir) {
  let n = 0;
  if (!existsSync(dir)) return 0;
  for (const f of readdirSync(dir)) {
    const s = statSync(join(dir, f));
    n += s.isDirectory() ? count(join(dir, f)) : 1;
  }
  return n;
}
const total = DIRS.reduce(function (acc, d) { return acc + count(join(WWW, d)); }, 0) + FILES.filter(function (f) { return existsSync(join(WWW, f)); }).length;
console.log('✓ نسخه وب در www/ ساخته شد — ' + total + ' فایل (همه منابع داخل پروژه، بدون CDN)');
