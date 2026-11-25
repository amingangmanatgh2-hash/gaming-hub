/* AMIN CHESS AI — صفحه خوش‌آمدگویی (اولین اجرا) */
(function (global) {
  'use strict';

  var U = global.AMIN.util;
  var AVATARS = ['♟', '♞', '♜', '♛', '♚', '♝', '🙂', '😎'];
  var PREMIUM_AVATARS = ['👑', '🦉', '🤖', '🦁', '🦊', '🐉'];

  function availableAvatars() {
    var owned = global.AMIN.shop.owned || {};
    var out = AVATARS.slice();
    if (owned['av-premium']) out = out.concat(PREMIUM_AVATARS);
    return out;
  }

  function render(host) {
    var st = global.AMIN.state;
    var step = 0;
    var picks = {
      name: st.profile.name && st.profile.name !== 'بازیکن' ? st.profile.name : '',
      avatar: st.settings.avatar || '♟',
      theme: st.settings.theme || 'dark',
      fontSize: st.settings.fontSize || 'md',
      animations: st.settings.animations !== false,
      sounds: st.settings.sounds !== false
    };

    var wrap = U.el('div.ob-wrap');
    host.appendChild(wrap);

    function header() {
      return U.el('div',
        U.el('div.ob-logo', { text: '♟' }),
        U.el('h1.ob-title', { text: 'امین چس' }),
        U.el('div.ob-en', { text: 'AMIN CHESS AI' }),
        U.el('p.ob-slogan', { text: '«هوشمند بازی کن، حرفه‌ای شطرنج یاد بگیر.»' }));
    }

    function dots() {
      return U.el('div.ob-step-dots', [0, 1, 2, 3].map(function (i) {
        return U.el('i' + (i === step ? '.on' : ''));
      }));
    }

    function stepContent() {
      if (step === 0) {
        /* نام و آواتار */
        var grid = U.el('div.avatar-pick');
        availableAvatars().forEach(function (a) {
          grid.appendChild(U.el('button' + (picks.avatar === a ? '.active' : ''), {
            text: a,
            onclick: function () { picks.avatar = a; renderStep(); global.AMIN.sound.play('click'); }
          }));
        });
        var nameInput = U.el('input#ob-name', {
          type: 'text', placeholder: 'مثلاً: قهرمان',
          value: picks.name, maxlength: 24
        });
        nameInput.addEventListener('input', function () { picks.name = nameInput.value; });
        return U.el('div',
          U.el('div.ob-card',
            U.el('h3', { text: 'اسم تو چیست؟' }),
            U.el('p', { text: 'این نام در پروفایل و صفحه اصلی نمایش داده می‌شود. برای بازی نیازی به ساخت حساب آنلاین نداری.' }),
            nameInput),
          U.el('div.ob-card',
            U.el('h3', { text: 'آواتارت را انتخاب کن' }),
            U.el('p', { text: 'آواتارهای بیشتر را می‌توانی بعداً از فروشگاه با سکه بخری.' }),
            grid));
      }
      if (step === 1) {
        /* تم و تنظیمات اولیه */
        var themeRow = U.el('div.seg-group');
        [['dark', 'شب'], ['light', 'روز'], ['amoled', 'AMOLED'], ['gold', 'طلایی'], ['ocean', 'اقیانوس']].forEach(function (t) {
          themeRow.appendChild(U.el('button.seg' + (picks.theme === t[0] ? '.active' : ''), {
            text: t[1],
            onclick: function () { picks.theme = t[0]; document.body.dataset.theme = t[0]; renderStep(); }
          }));
        });
        var fontRow = U.el('div.seg-group');
        [['sm', 'کوچک'], ['md', 'متوسط'], ['lg', 'بزرگ']].forEach(function (t) {
          fontRow.appendChild(U.el('button.seg' + (picks.fontSize === t[0] ? '.active' : ''), {
            text: t[1],
            onclick: function () { picks.fontSize = t[0]; document.body.dataset.font = t[0]; renderStep(); }
          }));
        });
        var swAnim = U.el('div.sw' + (picks.animations ? '.on' : ''), { onclick: function () { picks.animations = !picks.animations; swAnim.classList.toggle('on', picks.animations); document.body.dataset.anim = picks.animations ? 'on' : 'off'; } });
        var swSound = U.el('div.sw' + (picks.sounds ? '.on' : ''), { onclick: function () { picks.sounds = !picks.sounds; swSound.classList.toggle('on', picks.sounds); global.AMIN.sound.setEnabled(picks.sounds); if (picks.sounds) global.AMIN.sound.play('coin'); } });
        return U.el('div',
          U.el('div.ob-card',
            U.el('h3', { text: 'ظاهر برنامه' }),
            U.el('p', { text: 'بعداً هم می‌توانی از بخش تنظیمات همه را تغییر دهی. پیش‌نمایش همین حالا اعمال می‌شود.' }),
            U.el('label.field-label', { text: 'تم رنگی' }), themeRow,
            U.el('label.field-label', { text: 'اندازه نوشته' }), fontRow),
          U.el('div.ob-card',
            U.el('div.setting-row',
              U.el('div.sr-label', U.el('b', { text: 'انیمیشن‌ها' }), U.el('span', { text: 'حرکت روان مهره‌ها' })), swAnim),
            U.el('div.setting-row',
              U.el('div.sr-label', U.el('b', { text: 'صداها' }), U.el('span', { text: 'صدای حرکت و برخورد' })), swSound)));
      }
      if (step === 2) {
        /* معرفی تنظیمات AI */
        return U.el('div',
          U.el('div.ob-card',
            U.el('h3', { text: '🧠 هوش مصنوعی و API' }),
            U.el('p', { text: 'برای گفت‌وگوی فارسی با «استاد شطرنج» و تحلیل آنلاین، می‌توانی API خودت را وارد کنی: Cloudflare (سرویس اصلی) یا Groq (اختیاری).' }),
            U.el('p', { text: 'اما بدون هیچ API هم همه امکانات اصلی — بازی با موتور Stockfish، معماها، آموزش، فروشگاه و سکه‌ها — کاملاً آفلاین کار می‌کنند.' }),
            U.el('div.row.gap',
              U.el('button.btn', { text: '⚙️ تنظیم API', onclick: function () { global.AMIN.nav.go('api'); } }))),
          U.el('div.ob-card',
            U.el('h3', { text: 'این برنامه چه دارد؟' }),
            U.el('p', { html: '♟️ بازی با هوش مصنوعی ۶ سطح و دونفره<br>🧩 معما‌های روزانه و دسته‌بندی‌شده<br>📚 ۱۰ درس کامل فارسی با آزمون<br>🪙 سکه، فروشگاه و مأموریت‌ها<br>🧠 استاد شطرنج فارسی<br>📴 همه بدون اینترنت کار می‌کنند' })));
      }
      /* گام ۳: شروع */
      return U.el('div',
        U.el('div.ob-card', { style: 'text-align:center' },
          U.el('div', { text: picks.avatar, style: 'font-size:3rem;margin-bottom:8px' }),
          U.el('h3', { text: 'آماده‌ای؟' }),
          U.el('p', { text: (picks.name || 'بازیکن') + '، همه چیز تنظیم شد. تو راست‌به‌چپ، آفلاین و کاملاً رایگان!' }),
          U.el('div.badge.accent', { text: '✓ بدون نیاز به حساب آنلاین' }),
          U.el('div', { style: 'height:10px' }),
          U.el('div.badge', { text: '✓ موتور Stockfish داخلی' })));
    }

    var contentHolder = U.el('div');

    function renderStep() {
      wrap.innerHTML = '';
      wrap.appendChild(header());
      wrap.appendChild(dots());
      contentHolder = U.el('div');
      contentHolder.appendChild(stepContent());
      wrap.appendChild(contentHolder);
      wrap.appendChild(actions());
    }

    function actions() {
      var btnNext = U.el('button.btn.btn-primary.btn-full', {
        text: step === 3 ? '🚀 شروع بازی' : 'ادامه ›',
        onclick: function () {
          if (step < 3) { step++; renderStep(); global.AMIN.sound.play('click'); }
          else finish(true);
        }
      });
      var btnSkip = U.el('button.btn.btn-ghost.btn-full', {
        text: step === 3 ? 'فقط وارد شو' : 'بعداً تنظیم می‌کنم',
        onclick: function () { if (step === 2) finish(false); else if (step < 3) { step = 3; renderStep(); } else finish(false); }
      });
      var btnBack = step > 0 ? U.el('button.btn.btn-ghost.btn-full', { text: '‹ قبلی', onclick: function () { step--; renderStep(); } }) : null;
      return U.el('div.ob-actions', btnBack, btnNext, btnSkip);
    }

    function finish(saveAll) {
      st.profile.name = (picks.name || '').trim() || 'بازیکن';
      st.settings.avatar = picks.avatar;
      st.settings.theme = picks.theme;
      st.settings.fontSize = picks.fontSize;
      st.settings.animations = picks.animations;
      st.settings.sounds = picks.sounds;
      st.settings.onboarded = true;
      st.applySettings();
      Promise.all([st.saveProfile(), st.saveSettings()]).then(function () {
        host.classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        global.AMIN.nav.updateCoins();
        global.AMIN.nav.go('home');
        st.checkDailyLogin().then(function (r) {
          if (r && r.rewarded) U.toast('🎁 جایزه ورود روزانه: ' + U.faNum(r.amount) + ' سکه');
        });
      });
    }

    renderStep();
    return { dispose: function () {} };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.screens = global.AMIN.screens || {};
  global.AMIN.screens.onboarding = {
    render: render,
    show: function () {
      var host = document.getElementById('onboarding');
      host.classList.remove('hidden');
      return render(host);
    }
  };
})(window);
