#!/usr/bin/env node
/* ==========================================================================
   tools/build.js  ::  ساخت نسخه‌ی دسکتاپ (EXE / AppImage-dir / .app)
   --------------------------------------------------------------------------
   از @electron/packager استفاده می‌کند. روی هر سیستم‌عاملی می‌توان برای
   ویندوز خروجی گرفت (بدون Wine)، چون فقط باینری Electron کپی و تغییرنام
   داده می‌شود.

   نمونه:
     node tools/build.js --platform=win32 --arch=x64
   خروجی:
     dist/KafkhabRacing-win32-x64/Kafkhab Racing.exe
   ========================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

function arg(name, def) {
  const hit = process.argv.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : def;
}

const platform = arg('platform', process.platform === 'darwin' ? 'darwin' : 'win32');
const arch = arg('arch', 'x64');
const outDir = path.join(ROOT, 'dist');

const IGNORE = [
  /^\/dist(\/|$)/,
  /^\/node_modules\/(?!electron\/|@electron\/)/,
  /^\/android\/build(\/|$)/,
  /^\/android\/\.gradle(\/|$)/,
  /^\/\.git(\/|$)/,
  /^\/\.github(\/|$)/,
  /(^|\/)\.DS_Store$/,
  /npm-debug\.log$/
];

(async function main() {
  let packager;
  try {
    packager = require('@electron/packager');
  } catch (e) {
    console.error('بسته‌ی @electron/packager نصب نیست. اول اجرا کنید:  npm install');
    process.exit(1);
  }

  console.log('در حال ساخت نسخه‌ی ' + platform + '/' + arch + ' …');
  const t0 = Date.now();

  let appPaths;
  try {
    appPaths = await packager({
      dir: ROOT,
      name: 'Kafkhab Racing',
      appBundleId: 'com.kafkhab.racing',
      appVersion: require(path.join(ROOT, 'package.json')).version,
      platform: platform,
      arch: arch,
      out: outDir,
      overwrite: true,
      icon: fs.existsSync(path.join(ROOT, 'desktop', 'icon.png'))
        ? path.join(ROOT, 'desktop', 'icon.png') : undefined,
      ignore: IGNORE,
      prune: true,
      asar: false,           // تا فایل‌های بازی قابل بازرسی و ویرایش بمانند
      quiet: false
    });
  } catch (e) {
    console.error('\n✗ ساخت ناموفق:\n' + (e && e.message ? e.message : e));
    process.exit(1);
  }

  console.log('\n✓ ساخته شد در ' + ((Date.now() - t0) / 1000).toFixed(1) + ' ثانیه:');
  appPaths.forEach(p => console.log('   ' + p));

  // گزارش اندازه و فایل اجرایی
  const dir = appPaths[0];
  const exe = fs.readdirSync(dir).find(f => /\.exe$/.test(f));
  if (exe) console.log('\n   فایل اجرایی: ' + path.join(dir, exe));
  console.log('\nبرای توزیع، کل پوشه را zip کنید:');
  console.log('   cd dist && zip -r KafkhabRacing-win-x64.zip "' + path.basename(dir) + '"');
})();
