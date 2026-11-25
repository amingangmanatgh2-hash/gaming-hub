/* اعتبارسنجی درس‌ها: قانونی بودن دموی‌ها و تمرین‌ها و صحت آزمون‌ها */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
global.window = global;
const Chess = require('../vendor/chessjs/chess.js').Chess;

global.AMIN = {};
eval(readFileSync(new URL('../js/data/lessons.js', import.meta.url), 'utf8').replace(/^\/\*[\s\S]*?\*\//, ''));
eval(readFileSync(new URL('../js/data/puzzles.js', import.meta.url), 'utf8').replace(/^\/\*[\s\S]*?\*\//, ''));

function tryMoves(fen, sans) {
  const g = new Chess(fen);
  for (const s of sans) {
    const mv = g.move(s);
    if (!mv) return { ok: false, bad: s };
  }
  return { ok: true };
}

test('ساختار درس‌ها', () => {
  assert.ok(AMIN.lessons.LESSONS.length >= 10, 'حداقل ۱۰ درس لازم است');
  for (const l of AMIN.lessons.LESSONS) {
    assert.ok(l.id && l.title && l.icon && l.intro, 'فیلدهای اصلی درس ' + l.id);
    assert.ok(l.steps.length >= 2, 'حداقل ۲ گام: ' + l.id);
    assert.ok(l.quiz.length >= 2, 'حداقل ۲ سؤال: ' + l.id);
    assert.ok(l.exercise && l.exercise.fen && l.exercise.solutions && l.exercise.solutions.length, 'تمرین درس ' + l.id);
  }
});

test('دموهای درس‌ها: حرکات قانونی', () => {
  for (const l of AMIN.lessons.LESSONS) {
    for (let i = 0; i < l.steps.length; i++) {
      const st = l.steps[i];
      if (st.demo && st.demo.moves && st.demo.moves.length) {
        const r = tryMoves(st.demo.fen, st.demo.moves);
        assert.ok(r.ok, `دموی درس ${l.id} گام ${i + 1}: حرکت ${r.bad} غیرقانونی است`);
      }
    }
  }
});

test('تمرین‌های درس‌ها: حداقل یک راه‌حل قانونی و پات/مات ناخواسته نیست', () => {
  for (const l of AMIN.lessons.LESSONS) {
    const g = new Chess(l.exercise.fen);
    const legalSans = g.moves();
    const okSol = l.exercise.solutions.some(s => legalSans.includes(s));
    assert.ok(okSol, `تمرین درس ${l.id}: حداقل یک راه‌حل باید قانونی باشد`);
    for (const s of l.exercise.solutions) {
      if (!legalSans.includes(s)) continue;
      const g2 = new Chess(g.fen());
      g2.move(s);
      /* تمرین نباید با راه‌حل باعث پات شود (بجز درس مات‌ها که مات می‌خواهیم) */
      assert.ok(!g2.in_stalemate(), `تمرین درس ${l.id}: راه‌حل ${s} باعث پات می‌شود`);
    }
  }
});

test('آزمون‌های درس‌ها: پاسخ در محدوده گزینه‌ها', () => {
  for (const l of AMIN.lessons.LESSONS) {
    for (const q of l.quiz) {
      assert.ok(q.q && q.options.length >= 2, 'سؤال درس ' + l.id);
      assert.ok(q.answer >= 0 && q.answer < q.options.length, 'پاسخ در محدوده: درس ' + l.id);
      assert.ok(q.why, 'توضیح پاسخ: درس ' + l.id);
      /* گزینه‌ها نباید تکراری باشند */
      assert.equal(new Set(q.options).size, q.options.length, 'گزینه‌های تکراری در درس ' + l.id);
    }
  }
});

test('معماها و درس‌ها: کلیدواژه‌های پایگاه دانش پراستناد', () => {
  const kb = readFileSync(new URL('../js/data/knowledge.js', import.meta.url), 'utf8');
  assert.ok(kb.includes("'کیش'") || kb.includes('کیش'), 'پایگاه دانش شامل کیش');
});
