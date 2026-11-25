/* AMIN CHESS AI — صفحه بازی: حالت‌ها، صفحه شطرنج، کنترل‌ها، ذخیره/بارگذاری */
(function (global) {
  'use strict';

  var U = global.AMIN.util;
  var P = global.AMIN.ui.prompts;

  function render(root, params) {
    if (params && params.loadGameId) return gameScreen(root, { loadedId: params.loadGameId });
    if (params && params.mode) return gameScreen(root, params);
    return hub(root);
  }

  /* ---------- هاب بازی ---------- */
  function hub(root) {
    global.AMIN.nav.setHeader('بازی', false);
    var modes = [
      { ico: '🤖', title: 'بازی با هوش مصنوعی', sub: '۶ سطح از مبتدی تا استاد', onClick: pickAi, cls: '' },
      { ico: '👥', title: 'دونفره روی یک گوشی', sub: 'نوبتی کنار هم', onClick: function () { startGame({ mode: 'local' }); } },
      { ico: '🕊️', title: 'بازی آزاد', sub: 'بدون رکورد و سکه — فقط برای لذت', onClick: function () { startGame({ mode: 'free' }); } },
      { ico: '🎓', title: 'تمرین', sub: 'با نوار امتیاز و راهنما', onClick: function () { startGame({ mode: 'practice' }); } },
      { ico: '🔬', title: 'تحلیل صفحه', sub: 'حرکت آزاد با ارزیابی موتور', onClick: function () { global.AMIN.nav.go('analysis'); } },
      { ico: '🏁', title: 'تمرین آخر بازی', sub: '۵ سناریوی مهم', onClick: endgameList },
      { ico: '🚀', title: 'تمرین گشایش', sub: '۵ خط گشایش معروف', onClick: openingList },
      { ico: '💾', title: 'مسابقه‌های ذخیره‌شده', sub: 'ادامه بازی‌های نیمه‌کاره', onClick: savedList }
    ];
    var wrap = U.el('div');
    wrap.appendChild(U.el('div.card-sub', { text: 'کدام حالت؟ همه حالت‌ها بدون اینترنت کار می‌کنند.' }));
    modes.forEach(function (m) {
      wrap.appendChild(U.el('button.qa-btn', { style: 'margin-bottom:10px;width:100%', onclick: m.onClick },
        U.el('span.qa-ico', { text: m.ico }),
        U.el('b', { text: m.title }),
        U.el('span', { text: m.sub })));
    });
    root.appendChild(wrap);

    function pickAi() {
      P.colorDialog(function (color) {
        P.levelDialog('easy', function (level) {
          startGame({ mode: 'ai', playerColor: color, aiLevel: level });
        });
      });
    }
    function endgameList() {
      var G = global.AMIN.game;
      var card = U.el('div.modal',
        U.el('h3', { text: 'تمرین آخر بازی' }),
        U.el('div.col.gap', G.ENDGAME_SCENARIOS.map(function (s) {
          return U.el('button.btn', { text: s.fa, onclick: function () { dlg.close(); startGame({ mode: 'endgame', fen: s.fen, scenario: s }); } });
        })));
      var dlg = P.openModal(card);
    }
    function openingList() {
      var G = global.AMIN.game;
      var card = U.el('div.modal',
        U.el('h3', { text: 'تمرین گشایش' }),
        U.el('p.modal-msg', { text: 'حرکت‌های خط را به‌ترتیب اجرا کن؛ اگر اشتباه بزنی برنامه خبر می‌دهد.' }),
        U.el('div.col.gap', G.OPENING_LINES.map(function (l) {
          return U.el('button.btn', {
            text: l.fa, onclick: function () { dlg.close(); startGame({ mode: 'opening', opening: l }); }
          });
        })));
      var dlg = P.openModal(card);
    }
    function savedList() {
      global.AMIN.db.getAll('games').then(function (games) {
        games.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        var card = U.el('div.modal',
          U.el('h3', { text: 'مسابقه‌های ذخیره‌شده' }));
        if (!games.length) card.appendChild(U.el('p.modal-msg', { text: 'هنوز مسابقه‌ای ذخیره نکرده‌ای. در حین بازی دکمه «ذخیره» را بزن.' }));
        games.slice(0, 10).forEach(function (g) {
          card.appendChild(U.el('div.row.gap.spread', { style: 'margin-bottom:8px' },
            U.el('div.col', U.el('b', { text: g.name }), U.el('span', { text: U.fmtDate(g.ts), style: 'font-size:.7rem;color:var(--text-dim)' })),
            U.el('div.row.gap',
              U.el('button.btn.btn-sm', { text: 'بارگذاری', onclick: function () { dlg.close(); global.AMIN.nav.go('play', { loadGameId: g.id }); } }),
              U.el('button.btn.btn-sm.btn-danger', { text: 'حذف', onclick: function () {
                global.AMIN.db.tx('games', 'readwrite', function (st) { st['delete'](g.id); }).then(function () { dlg.close(); savedList(); });
              } }))));
        });
        var dlg = P.openModal(card);
      });
    }
    function startGame(opts) { global.AMIN.nav.go('play', opts); }
    return { dispose: function () {} };
  }

  /* ---------- صفحه بازی ---------- */
  function gameScreen(root, opts) {
    var st = global.AMIN.state;
    var G = global.AMIN.game;
    var nav = global.AMIN.nav;
    var Sound = global.AMIN.sound;
    var chess = new global.Chess();
    var mode = opts.mode || 'ai';
    var aiLevel = opts.aiLevel || 'easy';
    var playerColor = opts.playerColor || 'w';
    var lastMove = null;
    var disposers = [];
    var reviewSession = null;
    var ended = false;
    var hintMove = null;
    var savedName = opts.loadedId || null;

    /* برای دونفره، هر دو رنگ مال بازیکن‌اند */
    var canSelect = function () { return true; };

    if (opts.loadedId) {
      global.AMIN.db.tx('games', 'readonly', function (stq) { return stq.get(opts.loadedId); }).then(function (rec) {
        if (!rec) { nav.go('play'); return; }
        rec.moves.forEach(function (san) { chess.move(san); });
        mode = rec.mode || 'local';
        aiLevel = rec.aiLevel || aiLevel;
        playerColor = rec.playerColor || playerColor;
        savedName = rec.name;
        buildBoardArea();
        draw();
        if (mode === 'ai' && chess.turn() !== playerColor && !chess.game_over()) requestAiMove(700);
      });
    } else {
      if (opts.fen) { try { chess.load(opts.fen); } catch (e) {} }
    }

    function buildBoardArea() {
      var modeNames = {
        ai: 'بازی با هوش مصنوعی — ' + (G.AI_LEVELS[aiLevel] ? G.AI_LEVELS[aiLevel].fa : ''),
        local: 'دونفره روی یک گوشی',
        free: 'بازی آزاد',
        practice: 'تمرین',
        endgame: 'تمرین آخر بازی' + (opts.scenario ? ' — ' + opts.scenario.fa : ''),
        opening: 'تمرین گشایش' + (opts.opening ? ' — ' + opts.opening.fa : '')
      };
      root.innerHTML = '';
      var layout = U.el('div.game-layout');

      layout.appendChild(U.el('div.game-topbar',
        U.el('button.icon-btn', { text: '‹', onclick: confirmExit }),
        U.el('div.col', { style: 'flex:1;align-items:center' },
          U.el('b', { text: modeNames[mode] || '' }),
          U.el('span#game-status', { text: '', style: 'font-size:.72rem;color:var(--text-dim)' })),
        U.el('button.icon-btn', { text: '🧠', title: 'از استاد بپرس', onclick: function () { askMasterAboutPosition(); } })));

      var boardHolder = U.el('div#board-holder');
      layout.appendChild(boardHolder);

      /* نوار امتیاز در تمرین/آزاد/تحلیل */
      if (mode === 'practice' || mode === 'free' || mode === 'endgame') {
        layout.appendChild(U.el('div', { id: 'eval-wrap', style: 'display:none' },
          U.el('div.card-sub', { style: 'margin:0 2px 4px', text: 'ارزیابی موتور' }),
          U.el('div.progress.eval-bar', U.el('i#eval-fill', { style: 'width:50%' })),
          U.el('div#eval-text', { style: 'font-size:.74rem;color:var(--text-dim);margin-top:4px' })));
      }

      layout.appendChild(U.el('div#moves-strip.moves-strip', { text: '—' }));

      var controls = U.el('div.controls-row',
        U.el('button.btn', { text: '↩️ برگشت', onclick: function () { undoLocal(); } }),
        U.el('button.btn', { text: '🔄 نو', onclick: function () { chess = new global.Chess(opts.fen || undefined); ended = false; openingIdx = 0; draw(false); if (mode === 'ai' && playerColor === 'b') requestAiMove(600); } }),
        U.el('button.btn', { text: '🔄 چرخش', onclick: function () { boardApi.setOrientation(boardApi.getOrientation() === 'white' ? 'black' : 'white'); } }),
        U.el('button.btn', { text: '💡 راهنما', onclick: showHint }),
        U.el('button.btn', { text: '💾 ذخیره', onclick: saveGame }));
      layout.appendChild(controls);

      if (mode === 'ai') {
        layout.appendChild(U.el('button.btn.btn-ghost.btn-full', { text: '⚙️ تغییر سطح حریف', onclick: function () {
          P.levelDialog(aiLevel, function (lvl) { aiLevel = lvl; nav.setHeader('بازی با هوش مصنوعی — ' + G.AI_LEVELS[lvl].fa, true); U.toast('سطح حریف: ' + G.AI_LEVELS[lvl].fa); });
        } }));
      }

      if (mode === 'endgame' && opts.scenario) {
        layout.appendChild(U.el('div.card',
          U.el('div.card-title', { text: '🎯 هدف: ' + opts.scenario.fa }),
          U.el('div.card-sub', { text: opts.scenario.goal }),
          U.el('div.hint-text', { text: 'راهنما: ' + opts.scenario.hint })));
      }
      if (mode === 'opening' && opts.opening) {
        layout.appendChild(U.el('div.card',
          U.el('div.card-title', { text: '🚀 ' + opts.opening.fa }),
          U.el('div.card-sub', { text: opts.opening.desc + ' — حرکت‌های خط را به‌ترتیب بزن.' })));
      }

      root.appendChild(layout);
      global.AMIN.nav.setHeader(modeNames[mode] || 'بازی', true);
    }

    var boardApi = null;
    var openingIdx = 0;

    function makeBoard() {
      boardApi = global.AMIN.ui.board.create({
        orientation: (mode === 'ai' && playerColor === 'b') ? 'black' : 'white',
        boardTheme: st.getSettings().boardTheme,
        pieceSet: st.getSettings().pieceSet,
        showLegal: st.getSettings().showLegal,
        showCoords: st.getSettings().showCoords,
        canSelect: function (sq, piece) {
          if (mode === 'ai') return piece.color === playerColor;
          return true;
        },
        onMove: function (mv) { applyPlayerMove(mv); },
        onNeedPromotion: function (from, to, cb) {
          P.promotionDialog(chess.turn(), cb);
        }
      });
      if (st.getSettings().fxTrail) boardApi.el.classList.add('fx-trail');
    }

    function applyPlayerMove(mv) {
      var legal = chess.moves({ verbose: true }).filter(function (m) { return m.from === mv.from && m.to === mv.to && (!mv.promotion || m.promotion === mv.promotion); });
      if (!legal.length) { Sound.play('click'); return; }
      var use = legal.filter(function (m) { return m.promotion === (mv.promotion || 'q'); })[0] || legal[0];
      var res = chess.move(use.san);
      if (!res) return;
      afterLocalMove(res);
    }

    function afterLocalMove(res) {
      /* اعتبارسنجی تمرین گشایش */
      if (mode === 'opening' && opts.opening) {
        var expected = opts.opening.sans[openingIdx];
        if (res.san !== expected) {
          U.toast('✗ حرکت گشایش این «' + expected + '» است، نه «' + res.san + '»');
          chess.undo();
          draw();
          return;
        }
        openingIdx++;
        if (openingIdx >= opts.opening.sans.length) {
          Sound.play('win');
          U.toast('🎉 خط گشایش «' + opts.opening.fa + '» را کامل اجرا کردی! +' + U.faNum(10) + ' سکه');
          st.earn(10, 'تمرین گشایش', { reasonKey: 'opening:' + opts.opening.id + ':' + U.dayKey() });
        }
      }
      if (mode === 'endgame') {
        if (chess.in_checkmate()) {
          Sound.play('win');
          st.earn(25, 'مات در تمرین آخر بازی', { reasonKey: 'endgame:' + (opts.scenario ? opts.scenario.id : '') + ':' + U.dayKey() });
          st.track('game_win', 1);
        }
      }
      Sound.play(res.captured ? 'capture' : 'move');
      if (chess.in_check()) Sound.play('check');
      st.track('game_any', 1);
      draw();
      updateEvalBar();
      checkLocalEnd();
      if (mode === 'ai' && !ended && !chess.game_over() && chess.turn() !== playerColor) {
        requestAiMove();
      }
    }

    function checkLocalEnd() {
      if (!chess.game_over() || ended) return;
      ended = true;
      var resultFa;
      var outcome;
      if (chess.in_checkmate()) {
        var loser = chess.turn();
        var winner = loser === 'w' ? 'b' : 'w';
        resultFa = 'کیش و مات — برنده: ' + (winner === 'w' ? 'سفید' : 'سیاه');
        outcome = mode === 'ai' ? (winner === playerColor ? 'win' : 'loss') : (winner === 'w' ? 'win-white' : 'win-black');
      } else if (chess.in_stalemate()) { resultFa = 'پات — تساوی'; outcome = 'draw'; }
      else if (chess.in_threefold_repetition()) { resultFa = 'تکرار سه‌باره — تساوی'; outcome = 'draw'; }
      else if (chess.insufficient_material()) { resultFa = 'مهره ناکافی — تساوی'; outcome = 'draw'; }
      else { resultFa = 'قانون پنجاه حرکت — تساوی'; outcome = 'draw'; }
      Sound.play(outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'click');
      finishGame(outcome, resultFa);
    }

    function finishGame(outcome, resultFa) {
      var coins = 0;
      if (mode === 'ai') {
        if (outcome === 'win') coins = 15 + 5 * (G.AI_LEVELS[aiLevel] ? Math.ceil(G.AI_LEVELS[aiLevel].skill / 3.4) : 1);
        else if (outcome === 'draw') coins = 6;
        else coins = 2;
        st.recordGame({ mode: 'ai', result: outcome === 'win' ? 'win' : outcome === 'loss' ? 'loss' : 'draw', aiLevel: G.AI_LEVELS[aiLevel] ? Math.ceil(G.AI_LEVELS[aiLevel].skill / 3.4) : 0, movesCount: chess.history().length });
      } else if (mode === 'local' || mode === 'practice') {
        coins = 5;
        st.recordGame({
          mode: 'local',
          result: outcome === 'win-white' ? 'draw' : outcome === 'win-black' ? 'draw' : outcome,
          movesCount: chess.history().length
        });
      }
      var extra = coins ? ' — 🪙 +' + U.faNum(coins) + ' سکه' : '';
      P.gameEndDialog(outcome, resultFa + extra, {
        onReview: function () { runReview(); },
        onRematch: function () { ended = false; chess = new global.Chess(opts.fen || undefined); openingIdx = 0; buildBoardArea(); makeBoard(); draw(false); if (mode === 'ai' && playerColor === 'b') requestAiMove(600); },
        onClose: function () { nav.go('play'); }
      });
    }

    /* جلسه AI — موتور مستقیم روی شطرنجِ همین صفحه کار می‌کند (بدون نسخه دوم) */
    var aiTimer = null;
    function requestAiMove(delay) {
      if (mode !== 'ai' || ended || over) return;
      if (chess.game_over()) return;
      if (chess.turn() === playerColor) return;
      setThinking(true);
      aiTimer = setTimeout(function () {
        var lvl = G.AI_LEVELS[aiLevel] || G.AI_LEVELS.easy;
        global.AMIN.engine.bestMove(chess.fen(), { skill: lvl.skill, movetime: lvl.movetime }).then(function (res) {
          setThinking(false);
          if (ended) return;
          if (!res.bestmove || res.bestmove === '(none)') return;
          var mv = chess.move({ from: res.bestmove.slice(0, 2), to: res.bestmove.slice(2, 4), promotion: res.bestmove[4] || undefined });
          if (!mv) { U.toast('⚠️ حرکت نامعتبر موتور — دوباره تلاش می‌شود'); requestAiMove(600); return; }
          lastMove = mv;
          Sound.play(mv.captured ? 'capture' : 'move');
          if (chess.in_check()) Sound.play('check');
          draw(true);
          checkLocalEnd();
        }).catch(function (e) {
          setThinking(false);
          U.toast('⚠️ ' + (e && e.message || 'خطای موتور'));
        });
      }, delay || 380);
      disposers.push(function () { clearTimeout(aiTimer); });
    }

    function setThinking(t) {
      var el = document.getElementById('game-status');
      if (el) el.innerHTML = t ? 'حریف ماشینی دارد فکر می‌کند<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>' : '';
    }

    function undoLocal() {
      if (!chess.history().length) return;
      chess.undo();
      if (mode === 'ai' && chess.turn() !== playerColor && chess.history().length) chess.undo();
      ended = false;
      draw(false);
    }

    function draw(animate, byAi) {
      var holder = document.getElementById('board-holder');
      if (!holder) return;
      if (!boardApi) makeBoard();
      var renderOpts = { animate: animate !== false, lastMove: lastMove };
      if (chess.in_check()) {
        /* خانه شاهِ در کیش */
        var b = chess.board();
        var turn = chess.turn();
        for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
          var p = b[r][f];
          if (p && p.type === 'k' && p.color === turn) renderOpts.checkSquare = 'abcdefgh'[f] + (8 - r);
        }
      }
      boardApi.render(chess, renderOpts);
      if (hintMove) boardApi.setHint(hintMove);
      updateMovesStrip();
      updateStatusLine();
    }

    function updateStatusLine() {
      var el = document.getElementById('game-status');
      if (!el) return;
      var t = chess.turn() === 'w' ? 'سفید' : 'سیاه';
      var s = 'نوبت: ' + t;
      if (chess.in_check()) s += ' — کیش!';
      if (mode === 'opening' && opts.opening) s += ' — حرکت بعدی: ' + (opts.opening.sans[openingIdx] || 'پایان خط');
      el.textContent = s;
    }

    function updateMovesStrip() {
      var el = document.getElementById('moves-strip');
      if (!el) return;
      var hist = chess.history();
      var out = [];
      for (var i = 0; i < hist.length; i += 2) {
        out.push((i / 2 + 1) + '. ' + hist[i] + (hist[i + 1] ? ' ' + hist[i + 1] : ''));
      }
      el.innerHTML = out.length ? out.map(function (x) {
        var parts = x.split(' ');
        return '<b>' + parts[0] + '</b> ' + parts.slice(1).join(' ');
      }).join('&nbsp;&nbsp;') : '—';
      el.scrollTop = el.scrollHeight;
    }

    function updateEvalBar() {
      var wrap = document.getElementById('eval-wrap');
      if (!wrap) return;
      wrap.style.display = 'block';
      var fill = document.getElementById('eval-fill');
      var text = document.getElementById('eval-text');
      if (!global.AMIN.engine.status().ready) return;
      global.AMIN.analysis.evalPov(chess.fen(), chess.turn(), { movetime: 500 }).then(function (ev) {
        if (!fill) return;
        var pct = Math.max(2, Math.min(98, 50 + ev.cp / 30));
        fill.style.width = pct + '%';
        if (text) text.textContent = global.AMIN.analysis.describeEval(ev) + (ev.bestSan ? ' — پیشنهاد: ' + ev.bestSan : '');
      });
    }

    function showHint() {
      if (mode === 'ai' && !chess.turn) return;
      if (!global.AMIN.engine.status().ready) { U.toast('موتور در حال آماده‌سازی است…'); return; }
      U.toast('💡 موتور دارد بهترین حرکت را پیدا می‌کند…');
      global.AMIN.analysis.evalPov(chess.fen(), chess.turn(), { movetime: 900 }).then(function (ev) {
        if (ev.best) {
          hintMove = { from: ev.best.slice(0, 2), to: ev.best.slice(2, 4) };
          boardApi && boardApi.setHint(hintMove);
          U.toast('💡 پیشنهاد موتور: ' + (ev.bestSan || hintMove.from + '→' + hintMove.to));
        }
      });
    }

    function saveGame() {
      var name = (savedName || prompt2()).replace(/[<>]/g, '');
      function prompt2() { return 'مسابقه ' + U.faNum(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })); }
      var rec = {
        id: U.uuid(), ts: Date.now(), name: name,
        mode: mode, aiLevel: aiLevel, playerColor: playerColor,
        fen: chess.fen(), pgn: chess.pgn({ max_width: 60, newline_char: '\n' }),
        moves: chess.history(), over: chess.game_over()
      };
      global.AMIN.db.tx('games', 'readwrite', function (stx) { stx.put(rec, rec.id); }).then(function () {
        U.toast('💾 مسابقه ذخیره شد');
      });
    }

    function askMasterAboutPosition() {
      global.AMIN.masterCtx = {
        fen: chess.fen(),
        turn: chess.turn(),
        lastMove: lastMove ? lastMove.san : null,
        chess: chess
      };
      nav.go('master', { autoAsk: 'وضعیت فعلی را تحلیل کن و بهترین حرکت را با دلیل بگو.' });
    }

    /* بررسی بازی با موتور */
    function runReview() {
      var overlayCard = U.el('div.modal', { style: 'text-align:center' },
        U.el('h3', { text: 'بررسی بازی با موتور' }),
        U.el('div.card-sub', { text: 'هر حرکت با Stockfish مقایسه می‌شود…' }),
        U.el('div.progress', U.el('i#review-fill', { style: 'width:0%' })),
        U.el('div#review-count', { style: 'margin-top:8px;font-size:.8rem;color:var(--text-dim)' }, '۰٪'));
      var dlg = P.openModal(overlayCard, { locked: true });
      if (!global.AMIN.engine.status().ready) {
        global.AMIN.engine.init().then(function () { startReview(dlg); });
      } else startReview(dlg);

      function startReview(dlgRef) {
        var rev = global.AMIN.analysis.reviewGame(chess, null, {
          movetime: 380,
          onProgress: function (frac) {
            var fill = document.getElementById('review-fill');
            var cnt = document.getElementById('review-count');
            if (fill) fill.style.width = Math.round(frac * 100) + '%';
            if (cnt) cnt.textContent = U.faNum(Math.round(frac * 100)) + '٪';
          }
        });
        reviewSession = rev;
        rev.promise.then(function (results) {
          dlgRef.close();
          global.AMIN.lastReview = results;
          showReviewResults(results);
        }).catch(function () { dlgRef.close(); U.toast('بررسی ناتمام ماند'); });
      }
    }

    function showReviewResults(results) {
      var bad = results.filter(function (r) { return r.verdict.key === 'blunder' || r.verdict.key === 'mistake'; });
      var good = results.filter(function (r) { return r.verdict.key === 'best'; }).length;
      var card = U.el('div.modal',
        U.el('h3', { text: 'گزارش بررسی' }),
        U.el('div.card-sub', { html:
          '★ بهترین حرکت: ' + U.faNum(good) + '<br>' +
          '✗✗ اشتباه بزرگ: ' + U.faNum(bad.filter(function (r) { return r.verdict.key === 'blunder'; }).length) + '<br>' +
          '✗ خطا: ' + U.faNum(bad.filter(function (r) { return r.verdict.key === 'mistake'; }).length) }),
        U.el('div', { style: 'max-height:200px;overflow-y:auto' },
          bad.slice(0, 8).map(function (r) {
            return U.el('div.history-row',
              U.el('b', { text: r.san }),
              U.el('span', { text: (r.color === 'w' ? 'سفید' : 'سیاه') + ' · حرکت ' + U.faNum(r.moveNo) }),
              U.el('span', { text: r.verdict.fa + (r.bestSan ? ' — درست: ' + r.bestSan : ''), style: 'font-size:.72rem;color:var(--danger)' }));
          })),
        U.el('div.row.gap', { style: 'margin-top:12px' },
          U.el('button.btn.btn-primary', { text: '🧠 از استاد بپرس', onclick: function () { dlg.close(); askMasterAboutReview(); } }),
          U.el('button.btn.btn-ghost', { text: 'بستن', onclick: function () { dlg.close(); } })));
      var dlg = P.openModal(card);
    }

    function askMasterAboutReview() {
      global.AMIN.masterCtx = {
        fen: chess.fen(), turn: chess.turn(), chess: chess,
        lastReview: global.AMIN.lastReview || null
      };
      nav.go('master', { autoAsk: 'اشتباه‌های بازی اخیرم را بررسی کن و بگو چه چیزی را باید تمرین کنم.' });
    }

    function confirmExit() {
      if (chess.history().length && !ended) {
        U.confirmDlg('خروج از بازی', 'پیش از خروج، مسابقه ذخیره شود؟', 'ذخیره و خروج').then(function (save) {
          if (save) saveGame();
          nav.back();
        });
      } else nav.back();
    }

    /* شروع */
    buildBoardArea();
    makeBoard();
    draw(false);
    /* AI سفید است و شروع می‌کند */
    if (mode === 'ai' && playerColor === 'b') requestAiMove(800);

    return { dispose: function () { disposers.forEach(function (f) { f(); }); if (reviewSession) reviewSession.cancel(); } };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('play', { title: 'بازی', render: render });
})(window);
