/* AMIN CHESS AI — صفحه استاد شطرنج (چت فارسی) */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  function render(root, params) {
    var st = global.AMIN.state;
    var API = global.AMIN.api;
    var master = global.AMIN.master;
    var history = []; /* {role, content} */

    global.AMIN.nav.setHeader('استاد شطرنج', false);

    var provider = API.activeProvider();
    var statusText = provider === 'offline' ? 'حالت آفلاین — Stockfish + پایگاه دانش' :
      provider === 'groq' ? 'آنلاین با Groq' : 'آنلاین با Cloudflare';
    var statusCls = provider === 'offline' ? 'off' : 'ok';

    var skin = st.getSettings().masterSkin || 'sage';
    var avatarCls = { sage: '', nova: 'msp-nova', royal: 'msp-royal' }[skin] || '';

    var head = U.el('div.card.master-head',
      U.el('div.master-avatar.' + avatarCls, { text: '🧠' }),
      U.el('div.col', { style: 'flex:1' },
        U.el('b', { text: 'استاد شطرنج' }),
        U.el('span', { text: statusText })),
      U.el('button.btn.btn-sm', { text: '⚙️', onclick: function () { global.AMIN.nav.go('api'); } }));

    var chatBox = U.el('div.chat-box', { id: 'chat-box' });

    var input = U.el('input#master-input', { type: 'text', placeholder: 'سؤالت را به فارسی بنویس…' });
    var sendBtn = U.el('button.btn.btn-primary', { text: 'ارسال', onclick: send });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });

    var chips = U.el('div.chips-row',
      chip('📊 تحلیل موقعیت فعلی', 'وضعیت فعلی را تحلیل کن و بهترین حرکت را با دلیل بگو.'),
      chip('💡 کمک، گیر کردم', 'گیر کرده‌ام؛ چه حرکتی بزنم؟'),
      chip('❌ بررسی اشتباهات', 'اشتباه‌های بازی اخیرم را بررسی کن.'),
      chip('📖 قلعه چیست؟', 'قلعه کردن را توضیح بده.'),
      chip('⚔️ آموزش چنگال', 'تاکتیک چنگال را آموزش بده.'),
      chip('🚀 اصول گشایش', 'اصول گشایش را آموزش بده.'));

    function chip(label, q) {
      return U.el('button.chip', { text: label, onclick: function () { ask(q); } });
    }

    function addMsg(role, text, mode) {
      var m = U.el('div.msg.' + role, { text: text });
      if (mode) {
        var tag = mode === 'offline' ? 'موتور آفلاین + پایگاه دانش' :
          mode === 'offline-fallback' ? 'پاسخ آفلاین (سرویس آنلاین قطع بود)' :
            'مدل زبانی آنلاین';
        m.appendChild(U.el('span.msg-mode', { text: tag }));
      }
      chatBox.appendChild(m);
      chatBox.scrollTop = chatBox.scrollHeight;
      return m;
    }

    var busy = false;
    function send() {
      var q = input.value.trim();
      if (!q || busy) return;
      input.value = '';
      ask(q);
    }

    function ask(q) {
      if (busy) return;
      busy = true;
      addMsg('user', q);
      var typing = addMsg('assistant', '…');
      history.push({ role: 'user', content: q });

      var ctx = global.AMIN.masterCtx || {};
      ctx.chess = ctx.chess || null;
      master.ask(q, ctx, history).then(function (res) {
        typing.remove();
        addMsg('assistant', res.text, res.mode);
        history.push({ role: 'assistant', content: res.text });
        global.AMIN.state.addXp(3);
      }).catch(function (e) {
        typing.remove();
        addMsg('assistant', 'خطا: ' + (e && e.message || 'نامشخص'), 'offline');
      }).finally(function () { busy = false; });
    }

    var layout = U.el('div',
      head,
      U.el('div.card',
        chatBox,
        chips,
        U.el('div.chat-input-row', input, sendBtn)));

    root.appendChild(layout);
    addMsg('assistant', master.greeting(), provider === 'offline' ? 'offline' : 'online');

    /* اگر با پارامتر سؤال خودکار آمده‌ایم */
    if (params && params.autoAsk) {
      setTimeout(function () { ask(params.autoAsk); }, 300);
    }

    return { dispose: function () { global.AMIN.masterCtx = null; } };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('master', { title: 'استاد شطرنج', render: render });
})(window);
