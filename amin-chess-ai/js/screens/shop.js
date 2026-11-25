/* AMIN CHESS AI — فروشگاه */
(function (global) {
  'use strict';

  var U = global.AMIN.util;

  function render(root) {
    var st = global.AMIN.state;
    var shop = global.AMIN.shop;
    var nav = global.AMIN.nav;

    global.AMIN.nav.setHeader('فروشگاه', false);

    global.AMIN.shop.owned = global.AMIN.shop.owned || {};

    var holder = U.el('div');
    var tabs = U.el('div.shop-cat-tabs');
    var list = U.el('div');

    function ownedProducts() {
      return global.AMIN.db.getAll('purchases').then(function (list) {
        var owned = {};
        list.forEach(function (p) { owned[p.id || p] = true; });
        return owned;
      });
    }

    /* owned به‌صورت کش در حافظه + بارگذاری اولیه */
    var ownedCache = {};
    function isOwned(p) { return p.default || ownedCache[p.id]; }

    function renderTabs() {
      tabs.innerHTML = '';
      shop.cats().forEach(function (cat) {
        tabs.appendChild(U.el('button.chip' + (cat === currentCat ? '.active' : ''), {
          text: shop.CAT_FA[cat],
          onclick: function () { currentCat = cat; renderList(); }
        }));
      });
    }

    var currentCat = 'pieces';

    function renderList() {
      renderTabs();
      list.innerHTML = '';
      shop.byCat(currentCat).forEach(function (p) {
        list.appendChild(productCard(p));
      });
    }

    function productCard(p) {
      var owned = isOwned(p);
      var equipped = equippedNow(p);
      var preview = U.el('div.product-preview', global.AMIN.ui.shopPreview.renderPreview(p));
      var card = U.el('div.product-card',
        preview,
        U.el('div.product-body',
          U.el('b', { text: p.name }),
          U.el('p', { text: p.desc }),
          U.el('div.row.gap.spread',
            owned
              ? (equipped ? U.el('span.owned-chip', { text: '✓ در حال استفاده' }) : U.el('button.btn.btn-sm', { text: 'استفاده', onclick: function () { equip(p); } }))
              : U.el('button.btn.btn-primary.btn-sm', { text: '🪙 ' + U.faNum(p.price), onclick: function () { buy(p); } }),
            !owned && p.price > 0 ? U.el('button.btn.btn-ghost.btn-sm', { text: '👁', title: 'پیش‌نمایش', onclick: function () { previewProduct(p); } }) : null)));
      if (owned) preview.style.borderColor = 'rgba(52,211,153,.5)';
      return card;
    }

    function equippedNow(p) {
      var s = st.getSettings();
      var map = {
        pieces: 'pieceSet', board: 'boardTheme', background: 'background',
        sound: 'soundPack', master: 'masterSkin', effect: 'fxTrail'
      };
      if (p.cat === 'avatar') return s.avatar === (p.preview && p.preview.glyph);
      if (p.cat === 'effect') return p.id === 'fx-trail' ? !!s.fxTrail : !s.fxTrail;
      var key = map[p.cat];
      if (!key) return false;
      if (p.preview && p.preview.type === 'pieces') return s.pieceSet === p.preview.set;
      if (p.preview && p.preview.type === 'board') return s.boardTheme === p.preview.theme;
      if (p.preview && p.preview.type === 'swatch') return s.background === (p.id.replace('bg-', ''));
      if (p.preview && p.preview.type === 'sound') return s.soundPack === p.preview.pack;
      if (p.preview && p.preview.type === 'master') return s.masterSkin === p.id.replace('ms-', '');
      return s[key] === p.id;
    }

    function equip(p) {
      var s = st.getSettings();
      if (p.cat === 'pieces') s.pieceSet = p.preview.set;
      else if (p.cat === 'board') s.boardTheme = p.preview.theme;
      else if (p.cat === 'background') s.background = p.id.replace('bg-', '');
      else if (p.cat === 'avatar') { s.avatar = p.preview.glyph; st.profile.avatar = p.preview.glyph; st.saveProfile(); }
      else if (p.cat === 'sound') s.soundPack = p.preview.pack;
      else if (p.cat === 'master') s.masterSkin = p.id.replace('ms-', '');
      else if (p.cat === 'effect') s.fxTrail = p.id === 'fx-trail';
      st.applySettings();
      st.saveSettings().then(function () {
        U.toast('✓ «' + p.name + '» فعال شد');
        renderList();
      });
    }

    function buy(p) {
      if (st.economy.balance < p.price) {
        U.toast('🪙 سکه کافی نداری — ' + U.faNum(p.price - st.economy.balance) + ' سکه کم داری');
        return;
      }
      U.confirmDlg('خرید «' + p.name + '»', 'با ' + U.faNum(p.price) + ' سکه این محصول را می‌خرید و همیشه در حساب شما می‌ماند.', 'خرید').then(function (ok) {
        if (!ok) return;
        st.spend(p.price, 'خرید: ' + p.name, { reasonKey: 'buy:' + p.id }).then(function (r) {
          if (!r.ok) { U.toast(r.insufficient ? 'سکه کافی نداری' : 'خرید انجام نشد'); return; }
          global.AMIN.db.tx('purchases', 'readwrite', function (stx) { stx.put({ id: p.id, ts: Date.now() }, p.id); }).then(function () {
            ownedCache[p.id] = true;
            global.AMIN.state.addXp(20);
            if (p.cat === 'pieces' || p.cat === 'board' || p.cat === 'sound') equip(p);
            else U.toast('🎉 خرید موفق — در موجودی تو ثبت شد');
            renderList();
            nav.updateCoins();
          });
        });
      });
    }

    function previewProduct(p) {
      if (p.preview && p.preview.type === 'sound') return;
      var card = U.el('div.modal', { style: 'text-align:center' },
        U.el('h3', { text: p.name }),
        U.el('div', { style: 'max-width:280px;margin:10px auto' }, previewBig(p)),
        U.el('p.modal-msg', { text: p.desc + ' — قیمت: ' + U.faNum(p.price) + ' سکه' }),
        U.el('button.btn.btn-primary.btn-full', { text: 'بستن', onclick: function () { dlg.close(); } }));
      var dlg = global.AMIN.ui.prompts.openModal(card);
    }

    function previewBig(p) {
      if (p.preview && p.preview.type === 'board') {
        var b = global.AMIN.ui.board.mini(undefined, null, { boardTheme: p.preview.theme, pieceSet: st.getSettings().pieceSet });
        return b;
      }
      if (p.preview && p.preview.type === 'pieces') {
        var b2 = global.AMIN.ui.board.mini('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', null, { pieceSet: p.preview.set, boardTheme: st.getSettings().boardTheme });
        return b2;
      }
      var wrap = U.el('div', { style: 'height:120px;border-radius:14px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center' });
      var pv = U.el('div', { style: 'position:absolute;inset:0' }, global.AMIN.ui.shopPreview.renderPreview(p));
      pv.firstChild && (pv.firstChild.style.transform = 'scale(2.4)');
      wrap.appendChild(pv);
      return wrap;
    }

    holder.appendChild(U.el('div.card', U.el('div.row.gap.spread'),
      U.el('div.col', U.el('div.card-title', { text: '🛍️ فروشگاه AMIN' }), U.el('div.card-sub', { text: 'همه چیز با سکه مجازی — بدون پول واقعی' })),
      U.el('div.badge.accent', { text: '🪙 ' + U.faNum(st.economy.balance) })));
    holder.appendChild(tabs);
    holder.appendChild(list);

    root.appendChild(holder);

    ownedProducts().then(function (owned) { ownedCache = owned; renderList(); });
    return { dispose: function () {} };
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav.register('shop', { title: 'فروشگاه', render: render });
})(window);
