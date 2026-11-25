/* AMIN CHESS AI — ابزارهای عمومی */
(function (global) {
  'use strict';

  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function faNum(n) {
    return String(n == null ? '' : n).replace(/[0-9]/g, function (d) { return FA_DIGITS[+d]; });
  }

  function enNum(s) {
    return String(s == null ? '' : s).replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); });
  }

  /* نام فارسی مهره‌ها بر اساس حرف FEN */
  var PIECE_FA = { p: 'سرباز', n: 'اسب', b: 'فیل', r: 'رخ', q: 'وزیر', k: 'شاه' };

  function pieceFa(type) { return PIECE_FA[type] || type; }

  /* نام فارسی خانه‌ها: e4 → E۴ */
  function squareFa(sq) {
    return sq.toUpperCase();
  }

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* کلید روز محلی YYYY-MM-DD */
  function dayKey(d) {
    d = d || new Date();
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* کلید هفته محلی: YYYY-Www */
  function weekKey(d) {
    d = d || new Date();
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (t.getDay() + 1) % 7; /* شنبه = ۰ */
    t.setDate(t.getDate() - day);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    var jan1 = new Date(t.getFullYear(), 0, 1);
    var week = Math.floor(((t - jan1) / 86400000) / 7) + 1;
    return t.getFullYear() + '-W' + p(week);
  }

  function dateFa(d) {
    d = d || new Date();
    return faNum(dayKey(d));
  }

  /* ساخت عناصر DOM به‌صورت مختصر: el('div.card#id', {onclick: fn}, children...) */
  function el(sel) {
    var idPart = null;
    var hashIdx = sel.indexOf('#');
    if (hashIdx >= 0) {
      var rest = sel.slice(hashIdx + 1);
      var spaceIdx = rest.search(/[.:\[]/);
      idPart = spaceIdx >= 0 ? rest.slice(0, spaceIdx) : rest;
      sel = sel.slice(0, hashIdx) + (spaceIdx >= 0 ? rest.slice(spaceIdx) : '');
    }
    var parts = sel.split('.');
    var tag = parts[0] || 'div';
    var node = document.createElement(tag);
    if (idPart) node.id = idPart;
    if (parts.length > 1) node.className = parts.slice(1).join(' ');

    var args = Array.prototype.slice.call(arguments, 1);
    var attrs = null;
    if (args.length && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0].nodeType === undefined && args[0].constructor === Object) {
      attrs = args.shift();
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (k === 'html') { node.innerHTML = v; return; }
        if (k === 'text') { node.textContent = v; return; }
        if (k.slice(0, 2) === 'on' && typeof v === 'function') { node.addEventListener(k.slice(2), v); return; }
        if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
      });
    }
    args.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { c.forEach(function (x) { if (x) node.appendChild(x); }); }
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = el('div.toast' + (kind ? '.' + kind : ''), { text: msg });
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 350); }, 2600);
  }

  function confirmDlg(title, message, okLabel) {
    return new Promise(function (resolve) {
      var overlay = el('div.overlay');
      var card = el('div.modal',
        el('h3', { text: title }),
        el('p.modal-msg', { text: message }),
        el('div.row.gap',
          el('button.btn.btn-ghost', { text: 'انصراف', onclick: function () { overlay.remove(); resolve(false); } }),
          el('button.btn.btn-primary', { text: okLabel || 'تأیید', onclick: function () { overlay.remove(); resolve(true); } })
        ));
      overlay.appendChild(card);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.remove(); resolve(false); } });
      document.body.appendChild(overlay);
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return faNum(p(d.getHours()) + ':' + p(d.getMinutes()) + ' — ' + p(d.getMonth() + 1) + '/' + p(d.getDate()));
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.util = {
    faNum: faNum, enNum: enNum, pieceFa: pieceFa, squareFa: squareFa, uuid: uuid,
    dayKey: dayKey, weekKey: weekKey, dateFa: dateFa, el: el, toast: toast,
    confirmDlg: confirmDlg, escapeHtml: escapeHtml, fmtDate: fmtDate
  };
})(window);
