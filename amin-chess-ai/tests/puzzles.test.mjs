/* اعتبارسنجی بانک معماها: صحت FEN، قانونی بودن راه‌حل، مات واقعی، برد اجباری ماتریال */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
global.window = global;

/* بارگذاری chess.js UMD و ماژول معماها */
const Chess = require('../vendor/chessjs/chess.js').Chess;
const src = readFileSync(new URL('../js/data/puzzles.js', import.meta.url), 'utf8');
global.AMIN = {};
eval(src.replace(/^\/\*[\s\S]*?\*\//, ''));

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function materialFor(game, color) {
  let sum = 0;
  game.board().flat().forEach(p => { if (p && p.color === color) sum += VAL[p.type]; });
  return sum;
}

function play(game, san) {
  const g = new Chess(game.fen());
  const mv = g.move(san);
  assert.ok(mv, 'حرکت باید قانونی باشد: ' + san);
  return g;
}

function mateSans(game) {
  return game.moves().filter(s => play(game, s).in_checkmate());
}

test('بانک معماها: ساختار داده', () => {
  assert.ok(AMIN.puzzles.PUZZLES.length >= 10, 'حداقل ده معما');
  for (const p of AMIN.puzzles.PUZZLES) {
    assert.ok(p.id && p.fen && p.san && p.hint && p.title, 'فیلدهای کامل: ' + p.id);
    assert.ok([1, 2, 3, 4, 5].includes(p.diff), 'سطح درست: ' + p.id);
    assert.ok(p.coins > 0, 'سکه: ' + p.id);
    assert.ok(AMIN.puzzles.CAT_FA[p.cat], 'دسته معتبر: ' + p.id);
  }
});

test('بانک معماها: هر معما FEN قانونی و حرکت راه‌حل قانونی است', () => {
  for (const p of AMIN.puzzles.PUZZLES) {
    const g = new Chess(p.fen);
    assert.ok(typeof g.fen() === 'string' && g.fen().length > 20, 'FEN معتبر: ' + p.id);
    g.move(p.san);
    assert.ok(g.fen() !== p.fen, 'حرکت باید وضعیت را عوض کند: ' + p.id);
  }
});

test('معماهای مات در یک حرکت: بعد از راه‌حل واقعاً مات است', () => {
  for (const p of AMIN.puzzles.PUZZLES.filter(x => x.cat === 'mate1')) {
    const g = new Chess(p.fen);
    g.move(p.san);
    assert.ok(g.in_checkmate(), `معمای ${p.id} باید با ${p.san} مات شود`);
    assert.equal(g.moves().length, 0, `بعد از ${p.san} در ${p.id} حرکتی نباید بماند`);
  }
});

test('معماهای مات در یک حرکت: راه‌حل ثبت‌شده از میان مات‌های موجود موقعیت است', () => {
  for (const p of AMIN.puzzles.PUZZLES.filter(x => x.cat === 'mate1')) {
    const g = new Chess(p.fen);
    const mates = mateSans(g);
    assert.ok(mates.length >= 1, `${p.id}: حداقل یک مات در یک حرکت باید وجود داشته باشد`);
    assert.ok(mates.includes(p.san), `${p.id}: ${p.san} باید مات باشد (مات‌های موجود: ${mates})`);
  }
});

test('معماهای مات در دو حرکت: راه‌حل، مات اجباری است و در حرکت اول مات وجود ندارد', () => {
  for (const p of AMIN.puzzles.PUZZLES.filter(x => x.cat === 'mate2')) {
    const g0 = new Chess(p.fen);
    assert.equal(mateSans(g0).length, 0, `${p.id}: نباید مات در یک حرکت داشته باشد`);
    const g1 = play(g0, p.san);
    const replies = g1.moves();
    assert.ok(replies.length > 0, `${p.id}: حریف باید پاسخ داشته باشد`);
    for (const r of replies) {
      const g2 = play(g1, r);
      const mates = mateSans(g2);
      assert.ok(mates.length >= 1, `${p.id}: بعد از پاسخ ${r} باید مات در یک حرکت موجود باشد`);
    }
  }
});

test('معماهای تاکتیک: راه‌حل بیشترین سود ماتریال اجباری را می‌دهد', () => {
  for (const p of AMIN.puzzles.PUZZLES.filter(x => ['fork', 'hanging', 'queenfork'].includes(x.cat))) {
    /* سود راه‌حل: کمترین سود در بدترین پاسخ حریف (سود فوری + بهترین گرفتن بعدی) */
    const solGain = (() => {
      const g1 = play(new Chess(p.fen), p.san);
      if (g1.in_checkmate()) return 999;
      const replies = g1.moves();
      if (replies.length === 0) return -999;
      let worst = Infinity;
      for (const r of replies) {
        const g2 = play(g1, r);
        const before = materialFor(new Chess(p.fen), 'b') - materialFor(new Chess(p.fen), 'w');
        const after = materialFor(g2, 'b') - materialFor(g2, 'w');
        let bestNext = 0;
        for (const w of g2.moves({ verbose: true })) {
          if (w.captured) bestNext = Math.max(bestNext, VAL[w.captured]);
        }
        worst = Math.min(worst, (before - after) + bestNext);
      }
      return worst;
    })();
    assert.ok(solGain >= 4, `${p.id}: سود اجباری راه‌حل باید ≥۴ باشد (گرفتم: ${solGain})`);

    /* هیچ حرکت دیگری سود بیشتر یا مساوی ندهد */
    const g0 = new Chess(p.fen);
    let bestOther = -Infinity;
    for (const m of g0.moves()) {
      if (m === p.san) continue;
      const g1 = play(g0, m);
      if (g1.in_checkmate()) { bestOther = Math.max(bestOther, 999); continue; }
      const replies = g1.moves();
      if (replies.length === 0) { bestOther = Math.max(bestOther, 0); continue; }
      let worst = Infinity;
      for (const r of replies) {
        const g2 = play(g1, r);
        const before = materialFor(new Chess(p.fen), 'b') - materialFor(new Chess(p.fen), 'w');
        const after = materialFor(g2, 'b') - materialFor(g2, 'w');
        let bestNext = 0;
        for (const w of g2.moves({ verbose: true })) {
          if (w.captured) bestNext = Math.max(bestNext, VAL[w.captured]);
        }
        worst = Math.min(worst, (before - after) + bestNext);
      }
      bestOther = Math.max(bestOther, worst);
    }
    assert.ok(solGain >= bestOther,
      `${p.id}: سود راه‌حل (${solGain}) باید ≥ بهترین حرکت جایگزین (${bestOther}) باشد`);
  }
});

test('معمای روزانه: انتخاب پایدار', () => {
  const a = AMIN.puzzles.dailyPuzzle('2026-11-25');
  const b = AMIN.puzzles.dailyPuzzle('2026-11-25');
  assert.equal(a.id, b.id);
  assert.ok(AMIN.puzzles.get(a.id));
});
