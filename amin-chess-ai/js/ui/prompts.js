/* AMIN CHESS AI — دیالوگ‌های مشترک: ارتقای سرباز، انتخاب سطح AI، پایان بازی */
(function (global) {
  'use strict';

  var U = global.AMIN.util;
  var host = function () { return document.getElementById('modal-host'); };

  function openModal(node, opts) {
    opts = opts || {};
    var overlay = U.el('div.overlay');
    overlay.appendChild(node);
    if (!opts.locked) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay && opts.dismissible !== false) { overlay.remove(); }
      });
    }
    host().appendChild(overlay);
    return { close: function () { overlay.remove(); }, overlay: overlay };
  }

  /* انتخاب مهره برای ارتقای سرباز */
  function promotionDialog(color, onPick) {
    var U1 = U;
    var card = U1.el('div.modal',
      U1.el('h3', { text: 'ارتقای سرباز' }),
      U1.el('p.modal-msg', { text: 'سرباز به آخرین ردیف رسید — مهره جدید را انتخاب کن:' }),
      U1.el('div.row.gap.wrap',
        ['q', 'r', 'b', 'n'].map(function (t) {
          var names = { q: 'وزیر ♛', r: 'رخ ♜', b: 'فیل ♝', n: 'اسب ♞' };
          return U1.el('button.btn.btn-primary', {
            text: names[t],
            onclick: function () { dlg.close(); onPick(t); }
          });
        })
      ));
    var dlg = openModal(card, { locked: true });
    return dlg;
  }

  /* انتخاب سطح AI */
  function levelDialog(current, onPick) {
    var G = global.AMIN.game;
    var rows = Object.keys(G.AI_LEVELS).map(function (k) {
      var lvl = G.AI_LEVELS[k];
      return U.el('button.btn' + (k === current ? '.btn-primary' : ''), {
        text: lvl.fa + '  (' + lvl.elo + ')',
        onclick: function () { dlg.close(); onPick(k); }
      });
    });
    var card = U.el('div.modal',
      U.el('h3', { text: 'سطح هوش مصنوعی' }),
      U.el('p.modal-msg', { text: 'قدرت موتور Stockfish برای حریف ماشینی را انتخاب کن:' }),
      U.el('div.col.gap', rows));
    var dlg = openModal(card);
    return dlg;
  }

  /* انتخاب رنگ در بازی با AI */
  function colorDialog(onPick) {
    var card = U.el('div.modal',
      U.el('h3', { text: 'انتخاب رنگ' }),
      U.el('p.modal-msg', { text: 'با کدام مهره‌ها بازی می‌کنی؟' }),
      U.el('div.row.gap',
        U.el('button.btn.btn-primary', { text: '♔ سفید (اول حرکت)', onclick: function () { dlg.close(); onPick('w'); } }),
        U.el('button.btn', { text: '♚ سیاه', onclick: function () { dlg.close(); onPick('b'); } })
      ));
    var dlg = openModal(card);
    return dlg;
  }

  /* دیالوگ پایان بازی با گزینه‌ها */
  function gameEndDialog(outcome, resultFa, extras) {
    extras = extras || {};
    var emoji = outcome === 'win' ? '🏆' : outcome === 'draw' ? '🤝' : outcome.indexOf('win-') === 0 ? '🤝' : '💪';
    var title = outcome === 'win' ? 'بردی!' : outcome === 'draw' ? 'تساوی' : outcome.indexOf('win-') === 0 ? 'پایان بازی' : 'باختی';
    var msg = resultFa + (extras.coins ? ' — ' + extras.coins : '');
    var card = U.el('div.modal',
      U.el('div', { style: 'text-align:center;font-size:3rem' }, emoji),
      U.el('h3', { text: title, style: 'text-align:center' }),
      U.el('p.modal-msg', { text: msg, style: 'text-align:center' }),
      U.el('div.col.gap',
        extras.onReview ? U.el('button.btn.btn-primary.btn-full', {
          text: '🔍 بررسی با موتور و استاد شطرنج',
          onclick: function () { dlg.close(); extras.onReview(); }
        }) : null,
        U.el('button.btn.btn-full', { text: 'بازی دوباره', onclick: function () { dlg.close(); extras.onRematch(); } }),
        U.el('button.btn.btn-ghost.btn-full', { text: 'بستن', onclick: function () { dlg.close(); extras.onClose || function () {}(); } })
      ));
    var dlg = openModal(card, { locked: true, dismissible: false });
    return dlg;
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.ui = global.AMIN.ui || {};
  global.AMIN.ui.prompts = {
    openModal: openModal,
    promotionDialog: promotionDialog,
    levelDialog: levelDialog,
    colorDialog: colorDialog,
    gameEndDialog: gameEndDialog
  };
})(window);
