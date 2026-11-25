/* AMIN CHESS AI — صفحه اصلی */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  function render(root) {
    var st = global.AMIN.state;
    var nav = global.AMIN.nav;
    var profile = st.getProfile();
    var lp = st.levelProgress();

    var hero = U.el('div.hero-card',
      U.el('div.hero-greet', { text: 'خوش آمدی 👋' }),
      U.el('div.hero-name', { text: profile.name }),
      U.el('div.row.gap.wrap',
        U.el('div.hero-level', U.el('span', { text: '⭐ سطح ' + U.faNum(lp.level) }), U.el('span', { text: U.faNum(lp.current) + '/' + U.faNum(lp.need) + ' XP' })),
        U.el('div.hero-level', U.el('span', { text: '🪙 ' + U.faNum(st.economy.balance) + ' سکه' }))),
      U.el('div', { style: 'height:10px' }),
      U.el('div.progress', U.el('i', { style: 'width:' + lp.pct + '%' })),
      U.el('div.stat-grid',
        statBox(profile.wins, 'برد'),
        statBox(profile.losses, 'باخت'),
        statBox(profile.puzzlesSolved, 'معما'),
        statBox(profile.lessonsDone, 'درس')));

    function statBox(v, label) {
      return U.el('div.stat-box', U.el('b', { text: U.faNum(v) }), U.el('span', { text: label }));
    }

    /* اکشن‌های سریع */
    var quick = U.el('div.quick-actions',
      qaBtn('♟️', 'شروع بازی', 'با AI یا دونفره', function () { nav.go('play'); }),
      qaBtn('🧠', 'استاد شطرنج', 'تحلیل و گفت‌وگو', function () { nav.go('master'); }),
      qaBtn('🧩', 'معمای امروز', 'سکه بگیر', function () { nav.go('puzzles'); }),
      qaBtn('📚', 'آموزش', 'درس‌های فارسی', function () { nav.go('lessons'); }));

    function qaBtn(ico, title, sub, onClick) {
      return U.el('button.qa-btn', { onclick: onClick },
        U.el('span.qa-ico', { text: ico }), U.el('b', { text: title }), U.el('span', { text: sub }));
    }

    /* مأموریت‌ها */
    var missionCard = U.el('div.card',
      U.el('div.card-title', { text: '🎯 مأموریت‌های امروز' }),
      U.el('div', { id: 'mission-list' }, U.el('div.card-sub', { text: 'در حال بارگذاری…' })));
    var weeklyCard = U.el('div.card',
      U.el('div.card-title', { text: '🗓️ مأموریت‌های هفته' }),
      U.el('div', { id: 'mission-weekly' }, U.el('div.card-sub', { text: 'در حال بارگذاری…' })));

    function renderMissions(holderId, scope) {
      st.missionProgress(scope).then(function (list) {
        var holder = document.getElementById(holderId);
        if (!holder) return;
        holder.innerHTML = '';
        list.forEach(function (m) {
          holder.appendChild(U.el('div.mission-row',
            U.el('div.mission-ico', { text: m.icon }),
            U.el('div.mission-body',
              U.el('b', { text: m.title }),
              U.el('div.progress.mission-bar', U.el('i', { style: 'width:' + Math.round(100 * m.progress / m.target) + '%' }))),
            U.el('div.mission-claim',
              m.claimed
                ? U.el('span.claimed-chip', { text: '✓ گرفتید' })
                : (m.done
                  ? U.el('button.btn.btn-primary.btn-sm.mission-claim', {
                    text: '🪙 ' + U.faNum(m.reward),
                    onclick: function () {
                      st.claimMission(m, scope).then(function (r) {
                        if (r.ok) { U.toast('🪙 ' + U.faNum(m.reward) + ' سکه دریافت شد'); renderMissions(holderId, scope); nav.updateCoins(); }
                        else U.toast('مأموریت کامل نشده');
                      });
                    }
                  })
                  : U.el('span.badge', { text: U.faNum(m.progress) + '/' + U.faNum(m.target) })))));
        });
      });
    }

    /* آخرین مسابقات */
    var historyCard = U.el('div.card',
      U.el('div.card-title', { text: '⚔️ آخرین مسابقات' }),
      U.el('div', { id: 'last-games' }));

    global.AMIN.db.getAll('games').then(function (games) {
      var holder = document.getElementById('last-games');
      if (!holder) return;
      games.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      holder.innerHTML = '';
      if (!games.length) {
        holder.appendChild(U.el('div.card-sub', { text: 'هنوز مسابقه‌ای ثبت نشده — اولین بازی‌ات را شروع کن!' }));
        return;
      }
      games.slice(0, 4).forEach(function (g) {
        holder.appendChild(U.el('div.history-row',
          U.el('b', { text: g.name }),
          U.el('span', { text: U.fmtDate(g.ts) })));
      });
    });

    /* دستاوردها */
    var achCard = U.el('div.card',
      U.el('div.card-title', { text: '🏅 دستاوردها' }),
      U.el('div', { id: 'ach-list' }));
    Promise.all([st.grantedAchievements(), global.AMIN.db.getAll('transactions')]).then(function (r) {
      var holder = document.getElementById('ach-list');
      if (!holder) return;
      var owned = {};
      r[0].forEach(function (a) { owned[a.id] = true; });
      holder.innerHTML = '';
      holder.appendChild(U.el('div.ach-grid', st.ACHIEVEMENTS.slice(0, 8).map(function (a) {
        return U.el('div.ach-cell' + (owned[a.id] ? '.owned' : ''),
          U.el('div.ach-ico', { text: a.icon }),
          U.el('div', { text: a.title }));
      })));
    });

    /* پیشنهاد تمرین */
    var tip = pickTip(profile);
    var tipCard = U.el('div.card',
      U.el('div.card-title', { text: '💡 پیشنهاد تمرین' }),
      U.el('div.card-sub', { text: tip.text }),
      U.el('button.btn.btn-sm', { text: tip.action, onclick: tip.onclick }));

    function pickTip(p) {
      if (p.games === 0) return { text: 'اولین بازی‌ات را با سطح «مبتدی» شروع کن تا با صفحه و حرکت‌ها آشنا شوی.', action: 'شروع بازی', onclick: function () { nav.go('play'); } };
      if (p.puzzlesSolved < 5) return { text: 'معماهای روزانه سریع‌ترین راه تقویت تاکتیک است — امروز ۳ معما حل کن.', action: 'معماهای امروز', onclick: function () { nav.go('puzzles'); } };
      if (p.lessonsDone < 3) return { text: 'درس «اصول گشایش» را کامل کن تا شروع بازی‌هایت منظم شود.', action: 'رفتن به آموزش', onclick: function () { nav.go('lessons'); } };
      return { text: 'یک بازی در سطح بالاتر امتحان کن و بعد از آن «بررسی با موتور» را بزن.', action: 'شروع بازی', onclick: function () { nav.go('play'); } };
    }

    root.appendChild(hero);
    root.appendChild(quick);
    root.appendChild(missionCard);
    root.appendChild(weeklyCard);
    root.appendChild(historyCard);
    root.appendChild(achCard);
    root.appendChild(tipCard);

    renderMissions('mission-list', 'daily');
    renderMissions('mission-weekly', 'weekly');

    return { dispose: function () {} };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('home', { title: 'امین چس', render: render });
})(window);
