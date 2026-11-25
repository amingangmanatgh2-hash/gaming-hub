/* AMIN CHESS AI — تحلیل صفحه: حرکت آزاد، ارزیابی زنده، چند خط پیشنهادی */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  function render(root) {
    var st = global.AMIN.state;
    global.AMIN.nav.setHeader('تحلیل صفحه', true);
    var chess = new global.Chess();
    var boardApi = null;
    var lastMove = null;

    var wrap = U.el('div.game-layout');

    wrap.appendChild(U.el('div.card-sub', { text: 'هر دو طرف را آزاد حرکت بده و تحلیل زنده موتور را ببین. برای تحلیل بازی واقعی، پایان بازی دکمه «بررسی با موتور» را بزن یا از استاد بپرس.' }));

    var boardHolder = U.el('div#board-holder');
    wrap.appendChild(boardHolder);

    var evalFill = U.el('i', { style: 'width:50%' });
    var evalText = U.el('div', { style: 'font-size:.76rem;color:var(--text-dim);margin-top:4px', text: 'موتور در حال آماده‌سازی…' });
    wrap.appendChild(U.el('div.card',
      U.el('div.card-title', { text: '📊 ارزیابی زنده' }),
      U.el('div.progress.eval-bar', evalFill),
      evalText));

    var linesHolder = U.el('div');
    wrap.appendChild(U.el('div.card',
      U.el('div.card-title', { text: '🔬 بهترین خط‌ها (MultiPV)' }),
      linesHolder));

    wrap.appendChild(U.el('div.controls-row',
      U.el('button.btn', { text: '↩️ برگشت', onclick: function () { chess.undo(); lastMove = chess.history({ verbose: true }).slice(-1)[0] || null; draw(false); } }),
      U.el('button.btn', { text: '🔄 چرخش', onclick: function () { boardApi.setOrientation(boardApi.getOrientation() === 'white' ? 'black' : 'white'); draw(false); } }),
      U.el('button.btn', { text: '🗑️ پاک‌کردن', onclick: function () { chess = new global.Chess(); lastMove = null; draw(false); } }),
      U.el('button.btn.btn-primary', { text: '🧠 استاد', onclick: function () {
        global.AMIN.masterCtx = { fen: chess.fen(), turn: chess.turn(), chess: chess };
        global.AMIN.nav.go('master', { autoAsk: 'وضعیت فعلی را تحلیل کن و بهترین حرکت را با دلیل بگو.' });
      } })));

    root.appendChild(wrap);

    boardApi = global.AMIN.ui.board.create({
      boardTheme: st.getSettings().boardTheme,
      pieceSet: st.getSettings().pieceSet,
      onMove: function (mv) {
        var legal = chess.moves({ verbose: true }).filter(function (m) { return m.from === mv.from && m.to === mv.to; });
        if (!legal.length) return;
        var use = legal.filter(function (m) { return m.promotion === (mv.promotion || 'q'); })[0] || legal[0];
        var res = chess.move(use.san);
        if (res) { lastMove = res; global.AMIN.sound.play(res.captured ? 'capture' : 'move'); draw(true); }
      },
      onNeedPromotion: function (from, to, cb) { global.AMIN.ui.prompts.promotionDialog(chess.turn(), cb); }
    });
    boardHolder.appendChild(boardApi.el);
    draw(false);

    function draw(animate) {
      var opts = { animate: animate !== false, lastMove: lastMove };
      if (chess.in_check()) {
        var b = chess.board(); var t = chess.turn();
        for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
          var p = b[r][f];
          if (p && p.type === 'k' && p.color === t) opts.checkSquare = 'abcdefgh'[f] + (8 - r);
        }
      }
      boardApi.render(chess, opts);
      runEval();
    }

    function runEval() {
      if (!global.AMIN.engine.status().ready) {
        evalText.textContent = 'موتور در حال آماده‌سازی…';
        global.AMIN.engine.init().then(runEval).catch(function () { evalText.textContent = 'موتور در دسترس نیست'; });
        return;
      }
      global.AMIN.analysis.evalPov(chess.fen(), chess.turn(), { movetime: 900, multipv: 3 }).then(function (ev) {
        var pct = Math.max(2, Math.min(98, 50 + ev.cp / 30));
        evalFill.style.width = pct + '%';
        evalText.textContent = global.AMIN.analysis.describeEval(ev) + (ev.mate ? '' : ' — عمق ' + U.faNum(ev.depth || 0));
        linesHolder.innerHTML = '';
        (ev.lines || []).slice(0, 3).forEach(function (line, i) {
          if (!line || !line.pv) return;
          var san = global.AMIN.analysis.pvToSan(chess.fen(), line.pv);
          if (!san) return;
          var sc = line.mate != null && line.mate !== 0
            ? (line.mate > 0 ? '#+' + U.faNum(line.mate) : '#-' + U.faNum(Math.abs(line.mate)))
            : (line.score >= 0 ? '+' : '') + U.faNum((line.score / 100).toFixed(1));
          linesHolder.appendChild(U.el('div.history-row',
            U.el('span.badge.accent', { text: sc, style: 'direction:ltr' }),
            U.el('b', { text: san, style: 'direction:ltr;font-family:monospace' }),
            U.el('span.card-sub', { text: i === 0 ? 'بهترین حرکت' : 'جایگزین ' + U.faNum(i + 1), style: 'margin:0' })));
        });
      });
    }

    runEval();
    return { dispose: function () {} };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('analysis', { title: 'تحلیل صفحه', render: render });
})(window);
