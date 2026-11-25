/* AMIN CHESS AI — پروفایل: آمار، دستاورد، تاریخچه سکه و بازی */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  function render(root, params) {
    var st = global.AMIN.state;
    global.AMIN.nav.setHeader('پروفایل', false);
    var p = st.getProfile();
    var lp = st.levelProgress();

    var head = U.el('div.card.profile-head',
      U.el('div.profile-avatar', { text: p.avatar || st.getSettings().avatar || '♟' }),
      U.el('div.col', { style: 'flex:1' },
        U.el('div.profile-name', { text: p.name }),
        U.el('div.profile-sub', { text: '⭐ سطح ' + U.faNum(lp.level) + ' · ' + U.faNum(st.economy.balance) + ' سکه · از ' + U.faNum(new Date(p.createdAt).toLocaleDateString('fa-IR')) })),
      U.el('button.btn.btn-sm', { text: '✏️', onclick: editName }));

    function editName() {
      var card = U.el('div.modal',
        U.el('h3', { text: 'تغییر نام' }),
        U.el('input#new-name', { type: 'text', value: p.name, maxlength: 24 }),
        U.el('div.row.gap', { style: 'margin-top:12px' },
          U.el('button.btn.btn-primary', { text: 'ذخیره', onclick: function () {
            var v = document.getElementById('new-name').value.trim();
            if (v) { p.name = v; st.saveProfile().then(function () { dlg.close(); global.AMIN.nav.refreshCurrent(); }); }
          } }),
          U.el('button.btn.btn-ghost', { text: 'لغو', onclick: function () { dlg.close(); } })));
      var dlg = global.AMIN.ui.prompts.openModal(card);
    }

    var winRate = p.games ? Math.round(100 * p.wins / p.games) : 0;
    var stats = U.el('div.card',
      U.el('div.card-title', { text: '📊 آمار بازی' }),
      U.el('div.profile-stats',
        pstat(p.games, 'مسابقه'), pstat(p.wins, 'برد'), pstat(p.losses, 'باخت'),
        pstat(p.draws, 'تساوی'), pstat(winRate + '٪', 'نرخ برد'), pstat(p.bestStreak, 'بهترین رشته برد'),
        pstat(p.puzzlesSolved, 'معما حل‌شده'), pstat(p.puzzleBest, 'رکورد معما'), pstat(p.lessonsDone, 'درس کامل‌شده')));

    function pstat(v, l) { return U.el('div.pstat', U.el('b', { text: U.faNum(v) }), U.el('span', { text: l })); }

    var achCard = U.el('div.card',
      U.el('div.card-title', { text: '🏅 دستاوردها' }),
      U.el('div', { id: 'ach-holder' }));
    st.grantedAchievements().then(function (granted) {
      var holder = document.getElementById('ach-holder');
      if (!holder) return;
      var owned = {};
      granted.forEach(function (g) { owned[g.id] = true; });
      holder.innerHTML = '';
      holder.appendChild(U.el('div.ach-grid', st.ACHIEVEMENTS.map(function (a) {
        return U.el('div.ach-cell' + (owned[a.id] ? '.owned' : ''),
          U.el('div.ach-ico', { text: a.icon }),
          U.el('div', { text: a.title }),
          U.el('div', { text: owned[a.id] ? '✓' : '+' + U.faNum(a.reward) + ' سکه' }));
      })));
    });

    var coinsTab = U.el('div.card',
      U.el('div.card-title', { text: '🪙 تاریخچه تراکنش‌ها' }),
      U.el('div', { id: 'tx-holder' }, U.el('div.card-sub', { text: 'در حال بارگذاری…' })));
    st.transactions(30).then(function (txs) {
      var holder = document.getElementById('tx-holder');
      if (!holder) return;
      holder.innerHTML = '';
      if (!txs.length) { holder.appendChild(U.el('div.card-sub', { text: 'هنوز تراکنشی نداری.' })); return; }
      txs.forEach(function (t) {
        holder.appendChild(U.el('div.tx-row',
          U.el('div.col', { style: 'flex:1' },
            U.el('b', { text: t.reason }),
            U.el('span.tx-ts', { text: U.fmtDate(t.ts) })),
          U.el('span.tx-amt.' + (t.amount >= 0 ? 'pos' : 'neg'), { text: (t.amount >= 0 ? '+' : '') + U.faNum(t.amount) + ' 🪙' })));
      });
    });

    var gamesCard = U.el('div.card',
      U.el('div.card-title', { text: '⚔️ تاریخچه بازی‌ها' }),
      U.el('div', { id: 'g-holder' }));
    global.AMIN.db.getAll('games').then(function (games) {
      var holder = document.getElementById('g-holder');
      if (!holder) return;
      games.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      holder.innerHTML = '';
      if (!games.length) { holder.appendChild(U.el('div.card-sub', { text: 'هنوز بازی ثبت نشده.' })); return; }
      games.slice(0, 12).forEach(function (g) {
        holder.appendChild(U.el('div.history-row',
          U.el('b', { text: g.name }),
          U.el('span', { style: 'flex:1' }),
          U.el('span.badge', { text: g.moves ? U.faNum(g.moves.length) + ' حرکت' : '—' }),
          U.el('span.tx-ts', { text: U.fmtDate(g.ts) })));
      });
    });

    var dangerCard = U.el('div.card',
      U.el('div.card-title', { text: '⚙️ میان‌برها' }),
      U.el('div.row.gap.wrap',
        U.el('button.btn.btn-sm', { text: '🎨 شخصی‌سازی', onclick: function () { global.AMIN.nav.go('settings'); } }),
        U.el('button.btn.btn-sm', { text: '🔑 مدیریت API', onclick: function () { global.AMIN.nav.go('api'); } }),
        U.el('button.btn.btn-sm', { text: '📤 پشتیبان‌گیری', onclick: exportData }),
        U.el('button.btn.btn-sm.btn-danger', { text: '🗑️ پاک‌کردن همه داده‌ها', onclick: resetAll })));

    function exportData() {
      Promise.all([
        global.AMIN.db.kvGet('profile', null), global.AMIN.db.kvGet('settings', null),
        global.AMIN.db.kvGet('economy', null), global.AMIN.db.getAll('purchases'),
        global.AMIN.db.getAll('games')
      ]).then(function (r) {
        var blob = new Blob([JSON.stringify({ profile: r[0], settings: r[1], economy: r[2], purchases: r[3], games: r[4] }, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'amin-chess-backup.json';
        a.click();
        U.toast('پشتیبان دانلود شد');
      });
    }

    function resetAll() {
      U.confirmDlg('پاک‌کردن همه داده‌ها', 'همه سکه‌ها، خریدها، آمار و تنظیمات برای همیشه حذف می‌شوند. مطمئنی؟', 'بله، پاک کن').then(function (ok) {
        if (!ok) return;
        indexedDB.deleteDatabase('amin-chess-ai');
        setTimeout(function () { location.reload(); }, 400);
      });
    }

    root.appendChild(head);
    root.appendChild(stats);
    root.appendChild(achCard);
    root.appendChild(coinsTab);
    root.appendChild(gamesCard);
    root.appendChild(dangerCard);
    return { dispose: function () {} };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('profile', { title: 'پروفایل', render: render });
})(window);
