/* AMIN CHESS AI — تحلیل موقعیت و بررسی بازی (با موتور آفلاین) */
(function (global) {
  'use strict';

  var E = global.AMIN.engine;
  var U = global.AMIN.util;

  /* امتیاز از منظر یک رنگ خاص (UCI امتیاز را از منظر نوبت می‌دهد) */
  function toPov(res, color) {
    var sideToMove = color; /* فراخواننده باید رنگ نوبت در FEN بدهد */
    return res;
  }

  /* امتیاز بر حسب سنتي‌پان از منظر بازیکنی که در FEN نوبت دارد */
  function scorePov(res) {
    if (res.mate != null && res.mate !== 0) {
      return { mate: res.mate, cp: res.mate > 0 ? 10000 - res.mate : -10000 - res.mate };
    }
    return { mate: 0, cp: res.score || 0 };
  }

  /* ارزیابی یک FEN از منظر رنگ داده‌شده */
  function evalPov(fen, color, opts) {
    opts = opts || {};
    var side = fen.split(' ')[1] || 'w';
    return E.analyze(fen, { multipv: opts.multipv || 2, movetime: opts.movetime || 600 }).then(function (res) {
      var s = scorePov(res);
      var flip = side !== color;
      var best = res.bestmove;
      return {
        fen: fen, color: color,
        cp: flip ? -s.cp : s.cp,
        mate: res.mate != null && res.mate !== 0 ? (flip ? -res.mate : res.mate) : null,
        best: best,
        bestSan: res.lines && res.lines[0] && res.lines[0].pv ? pvToSan(fen, res.lines[0].pv) : (best ? pvToSan(fen, [best]) : null),
        lines: res.lines || [],
        depth: res.depth
      };
    });
  }

  /* تبدیل اولین حرکت‌های pv به SAN خوانا */
  function pvToSan(fen, pv) {
    if (!pv || !pv.length) return null;
    try {
      var g = new global.Chess(fen);
      var out = [];
      for (var i = 0; i < Math.min(4, pv.length); i++) {
        var mv = g.move({ from: pv[i].slice(0, 2), to: pv[i].slice(2, 4), promotion: pv[i][4] || undefined });
        if (!mv) break;
        out.push(mv.san);
      }
      return out.join(' ');
    } catch (e) { return null; }
  }

  /* دسته‌بندی کیفیت یک حرکت بر اساس افت امتیاز */
  function classify(lossCp, isBest) {
    if (isBest) return { key: 'best', fa: 'بهترین حرکت', cls: 'good', icon: '★' };
    if (lossCp >= 300) return { key: 'blunder', fa: 'اشتباه بزرگ', cls: 'bad', icon: '✗✗' };
    if (lossCp >= 120) return { key: 'mistake', fa: 'خطا', cls: 'warn', icon: '✗' };
    if (lossCp >= 60) return { key: 'inaccuracy', fa: 'نقص جزئی', cls: 'minor', icon: '?!' };
    if (lossCp <= 10) return { key: 'good', fa: 'حرکت خوب', cls: 'good', icon: '✓' };
    return { key: 'ok', fa: 'قابل قبول', cls: 'ok', icon: '–' };
  }

  /* بررسی کل بازی: آرایه‌ای از حرکات با کیفیت هرکدام
   * chess: شیء Chess با تاریخچه کامل؛ playerColor: 'w'|'b' یا null (هر دو) */
  function reviewGame(chess, playerColor, opts) {
    opts = opts || {};
    var verbose = chess.history({ verbose: true });
    /* بازسازی FEN‌های میانی */
    var fens = [new global.Chess().fen()];
    var startFen = chess.fen();
    var g = new global.Chess();
    if (startFen !== new global.Chess().fen()) {
      /* اگر بازی از FEN غیراستاندارد شروع شده باشد از pgn/history نمی‌توان دقیق ساخت؛
         فرض: بازی‌های برنامه همیشه از startpos هستند */
      fens[0] = new global.Chess().fen();
    }
    var recon = new global.Chess();
    for (var i = 0; i < verbose.length; i++) {
      fens.push(recon.fen());
      recon.move(verbose[i].san);
    }

    var results = [];
    var idx = 0;
    var cancelled = false;

    function step() {
      if (cancelled) return Promise.resolve(results);
      if (idx >= verbose.length) return Promise.resolve(results);
      var m = verbose[idx];
      var fenBefore = fens[idx];
      var color = m.color;
      if (playerColor && color !== playerColor) { idx++; return step(); }
      var isPromotion = !!m.promotion;
      return Promise.all([
        evalPov(fenBefore, color, { movetime: opts.movetime || 450 }),
        evalPov(fens[idx + 1], color, { movetime: opts.movetime || 450 })
      ]).then(function (r) {
        var before = r[0], after = r[1];
        var isBest = before.best && m.from === before.best.slice(0, 2) && m.to === before.best.slice(2, 4);
        var loss = Math.max(0, before.cp - after.cp);
        if (before.mate != null && after.mate == null) loss = Math.max(loss, 350);
        var c = classify(loss, isBest && !after.mate !== null ? isBest : isBest);
        results.push({
          ply: idx, moveNo: Math.floor(idx / 2) + 1, color: color, san: m.san,
          loss: loss, verdict: c, bestSan: before.bestSan, fenBefore: fenBefore,
          cpBefore: before.cp, cpAfter: after.cp
        });
        idx++;
        if (opts.onProgress) opts.onProgress(idx / verbose.length, results[results.length - 1]);
        return step();
      });
    }

    return {
      promise: step(),
      cancel: function () { cancelled = true; }
    };
  }

  /* گزارش متنی فارسی یک تحلیل موقعیت */
  function describeEval(ev) {
    var cp = ev.cp;
    var who = ev.color === 'w' ? 'سفید' : 'سیاه';
    var U2 = U;
    if (ev.mate != null) {
      if (ev.mate > 0) return 'مات اجباری در ' + U2.faNum(ev.mate) + ' حرکت به سود ' + who + '!';
      return 'در خطر مات در ' + U2.faNum(Math.abs(ev.mate)) + ' حرکت برای ' + who + '.';
    }
    var abs = Math.abs(cp);
    var val = (abs / 100).toFixed(1);
    if (abs < 50) return 'موقعیت متعادل است (اختلاف ناچیز).';
    var side = (ev.color === 'w' ? cp > 0 : cp < 0) ? who : (ev.color === 'w' ? 'سیاه' : 'سفید');
    if (abs < 150) return 'برتری خفیف برای ' + side + ' (حدود ' + U2.faNum(val) + ' سرباز).';
    if (abs < 400) return 'برتری روشن برای ' + side + ' (حدود ' + U2.faNum(val) + ' سرباز).';
    return 'برتری بزرگ برای ' + side + ' (حدود ' + U2.faNum(val) + ' سرباز).';
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.analysis = {
    evalPov: evalPov, reviewGame: reviewGame, classify: classify,
    describeEval: describeEval, pvToSan: pvToSan
  };
})(window);
