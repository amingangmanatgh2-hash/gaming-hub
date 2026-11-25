/* AMIN CHESS AI — وضعیت مرکزی برنامه: تنظیمات، پروفایل، سکه، مأموریت، دستاورد */
(function (global) {
  'use strict';

  var db = global.AMIN.db;
  var U = global.AMIN.util;

  /* ---------- تنظیمات ---------- */
  var DEFAULT_SETTINGS = {
    theme: 'dark',            /* dark | light | amoled | gold | ocean */
    fontSize: 'md',           /* sm | md | lg */
    animations: true,
    sounds: true,
    soundPack: 'classic',
    pieceSet: 'classic',
    boardTheme: 'nebula',
    background: 'aurora',
    avatar: '♟',
    masterSkin: 'sage',
    showLegal: true,
    showCoords: true,
    onboarded: false
  };

  var settings = Object.assign({}, DEFAULT_SETTINGS);

  var profile = {
    name: 'بازیکن',
    createdAt: Date.now(),
    games: 0, wins: 0, losses: 0, draws: 0,
    bestWinLevel: 0, currentStreak: 0, bestStreak: 0,
    lastLoginDay: null, loginStreak: 0,
    puzzlesSolved: 0, puzzleStreak: 0, puzzleBest: 0,
    lessonsDone: 0, quizzesPassed: 0,
    lastGameAt: null
  };

  var economy = { balance: 0, xp: 0 };

  /* ---------- event bus ---------- */
  var listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, data) { (listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); }

  /* ---------- سکه‌ها: دفتر تراکنش معتبر ---------- */
  function earn(amount, reason, opts) {
    opts = opts || {};
    amount = Math.max(0, Math.round(amount));
    var t = {
      id: U.uuid(), ts: Date.now(), amount: amount,
      reason: reason, reasonKey: opts.reasonKey || null, meta: opts.meta || null
    };
    return db.atomic(['transactions', 'kv'], 'readwrite', function (stores) {
      var txStore = stores.transactions;
      if (t.reasonKey) {
        var idx = txStore.index('reasonKey');
        var req = idx.get(t.reasonKey);
        req.onsuccess = function () {
          if (req.result) { /* قبلاً ثبت شده — جلوگیری از دریافت دوباره */ t._dup = true; }
          else { txStore.put(t); bumpBalance(stores.kv, amount, 0); }
        };
        t._pending = true;
        return null;
      } else {
        txStore.put(t);
        bumpBalance(stores.kv, amount, 0);
        return true;
      }
    }).then(function (res) {
      if (res === null) {
        /* مسیر ناهمگام index — نتیجه را دوباره می‌خوانیم */
        if (t._dup) return { ok: false, duplicate: true, balance: economy.balance };
      }
      if (t._dup) return { ok: false, duplicate: true, balance: economy.balance };
      economy.balance += amount;
      economy.xp += Math.ceil(amount / 2);
      persistEconomy();
      emit('coins', economy);
      emit('xp', economy);
      if (!opts.silent) { global.AMIN.sound.play('coin'); }
      checkAchievements();
      return { ok: true, balance: economy.balance };
    });
  }

  function spend(amount, reason, opts) {
    opts = opts || {};
    amount = Math.round(amount);
    if (economy.balance < amount) return Promise.resolve({ ok: false, insufficient: true, balance: economy.balance });
    var t = {
      id: U.uuid(), ts: Date.now(), amount: -amount,
      reason: reason, reasonKey: opts.reasonKey || null, meta: opts.meta || null
    };
    return db.atomic(['transactions', 'kv'], 'readwrite', function (stores) {
      var txStore = stores.transactions;
      if (t.reasonKey) {
        var req = txStore.index('reasonKey').get(t.reasonKey);
        req.onsuccess = function () {
          if (req.result) t._dup = true; else { txStore.put(t); bumpBalance(stores.kv, -amount, 0); }
        };
        return null;
      }
      txStore.put(t);
      bumpBalance(stores.kv, -amount, 0);
      return true;
    }).then(function () {
      if (t._dup) return { ok: false, duplicate: true, balance: economy.balance };
      economy.balance -= amount;
      persistEconomy();
      emit('coins', economy);
      return { ok: true, balance: economy.balance };
    });
  }

  /* به‌روزرسانی موجودی ذخیره‌شده در همان تراکنش اتمیک */
  function bumpBalance(kvStore, deltaAmount, deltaXp) {
    var req = kvStore.get('economy');
    req.onsuccess = function () {
      var val = req.result || { balance: 0, xp: 0 };
      val.balance = (val.balance || 0) + deltaAmount;
      val.xp = (val.xp || 0) + Math.ceil(Math.max(0, deltaAmount) / 2);
      kvStore.put(val, 'economy');
    };
  }

  function persistEconomy() {
    db.kvSet('economy', economy);
  }

  function recomputeBalance() {
    return db.getAll('transactions').then(function (txs) {
      var sum = 0;
      txs.forEach(function (t) { sum += t.amount; });
      economy.balance = sum;
      return db.kvGet('xp', 0).then(function (xp) {
        economy.xp = xp || 0;
        persistEconomy();
        return economy;
      });
    });
  }

  function addXp(n) {
    economy.xp = Math.max(0, economy.xp + n);
    persistEconomy();
    emit('xp', economy);
    checkAchievements();
  }

  function levelFromXp(xp) {
    return 1 + Math.floor(Math.sqrt((xp || 0) / 120));
  }
  function xpForLevel(l) { return 120 * (l) * (l); } /* مجموع XP لازم برای رسیدن به سطح l+1 */
  function levelProgress() {
    var lv = levelFromXp(economy.xp);
    var cur = xpForLevel(lv - 1);
    var next = xpForLevel(lv);
    return { level: lv, current: economy.xp - cur, need: next - cur, pct: Math.min(100, Math.round(100 * (economy.xp - cur) / (next - cur))) };
  }

  function transactions(limit) {
    return db.getAll('transactions').then(function (list) {
      list.sort(function (a, b) { return b.ts - a.ts; });
      return limit ? list.slice(0, limit) : list;
    });
  }

  /* ---------- ذخیره/بارگذاری ---------- */
  function saveProfile() { return db.kvSet('profile', profile); }
  function saveSettings() { return db.kvSet('settings', settings); }

  function applySettings() {
    var b = document.body;
    b.dataset.theme = settings.theme;
    b.dataset.font = settings.fontSize;
    b.dataset.anim = settings.animations ? 'on' : 'off';
    b.dataset.bg = settings.background;
    global.AMIN.sound.setEnabled(settings.sounds);
    global.AMIN.sound.setPack(settings.soundPack);
    emit('settings', settings);
  }

  function load() {
    return db.kvGet('settings', null).then(function (s) {
      if (s) settings = Object.assign({}, DEFAULT_SETTINGS, s);
      return db.kvGet('profile', null);
    }).then(function (p) {
      if (p) profile = Object.assign(profile, p);
      applySettings();
      return recomputeBalance();
    });
  }

  /* ---------- ورود روزانه ---------- */
  function checkDailyLogin() {
    var today = U.dayKey();
    if (profile.lastLoginDay === today) return Promise.resolve(null);
    var yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    profile.loginStreak = (profile.lastLoginDay === U.dayKey(yesterday)) ? profile.loginStreak + 1 : 1;
    profile.lastLoginDay = today;
    return saveProfile().then(function () {
      var reward = 10 + Math.min(profile.loginStreak, 7) * 2;
      return earn(reward, 'جایزه ورود روزانه', { reasonKey: 'daily-login:' + today, silent: true })
        .then(function (r) { track('coin_earn', reward); return { rewarded: r.ok, amount: reward, streak: profile.loginStreak }; });
    });
  }

  /* ---------- آمار مسابقه ---------- */
  function recordGame(info) {
    /* info: {mode, result: 'win'|'loss'|'draw', aiLevel?, movesCount?} */
    profile.games++;
    if (info.result === 'win') {
      profile.wins++;
      profile.currentStreak++;
      if (info.aiLevel && info.aiLevel > profile.bestWinLevel) profile.bestWinLevel = info.aiLevel;
      if (profile.currentStreak > profile.bestStreak) profile.bestStreak = profile.currentStreak;
    } else if (info.result === 'loss') {
      profile.losses++;
      profile.currentStreak = 0;
    } else { profile.draws++; }
    profile.lastGameAt = Date.now();
    track('game_any', 1);
    if (info.result === 'win') {
      track('game_win', 1);
      if (info.mode === 'ai') track('game_ai_win', 1);
    }
    var coinMap = { win: 15 + 5 * (info.aiLevel || 0), draw: 6, loss: 2 };
    var coins = info.mode === 'local' ? 5 : (coinMap[info.result] || 0);
    return saveProfile().then(function () {
      var p = earn(coins, info.result === 'win' ? 'برد در مسابقه' : (info.result === 'draw' ? 'تساوی' : 'پاداش بازی'), { reasonKey: 'game:' + (profile.games) });
      emit('stats', profile);
      checkAchievements();
      return p;
    });
  }

  function addPuzzleSolved(difficulty, coins) {
    profile.puzzlesSolved++;
    profile.puzzleStreak++;
    if (profile.puzzleStreak > profile.puzzleBest) profile.puzzleBest = profile.puzzleStreak;
    track('puzzle_solved', 1);
    return saveProfile().then(function () {
      emit('stats', profile);
      checkAchievements();
      return earn(coins, 'حل معما', { reasonKey: 'puzzle:' + U.dayKey() + ':' + (profile.puzzlesSolved) });
    });
  }

  function addLessonDone(lessonId, coins) {
    profile.lessonsDone++;
    track('lesson_done', 1);
    return saveProfile().then(function () {
      emit('stats', profile);
      checkAchievements();
      return earn(coins, 'تکمیل درس', { reasonKey: 'lesson:' + lessonId });
    });
  }

  function addQuizPassed(lessonId, coins) {
    profile.quizzesPassed++;
    track('lesson_quiz', 1);
    return saveProfile().then(function () {
      emit('stats', profile);
      checkAchievements();
      return earn(coins, 'قبولی در آزمون', { reasonKey: 'quiz:' + U.dayKey() + ':' + lessonId });
    });
  }

  /* ---------- مأموریت‌ها ---------- */
  var MISSION_POOL_DAILY = [
    { id: 'd-game', metric: 'game_any', target: 1, reward: 15, icon: '♟', title: 'یک مسابقه انجام بده' },
    { id: 'd-win', metric: 'game_win', target: 1, reward: 25, icon: '🏅', title: 'یک مسابقه را ببر' },
    { id: 'd-puzzle', metric: 'puzzle_solved', target: 3, reward: 20, icon: '🧩', title: '۳ معما حل کن' },
    { id: 'd-lesson', metric: 'lesson_done', target: 1, reward: 20, icon: '📚', title: 'یک درس را کامل کن' },
    { id: 'd-quiz', metric: 'lesson_quiz', target: 1, reward: 15, icon: '📝', title: 'در یک آزمون قبول شو' },
    { id: 'd-ai-win', metric: 'game_ai_win', target: 1, reward: 30, icon: '🤖', title: 'هوش مصنوعی را شکست بده' },
    { id: 'd-coins', metric: 'coin_earn', target: 40, reward: 15, icon: '🪙', title: '۴۰ سکه به‌دست بیاور' }
  ];

  var MISSION_POOL_WEEKLY = [
    { id: 'w-games', metric: 'game_any', target: 5, reward: 80, icon: '⚔️', title: '۵ مسابقه در هفته' },
    { id: 'w-puzzles', metric: 'puzzle_solved', target: 12, reward: 100, icon: '🧩', title: '۱۲ معما در هفته' },
    { id: 'w-wins', metric: 'game_win', target: 3, reward: 90, icon: '🏆', title: '۳ برد در هفته' },
    { id: 'w-lessons', metric: 'lesson_done', target: 3, reward: 70, icon: '🎓', title: '۳ درس در هفته' }
  ];

  /* انتخاب روزانه: ۳ مأموریت با هش تاریخ (پایدار در طول روز) */
  function pickMissions(scope) {
    var pool = scope === 'weekly' ? MISSION_POOL_WEEKLY : MISSION_POOL_DAILY;
    var key = scope === 'weekly' ? U.weekKey() : U.dayKey();
    var count = scope === 'weekly' ? 2 : 3;
    var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    var out = [];
    var used = {};
    var idx = 0;
    while (out.length < Math.min(count, pool.length)) {
      var pick = pool[(h + idx * 7) % pool.length];
      if (!used[pick.id]) { used[pick.id] = true; out.push(pick); }
      idx++;
      if (idx > pool.length * 4) break;
    }
    return out;
  }

  function periodKey(scope) { return (scope === 'weekly' ? 'w:' : 'd:') + (scope === 'weekly' ? U.weekKey() : U.dayKey()); }

  /* ثبت رویداد برای شمارنده مأموریت‌ها */
  function track(metric, n) {
    n = n || 1;
    var keys = [periodKey('daily') + ':' + metric, periodKey('weekly') + ':' + metric];
    return Promise.all(keys.map(function (k) {
      return db.kvGet('mp:' + k, 0).then(function (v) {
        return db.kvSet('mp:' + k, (v || 0) + n);
      });
    })).then(function () { emit('missions'); return true; });
  }

  function missionProgress(scope) {
    var missions = pickMissions(scope);
    var pk = periodKey(scope);
    return Promise.all(missions.map(function (m) {
      return db.kvGet('mp:' + pk + ':' + m.metric, 0).then(function (v) {
        return db.tx('transactions', 'readonly', function (st) {
          return st.index('reasonKey').get('mission:' + pk + ':' + m.id);
        }).then(function (claimed) {
          return Object.assign({}, m, { progress: Math.min(v || 0, m.target), claimed: !!claimed, done: (v || 0) >= m.target });
        });
      });
    }));
  }

  function claimMission(mission, scope) {
    var pk = periodKey(scope);
    var vKey = 'mp:' + pk + ':' + mission.metric;
    return db.kvGet(vKey, 0).then(function (v) {
      if ((v || 0) < mission.target) return { ok: false, reason: 'incomplete' };
      return earn(mission.reward, 'مأموریت: ' + mission.title, { reasonKey: 'mission:' + pk + ':' + mission.id, silent: true })
        .then(function (r) {
          if (r.ok) track('coin_earn', mission.reward);
          return r;
        });
    });
  }

  /* ---------- دستاوردها ---------- */
  var ACHIEVEMENTS = [
    { id: 'first-win', icon: '🥇', title: 'اولین برد', desc: 'اولین مسابقه خود را ببرید', reward: 30, check: function (p) { return p.wins >= 1; } },
    { id: 'win-10', icon: '🎖️', title: 'ده برد', desc: '۱۰ مسابقه را ببرید', reward: 60, check: function (p) { return p.wins >= 10; } },
    { id: 'win-50', icon: '🏆', title: 'پنجاه برد', desc: '۵۰ مسابقه را ببرید', reward: 150, check: function (p) { return p.wins >= 50; } },
    { id: 'beat-master', icon: '👑', title: 'شکست استاد', desc: 'سطح «استاد» را ببرید', reward: 120, check: function (p) { return p.bestWinLevel >= 6; } },
    { id: 'streak-3', icon: '🔥', title: 'سه برد پیاپی', desc: '۳ مسابقه پشت‌سرهم ببرید', reward: 40, check: function (p) { return p.bestStreak >= 3; } },
    { id: 'streak-7', icon: '☄️', title: 'هفت برد پیاپی', desc: '۷ مسابقه پشت‌سرهم ببرید', reward: 100, check: function (p) { return p.bestStreak >= 7; } },
    { id: 'puzzle-10', icon: '🧩', title: 'ده معما', desc: '۱۰ معما را حل کنید', reward: 40, check: function (p) { return p.puzzlesSolved >= 10; } },
    { id: 'puzzle-50', icon: '🧠', title: 'پنجاه معما', desc: '۵۰ معما را حل کنید', reward: 120, check: function (p) { return p.puzzlesSolved >= 50; } },
    { id: 'lesson-1', icon: '📗', title: 'شاگرد تازه‌کار', desc: 'یک درس را کامل کنید', reward: 20, check: function (p) { return p.lessonsDone >= 1; } },
    { id: 'lesson-5', icon: '📘', title: 'دانش‌آموز کوشا', desc: '۵ درس را کامل کنید', reward: 70, check: function (p) { return p.lessonsDone >= 5; } },
    { id: 'lesson-all', icon: '🎓', title: 'فارغ‌التحصیل', desc: 'همه درس‌ها را کامل کنید', reward: 200, check: function (p) { return p.lessonsDone >= 10; } },
    { id: 'login-7', icon: '📅', title: 'هفت روز پیاپی', desc: '۷ روز پشت‌سرهم وارد شوید', reward: 80, check: function (p) { return p.loginStreak >= 7; } }
  ];

  function grantedAchievements() {
    return db.getAll('achievements');
  }

  function checkAchievements() {
    return db.getAll('achievements').then(function (granted) {
      var have = {};
      granted.forEach(function (g) { have[g.id] = true; });
      var newly = [];
      var chain = Promise.resolve();
      ACHIEVEMENTS.forEach(function (a) {
        if (have[a.id]) return;
        var ok = false;
        try { ok = a.check(profile); } catch (e) {}
        if (ok) {
          newly.push(a);
          chain = chain.then(function () {
            return db.kvSet('ach:' + a.id, Date.now()).then(function () {
              return db.tx('achievements', 'readwrite', function (st) { st.put({ id: a.id, ts: Date.now() }); });
            }).then(function () {
              global.AMIN.ui && global.AMIN.ui.toast && global.AMIN.ui.toast('🏅 دستاورد: ' + a.title + ' (+' + U.faNum(a.reward) + ' سکه)');
              return earn(a.reward, 'دستاورد: ' + a.title, { reasonKey: 'ach:' + a.id, silent: true });
            });
          });
        }
      });
      return chain.then(function () { if (newly.length) emit('achievements', newly); return newly; });
    });
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.state = {
    settings: settings, profile: profile,
    load: load, applySettings: applySettings, saveSettings: saveSettings, saveProfile: saveProfile,
    earn: earn, spend: spend, addXp: addXp, transactions: transactions,
    recomputeBalance: recomputeBalance,
    levelFromXp: levelFromXp, levelProgress: levelProgress,
    recordGame: recordGame, addPuzzleSolved: addPuzzleSolved, addLessonDone: addLessonDone, addQuizPassed: addQuizPassed,
    checkDailyLogin: checkDailyLogin,
    track: track, missionProgress: missionProgress, claimMission: claimMission,
    MISSION_POOL_DAILY: MISSION_POOL_DAILY, MISSION_POOL_WEEKLY: MISSION_POOL_WEEKLY,
    ACHIEVEMENTS: ACHIEVEMENTS, grantedAchievements: grantedAchievements, checkAchievements: checkAchievements,
    on: on, emit: emit,
    get economy() { return economy; },
    getSettings: function () { return settings; },
    getProfile: function () { return profile; }
  };
})(window);
