/* AMIN CHESS AI — معماها: معمای روزانه + دسته‌بندی + راهنما و جواب */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  function render(root) {
    var st = global.AMIN.state;
    global.AMIN.nav.setHeader('معماهای شطرنج', false);
    var PZ = global.AMIN.puzzles;

    var wrap = U.el('div');
    var dailyCard = U.el('div.card.puzzle-daily',
      U.el('div.card-title', { text: '🧩 معمای روزانه' }),
      U.el('div.puzzle-status',
        U.el('span.badge', { text: '🪙 ' + U.faNum(st.economy.balance) + ' سکه' }),
        U.el('span.badge.accent', { text: 'رکورد رشته: ' + U.faNum(st.getProfile().puzzleBest) })));
    var dailyHolder = U.el('div');
    dailyCard.appendChild(dailyHolder);
    wrap.appendChild(dailyCard);

    var catCard = U.el('div.card',
      U.el('div.card-title', { text: '🗂️ معماها بر اساس دسته' }),
      U.el('div', { id: 'cat-holder' }));
    wrap.appendChild(catCard);
    root.appendChild(wrap);

    /* معمای روزانه */
    var puzzle = PZ.dailyPuzzle();
    var puzzleKey = 'puzzle:' + U.dayKey();
    var solvedToday = false;
    var hintsUsed = 0;

    global.AMIN.db.kvGet(puzzleKey, false).then(function (v) {
      solvedToday = !!v;
      buildDaily();
    });

    function buildDaily() {
      dailyHolder.innerHTML = '';
      var g = new global.Chess(puzzle.fen);
      var solved = solvedToday;
      var msg = U.el('div.puzzle-msg', { style: solved ? 'display:block' : 'display:none' });
      var hintText = U.el('div.hint-text', { text: '', style: 'display:none' });
      var boardApi = null;
      var movesCount = 0;

      var status = U.el('div.puzzle-status',
        U.el('span.badge' + (solved ? '.ok' : ''), { text: solved ? '✓ امروز حل شد — +' + U.faNum(puzzle.coins) + ' سکه قبلاً گرفته شد' : '🪙 جایزه: ' + U.faNum(puzzle.coins) + ' سکه' }),
        U.el('span.badge', { text: 'سطح ' + U.faNum(puzzle.diff) + ' · ' + PZ.CAT_FA[puzzle.cat] }));
      dailyHolder.appendChild(status);

      var boardHolder = U.el('div');
      dailyHolder.appendChild(boardHolder);
      dailyHolder.appendChild(msg);
      dailyHolder.appendChild(hintText);

      var btnRow = U.el('div.controls-row', { style: 'margin-top:10px' },
        U.el('button.btn', { text: '💡 راهنما', onclick: function () { showHint(); } }),
        U.el('button.btn', { text: '↺ شروع دوباره', onclick: function () { reset(); } }),
        solved ? U.el('button.btn', { text: '👁 جواب', onclick: showSolution }) : null,
        U.el('button.btn', { text: '🧠 بپرس از استاد', onclick: function () {
          global.AMIN.masterCtx = { fen: g.fen(), turn: g.turn(), chess: g };
          global.AMIN.nav.go('master', { autoAsk: 'این موقعیت معمای شطرنج است؛ بهترین حرکت را با دلیل بگو.' });
        } }));
      dailyHolder.appendChild(btnRow);

      function reset() {
        g = new global.Chess(puzzle.fen);
        boardApi.render(g, { animate: false });
        msg.style.display = 'none';
        hintText.style.display = 'none';
        movesCount = 0;
      }

      function showHint() {
        if (hintsUsed === 0) {
          hintsUsed++;
          hintText.textContent = '💡 راهنما: ' + puzzle.hint;
          hintText.style.display = 'block';
        } else {
          /* راهنمای دوم: هایلایت خانه مبدأ */
          var sol = g.moves({ verbose: true }).filter(function (m) { return m.san === puzzle.san; })[0];
          if (sol && boardApi) { boardApi.setHint({ from: sol.from, to: sol.to }); hintText.textContent = '💡 خانه‌های هایلایت‌شده را نگاه کن؛ از اینجا حرکت درست شروع می‌شود.'; }
        }
      }

      function showSolution() {
        var sol = g.moves({ verbose: true }).filter(function (m) { return m.san === puzzle.san; })[0];
        if (sol) {
          g.move(sol.san);
          boardApi.render(g, { animate: true, lastMove: sol });
          msg.textContent = '👁 جواب: «' + puzzle.san + '» — ' + puzzle.hint;
          msg.style.display = 'block';
        }
      }

      setTimeout(function () {
        boardApi = global.AMIN.ui.board.create({
          boardTheme: st.getSettings().boardTheme,
          pieceSet: st.getSettings().pieceSet,
          canSelect: function () { return !solved; },
          onMove: function (mv) { tryMove(mv); },
          onNeedPromotion: function (from, to, cb) { global.AMIN.ui.prompts.promotionDialog(g.turn(), cb); }
        });
        boardHolder.appendChild(boardApi.el);
        boardApi.render(g, { animate: false });
      }, 30);

      function tryMove(mv) {
        if (solved) return;
        var legal = g.moves({ verbose: true }).filter(function (m) { return m.from === mv.from && m.to === mv.to; });
        if (!legal.length) return;
        var use = legal.filter(function (m) { return m.promotion === (mv.promotion || 'q'); })[0] || legal[0];
        var res = g.move(use.san);
        movesCount++;
        if (res.san === puzzle.san) {
          solved = true;
          global.AMIN.sound.play('win');
          boardApi.render(g, { animate: true, lastMove: res });
          var bonus = movesCount === 1 && hintsUsed === 0 ? 2 : 0;
          msg.textContent = '🎉 درست بود! «' + res.san + '»' + (bonus ? ' — پاداش حل در اول تلاش: +' + U.faNum(bonus) : '');
          msg.style.display = 'block'; msg.classList.add('ok');
          global.AMIN.db.kvSet(puzzleKey, true);
          st.addPuzzleSolved(puzzle.diff, puzzle.coins + bonus).then(function () {
            global.AMIN.nav.updateCoins();
            status.querySelector('.badge').textContent = '✓ امروز حل شد — 🪙 ' + U.faNum(puzzle.coins + bonus) + ' گرفته شد';
            status.querySelector('.badge').classList.add('ok');
          });
        } else {
          global.AMIN.sound.play('click');
          msg.textContent = '✗ «' + res.san + '» درست نیست. برگشت انجام شد — دوباره تلاش کن یا راهنما بگیر.';
          msg.style.display = 'block'; msg.classList.add('bad');
          setTimeout(function () { g.undo(); boardApi.render(g, { animate: false }); }, 500);
        }
      }
    }

    /* دسته‌ها */
    var cats = Object.keys(PZ.CAT_FA);
    var catHolder = document.getElementById('cat-holder');
    cats.forEach(function (cat) {
      var list = PZ.byCategory(cat);
      var card = U.el('div.card',
        U.el('div.row.gap.spread',
          U.el('b', { text: PZ.CAT_FA[cat] + ' (' + U.faNum(list.length) + ')' }),
          U.el('span.card-sub', { text: 'مات و تاکتیک‌های این دسته', style: 'margin:0' })));
      list.forEach(function (pz) {
        card.appendChild(U.el('div.mission-row',
          U.el('div.mission-ico', { text: pz.diff <= 2 ? '🟢' : pz.diff <= 4 ? '🟡' : '🔴' }),
          U.el('div.mission-body', U.el('b', { text: pz.title })),
          U.el('button.btn.btn-sm', { text: 'حل کن', onclick: function () { openPuzzle(pz); } })));
      });
      catHolder.appendChild(card);
    });

    function openPuzzle(pz) {
      var g = new global.Chess(pz.fen);
      var card = U.el('div.modal',
        U.el('h3', { text: pz.title }),
        U.el('div.card-sub', { text: PZ.CAT_FA[pz.cat] + ' · سطح ' + U.faNum(pz.diff) + ' · 🪙 ' + U.faNum(pz.coins) }));
      var boardHolder = U.el('div');
      card.appendChild(boardHolder);
      var msg = U.el('div.puzzle-msg', { style: 'display:none' });
      card.appendChild(msg);
      card.appendChild(U.el('div.row.gap', { style: 'margin-top:10px' },
        U.el('button.btn', { text: '↺', onclick: function () { g = new global.Chess(pz.fen); api.render(g, { animate: false }); } }),
        U.el('button.btn', { text: '💡 راهنما', onclick: function () { msg.textContent = '💡 ' + pz.hint; msg.style.display = 'block'; } }),
        U.el('button.btn.btn-ghost', { text: 'بستن', onclick: function () { dlg.close(); } })));
      var dlg = global.AMIN.ui.prompts.openModal(card, { locked: true, dismissible: false });
      var api = null;
      setTimeout(function () {
        api = global.AMIN.ui.board.create({
          boardTheme: st.getSettings().boardTheme, pieceSet: st.getSettings().pieceSet,
          onMove: function (mv) {
            var legal = g.moves({ verbose: true }).filter(function (m) { return m.from === mv.from && m.to === mv.to; });
            if (!legal.length) return;
            var use = legal.filter(function (m) { return m.promotion === (mv.promotion || 'q'); })[0] || legal[0];
            var res = g.move(use.san);
            if (res.san === pz.san) {
              global.AMIN.sound.play('win');
              api.render(g, { animate: true, lastMove: res });
              msg.textContent = '🎉 درست بود! «' + res.san + '»';
              msg.style.display = 'block'; msg.classList.add('ok');
              st.addPuzzleSolved(pz.diff, pz.coins).then(function () { global.AMIN.nav.updateCoins(); });
            } else {
              msg.textContent = '✗ «' + res.san + '» درست نیست؛ دوباره!';
              msg.style.display = 'block'; msg.classList.add('bad');
              setTimeout(function () { g.undo(); api.render(g, { animate: false }); }, 400);
            }
          },
          onNeedPromotion: function (from, to, cb) { global.AMIN.ui.prompts.promotionDialog(g.turn(), cb); }
        });
        boardHolder.appendChild(api.el);
        api.render(g, { animate: false });
      }, 30);
    }

    return { dispose: function () {} };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('puzzles', { title: 'معماهای شطرنج', render: render });
})(window);
