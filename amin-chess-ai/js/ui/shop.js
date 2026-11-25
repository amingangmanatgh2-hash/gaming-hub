/* AMIN CHESS AI — رندر پیش‌نمایش محصولات فروشگاه */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  /* پیش‌نمایش زنده هر نوع محصول */
  function renderPreview(product) {
    var p = product.preview || { type: 'avatar', glyph: '♟' };
    if (p.type === 'avatar') {
      return U.el('div', { text: p.glyph, style: 'font-size:2rem' });
    }
    if (p.type === 'swatch') {
      return U.el('div.bgp-none.' + p.cls, { style: 'position:absolute;inset:0' });
    }
    if (p.type === 'master') {
      return U.el('div.' + p.cls, { style: 'position:absolute;inset:0' }, U.el('span', { text: '🧠', style: 'position:relative;z-index:1;font-size:1.6rem' }));
    }
    if (p.type === 'sound') {
      var btn = U.el('button', { text: '🔊', style: 'background:none;border:0;font-size:1.8rem;cursor:pointer;color:inherit', onclick: function () { global.AMIN.sound.setPack(p.pack); global.AMIN.sound.play('move'); setTimeout(global.AMIN.sound.play.bind(global.AMIN.sound, 'capture'), 220); } });
      return btn;
    }
    if (p.type === 'pieces') {
      var wrap = U.el('div', { style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:2px;font-size:1.5rem' });
      var set = global.AMIN.ui.board.PIECE_SETS[p.set];
      if (set) {
        wrap.appendChild(U.el('span.' + set.black.cls, { text: set.black.glyph.k }));
        wrap.appendChild(U.el('span.' + set.white.cls, { text: set.white.glyph.q }));
      }
      return wrap;
    }
    if (p.type === 'board') {
      var holder = U.el('div', { style: 'position:absolute;inset:6px;border-radius:8px;overflow:hidden;display:grid;grid-template:repeat(4,1fr)/repeat(4,1fr)' });
      var theme = global.AMIN.ui.board.BOARD_THEMES[p.theme];
      for (var r = 0; r < 4; r++) {
        for (var f = 0; f < 4; f++) {
          var cell = U.el('div');
          var probe = document.createElement('div');
          probe.style.display = 'none';
          if (theme) {
            /* محاسبه رنگ واقعی از CSS variable */
            var cs = getComputedStyle(document.documentElement);
            var light = cs.getPropertyValue('--sq-l-' + p.theme).trim() || '#ccc';
            var dark = cs.getPropertyValue('--sq-d-' + p.theme).trim() || '#333';
            cell.style.background = (r + f) % 2 === 0 ? light : dark;
          }
          holder.appendChild(cell);
        }
      }
      return holder;
    }
    return U.el('div', { text: '🎁' });
  }

  global.AMIN.ui = global.AMIN.ui || {};
  global.AMIN.ui.shopPreview = { renderPreview: renderPreview };
})(window);
