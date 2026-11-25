/* AMIN CHESS AI — «استاد شطرنج»: دستیار فارسی با دو حالت آفلاین و آنلاین
 * حالت آفلاین: Stockfish + پایگاه دانش داخلی (صادقانه درباره محدودیت‌ها)
 * حالت آنلاین: Cloudflare Workers AI یا Groq بر اساس تنظیمات کاربر */
(function (global) {
  'use strict';

  var KB = global.AMIN.knowledge;
  var API = global.AMIN.api;
  var E = global.AMIN.engine;
  var AN = global.AMIN.analysis;
  var U = global.AMIN.util;

  var SYSTEM_PROMPT = [
    'تو «استاد شطرنج» هستی، دستیار شطرنج فارسی‌زبانِ اپلیکیشن AMIN CHESS AI.',
    'قواعد پاسخ: فقط فارسی، صمیمی اما حرفه‌ای، پاسخ کوتاه و کاربردی (حداکثر ۱۲۰ کلمه)،',
    'از فهرست و ترتیب استفاده کن اگر لازم شد. حرکت‌ها را با نماد SAN استاندارد بنویس (مثل Nf3 یا O-O).',
    'اگر موقعیت شطرنج فعلی به تو داده شد، بر اساس آن تحلیل کن: بهترین حرکت، دلیل، و یک نکته تاکتیکی.',
    'اگر سؤال درباره قوانین یا آموزش بود، آموزش گام‌به‌گام بده. اگر اشتباه کاربر در بازی به تو داده شد،',
    'علت خطا و درس گرفته‌شده را بگو. اگر سؤال خارج از شطرنج بود، مؤدبانه به شطرنج برگرد.'
  ].join('\n');

  /* ---------- ابزار توضیح حرکت ---------- */
  function pieceTypeFa(t) { return U.pieceFa(t); }

  function explainMoveData(fen, move, engineRes) {
    var reasons = [];
    var colorFa = move.color === 'w' ? 'سفید' : 'سیاه';
    if (move.captured) {
      reasons.push('مهره ' + pieceTypeFa(move.captured) + ' حریف را می‌گیرد — سود ماتریال.');
    }
    var g = new global.Chess(fen);
    g.move(move.san);
    if (g.in_checkmate()) reasons.push('کیش و مات! بازی همین‌جا تمام می‌شود.');
    else if (g.in_check()) reasons.push('به شاه حریف کیش می‌دهد و او را مجبور به پاسخ می‌کند.');
    if (move.flags && move.flags.indexOf('k') >= 0) reasons.push('قلعه کوچک — شاه امن و رخ فعال می‌شود.');
    if (move.flags && move.flags.indexOf('q') >= 0) reasons.push('قلعه بزرگ — شاه امن و رخ سمت وزیر وارد بازی می‌شود.');
    if (move.flags && move.flags.indexOf('p') >= 0) reasons.push('سرباز به ' + pieceTypeFa(move.promotion || 'q') + ' ارتقا می‌یابد.');
    if (move.flags && move.flags.indexOf('e') >= 0) reasons.push('گرفتن آن‌پاسان!');
    var mid = ['d4', 'd5', 'e4', 'e5'];
    if (mid.indexOf(move.to) >= 0) reasons.push('بر خانه‌های مرکزی مسلط می‌شود.');
    if (move.piece === 'n' && ['c3', 'f3', 'c6', 'f6'].indexOf(move.to) >= 0) reasons.push('توسعه اسب طبق اصول گشایش.');
    if (move.piece === 'b' && ['c4', 'f4', 'c5', 'f5'].indexOf(move.to) >= 0) reasons.push('توسعه فیل به سمت مرکز.');
    if (move.piece === 'k' && !move.flags.match(/k|q/)) reasons.push('حرکت شاه.');
    if (engineRes && engineRes.score != null && engineRes.score >= 50) reasons.push('موتور امتیاز موقعیت را در سود تو می‌بیند.');
    if (!reasons.length) reasons.push('حرکتی منسجم که مهره‌ها را فعال‌تر نگه می‌دارد.');
    return reasons;
  }

  /* ---------- پاسخ آفلاین ---------- */
  function offlineAnswer(question, ctx) {
    ctx = ctx || {};
    var q = String(question || '').trim();

    var wantsAnalysis = /تحلیل|موقعیت|امتیاز|چه وضع|وضعیت|بهترین حرکت|پیشنهاد|باهم چی|چه بزنم|راهنمای حرکت/.test(q);
    var wantsStuck = /گیر|نمی‌دانم|چه کنم|کمک/.test(q);
    var wantsMistakes = /اشتباه|خطا|بررسی بازی|آخر بازی|چرا باختم|بازبینی/.test(q);
    var wantsTeach = /آموزش|یاد بگیر|تاکتیک|گشایش|چطور|چگونه|قانون|درس/.test(q);

    if (wantsAnalysis && ctx.fen && E.status().ready) {
      return AN.evalPov(ctx.fen, ctx.turn || 'w', { movetime: 1100 }).then(function (ev) {
        var legal = ctx.chess ? ctx.chess.moves({ verbose: true }) : [];
        var kbTactic = KB.search('تاکتیک', 1)[0];
        var text = '📊 تحلیل موقعیت فعلی (آفلاین با موتور Stockfish):\n' +
          AN.describeEval(ev) + '\n\n' +
          'بهترین حرکت: ' + (ev.bestSan || '؟') + '\n';
        if (ev.lines[1] && ev.lines[1].pv) {
          var alt = AN.pvToSan(ctx.fen, ev.lines[1].pv);
          if (alt) text += 'گزینه جایگزین: ' + alt + '\n';
        }
        text += '\nنکته: مهره‌های بی‌حفاظ و خط‌های باز حریف را اسکن کن.';
        if (kbTactic) text += '\n\nبرای تقویت تاکتیک، درس «تاکتیک‌ها» را در بخش آموزش ببین.';
        return { text: text, mode: 'offline' };
      }).catch(function () {
        return Promise.resolve({
          text: 'موتور تحلیل در دسترس نیست (در حال راه‌اندازی است). چند لحظه بعد دوباره امتحان کن.',
          mode: 'offline'
        });
      });
    }

    if (wantsStuck && ctx.fen && E.status().ready) {
      return AN.evalPov(ctx.fen, ctx.turn || 'w', { movetime: 900 }).then(function (ev) {
        return {
          text: 'نگران نباش! پیشنهاد موتور آفلاین: «' + (ev.bestSan || '؟') + '»\n' +
            AN.describeEval(ev) + '\n\n' +
            'چک‌لیست گیرکردن:\n۱) کیش هست؟ ۲) مهره بی‌حفاظ دارم؟ ۳) کدام مهره‌ام بی‌کار است؟',
          mode: 'offline'
        };
      });
    }

    if (wantsMistakes) {
      var review = ctx.lastReview;
      if (review && review.length) {
        var bad = review.filter(function (r) { return r.verdict.key === 'blunder' || r.verdict.key === 'mistake'; });
        if (bad.length) {
          var lines = bad.slice(0, 4).map(function (r) {
            return '• حرکت ' + U.faNum(r.moveNo) + ' («' + r.san + '»): ' + r.verdict.fa +
              (r.bestSan ? ' — حرکت درست «' + r.bestSan + '» بود' : '');
          });
          return Promise.resolve({
            text: 'در بازی آخر ' + U.faNum(bad.length) + ' حرکت ضعیف پیدا شد:\n' + lines.join('\n') +
              '\n\nدرس مشترک: قبل از هر حرکت، تهدیدهای حریف و مهره‌های بی‌حفاظ خودت را اسکن کن.',
            mode: 'offline'
          });
        }
        return Promise.resolve({ text: 'در بازی آخر خطای بزرگی نداشتی! بازی تمیزی بود. برای تمرین بیشتر سراغ معماها برو.', mode: 'offline' });
      }
      return Promise.resolve({ text: 'اول یک بازی را کامل کن؛ بعد می‌توانم حرکت‌های ضعیفش را با موتور بررسی کنم. در حالت آنلاین تحلیل مفصل‌تری می‌دهم.', mode: 'offline' });
    }

    /* جستجوی پایگاه دانش */
    var hits = KB.search(q, 1);
    if (hits.length) {
      var e = hits[0];
      return Promise.resolve({ text: '📖 ' + e.title + '\n\n' + e.text, mode: 'offline' });
    }

    if (wantsTeach) {
      var t = KB.search('گشایش اصول', 1)[0] || KB.search('بهتر شدن', 1)[0];
      if (t) return Promise.resolve({ text: '🎓 ' + t.title + '\n\n' + t.text, mode: 'offline' });
    }

    /* پاسخ صادقانه آفلاین */
    return Promise.resolve({
      text: 'در حالت آفلاین می‌توانم: تحلیل موقعیت و بهترین حرکت (با موتور Stockfish)، پاسخ سؤال‌های قوانین و آموزش (با پایگاه دانش داخلی)، و بررسی اشتباهات بازی آخر را انجام دهم.\n\n' +
        'برای گفت‌وگوی آزاد فارسی، یک API را در «مدیریت هوش مصنوعی و API» تنظیم کن (Cloudflare یا Groq)؛ در آن حالت هر سؤالی را جواب می‌دهم. فعلاً بدون اینترنت هستم و صادقانه می‌گویم: مدل زبانی آنلاین در دسترس نیست.',
      mode: 'offline'
    });
  }

  /* ---------- پاسخ آنلاین ---------- */
  function onlineAnswer(question, ctx, history) {
    var msgs = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (ctx && ctx.fen) {
      var ctxLine = 'موقعیت فعلی بازی کاربر:\nFEN: ' + ctx.fen + '\nنوبت: ' + (ctx.turn === 'w' ? 'سفید' : 'سیاه');
      if (ctx.lastMove) ctxLine += '\nحرکت اخیر: ' + ctx.lastMove;
      if (ctx.chess) {
        var mv = ctx.chess.moves();
        ctxLine += '\nحرکات قانونی: ' + mv.slice(0, 40).join(', ');
        ctxLine += ctx.chess.in_check() ? '\nوضعیت: کیش!' : '';
      }
      if (ctx.lastReview) {
        var bad = ctx.lastReview.filter(function (r) { return r.verdict.key === 'blunder' || r.verdict.key === 'mistake'; }).slice(0, 5);
        if (bad.length) ctxLine += '\nحرکت‌های ضعیف بازی اخیر: ' + bad.map(function (r) { return r.san + '(' + r.verdict.fa + (r.bestSan ? '؛ درست: ' + r.bestSan : '') + ')'; }).join('، ');
      }
      msgs.push({ role: 'system', content: ctxLine });
    }
    (history || []).slice(-6).forEach(function (h) {
      msgs.push({ role: h.role, content: h.content });
    });
    msgs.push({ role: 'user', content: question });

    return API.chat(msgs, { maxTokens: 650 }).then(function (r) {
      return { text: r.text, mode: 'online', provider: r.provider };
    }).catch(function (e) {
      /* افتادن به آفلاین — صادقانه اعلام کن */
      return offlineAnswer(question, ctx).then(function (res) {
        return {
          text: '⚠️ سرویس آنلاین پاسخ نداد (' + (e && e.message || 'خطا') + ').' +
            ' تا اطلاع بعدی با پایگاه دانش آفلاین جواب می‌دهم:\n\n' + res.text,
          mode: 'offline-fallback'
        };
      });
    });
  }

  function ask(question, ctx, history) {
    var provider = API.activeProvider();
    if (provider !== 'offline' && global.navigator && global.navigator.onLine !== false) {
      return onlineAnswer(question, ctx, history);
    }
    return offlineAnswer(question, ctx);
  }

  /* پیام خوش‌آمد دستیار */
  function greeting() {
    var provider = API.activeProvider();
    if (provider === 'offline') {
      return 'سلام! من «استاد شطرنج» هستم 🧠\nدر حالت آفلاین می‌توانم موقعیتت را تحلیل کنم، بهترین حرکت را بگویم، قوانین را توضیح دهم و اشتباهات بازی‌ات را بررسی کنم.\nبرای گفت‌وگوی کامل، API خودت را در بخش «مدیریت هوش مصنوعی» تنظیم کن.';
    }
    return 'سلام! من «استاد شطرنج» هستم 🧠\nاتصال آنلاین برقرار است (' + (provider === 'groq' ? 'Groq' : 'Cloudflare') + '). از تحلیل موقعیت تا آموزش گشایش هرچه بخواهی در خدمتم!';
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.master = {
    ask: ask, offlineAnswer: offlineAnswer, onlineAnswer: onlineAnswer,
    greeting: greeting, explainMoveData: explainMoveData
  };
})(window);
