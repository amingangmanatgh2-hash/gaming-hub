/* AMIN CHESS AI — بخش آموزش: لیست درس، درس با دموی تعاملی، تمرین، آزمون */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  function render(root, params) {
    global.AMIN.nav.setHeader('آموزش شطرنج', false);
    if (params && params.lessonId) return lessonDetail(root, params.lessonId);
    return lessonList(root);
  }

  /* ---------- لیست درس‌ها ---------- */
  function lessonList(root) {
    var st = global.AMIN.state;
    var holder = U.el('div');
    holder.appendChild(U.el('div.card-sub', { text: '۱۰ درس کامل فارسی — هر درس: آموزش گام‌به‌گام + دموی تعاملی + تمرین + آزمون' }));
    var grid = U.el('div.lesson-grid', { id: 'lesson-grid' });
    holder.appendChild(grid);
    root.appendChild(holder);

    Promise.all([
      global.AMIN.db.getAll('lesson_progress'),
      st.grantedAchievements()
    ]).then(function (r) {
      var progress = {};
      r[0].forEach(function (l) { progress[l.id || l] = true; });
      var doneCount = 0;
      var gridEl = document.getElementById('lesson-grid');
      if (!gridEl) return;
      gridEl.innerHTML = '';
      global.AMIN.lessons.LESSONS.forEach(function (l) {
        if (progress[l.id]) doneCount++;
        gridEl.appendChild(U.el('button.lesson-card' + (progress[l.id] ? '.done' : ''), {
          onclick: function () { global.AMIN.nav.go('lessons', { lessonId: l.id }); }
        },
          U.el('div.lc-ico', { text: l.icon }),
          U.el('b', { text: l.title }),
          U.el('div.lc-meta', { text: (progress[l.id] ? '✓ کامل شده' : U.faNum(l.steps.length) + ' گام · آزمون دارد') })));
      });
      var sub = U.el('div.card-sub', { text: 'پیشرفت: ' + U.faNum(doneCount) + ' از ' + U.faNum(global.AMIN.lessons.LESSONS.length) + ' درس' });
      gridEl.parentElement.insertBefore(sub, gridEl);
    });
    return { dispose: function () {} };
  }

  /* ---------- جزئیات درس ---------- */
  function lessonDetail(root, lessonId) {
    var st = global.AMIN.state;
    var nav = global.AMIN.nav;
    global.AMIN.nav.setHeader('درس', true);
    var L = global.AMIN.lessons.get(lessonId);
    if (!L) { nav.go('lessons'); return { dispose: function () {} }; }

    var wrap = U.el('div');
    wrap.appendChild(U.el('div.card',
      U.el('div.row.gap', U.el('span', { text: L.icon, style: 'font-size:2rem' }), U.el('div.col', U.el('div.card-title', { text: L.title }))),
      U.el('div.card-sub', { text: L.intro })));

    /* گام‌ها با دموی تعاملی */
    var stepsHolder = U.el('div');
    wrap.appendChild(stepsHolder);

    var stepIdx = 0;
    var disposers = [];

    function renderStep() {
      stepsHolder.innerHTML = '';
      var s = L.steps[stepIdx];
      var card = U.el('div.card.lesson-step',
        U.el('h4', { text: 'گام ' + U.faNum(stepIdx + 1) + ': ' + s.title }),
        U.el('p', { text: s.text }));
      if (s.demo && s.demo.moves && s.demo.moves.length) {
        var demoChess = new global.Chess(s.demo.fen);
        var demoBoard = global.AMIN.ui.board.create({ interactive: false, boardTheme: st.getSettings().boardTheme, pieceSet: st.getSettings().pieceSet, showCoords: false });
        demoBoard.render(demoChess, { animate: false });
        var i = 0;
        var controls = U.el('div.demo-controls',
          U.el('button.btn.btn-sm', { text: '▶', onclick: function () { if (i < s.demo.moves.length) { demoChess.move(s.demo.moves[i]); i++; demoBoard.render(demoChess, { animate: true, lastMove: demoChess.history({ verbose: true }).slice(-1)[0] }); } } }),
          U.el('button.btn.btn-sm', { text: '↺', onclick: function () { demoChess = new global.Chess(s.demo.fen); i = 0; demoBoard.render(demoChess, { animate: false }); } }),
          U.el('span.card-sub', { style: 'margin:0', text: (i) + '/' + U.faNum(s.demo.moves.length) }));
        var cnt = controls.querySelector('span');
        controls.querySelector('button').addEventListener('click', function () { setTimeout(function () { cnt.textContent = U.faNum(i) + '/' + U.faNum(s.demo.moves.length); }, 30); });
        card.appendChild(U.el('div.lesson-demo', demoBoard.el, controls));
        disposers.push(function () { });
      }
      stepsHolder.appendChild(card);

      var navRow = U.el('div.row.gap.spread', { style: 'margin-bottom:14px' },
        U.el('button.btn', { text: '‹ قبلی', onclick: function () { if (stepIdx > 0) { stepIdx--; renderStep(); } } }),
        stepIdx < L.steps.length - 1
          ? U.el('button.btn.btn-primary', { text: 'گام بعد ›', onclick: function () { stepIdx++; renderStep(); global.AMIN.sound.play('click'); } })
          : null);
      stepsHolder.appendChild(navRow);

      if (stepIdx === L.steps.length - 1) {
        stepsHolder.appendChild(exerciseCard());
        stepsHolder.appendChild(quizCard());
      }
    }

    /* تمرین تعاملی */
    function exerciseCard() {
      var ex = L.exercise;
      var boardApi = null;
      var solved = false;
      var card = U.el('div.card',
        U.el('div.card-title', { text: '✏️ تمرین' }),
        U.el('div.card-sub', { text: ex.prompt }));
      var holder = U.el('div');
      card.appendChild(holder);
      var msg = U.el('div.puzzle-msg', { style: 'display:none' });
      card.appendChild(msg);
      setTimeout(function () {
        var g = new global.Chess(ex.fen);
        boardApi = global.AMIN.ui.board.create({
          boardTheme: st.getSettings().boardTheme,
          pieceSet: st.getSettings().pieceSet,
          onMove: function (mv) {
            if (solved) return;
            var legal = g.moves({ verbose: true }).filter(function (m) { return m.from === mv.from && m.to === mv.to; });
            if (!legal.length) return;
            var use = legal.filter(function (m) { return m.promotion === (mv.promotion || 'q'); })[0] || legal[0];
            var res = g.move(use.san);
            if (ex.solutions.indexOf(res.san) >= 0) {
              solved = true;
              global.AMIN.sound.play('win');
              msg.textContent = '✓ درست بود! «' + res.san + '» حرکت آموزشی این تمرین است.';
              msg.style.display = 'block'; msg.classList.add('ok');
              boardApi.render(g, { animate: true, lastMove: res });
              var lessonCoins = 10;
              st.earn(lessonCoins, 'تمرین درس ' + L.title, { reasonKey: 'ex:' + L.id + ':' + U.dayKey() }).then(function () {
                global.AMIN.nav.updateCoins();
              });
              st.track('lesson_done', 1);
            } else {
              global.AMIN.sound.play('click');
              msg.textContent = '✗ «' + res.san + '» حرکت هدف نیست. دوباره فکر کن — برگشت خودکار انجام شد.';
              msg.style.display = 'block'; msg.classList.add('bad');
              g.undo();
              boardApi.render(g, { animate: false });
            }
          },
          onNeedPromotion: function (from, to, cb) {
            global.AMIN.ui.prompts.promotionDialog(g.turn(), cb);
          }
        });
        holder.appendChild(boardApi.el);
        boardApi.render(g, { animate: false });
      }, 50);
      return card;
    }

    /* آزمون کوتاه */
    function quizCard() {
      var answered = 0;
      var correct = 0;
      var card = U.el('div.card',
        U.el('div.card-title', { text: '📝 آزمون کوتاه' }));
      L.quiz.forEach(function (q, qi) {
        var qEl = U.el('div.quiz-q', U.el('h4', { text: U.faNum(qi + 1) + '. ' + q.q }));
        q.options.forEach(function (opt, oi) {
          qEl.appendChild(U.el('button.quiz-opt', {
            text: opt,
            onclick: function () {
              if (qEl.dataset.done) return;
              qEl.dataset.done = '1';
              answered++;
              var opts = qEl.querySelectorAll('.quiz-opt');
              if (oi === q.answer) {
                opts[oi].classList.add('correct');
                correct++;
                global.AMIN.sound.play('coin');
              } else {
                opts[oi].classList.add('wrong');
                opts[q.answer].classList.add('correct');
                global.AMIN.sound.play('click');
              }
              qEl.appendChild(U.el('div.quiz-why', { text: q.why }));
              maybeFinish();
            }
          }));
        });
        card.appendChild(qEl);
      });
      function maybeFinish() {
        if (answered < L.quiz.length) return;
        var passed = correct >= Math.ceil(L.quiz.length * 0.6);
        var resultEl = U.el('div.puzzle-msg' + (passed ? '.ok' : '.bad'), {
          text: passed
            ? '🎉 آفرین! ' + U.faNum(correct) + ' از ' + U.faNum(L.quiz.length) + ' درست بود.'
            : 'نتیجه: ' + U.faNum(correct) + ' از ' + U.faNum(L.quiz.length) + ' — دوباره مرور کن و دوباره امتحان بده (امکان تلاش مجدد با ورود دوباره به درس).'
        });
        card.appendChild(resultEl);
        completeLesson(passed);
      }
      return card;
    }

    function completeLesson(passed) {
      if (global.AMIN._lessonDoneGuard === L.id) return;
      global.AMIN._lessonDoneGuard = L.id;
      var db = global.AMIN.db;
      db.tx('lesson_progress', 'readwrite', function (stq) { stq.put({ id: L.id, ts: Date.now(), passed: passed }, L.id); }).then(function () {
        var chain = st.addLessonDone(L.id, L.coins);
        if (passed) chain = chain.then(function () { return st.addQuizPassed(L.id, 10); });
        chain.then(function () { nav.updateCoins(); });
        U.toast(passed ? '🎓 درس کامل شد! +' + U.faNum(L.coins + 10) + ' سکه' : '📚 درس ثبت شد — +' + U.faNum(L.coins) + ' سکه');
      });
    }

    wrap.appendChild(U.el('button.btn.btn-ghost.btn-full', { text: '‹ بازگشت به درس‌ها', onclick: function () { nav.go('lessons'); } }));
    root.appendChild(wrap);
    renderStep();
    return { dispose: function () { disposers.forEach(function (f) { f(); }); } };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('lessons', { title: 'آموزش شطرنج', render: render });
})(window);
