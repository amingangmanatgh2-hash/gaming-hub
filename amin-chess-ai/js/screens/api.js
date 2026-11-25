/* AMIN CHESS AI — «مدیریت هوش مصنوعی و API»
 * Cloudflare (سرویس اصلی) + Groq (اختیاری)
 * توکن‌ها فقط در IndexedDB همین دستگاه ذخیره می‌شوند. */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  function render(root) {
    var API = global.AMIN.api;
    global.AMIN.nav.setHeader('مدیریت هوش مصنوعی و API', false);

    var wrap = U.el('div');

    /* وضعیت اتصال */
    var statusBar = U.el('div');
    wrap.appendChild(statusBar);

    function renderStatus() {
      statusBar.innerHTML = '';
      var s = API.statusSummary();
      var line;
      if (s.provider === 'groq') line = U.el('div.status-line.ok', { text: '🟢 آنلاین — سرویس فعال: Groq' });
      else if (s.provider === 'cloudflare') line = U.el('div.status-line.ok', { text: '🟢 آنلاین — سرویس فعال: Cloudflare' });
      else line = U.el('div.status-line.off', { text: '🟡 حالت آفلاین — همه امکانات محلی کار می‌کنند؛ برای چت فارسی با مدل زبانی API تنظیم کن.' });
      statusBar.appendChild(line);
    }

    /* ---------- Cloudflare ---------- */
    var cfAccount = U.el('input', { type: 'text', placeholder: 'Account ID — از داشبورد Cloudflare (Workers & Pages)', value: API.creds.cloudflare.accountId || '', dir: 'ltr' });
    var cfToken = U.el('input', { type: 'password', placeholder: 'API Token (دسترسی Workers AI)', value: API.creds.cloudflare.apiToken || '', dir: 'ltr' });
    var tokenVisible = false;
    var toggleBtn = U.el('button.token-toggle', { text: '👁', onclick: function () {
      tokenVisible = !tokenVisible;
      cfToken.type = tokenVisible ? 'text' : 'password';
      toggleBtn.textContent = tokenVisible ? '🙈' : '👁';
    } });
    var cfTokenWrap = U.el('div.token-wrap', cfToken, toggleBtn);
    var cfResult = U.el('div.test-result');

    var cfCard = U.el('div.card',
      U.el('div.card-title', { text: '☁️ Cloudflare (سرویس اصلی)' }),
      U.el('div.card-sub', { text: 'مدل‌های Workers AI را از طریق حساب خودت استفاده می‌کنی. توکن هرگز به سرور دیگری فرستاده نمی‌شود و فقط روی همین گوشی می‌ماند.' }),
      U.el('label.field-label', { text: 'CF_ACCOUNT_ID' }), cfAccount,
      U.el('label.field-label', { text: 'CF_API_TOKEN' }), cfTokenWrap,
      U.el('div.field-help', { text: 'از dash.cloudflare.com → My Profile → API Tokens یک توکن با مجوز Workers AI بساز.' }),
      cfResult,
      U.el('div.row.gap.wrap', { style: 'margin-top:12px' },
        U.el('button.btn.btn-primary', { text: '🔌 تست اتصال', onclick: testCf }),
        U.el('button.btn', { text: '💾 ذخیره', onclick: saveCf }),
        U.el('button.btn.btn-danger', { text: '🗑️ حذف', onclick: deleteCf })));

    function testCf() {
      cfResult.className = 'test-result';
      cfResult.textContent = '⏳ در حال تست اتصال به Cloudflare…';
      API.testCloudflare(cfAccount.value.trim(), cfToken.value.trim()).then(function (r) {
        if (r.ok) {
          cfResult.className = 'test-result ok';
          cfResult.textContent = '✓ ' + r.message + (r.models ? ' — دسترسی به مدل‌ها تأیید شد.' : '');
        } else {
          cfResult.className = 'test-result bad';
          cfResult.textContent = '✗ ' + r.error;
        }
      });
    }

    function saveCf() {
      var acc = cfAccount.value.trim(), tok = cfToken.value.trim();
      if (!acc || !tok) { U.toast('Account ID و Token هر دو لازم‌اند'); return; }
      API.creds.cloudflare.accountId = acc;
      API.creds.cloudflare.apiToken = tok;
      API.creds.cloudflare.saved = true;
      API.save().then(function () {
        U.toast('✓ تنظیمات Cloudflare ذخیره شد');
        renderStatus();
      });
    }

    function deleteCf() {
      U.confirmDlg('حذف اطلاعات Cloudflare', 'Account ID و Token از این دستگاه پاک می‌شوند.', 'حذف').then(function (ok) {
        if (!ok) return;
        API.creds.cloudflare = { accountId: '', apiToken: '', saved: false };
        cfAccount.value = ''; cfToken.value = '';
        API.save().then(function () { U.toast('اطلاعات Cloudflare حذف شد'); renderStatus(); });
      });
    }

    /* ---------- Groq ---------- */
    var gqKey = U.el('input', { type: 'password', placeholder: 'API Key گروک', value: API.creds.groq.apiKey || '', dir: 'ltr' });
    var gqModel = U.el('select');
    API.GROQ_MODELS.forEach(function (m) {
      var opt = U.el('option', { value: m.id, text: m.name });
      if (m.id === (API.creds.groq.model || 'llama-3.1-8b-instant')) opt.selected = true;
      gqModel.appendChild(opt);
    });
    var gqEnabled = API.creds.groq.enabled;
    var gqSwitch = U.el('div.sw' + (gqEnabled ? '.on' : ''));
    gqSwitch.addEventListener('click', function () {
      gqEnabled = !gqEnabled;
      gqSwitch.classList.toggle('on', gqEnabled);
      API.creds.groq.enabled = gqEnabled;
      API.save().then(renderStatus);
    });
    var gqResult = U.el('div.test-result');

    var gqCard = U.el('div.card',
      U.el('div.card-title', { text: '⚡ Groq (اختیاری — سرویس جایگزین)' }),
      U.el('div.card-sub', { text: 'Groq اجباری نیست؛ اگر فقط Cloudflare را تنظیم کنی برنامه کاملاً کار می‌کند. Groq برای گفت‌وگوی سریع مدل‌های بزرگ خوب است.' }),
      U.el('div.setting-row',
        U.el('div.sr-label', U.el('b', { text: 'فعال‌سازی Groq' }), U.el('span', { text: 'استفاده به‌عنوان سرویس گفت‌وگو' })),
        gqSwitch),
      U.el('label.field-label', { text: 'GROQ_API_KEY' }),
      U.el('div.token-wrap', gqKey, U.el('button.token-toggle', { text: '👁', onclick: function () { gqKey.type = gqKey.type === 'password' ? 'text' : 'password'; } })),
      U.el('label.field-label', { text: 'انتخاب مدل' }), gqModel,
      gqResult,
      U.el('div.row.gap.wrap', { style: 'margin-top:12px' },
        U.el('button.btn.btn-primary', { text: '🔌 تست اتصال', onclick: testGq }),
        U.el('button.btn', { text: '💾 ذخیره', onclick: saveGq }),
        U.el('button.btn.btn-danger', { text: '🗑️ حذف', onclick: deleteGq })));

    function testGq() {
      gqResult.className = 'test-result';
      gqResult.textContent = '⏳ در حال تست اتصال به Groq…';
      API.testGroq(gqKey.value.trim()).then(function (r) {
        gqResult.className = r.ok ? 'test-result ok' : 'test-result bad';
        gqResult.textContent = (r.ok ? '✓ ' : '✗ ') + (r.message || r.error);
      });
    }

    function saveGq() {
      var key = gqKey.value.trim();
      if (!key) { U.toast('API Key را وارد کن'); return; }
      API.creds.groq.apiKey = key;
      API.creds.groq.model = gqModel.value;
      API.creds.groq.enabled = gqEnabled;
      API.creds.groq.saved = true;
      API.save().then(function () {
        U.toast('✓ تنظیمات Groq ذخیره شد');
        renderStatus();
      });
    }

    function deleteGq() {
      U.confirmDlg('حذف اطلاعات Groq', 'API Key Groq از این دستگاه پاک می‌شود.', 'حذف').then(function (ok) {
        if (!ok) return;
        API.creds.groq = { apiKey: '', model: 'llama-3.1-8b-instant', enabled: false, saved: false };
        gqKey.value = '';
        gqSwitch.classList.remove('on');
        API.save().then(function () { U.toast('اطلاعات Groq حذف شد'); renderStatus(); });
      });
    }

    /* ---------- سرویس جایگزین ---------- */
    var provCard = U.el('div.card',
      U.el('div.card-title', { text: '🔀 انتخاب سرویس فعال' }),
      U.el('div.card-sub', { text: 'در حالت «خودکار» برنامه با بهترین سرویس موجود کار می‌کند؛ اگر هیچ‌کدام نباشد، همه‌چیز آفلاین کار می‌کند.' }),
      segRowFor('سرویس گفت‌وگوی استاد شطرنج', [['auto', 'خودکار'], ['cloudflare', 'Cloudflare'], ['groq', 'Groq'], ['offline', 'همیشه آفلاین']], API.creds.provider, function (v) {
        API.creds.provider = v;
        API.save().then(function () { renderStatus(); });
      }));

    function segRowFor(label, options, current, onPick) {
      var group = U.el('div.seg-group');
      options.forEach(function (o) {
        group.appendChild(U.el('button.seg' + (o[0] === current ? '.active' : ''), {
          text: o[1],
          onclick: function () { onPick(o[0]); }
        }));
      });
      return U.el('div.setting-row',
        U.el('div.sr-label', U.el('b', { text: label }), U.el('span', { text: 'اگر سرویس قطع شود خودکار آفلاین می‌شویم' })),
        group);
    }

    var noteCard = U.el('div.card',
      U.el('div.card-title', { text: '🔒 امنیت' }),
      U.el('div.card-sub', { html:
        '• توکن‌ها فقط در IndexedDB همین دستگاه ذخیره می‌شوند و در هیچ فایل عمومی یا کد جاوااسکریپت قابل انتشار نیستند.<br>' +
        '• اگر می‌خواهی کلیدها هرگز به مرورگر نروند، بک‌اند Worker همراه پروژه (پوشه worker/) را روی Cloudflare مستقر کن و در README راهنمای آن آمده است.<br>' +
        '• توکن‌ها را در مخزن GitHub قرار نده.' }));

    wrap.appendChild(statusBar);
    wrap.appendChild(cfCard);
    wrap.appendChild(gqCard);
    wrap.appendChild(provCard);
    wrap.appendChild(noteCard);
    root.appendChild(wrap);
    renderStatus();
    return { dispose: function () {} };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('api', { title: 'مدیریت هوش مصنوعی و API', render: render });
})(window);
