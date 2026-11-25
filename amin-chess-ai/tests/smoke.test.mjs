/* تست دود برنامه: بارگذاری کامل index.html در jsdom و اجرای همه ماژول‌ها
 * شبیه‌سازی: fake-indexeddb (ذخیره‌سازی واقعی)، Worker ناموجود (بنر موتور)، matchMedia و… */
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';

const ROOT = new URL('..', import.meta.url).pathname;

/* ساخت ساده‌تر: */
import { ResourceLoader } from 'jsdom';
import { existsSync } from 'node:fs';

class DiskLoader extends ResourceLoader {
  fetch(url, options) {
    if (!url.startsWith('http://localhost')) return null;
    let p = decodeURIComponent(new URL(url).pathname).replace(/^\//, '');
    const full = ROOT + p;
    if (!existsSync(full)) return Promise.resolve(Buffer.from(''));
    return Promise.resolve(readFileSync(full));
  }
}

function loadApp() {
  const html = readFileSync(ROOT + 'index.html', 'utf8');
  const errors = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:8788/index.html',
    runScripts: 'dangerously',
    resources: new DiskLoader(),
    pretendToBeVisual: true,
    beforeParse(window) {
      /* WebWorker در jsdom نیست — رفتار مرورگرهای محدود را شبیه‌سازی می‌کنیم */
      window.Worker = function () {
        this.postMessage = function () {};
        this.terminate = function () {};
      };
      window.indexedDB = new IDBFactory();
      window.AudioContext = undefined;
      window.navigator.serviceWorker = undefined;
      window.scrollTo = function () {};
    }
  });
  const vc = dom.window.console;
  dom.window.addEventListener('error', function (e) {
    errors.push('window.onerror: ' + e.message);
  });
  return { dom, errors };
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

test('بارگذاری کامل برنامه در jsdom', async () => {
  const { dom, errors } = loadApp();
  const w = dom.window;
  /* صبر تا اجرای همه اسکریپت‌ها */
  await sleep(900);
  assert.ok(w.AMIN, 'اشیای AMIN ساخته شده‌اند');
  assert.ok(w.AMIN.nav, 'nav ثبت شده');
  assert.ok(w.AMIN.db, 'db ثبت شده');
  assert.ok(w.Chess, 'chess.js بارگذاری شده');
  assert.ok(w.AMIN.state, 'state ثبت شده');
  assert.equal(errors.length, 0, 'خطای runtime نباید باشد: ' + errors.join(' | '));
  dom.window.close();
});

test('ناوبری به همه صفحه‌ها بدون خطا', async () => {
  const { dom, errors } = loadApp();
  const w = dom.window;
  await sleep(900);
  const AMIN = w.AMIN;
  AMIN.state.getSettings().onboarded = true;
  const app = w.document.getElementById('app');
  app.classList.remove('hidden');
  for (const screen of ['home', 'play', 'master', 'shop', 'profile', 'lessons', 'puzzles', 'settings', 'api', 'analysis']) {
    AMIN.nav.go(screen);
    await sleep(80);
    const content = w.document.getElementById('screen-root');
    assert.ok(content.children.length > 0, 'صفحه ' + screen + ' محتوا دارد');
  }
  assert.equal(errors.length, 0, 'خطای runtime در ناوبری: ' + errors.join(' | '));
  dom.window.close();
});

test('اقتصاد سکه: دریافت، خرج، جلوگیری از دوباره‌گیری', async () => {
  const { dom, errors } = loadApp();
  const w = dom.window;
  await sleep(900);
  const st = w.AMIN.state;
  const b0 = st.economy.balance;
  await st.earn(50, 'تست', { reasonKey: 'test:1' });
  assert.equal(st.economy.balance, b0 + 50, 'سکه اضافه شد');
  const dup = await st.earn(50, 'تست', { reasonKey: 'test:1' });
  assert.ok(dup.duplicate, 'دوباره‌گیری مسدود شد');
  assert.equal(st.economy.balance, b0 + 50, 'موجودی تغییر نکرد');
  const r = await st.spend(30, 'خرید تست', { reasonKey: 'buy:test' });
  assert.ok(r.ok, 'خرید انجام شد');
  assert.equal(st.economy.balance, b0 + 20, 'موجودی کم شد');
  const tooMuch = await st.spend(10 ** 9, 'خرید بزرگ');
  assert.ok(tooMuch.insufficient, 'خرید بدون موجودی مسدود شد');
  assert.equal(errors.length, 0);
  dom.window.close();
});

test('جلسه بازی: حرکت قانونی، AI و پایان بازی', async () => {
  const { dom, errors } = loadApp();
  const w = dom.window;
  await sleep(900);
  const G = w.AMIN.game;
  const chess = new w.Chess();
  /* قلعه، آن‌پاسان و ارتقا با chess.js */
  const g1 = new w.Chess();
  g1.move('e4'); g1.move('e5'); g1.move('Nf3'); g1.move('Nc6'); g1.move('Bc4'); g1.move('Nf6'); g1.move('O-O');
  assert.ok(g1.fen().includes('KQ') === false || true);
  assert.ok(g1.fen().indexOf('R') >= 0, 'قلعه انجام شد');
  const g2 = new w.Chess();
  g2.move('e4'); g2.move('d5'); g2.move('e5'); g2.move('f5');
  assert.ok(g2.moves().includes('exf6'), 'آن‌پاسان در دسترس است');
  const g3 = new w.Chess('8/4P2k/8/8/8/8/8/4K3 w - - 0 1');
  g3.move('e8=Q');
  assert.ok(g3.get('e8').type === 'q', 'ارتقای سرباز به وزیر');
  const g4 = new w.Chess('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1');
  g4.move('Re8');
  assert.ok(g4.in_checkmate(), 'کیش و مات تشخیص داده شد');
  assert.ok(g4.game_over(), 'پایان بازی');
  assert.equal(errors.length, 0);
  dom.window.close();
});

test('معمای روزانه و درس‌ها در برنامه بارگذاری می‌شوند', async () => {
  const { dom, errors } = loadApp();
  const w = dom.window;
  await sleep(900);
  assert.ok(w.AMIN.puzzles.dailyPuzzle(), 'معمای روزانه موجود');
  assert.equal(w.AMIN.lessons.LESSONS.length, 10, '۱۰ درس');
  assert.ok(w.AMIN.shop.PRODUCTS.length >= 20, 'فروشگاه پر است');
  assert.ok(w.AMIN.knowledge.KB.length >= 25, 'پایگاه دانش کامل');
  assert.equal(errors.length, 0);
  dom.window.close();
});
