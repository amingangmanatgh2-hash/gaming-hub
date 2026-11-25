/* AMIN CHESS AI — پوشش موتور Stockfish (نسخه WASM با پشتیبان asm.js)
 * موتور داخل Web Worker اجرا می‌شود و بدون اینترنت کار می‌کند؛
 * فایل‌های موتور داخل پروژه قرار دارند. */
(function (global) {
  'use strict';

  var worker = null;
  var ready = false;
  var readyPromise = null;
  var currentJob = null;      /* {resolve, reject, type} */
  var jobQueue = [];
  var infoListeners = [];     /* برای نمایش لحظه‌ای عمق/امتیاز */
  var usingAsm = false;
  var restarting = false;

  var U = global.AMIN.util;

  function pickEngineFile() {
    /* WASM اول، در صورت شکست پشتیبان asm.js */
    return 'vendor/stockfish/stockfish.js';
  }

  function spawn() {
    return new Promise(function (resolve, reject) {
      var w;
      try {
        w = new Worker('vendor/stockfish/stockfish.js');
      } catch (e) {
        try { w = new Worker('vendor/stockfish/stockfish.asm.js'); usingAsm = true; }
        catch (e2) { reject(new Error('نمی‌توان موتور را اجرا کرد: ' + e2.message)); return; }
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error('موتور پاسخ نداد')); }
      }, 20000);

      w.onmessage = onEngineMessage;
      w.onerror = function (err) {
        /* اگر wasm کار نکرد یک‌بار با نسخه asm.js دوباره راه‌اندازی می‌کنیم */
        if (!usingAsm && !restarting) {
          restarting = true;
          usingAsm = true;
          try { w.terminate(); } catch (e) {}
          spawn().then(function (w2) {
            worker = w2; restarting = false;
            if (!settled) { settled = true; clearTimeout(timer); resolve(w2); }
            flushQueue();
          }).catch(function (e2) {
            restarting = false;
            if (!settled) { settled = true; clearTimeout(timer); reject(e2); }
          });
        } else if (!settled) {
          settled = true; clearTimeout(timer);
          reject(new Error('خطای موتور شطرنج'));
        }
        handleEngineFailure();
      };

      /* دست‌دهد اولیه: uci */
      var origResolve = resolve;
      resolveWaiters.uciok = function () {
        if (!settled) { settled = true; clearTimeout(timer); origResolve(w); }
      };
      try { w.postMessage('uci'); } catch (e) { clearTimeout(timer); reject(e); }
    });
  }

  /* نقشه انتظارها برای پیام‌های موتور */
  var resolveWaiters = {};

  function onEngineMessage(e) {
    var line = typeof e.data === 'string' ? e.data : (e.data && e.data.line) || '';
    if (!line) return;
    if (line === 'uciok' && resolveWaiters.uciok) { resolveWaiters.uciok(); return; }
    if (line === 'readyok' && resolveWaiters.readyok) { resolveWaiters.readyok(); return; }

    if (line.indexOf('info') === 0 && currentJob && currentJob.type !== 'simple') {
      var parsed = parseInfo(line);
      if (parsed && currentJob.onInfo) currentJob.onInfo(parsed);
      if (parsed) lastInfo = parsed;
    }
    if (line.indexOf('bestmove') === 0 && currentJob) {
      var mv = line.split(/\s+/)[1];
      var job = currentJob;
      currentJob = null;
      var result = { bestmove: mv, from: mv && mv.slice(0, 2), to: mv && mv.slice(2, 4), promotion: mv && mv.length > 4 ? mv[4] : null };
      if (lastInfo) {
        result.score = lastInfo.score;
        result.mate = lastInfo.mate;
        result.depth = lastInfo.depth;
        result.pv = lastInfo.pv;
        result.lines = collectedLines.slice();
      }
      collectedLines = [];
      lastInfo = null;
      job.resolve(result);
      flushQueue();
    }
  }

  var lastInfo = null;
  var collectedLines = [];

  function parseInfo(line) {
    var out = {};
    var m = line.match(/depth (\d+)/); if (m) out.depth = +m[1];
    m = line.match(/multipv (\d+)/); if (m) out.multipv = +m[1];
    m = line.match(/score (cp|mate) (-?\d+)/);
    if (m) {
      if (m[1] === 'cp') out.score = +m[2]; else { out.mate = +m[2]; out.score = 0; }
    }
    m = line.match(/ pv (.+)$/); if (m) out.pv = m[1].trim().split(/\s+/);
    return out;
  }

  function send(str) { if (worker) worker.postMessage(str); }

  function flushQueue() {
    if (jobQueue.length && !currentJob) {
      var next = jobQueue.shift();
      runJob(next);
    }
  }

  function runJob(job) {
    currentJob = job;
    try {
      /* ارسال ترتیبی فرمان‌ها به موتور */
      job.cmds.forEach(function (c) { send(c); });
    } catch (e) {
      currentJob = null;
      job.reject(e);
      flushQueue();
    }
  }

  function enqueue(cmds, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var job = { cmds: cmds, resolve: resolve, reject: reject, type: opts.type || 'search', onInfo: opts.onInfo || null };
      if (currentJob) jobQueue.push(job);
      else runJob(job);
    });
  }

  function handleEngineFailure() {
    /* خطای موتور نباید اپ را بکشد؛ درخواست جاری را با خطا تمام کن */
    if (currentJob) {
      var j = currentJob; currentJob = null;
      j.reject(new Error('موتور متوقف شد'));
      flushQueue();
    }
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = spawn().then(function (w) {
      worker = w;
      send('setoption name MultiPV value 1');
      send('setoption name Threads value 1');
      send('setoption name Hash value 32');
      return new Promise(function (resolve) {
        resolveWaiters.readyok = function () { ready = true; resolve(true); };
        send('isready');
      });
    }).catch(function (e) {
      readyPromise = null;
      throw e;
    });
    return readyPromise;
  }

  /* تنظیم سطح مهارت (۰ تا ۲۰) */
  function setSkill(level) {
    send('setoption name Skill level value ' + Math.max(0, Math.min(20, level | 0)));
  }

  /* بهترین حرکت برای بازی با AI */
  function bestMove(fen, opts) {
    opts = opts || {};
    var cmds = ['position fen ' + fen];
    if (opts.skill != null) cmds.push('setoption name Skill level value ' + (opts.skill | 0));
    cmds.push('go ' + (opts.movetime ? 'movetime ' + (opts.movetime | 0) : 'depth ' + (opts.depth || 10)));
    return enqueue(cmds, { type: 'search' });
  }

  /* تحلیل موقعیت: امتیاز، بهترین حرکت و خط‌های اصلی (MultiPV) */
  function analyze(fen, opts) {
    opts = opts || {};
    var multipv = opts.multipv || 2;
    var movetime = opts.movetime || 1200;
    collectedLines = [];
    var cmds = [
      'setoption name MultiPV value ' + multipv,
      'position fen ' + fen,
      'go movetime ' + (movetime | 0)
    ];
    return enqueue(cmds, {
      type: 'search',
      onInfo: function (p) {
        if (p.pv && p.pv.length && (p.multipv || 1) >= 1) {
          collectedLines[(p.multipv || 1) - 1] = { score: p.mate != null ? null : p.score, mate: p.mate, depth: p.depth, pv: p.pv };
        }
        infoListeners.forEach(function (fn) { try { fn(p); } catch (e) {} });
      }
    }).then(function (res) {
      /* برگرداندن دید موتور از منظر بازیکن فعلی */
      return res;
    });
  }

  /* ارزیابی سریع یک FEN (برای تشخیص اشتباه) */
  function evaluate(fen, opts) {
    opts = opts || {};
    return analyze(fen, { multipv: 1, movetime: opts.movetime || 500 });
  }

  function stop() { send('stop'); }

  function restart() {
    return new Promise(function (resolve) {
      if (worker) { try { worker.terminate(); } catch (e) {} }
      worker = null; ready = false; readyPromise = null; currentJob = null;
      init().then(function () { resolve(true); }).catch(function () { resolve(false); });
    });
  }

  function status() {
    return { ready: ready, usingAsm: usingAsm, busy: !!currentJob, queued: jobQueue.length };
  }

  function onInfo(fn) { infoListeners.push(fn); return function () { infoListeners = infoListeners.filter(function (x) { return x !== fn; }); }; }

  global.AMIN = global.AMIN || {};
  global.AMIN.engine = {
    init: init, bestMove: bestMove, analyze: analyze, evaluate: evaluate,
    setSkill: setSkill, stop: stop, restart: restart, status: status, onInfo: onInfo
  };
})(window);
