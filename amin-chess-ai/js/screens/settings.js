/* AMIN CHESS AI — تنظیمات و شخصی‌سازی با پیش‌نمایش زنده */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  function render(root) {
    var st = global.AMIN.state;
    var s = st.getSettings();
    global.AMIN.nav.setHeader('تنظیمات و شخصی‌سازی', false);

    var wrap = U.el('div');

    /* پیش‌نمایش زنده */
    var previewHolder = U.el('div.card.live-preview');
    var previewBoard = null;
    function refreshPreview() {
      previewHolder.innerHTML = '';
      previewHolder.appendChild(U.el('b', { text: 'پیش‌نمایش زنده', style: 'min-width:80px' }));
      var b = global.AMIN.ui.board.mini('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', null,
        { boardTheme: s.boardTheme, pieceSet: s.pieceSet, size: 'small' });
      previewBoard = b;
      previewHolder.appendChild(b);
      var avatarChip = U.el('div.col', { style: 'align-items:center;gap:4px' },
        U.el('div', { text: s.avatar, style: 'font-size:2rem' }),
        U.el('span', { text: 'آواتار', style: 'font-size:.66rem;color:var(--text-dim)' }));
      previewHolder.appendChild(avatarChip);
    }

    /* تم */
    function segRow(label, sub, options, current, onPick) {
      var group = U.el('div.seg-group');
      options.forEach(function (o) {
        group.appendChild(U.el('button.seg' + (o[0] === current ? '.active' : ''), {
          text: o[1],
          onclick: function () { onPick(o[0]); }
        }));
      });
      return U.el('div.setting-row',
        U.el('div.sr-label', U.el('b', { text: label }), U.el('span', { text: sub })),
        group);
    }

    function toggleRow(label, sub, value, onToggle) {
      var sw = U.el('div.sw' + (value ? '.on' : ''));
      sw.addEventListener('click', function () { onToggle(!value); });
      return U.el('div.setting-row',
        U.el('div.sr-label', U.el('b', { text: label }), U.el('span', { text: sub })),
        sw);
    }

    function persist() {
      st.applySettings();
      st.saveSettings().then(function () {
        refreshPreview();
        global.AMIN.nav.updateCoins();
      });
    }

    var themeCard = U.el('div.card',
      U.el('div.card-title', { text: '🎨 ظاهر' }),
      segRow('تم رنگی', 'شب، روز، AMOLED و…', [['dark', 'شب'], ['light', 'روز'], ['amoled', 'AMOLED'], ['gold', 'طلایی'], ['ocean', 'اقیانوس']], s.theme, function (v) { s.theme = v; persist(); }),
      segRow('پس‌زمینه', 'پس‌زمینه خریداری‌شده از فروشگاه', [['aurora', 'شفق'], ['midnight', 'نیمه‌شب'], ['sunset', 'غروب'], ['matrix', 'ماتریکس'], ['plain', 'ساده']], s.background, function (v) { s.background = v; persist(); }),
      segRow('اندازه نوشته', 'همه متن‌های برنامه', [['sm', 'کوچک'], ['md', 'متوسط'], ['lg', 'بزرگ']], s.fontSize, function (v) { s.fontSize = v; persist(); }),
      toggleRow('انیمیشن‌ها', 'حرکت روان مهره‌ها', s.animations, function (v) { s.animations = v; persist(); }));

    var boardCard = U.el('div.card',
      U.el('div.card-title', { text: '♟️ صفحه شطرنج' }),
      segRow('طرح صفحه', 'رنگ خانه‌های روشن و تیره', [['nebula', 'سحابی'], ['ocean', 'اقیانوس'], ['forest', 'جنگل'], ['wood', 'چوب'], ['mono', 'مونوکروم']], s.boardTheme, function (v) { s.boardTheme = v; persist(); }),
      segRow('پوسته مهره‌ها', 'ظاهر مهره‌ها', [['classic', 'کلاسیک'], ['outline', 'خطی'], ['minimal', 'مینیمال'], ['neo', 'نئون'], ['gold', 'طلایی']], s.pieceSet, function (v) { s.pieceSet = v; persist(); }),
      toggleRow('نمایش حرکات قانونی', 'دایره‌های راهنما روی صفحه', s.showLegal, function (v) { s.showLegal = v; persist(); }),
      toggleRow('مختصات صفحه', 'حروف و اعداد کنار صفحه', s.showCoords, function (v) { s.showCoords = v; persist(); }),
      toggleRow('افکت رد نور', 'پس از خرید از فروشگاه', s.fxTrail, function (v) { s.fxTrail = v; persist(); }));

    /* آواتار */
    var AVATARS = ['♟', '♞', '♜', '♛', '♚', '♝', '🙂', '😎', '👑', '🦉', '🤖', '🦁', '🦊', '🐉'];
    var avatarCard = U.el('div.card',
      U.el('div.card-title', { text: '🙋 آواتار و دستیار' }));
    var avGrid = U.el('div.avatar-pick');
    AVATARS.forEach(function (a) {
      avGrid.appendChild(U.el('button' + (s.avatar === a ? '.active' : ''), {
        text: a,
        onclick: function () {
          s.avatar = a; st.profile.avatar = a;
          st.saveProfile();
          persist();
        }
      }));
    });
    avatarCard.appendChild(avGrid);
    avatarCard.appendChild(U.el('div.card-sub', { text: 'آواتارهای ویژه با خرید «بسته آواتارهای ویژه» از فروشگاه باز می‌شوند.' }));
    avatarCard.appendChild(segRow('پوسته دستیار', 'ظاهر استاد شطرنج در چت', [['sage', 'حکیم'], ['nova', 'نوا'], ['royal', 'سلطان']], s.masterSkin, function (v) { s.masterSkin = v; persist(); }));

    var soundCard = U.el('div.card',
      U.el('div.card-title', { text: '🔊 صدا' }),
      toggleRow('صداها', 'فعال/غیرفعال کردن کل صداها', s.sounds, function (v) { s.sounds = v; persist(); }),
      segRow('بسته صدا', 'حس حرکت مهره‌ها', [['classic', 'کلاسیک'], ['wood', 'چوب'], ['digital', 'رترو']], s.soundPack, function (v) { s.soundPack = v; global.AMIN.sound.setPack(v); if (s.sounds) global.AMIN.sound.play('move'); persist(); }));

    var dataCard = U.el('div.card',
      U.el('div.card-title', { text: '🧩 میان‌برهای دیگر' }),
      U.el('div.row.gap.wrap',
        U.el('button.btn.btn-sm', { text: '🔑 مدیریت هوش مصنوعی و API', onclick: function () { global.AMIN.nav.go('api'); } }),
        U.el('button.btn.btn-sm', { text: '👤 پروفایل', onclick: function () { global.AMIN.nav.go('profile'); } })));

    var aboutCard = U.el('div.card',
      U.el('div.card-title', { text: 'ℹ️ درباره' }),
      U.el('div.card-sub', { html: 'AMIN CHESS AI — امین چس<br>«هوشمند بازی کن، حرفه‌ای شطرنج یاد بگیر.»<br>موتور: Stockfish (آفلاین) · قوانین: chess.js<br>همه داده‌ها روی همین دستگاه ذخیره می‌شوند.' }));

    refreshPreview();
    previewHolder.style.display = 'flex';
    wrap.appendChild(previewHolder);
    wrap.appendChild(themeCard);
    wrap.appendChild(boardCard);
    wrap.appendChild(avatarCard);
    wrap.appendChild(soundCard);
    wrap.appendChild(dataCard);
    wrap.appendChild(aboutCard);
    root.appendChild(wrap);
    return { dispose: function () {} };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('settings', { title: 'تنظیمات', render: render });
})(window);
