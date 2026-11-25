/* AMIN CHESS AI — منطق جلسه بازی: حالت‌ها، AI، ذخیره/بارگذاری، تمرین گشایش و آخر بازی */
(function (global) {
  'use strict';

  var E = global.AMIN.engine;
  var U = global.AMIN.util;
  var Sound = global.AMIN.sound;

  /* سطوح هوش مصنوعی: نام فارسی، سطح مهارت Stockfish و زمان فکر */
  var AI_LEVELS = {
    beginner:     { fa: 'مبتدی',     skill: 1,  movetime: 250,  elo: '~۴۰۰' },
    easy:         { fa: 'آسان',      skill: 5,  movetime: 350,  elo: '~۸۰۰' },
    medium:       { fa: 'متوسط',     skill: 10, movetime: 550,  elo: '~۱۲۰۰' },
    hard:         { fa: 'سخت',       skill: 15, movetime: 850,  elo: '~۱۶۰۰' },
    professional: { fa: 'حرفه‌ای',   skill: 18, movetime: 1200, elo: '~۲۰۰۰' },
    master:       { fa: 'استاد',     skill: 20, movetime: 1600, elo: '~۲۲۰۰+' }
  };

  /* سناریوهای تمرین آخر بازی (همه با chess.js قابل اعتبارسنجی‌اند) */
  var ENDGAME_SCENARIOS = [
    { id: 'kqk', fa: 'مات با وزیر و شاه', fen: '7k/8/5K2/8/8/8/8/3Q4 w - - 0 1', goal: 'شاه حریف را به لبه هُل کن و با حمایت شاه مات کن. مواظب پات باش!', hint: 'شاه را نزدیک کن؛ بعد وزیر یک خانه فاصله امن.' },
    { id: 'krk', fa: 'مات با رخ و شاه', fen: '7k/8/5K2/8/8/8/8/6R1 w - - 0 1', goal: 'با تکنیک «جعبه» شاه حریف را محبوس و مات کن.', hint: 'رخ خطی می‌بندد و شاه خودت جعبه را کوچک می‌کند.' },
    { id: 'kqkp', fa: 'وزیر در برابر سرباز', fen: '8/6k1/8/8/8/8/1p2K3/2Q5 w - - 0 1', goal: 'سرباز حریف را متوقف کن و مات کن.', hint: 'وزیر را پشت سرباز بگذار تا نتواند بدود.' },
    { id: 'kpk', fa: 'سرباز در برابر شاه', fen: '8/8/4k3/8/4P3/4K3/8/8 w - - 0 1', goal: 'سرباز را تا ارتقا پیش ببر و مات کن.', hint: 'شاه جلوی سرباز! قاعده مربع را به یاد داشته باش.' },
    { id: 'krvkr', fa: 'رخ در برابر رخ', fen: '7k/8/5K2/8/8/8/6R1/7r w - - 0 1', goal: 'با مات نردبان یا دفاع درست بازی را ببر/مساوی کن.', hint: 'رخ پشت — محافظت از رخ خودت با فاصله یک خانه.' }
  ];

  /* خطوط گشایش تمرینی */
  var OPENING_LINES = [
    { id: 'italian', fa: 'گشایش ایتالیایی', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4'], desc: 'کلاسیک‌ترین گشایش شروع سریع با مرکز و فیل c4.' },
    { id: 'qgambit', fa: 'گامبیت وزیر', sans: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'dxc4'], desc: 'فشار روی مرکز با پیشنهاد سرباز c4.' },
    { id: 'sicilian', fa: 'دفاع سیسیل', sans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'], desc: 'محبوب‌ترین دفاع سیاه در برابر e4.' },
    { id: 'french', fa: 'دفاع فرانسه', sans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'e5', 'Nfd7'], desc: 'ساختار محکم با ضدحمله سمت c5.' },
    { id: 'london', fa: 'سیستم لندن', sans: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'c5'], desc: 'سامانه ساده و محکم با فیل f4.' }
  ];

  function createSession(opts) {
    opts = opts || {};
    var chess = new global.Chess(opts.fen || undefined);
    var mode = opts.mode || 'ai';
    var aiLevel = opts.aiLevel || 'easy';
    var playerColor = opts.playerColor || 'w';
    var over = false;
    var reported = false;
    var thinking = false;
    var disposer = [];

    var handlers = {
      onPosition: opts.onPosition || function () {},
      onGameEnd: opts.onGameEnd || function () {},
      onThinking: opts.onThinking || function () {},
      onError: opts.onError || function () {}
    };

    function turn() { return chess.turn(); }
    function isPlayerTurn() {
      if (over) return false;
      if (mode === 'ai') return turn() === playerColor;
      return true; /* local/free/analysis/practice: هر دو طرف */
    }
    function aiIsWhite() { return mode === 'ai' && playerColor === 'b'; }

    function afterMove(mv, animate) {
      Sound.play(mv.captured ? 'capture' : 'move');
      if (chess.in_check()) Sound.play('check');
      handlers.onPosition({ move: mv, animate: animate !== false });
      checkEnd();
      if (!over && mode === 'ai' && chess.turn() !== playerColor) {
        scheduleAi();
      }
    }

    function checkEnd() {
      if (!chess.game_over()) return;
      over = true;
      var result;
      if (chess.in_checkmate()) {
        var loser = chess.turn();
        result = { type: 'mate', winner: loser === 'w' ? 'b' : 'w' };
      } else if (chess.in_stalemate()) result = { type: 'stalemate' };
      else if (chess.in_threefold_repetition()) result = { type: 'repetition' };
      else if (chess.insufficient_material()) result = { type: 'material' };
      else result = { type: 'fifty' };
      var outcome;
      if (result.winner) {
        outcome = result.winner === playerColor ? 'win' : 'loss';
        if (mode !== 'ai') outcome = result.winner === 'w' ? 'win-white' : 'win-black';
      } else outcome = 'draw';
      if (mode === 'ai' || mode === 'local' || mode === 'practice') recordResult(outcome, result);
      handlers.onGameEnd({ result: result, outcome: outcome });
    }

    function recordResult(outcome, result) {
      if (reported) return;
      reported = true;
      var st = global.AMIN.state;
      var info = { mode: mode === 'ai' ? 'ai' : 'local', movesCount: chess.history().length, aiLevel: AI_LEVELS[aiLevel] ? (AI_LEVELS[aiLevel].skill >= 20 ? 6 : AI_LEVELS[aiLevel].skill >= 18 ? 5 : AI_LEVELS[aiLevel].skill >= 15 ? 4 : AI_LEVELS[aiLevel].skill >= 10 ? 3 : AI_LEVELS[aiLevel].skill >= 5 ? 2 : 1) : 0 };
      if (outcome === 'win') info.result = 'win';
      else if (outcome === 'loss') info.result = 'loss';
      else info.result = 'draw';
      if (outcome === 'win-white' || outcome === 'win-black') info.result = 'draw'; /* دونفره: سکه کمتر */
      st.recordGame(info);
    }

    /* حرکت بازیکن یا برنامه: از SAN یا from/to */
    function move(m, opts2) {
      opts2 = opts2 || {};
      if (over && mode !== 'analysis') return { error: 'بازی تمام شده است' };
      var mv;
      try {
        if (typeof m === 'string') mv = chess.move(m);
        else mv = chess.move({ from: m.from, to: m.to, promotion: m.promotion || undefined });
      } catch (e) { mv = null; }
      if (!mv) return { error: 'حرکت غیرقانونی' };
      afterMove(mv, opts2.animate);
      return { move: mv };
    }

    /* برنامه‌ریزی حرکت AI (کمی تأخیر تا UI فرصت رندر داشته باشد) */
    var aiTimer = null;
    function scheduleAi() {
      thinking = true;
      handlers.onThinking(true);
      aiTimer = setTimeout(function () {
        if (over) { thinking = false; handlers.onThinking(false); return; }
        var lvl = AI_LEVELS[aiLevel] || AI_LEVELS.easy;
        E.bestMove(chess.fen(), { skill: lvl.skill, movetime: lvl.movetime }).then(function (res) {
          thinking = false;
          handlers.onThinking(false);
          if (!res.bestmove || res.bestmove === '(none)') return;
          var mv = chess.move({ from: res.bestmove.slice(0, 2), to: res.bestmove.slice(2, 4), promotion: (res.bestmove[4] || undefined) });
          if (!mv) { handlers.onError('حرکت نامعتبر موتور: ' + res.bestmove); return; }
          Sound.play(mv.captured ? 'capture' : 'move');
          if (chess.in_check()) Sound.play('check');
          handlers.onPosition({ move: mv, animate: true, byAi: true });
          checkEnd();
        }).catch(function (e) {
          thinking = false;
          handlers.onThinking(false);
          handlers.onError(e && e.message || 'خطای موتور');
        });
      }, 350);
      disposer.push(function () { clearTimeout(aiTimer); });
    }

    function undo() {
      if (thinking) return { error: 'موتور در حال فکر کردن است' };
      var n = 1;
      if (mode === 'ai') {
        /* برگشت جفت حرکت تا نوبت بازیکن شود */
        if (chess.turn() === playerColor) n = 2; else n = 1;
      }
      var undone = 0;
      for (var i = 0; i < n; i++) {
        if (chess.undo()) undone++;
      }
      if (undone) { over = false; reported = false; handlers.onPosition({ animate: false }); }
      return { undone: undone };
    }

    function restart() {
      chess = new global.Chess();
      over = false; reported = false;
      handlers.onPosition({ animate: false });
      if (mode === 'ai' && playerColor === 'b') scheduleAi();
      return true;
    }

    function flipColor() {
      playerColor = playerColor === 'w' ? 'b' : 'w';
      handlers.onPosition({ animate: false, flipped: true });
      if (mode === 'ai' && chess.turn() !== playerColor && !over) scheduleAi();
    }

    /* ---------- ذخیره و بارگذاری ---------- */
    function save(name) {
      var db = global.AMIN.db;
      var id = U.uuid();
      var rec = {
        id: id, ts: Date.now(), name: name || ('مسابقه ' + U.faNum(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))),
        mode: mode, aiLevel: aiLevel, playerColor: playerColor,
        fen: chess.fen(), pgn: chess.pgn({ max_width: 60, newline_char: '\n' }),
        moves: chess.history(), over: over
      };
      return db.tx('games', 'readwrite', function (st) { st.put(rec, id); }).then(function () { return rec; });
    }

    function dispose() {
      disposer.forEach(function (fn) { try { fn(); } catch (e) {} });
      disposer = [];
    }

    return {
      get chess() { return chess; },
      get mode() { return mode; },
      get aiLevel() { return aiLevel; },
      get playerColor() { return playerColor; },
      get over() { return over; },
      get thinking() { return thinking; },
      move: move, undo: undo, restart: restart, flipColor: flipColor,
      save: save, dispose: dispose,
      isPlayerTurn: isPlayerTurn, turn: turn
    };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.game = {
    createSession: createSession,
    AI_LEVELS: AI_LEVELS,
    ENDGAME_SCENARIOS: ENDGAME_SCENARIOS,
    OPENING_LINES: OPENING_LINES
  };
})(window);
