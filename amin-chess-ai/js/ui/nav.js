/* AMIN CHESS AI — ناوبری صفحه‌ها */
(function (global) {
  'use strict';

  var U = global.AMIN.util;
  var screens = {};
  var current = null;
  var currentId = null;
  var stack = [];
  var disposeFn = null;

  function register(id, def) { screens[id] = def; }

  function root() { return document.getElementById('screen-root'); }

  function setHeader(title, showBack) {
    document.getElementById('header-title').textContent = title;
    document.getElementById('btn-back').classList.toggle('hidden', !showBack);
  }

  function setActiveNav(id) {
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.screen === id);
    });
    var mainScreens = ['home', 'play', 'master', 'shop', 'profile'];
    document.getElementById('bottom-nav').classList.toggle('hidden', mainScreens.indexOf(id) < 0);
  }

  function disposeCurrent() {
    if (disposeFn) { try { disposeFn(); } catch (e) { console.error(e); } disposeFn = null; }
    root().innerHTML = '';
  }

  /* رفتن به صفحه */
  function go(id, params, opts) {
    opts = opts || {};
    var def = screens[id];
    if (!def) { console.warn('صفحه‌ای با نام ' + id + ' ثبت نشده'); return; }
    if (!opts.noPush && currentId && currentId !== id) stack.push({ id: currentId, params: currentParams });
    disposeCurrent();
    currentId = id;
    currentParams = params || {};
    setHeader(def.title, !!def.noNav);
    setActiveNav(id);
    var res = def.render(root(), currentParams);
    disposeFn = (res && typeof res.dispose === 'function') ? res.dispose : null;
    root().scrollTop = 0;
    if (global.AMIN.sound) global.AMIN.sound.play('click');
  }

  var currentParams = null;

  function back() {
    var prev = stack.pop();
    if (prev) go(prev.id, prev.params, { noPush: true });
    else go('home', null, { noPush: true });
  }

  function refreshCurrent() {
    if (currentId) go(currentId, currentParams, { noPush: true });
  }

  function updateCoins() {
    var elc = document.getElementById('coins-value');
    if (elc && global.AMIN.state) elc.textContent = U.faNum(global.AMIN.state.economy.balance);
  }

  function init() {
    document.getElementById('btn-back').addEventListener('click', back);
    document.getElementById('btn-coins').addEventListener('click', function () {
      go('profile', { tab: 'coins' });
    });
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.screen); });
    });
    global.AMIN.state && global.AMIN.state.on('coins', updateCoins);
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.nav = {
    register: register, go: go, back: back, init: init,
    refreshCurrent: refreshCurrent, updateCoins: updateCoins,
    setHeader: setHeader,
    get current() { return currentId; }
  };
})(window);
