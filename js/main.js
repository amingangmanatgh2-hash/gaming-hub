/* ==========================================================================
   main.js  ::  کنترل‌کننده‌ی برنامه — منوها، گاراژ، پیشرفت، حلقه‌ی اصلی
   ========================================================================== */
(function (root) {
  'use strict';
  var KK = root.KK, M4 = KK.M4;
  var clamp = KK.clamp, lerp = KK.lerp, PI = KK.PI, TAU = KK.TAU;
  var doc = root.document;

  var SAVE_KEY = 'kafkhab.save.v1';

  /* ============================================================ پیشرفت */
  function defaultProfile() {
    return {
      coins: 3200,
      owned: ['tandar'],
      paint: {},
      upgrades: {},
      tracks: ['tehran', 'kish'],
      best: {},
      selected: 'tandar',
      settings: { quality: 1, master: 80, sfx: 90, music: 35, camMode: 'chase', splitDir: 'vertical', showFps: false }
    };
  }
  function loadProfile() {
    try {
      var raw = root.localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultProfile();
      var p = JSON.parse(raw), d = defaultProfile();
      for (var k in d) if (p[k] === undefined) p[k] = d[k];
      for (var s in d.settings) if (p.settings[s] === undefined) p.settings[s] = d.settings[s];
      return p;
    } catch (e) { return defaultProfile(); }
  }
  function saveProfile() {
    try { root.localStorage.setItem(SAVE_KEY, JSON.stringify(P)); } catch (e) { }
  }

  /* ============================================================== برنامه */
  var P, renderer, audio, game = null;
  var curScreen = 'loading';
  var showroom = null;
  var lastT = 0, fpsAvg = 60;
  var raceCfg = null;
  var setup = { trackId: 'tehran', carId: 'tandar', p2CarId: null, laps: 3, ai: 7, dif: 1, mode: 'single' };

  var $ = function (id) { return doc.getElementById(id); };
  function el(tag, cls, html) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function fa(n) {
    return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }
  function money(n) { return fa(Math.round(n).toLocaleString('en-US').replace(/,/g, '٬')); }
  function fmt(t) {
    if (!t && t !== 0) return '--:--.--';
    var m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  }
  function hexCss(h) { return '#' + ('000000' + (h >>> 0).toString(16)).slice(-6); }
  function toast(msg, kind) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.className = ''; }, 2400);
  }

  function show(id) {
    var all = doc.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    var full = id ? 'screen-' + id : null;
    if (full) $(full) && $(full).classList.add('active');
    curScreen = id;
    $('touch').classList.toggle('hidden', !(id === null && game && game.touchMode));
    audio && audio.resume();
    if (id === 'menu' || id === 'garage' || id === 'tracks') {
      audio && audio.startMusic(id === 'menu' ? 'menu' : 'menu');
    } else if (id === null) {
      audio && audio.startMusic(game && game.theme && game.theme.neon ? 'neon' : 'race');
    } else audio && audio.stopMusic();
  }

  /* =============================================================== گاراژ */
  var garageSel = 'tandar';
  function ownedCars() {
    return KK.CARS.filter(function (c) { return P.owned.indexOf(c.id) >= 0; });
  }
  function paintOf(carId) {
    if (P.paint[carId] !== undefined) return P.paint[carId];
    var c = KK.CARS.filter(function (x) { return x.id === carId; })[0];
    return c ? c.color : 0xffffff;
  }

  function renderGarageList() {
    var list = $('carlist');
    list.innerHTML = '';
    KK.CARS.forEach(function (c) {
      var has = P.owned.indexOf(c.id) >= 0;
      var it = el('div', 'citem' + (c.id === garageSel ? ' sel' : ''));
      var sw = el('span', 'sw'); sw.style.background = hexCss(has ? paintOf(c.id) : 0x555a63);
      var nm = el('span', 'nm', c.name + '<em>' + c.latin + '</em>');
      it.appendChild(sw); it.appendChild(nm);
      it.appendChild(el('span', has ? 'pr' : 'lock', has ? (c.id === P.selected ? '✓ فعال' : 'دارید') : '◆ ' + money(c.price)));
      it.onclick = function () { garageSel = c.id; audio && audio.ui('move'); renderGarage(); };
      list.appendChild(it);
    });
  }

  function statRow(label, val, max) {
    var r = el('div', 'brow');
    r.appendChild(el('span', null, label));
    var bt = el('div', 'bt'); var i = el('i');
    i.style.width = clamp(val / max * 100, 2, 100) + '%';
    bt.appendChild(i); r.appendChild(bt);
    r.appendChild(el('span', null, fa(Math.round(val))));
    return r;
  }

  function renderGarage() {
    var c = KK.CARS.filter(function (x) { return x.id === garageSel; })[0];
    if (!c) return;
    var has = P.owned.indexOf(c.id) >= 0;
    $('g-coins').textContent = money(P.coins);
    $('g-name').textContent = c.name;
    $('g-tag').textContent = c.latin + ' · ' + c.tag;
    $('g-desc').textContent = c.desc;

    var up = P.upgrades[c.id] || {};
    var bars = $('g-bars'); bars.innerHTML = '';
    var bonus = function (eff) {
      var s = 0;
      KK.UPGRADES.forEach(function (u) { if (u.effect === eff) s += u.step * (up[u.id] || 0); });
      return s;
    };
    bars.appendChild(statRow('قدرت', c.power + bonus('power'), 130));
    bars.appendChild(statRow('چسبندگی', c.grip + bonus('grip'), 130));
    bars.appendChild(statRow('سرعت', c.aero + bonus('aero'), 130));
    bars.appendChild(statRow('ترمز', c.brake + bonus('brake'), 130));
    bars.appendChild(statRow('دریفت', c.drift, 130));
    bars.appendChild(statRow('خاکی', c.offroad, 130));
    bars.appendChild(statRow('وزن', c.weight + bonus('weight'), 4200));

    var buy = $('g-buy'), sel = $('g-select');
    if (has) { buy.style.display = 'none'; sel.style.display = ''; }
    else {
      buy.style.display = ''; sel.style.display = 'none';
      buy.textContent = 'خرید — ◆ ' + money(c.price);
      buy.disabled = P.coins < c.price;
    }
    sel.textContent = (c.id === P.selected) ? '✓ خودروی فعال' : 'انتخاب به‌عنوان خودروی فعال';

    // رنگ‌ها
    var pw = $('g-paints'); pw.innerHTML = '';
    KK.PAINTS.forEach(function (hex) {
      var d = el('div', 'pdot' + (paintOf(c.id) === hex ? ' sel' : '') + (has ? '' : ' locked'));
      d.style.background = hexCss(hex);
      d.onclick = function () {
        if (!has) { toast('اول باید این خودرو را بخری', 'bad'); return; }
        P.paint[c.id] = hex; saveProfile(); audio && audio.ui('ok');
        renderGarage(); rebuildShowroom();
      };
      pw.appendChild(d);
    });

    // ارتقاءها
    var uw = $('g-upgrades'); uw.innerHTML = '';
    KK.UPGRADES.forEach(function (u) {
      var lv = (up[u.id] || 0);
      var box = el('div', 'ubox');
      box.appendChild(el('div', 'uh', '<span>' + u.icon + ' ' + u.name + '</span><span>سطح ' + fa(lv) + '/' + fa(u.max) + '</span>'));
      box.appendChild(el('div', 'ud', u.desc));
      var pips = el('div', 'pips');
      for (var i = 0; i < u.max; i++) pips.appendChild(el('i', lv > i ? 'on' : ''));
      box.appendChild(pips);
      var b = el('button', 'ghost');
      if (lv >= u.max) { b.textContent = 'کامل شد'; b.disabled = true; }
      else {
        var cost = u.cost[lv];
        b.textContent = 'ارتقا — ◆ ' + money(cost);
        b.disabled = !has || P.coins < cost;
        b.onclick = function () {
          if (P.coins < cost) { toast('سکه کافی نداری', 'bad'); return; }
          P.coins -= cost;
          P.upgrades[c.id] = P.upgrades[c.id] || {};
          P.upgrades[c.id][u.id] = lv + 1;
          saveProfile(); audio && audio.ui('buy');
          toast(u.name + ' به سطح ' + fa(lv + 1) + ' رسید', 'ok');
          renderGarage();
        };
      }
      box.appendChild(b);
      uw.appendChild(box);
    });

    renderGarageList();
    rebuildShowroom();
  }

  /* -------------------------------------------------------- پیش‌نمایش */
  function rebuildShowroom() {
    var c = KK.CARS.filter(function (x) { return x.id === garageSel; })[0];
    if (!c || !renderer) return;
    var def = JSON.parse(JSON.stringify(c));
    def.color = paintOf(c.id);
    try {
      var car = new KK.carModule.Car(def, { upgrades: P.upgrades[c.id] || {} });
      showroom = {
        car: car,
        body: renderer.upload(car.geo.mesh),
        wheel: renderer.upload(car.wheelMesh),
        angle: showroom ? showroom.angle : 0.6
      };
    } catch (e) { showroom = null; }
  }

  function buildStage() {
    if (showroom && showroom.platform) return;
    var mb = new KK.MeshBuilder();
    mb.setColorHex(0x14181f).setMat(KK.MAT.METAL);
    mb.cylinder(0, -0.25, 0, 6.4, 0.5, 48, 'y', true, true);
    mb.setColorHex(0x0d1015).setMat(KK.MAT.METAL);
    mb.cylinder(0, -0.5, 0, 9.5, 0.16, 48, 'y', true, true);
    mb.setColorHex(0x00e5ff).setMat(KK.MAT.NEON);
    mb.cylinder(0, 0.005, 0, 6.35, 0.05, 48, 'y', false, false, 6.35);
    mb.setColorHex(0xff2fb0).setMat(KK.MAT.NEON);
    mb.cylinder(0, -0.42, 0, 9.4, 0.04, 48, 'y', false, false, 9.4);
    // ستون‌های نور پس‌زمینه
    for (var i = 0; i < 10; i++) {
      var a = (i / 10) * TAU;
      mb.setColorHex(i % 2 ? 0x0a2a3a : 0x2a0a2a).setMat(KK.MAT.METAL);
      mb.box(Math.cos(a) * 13, 3, Math.sin(a) * 13, 0.5, 8, 0.5);
    }
    showroom = showroom || {};
    showroom.platform = renderer.upload(mb);
  }

  function stageViewport() {
    var s = $('g-stage');
    if (!s || !s.getBoundingClientRect) return null;
    var r = s.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return null;
    var cv = renderer.canvas;
    var k = cv.width / Math.max(1, cv.clientWidth);
    return {
      x: Math.round(r.left * k),
      y: Math.round((cv.clientHeight - r.bottom) * k),
      w: Math.round(r.width * k),
      h: Math.round(r.height * k)
    };
  }

  function renderShowroom(dt) {
    if (!showroom || !showroom.platform) return;
    var vp = stageViewport();
    if (!vp) return;
    buildStage();
    showroom.angle += dt * 0.45;
    var car = showroom.car;
    var a = showroom.angle;
    var R = 4.6 + car.def.len * 0.5;
    var cam = {
      pos: [Math.cos(a) * R, 1.35 + car.def.ht, Math.sin(a) * R],
      fov: 0.78
    };
    cam.view = M4.lookAt(M4.create(), cam.pos, [0, car.def.ht * 0.42, 0], [0, 1, 0]);
    cam.right = [cam.view[0], cam.view[4], cam.view[8]];
    cam.up = [cam.view[1], cam.view[5], cam.view[9]];
    cam.fwd = [-cam.view[2], -cam.view[6], -cam.view[10]];
    renderer.setEnv({
      lightDir: [0.42, 0.80, 0.42], lightCol: [1.5, 1.45, 1.35],
      ambTop: [0.30, 0.40, 0.55], ambBot: [0.05, 0.06, 0.10],
      fog: [0.02, 0.03, 0.06], fogNear: 26, fogFar: 90,
      skyTop: [0.02, 0.04, 0.09], skyBot: [0.05, 0.09, 0.16], sun: [1, 0.95, 0.85],
      night: 0, cloud: 0, rock: [0.1, 0.1, 0.12], time: dt
    });
    car.updateMatrices();
    var ident = M4.create();
    var draws = [{ meshes: showroom.platform, model: ident }];
    draws.push({ meshes: showroom.body, model: car.model });
    for (var w = 0; w < 4; w++) {
      var m = M4.create();
      M4.multiply(m, car.model, car.wheelMat[w]);
      draws.push({ meshes: showroom.wheel, model: m });
    }
    renderer.shadowN = 0;
    renderer.pushShadow(0, 0.03, 0, 0, car.def.wid * 1.3, car.def.len * 1.1, 0.6);
    renderer.partN = 0;
    renderer.renderView(cam, { draws: draws }, vp);
  }

  /* =============================================================== پیست‌ها */
  function thumbStyle(theme) {
    var t = KK.THEMES[theme] || KK.THEMES.mountain;
    return 'background:linear-gradient(180deg,' + hexCss(t.skyTop) + ' 0%,' + hexCss(t.skyBot) +
      ' 46%,' + hexCss(t.fog) + ' 62%,' + hexCss(t.ground) + ' 100%)';
  }

  function renderTracks() {
    var g = $('trackgrid'); g.innerHTML = '';
    $('t-coins').textContent = money(P.coins);
    KK.TRACKS.forEach(function (t, i) {
      var has = P.tracks.indexOf(t.id) >= 0;
      var c = el('div', 'tcard' + (has ? '' : ' locked'));
      c.appendChild(el('div', 'thumb')).setAttribute('style', thumbStyle(t.theme));
      if (!has) c.appendChild(el('div', 'cost', '◆ ' + money(t.cost)));
      c.appendChild(el('div', 'badge', 'سختی ' + fa(t.dif) + '/3'));
      var info = el('div', 'tinfo');
      info.appendChild(el('b', null, fa(i + 1) + '. ' + t.name));
      info.appendChild(el('em', null, t.latin + ' · ' + t.region));
      var meta = el('div', 'tmeta',
        '<span>' + fa(t.laps) + ' دور</span><span>' + fa(Math.round(t.len)) + ' متر</span>' +
        '<span>' + fa(t.ai) + ' رقیب</span>');
      info.appendChild(meta);
      info.appendChild(el('div', 'tdesc', t.desc));
      var b = P.best[t.id];
      if (b) info.appendChild(el('div', 'rec', 'رکورد: ' + fmt(b.time) + ' — ' + b.car));
      c.appendChild(info);
      c.onclick = function () {
        if (!has) {
          if (P.coins < t.cost) { toast('سکه کافی نداری', 'bad'); return; }
          P.coins -= t.cost; P.tracks.push(t.id); saveProfile();
          audio && audio.ui('buy');
          toast('پیست «' + t.name + '» باز شد', 'ok');
          renderTracks();
          return;
        }
        audio && audio.ui('ok');
        setup.trackId = t.id;
        openSetup();
      };
      g.appendChild(c);
    });
  }

  /* ========================================================= پیش‌مسابقه */
  function seg(host, items, cur, onPick) {
    var h = $(host); if (!h) return;
    h.innerHTML = '';
    items.forEach(function (it) {
      var b = el('button', it.v === cur ? 'on' : '', it.label);
      b.onclick = function () { audio && audio.ui('move'); onPick(it.v); };
      h.appendChild(b);
    });
  }

  function openSetup() {
    var t = KK.TRACKS.filter(function (x) { return x.id === setup.trackId; })[0];
    setup.laps = Math.max(setup.laps, t.laps);
    $('s-trackname').textContent = t.name + ' · ' + t.region;
    setup.carId = P.selected;
    if (!setup.p2CarId) setup.p2CarId = (ownedCars()[1] || ownedCars()[0]).id;
    renderSetup();
    show('setup');
  }

  function renderSetup() {
    var list = $('s-carlist'); list.innerHTML = '';
    ownedCars().forEach(function (c) {
      var r = el('div', 'rrow' + (c.id === setup.carId ? ' sel' : ''));
      var sw = el('span', 'sw'); sw.style.background = hexCss(paintOf(c.id));
      r.appendChild(sw);
      r.appendChild(el('span', null, c.name + ' — ' + c.tag));
      r.onclick = function () { setup.carId = c.id; audio && audio.ui('move'); renderSetup(); };
      list.appendChild(r);
    });
    var l2 = $('s-p2list'); l2.innerHTML = '';
    $('s-p2card').style.display = setup.mode === 'split' ? '' : 'none';
    if (setup.mode === 'split') {
      ownedCars().forEach(function (c) {
        var r = el('div', 'rrow' + (c.id === setup.p2CarId ? ' sel' : ''));
        var sw = el('span', 'sw'); sw.style.background = hexCss(paintOf(c.id));
        r.appendChild(sw);
        r.appendChild(el('span', null, c.name + ' — ' + c.tag));
        r.onclick = function () { setup.p2CarId = c.id; audio && audio.ui('move'); renderSetup(); };
        l2.appendChild(r);
      });
    }
    seg('s-laps', [{ v: 2, label: '۲' }, { v: 3, label: '۳' }, { v: 5, label: '۵' }, { v: 8, label: '۸' }], setup.laps, function (v) { setup.laps = v; renderSetup(); });
    seg('s-ai', [{ v: 3, label: '۳' }, { v: 5, label: '۵' }, { v: 7, label: '۷' }, { v: 11, label: '۱۱' }], setup.ai, function (v) { setup.ai = v; renderSetup(); });
    seg('s-dif', [{ v: 0, label: 'آسان' }, { v: 1, label: 'متوسط' }, { v: 2, label: 'سخت' }, { v: 3, label: 'افسانه' }], setup.dif, function (v) { setup.dif = v; renderSetup(); });
    seg('s-cam', [{ v: 'chase', label: 'پشت سر' }, { v: 'hood', label: 'کاپوت' }], P.settings.camMode, function (v) { P.settings.camMode = v; saveProfile(); renderSetup(); });
  }

  /* ============================================================== مسابقه */
  function carDefById(id) {
    return KK.CARS.filter(function (c) { return c.id === id; })[0];
  }

  function startRace() {
    var tdef = KK.TRACKS.filter(function (t) { return t.id === setup.trackId; })[0];
    var entries = [];
    var mk = function (cid, name, player) {
      var def = JSON.parse(JSON.stringify(carDefById(cid)));
      def.color = paintOf(cid);
      return { carDef: def, name: name, player: player || null, colorHex: def.color, upgrades: P.upgrades[cid] || {} };
    };
    entries.push(mk(setup.carId, 'شما', 1));
    if (setup.mode === 'split') entries.push(mk(setup.p2CarId, 'بازیکن ۲', 2));

    var pool = KK.DRIVERS.slice().sort(function () { return Math.random() - 0.5; });
    var carPool = KK.CARS.slice().sort(function () { return Math.random() - 0.5; });
    var usedIds = {};
    entries.forEach(function (e) { usedIds[e.carDef.id] = 1; });
    for (var i = 0; i < setup.ai; i++) {
      var cd = carPool[i % carPool.length];
      var aiDef = JSON.parse(JSON.stringify(cd));
      var drv = pool[i % pool.length];
      aiDef.color = drv.colors[0]; aiDef.accent = drv.colors[1];
      entries.push({ carDef: aiDef, name: drv.name, player: null, colorHex: aiDef.color, aiIdx: i, upgrades: {} });
    }

    show('loading');
    $('loadmsg').textContent = 'در حال ساخت پیست «' + tdef.name + '»…';
    $('loadbar').style.width = '18%';

    setTimeout(function () {
      try {
        renderer.resize();
        game = new KK.gameModule.Game({
          renderer: renderer, audio: audio, hudCanvas: $('hud'),
          settings: P.settings, laps: setup.laps, difficulty: setup.dif,
          onFinish: onRaceFinish, onEvent: onRaceEvent
        });
        game.touchMode = isTouch();
        game.load(tdef, entries);
        $('loadmsg').textContent = 'در حال بارگذاری هندسه…';
        $('loadbar').style.width = '62%';
        setTimeout(function () {
          game.uploadAssets();
          $('loadbar').style.width = '100%';
          raceCfg = { trackId: tdef.id };
          setTimeout(function () {
            show(null);
            $('touch').classList.toggle('hidden', !game.touchMode);
            bindTouch();
          }, 220);
        }, 30);
      } catch (e) {
        console.error(e);
        toast('خطا در ساخت مسابقه: ' + e.message, 'bad');
        show('menu');
      }
    }, 40);
  }

  function onRaceEvent(kind, data) {
    if (kind === 'lap') { audio && audio.tone(660, 0.12, 0.08, 'triangle'); }
    else if (kind === 'boost') { }
  }

  function onRaceFinish(ranking) {
    var me = ranking.filter(function (c) { return c.isPlayer; })[0] || ranking[0];
    if (!me) { show('menu'); return; }
    var myPos = ranking.indexOf(me) + 1;
    var total = ranking.length;
    var tdef = KK.TRACKS.filter(function (t) { return t.id === raceCfg.trackId; })[0];

    var base = (total - myPos + 1) * 165 * (0.75 + setup.laps * 0.12);
    var winBonus = myPos === 1 ? 650 : 0;
    var difBonus = setup.dif * 180;
    var drift = Math.round((me.driftBank || 0) / 12);
    var reward = Math.round(base + winBonus + difBonus + drift);
    P.coins += reward;

    if (me.bestLap) {
      var b = P.best[tdef.id];
      if (!b || me.bestLap < b.time) {
        P.best[tdef.id] = { time: me.bestLap, car: me.def.name };
        toast('رکورد جدید پیست! ' + fmt(me.bestLap), 'ok');
      }
    }
    saveProfile();

    // جدول
    var tb = $('r-table'); tb.innerHTML =
      '<tr><th>جایگاه</th><th>راننده</th><th>خودرو</th><th>زمان</th><th>بهترین دور</th></tr>';
    ranking.forEach(function (c, i) {
      var tr = el('tr', c.isPlayer ? 'me' : '');
      tr.appendChild(el('td', null, fa(i + 1)));
      tr.appendChild(el('td', null, c.isPlayer ? 'شما' : c.name));
      tr.appendChild(el('td', null, c.def.name));
      tr.appendChild(el('td', 't', c.finished ? fmt(c.finishTime) : 'DNF'));
      tr.appendChild(el('td', 't', fmt(c.bestLap)));
      tb.appendChild(tr);
    });
    var pod = $('r-podium'); pod.innerHTML = '';
    [1, 0, 2].forEach(function (k) {
      var c = ranking[k];
      var d = el('div', 'pod p' + (k + 1));
      d.appendChild(el('div', 'rk', fa(k + 1)));
      d.appendChild(el('div', 'nm', c ? (c.isPlayer ? 'شما' : c.name) : ''));
      pod.appendChild(d);
    });
    $('r-title').textContent = myPos === 1 ? 'برد! 🏆' : 'پایان مسابقه';
    $('r-coins').textContent = money(reward);
    show('results');
    audio && audio.ui(myPos === 1 ? 'buy' : 'ok');
  }

  /* ================================================================ لمسی */
  function isTouch() {
    return ('ontouchstart' in root) || (root.navigator && root.navigator.maxTouchPoints > 0);
  }
  var touchState = null;
  function bindTouch() {
    if (touchState || !game || !game.players.length) return;
    touchState = { up: 0, down: 0, left: 0, right: 0, hb: 0, nitro: 0 };
    game.players[0].touch = touchState;
    var btns = doc.querySelectorAll('#touch .tbtn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        var key = b.getAttribute('data-t');
        var on = function (e) { e.preventDefault(); touchState[key] = 1; };
        var off = function (e) { e.preventDefault(); touchState[key] = 0; };
        b.addEventListener('touchstart', on, { passive: false });
        b.addEventListener('touchend', off, { passive: false });
        b.addEventListener('touchcancel', off, { passive: false });
        b.addEventListener('mousedown', on);
        b.addEventListener('mouseup', off);
        b.addEventListener('mouseleave', off);
      })(btns[i]);
    }
  }

  /* ============================================================ تنظیمات */
  function renderSettings() {
    seg('set-quality', [{ v: 0, label: 'کم' }, { v: 1, label: 'متوسط' }, { v: 2, label: 'زیبا' }], P.settings.quality,
      function (v) { P.settings.quality = v; renderer.quality = [0.5, 1, 1.5][v]; renderer.resize(); saveProfile(); renderSettings(); });
    seg('set-split', [{ v: 'vertical', label: 'عمودی' }, { v: 'horizontal', label: 'افقی' }], P.settings.splitDir,
      function (v) { P.settings.splitDir = v; saveProfile(); renderSettings(); });
    seg('set-fps', [{ v: false, label: 'خاموش' }, { v: true, label: 'روشن' }], P.settings.showFps,
      function (v) { P.settings.showFps = v; saveProfile(); renderSettings(); });
    $('set-master').value = P.settings.master;
    $('set-sfx').value = P.settings.sfx;
    $('set-music').value = P.settings.music;
  }
  function applyAudio() {
    if (!audio) return;
    audio.setMaster(P.settings.master / 100);
    audio.setSfx(P.settings.sfx / 100);
    audio.setMusic(P.settings.music / 100);
  }

  /* ========================================================= حلقه‌ی اصلی */
  function frame(now) {
    root.requestAnimationFrame(frame);
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (!isFinite(dt) || dt <= 0) dt = 0.016;
    dt = Math.min(dt, 0.05);
    fpsAvg = fpsAvg * 0.92 + (1 / dt) * 0.08;

    try {
      if (curScreen === null && game && game.state !== 'done') {
        if (!game.paused) {
          game.fps = fpsAvg;
          game.step(dt);
          if (!game.draws.length) game.draws = game.buildDrawList();
          renderer.resize();
          game.layoutViewports();
          game.render();
          game.drawHUD();
        }
      } else if (curScreen === 'garage') {
        renderer.resize();
        if (showroom && showroom.car) renderShowroom(dt);
      } else {
        // پس‌زمینه‌ی ساده برای منوها
        renderer.resize();
        drawMenuBackdrop(dt);
      }
    } catch (e) {
      frame._errCount = (frame._errCount || 0) + 1;
      if (frame._errCount <= 5) console.error('[frame]', e);
    }
  }

  var _menuT = 0, _menuDraws = null;
  function drawMenuBackdrop(dt) {
    _menuT += dt;
    var cam = {
      pos: [Math.cos(_menuT * 0.12) * 16, 4.5, Math.sin(_menuT * 0.12) * 16],
      fov: 0.95
    };
    cam.view = M4.lookAt(M4.create(), cam.pos, [0, 1, 0], [0, 1, 0]);
    cam.right = [cam.view[0], cam.view[4], cam.view[8]];
    cam.up = [cam.view[1], cam.view[5], cam.view[9]];
    cam.fwd = [-cam.view[2], -cam.view[6], -cam.view[10]];
    renderer.setEnv({
      lightDir: [0.4, 0.7, 0.55], lightCol: [1.2, 1.1, 1.0],
      ambTop: [0.14, 0.18, 0.28], ambBot: [0.03, 0.04, 0.08],
      fog: [0.02, 0.03, 0.06], fogNear: 20, fogFar: 70,
      skyTop: [0.01, 0.02, 0.06], skyBot: [0.04, 0.06, 0.14], sun: [1, 0.9, 0.8],
      night: 1, cloud: 0, rock: [0.08, 0.08, 0.1], time: _menuT
    });
    if (!_menuDraws && showroom && showroom.platform) {
      var ident = M4.create();
      _menuDraws = [{ meshes: showroom.platform, model: ident }];
    }
    if (_menuDraws && showroom && showroom.car) {
      showroom.car.yaw = _menuT * 0.4;
      showroom.car.updateMatrices();
      var d = _menuDraws.slice();
      d.push({ meshes: showroom.body, model: showroom.car.model });
      for (var w = 0; w < 4; w++) {
        var m = M4.create();
        M4.multiply(m, showroom.car.model, showroom.car.wheelMat[w]);
        d.push({ meshes: showroom.wheel, model: m });
      }
      renderer.shadowN = 0;
      renderer.pushShadow(0, 0.03, 0, showroom.car.yaw, showroom.car.def.wid * 1.3, showroom.car.def.len * 1.1, 0.55);
      renderer.partN = 0;
      renderer.renderView(cam, { draws: d }, { x: 0, y: 0, w: renderer.w, h: renderer.h });
    }
  }

  /* ============================================================== راه‌اندازی */
  function wireUI() {
    var acts = {
      quick: function () {
        var pool = P.tracks.slice();
        setup.trackId = pool[(Math.random() * pool.length) | 0];
        setup.mode = 'single';
        var t = KK.TRACKS.filter(function (x) { return x.id === setup.trackId; })[0];
        setup.laps = t.laps;
        setup.ai = t.ai;
        startRace();
      },
      race: function () { setup.mode = 'single'; renderTracks(); show('tracks'); },
      garage: function () { renderGarage(); show('garage'); },
      local: function () {
        if (ownedCars().length < 2) { toast('برای دونفره حداقل به دو خودرو نیاز داری', 'bad'); show('garage'); renderGarage(); return; }
        setup.mode = 'split'; renderTracks(); show('tracks');
      },
      settings: function () { renderSettings(); show('settings'); },
      howto: function () { show('howto'); },
      back: function () {
        audio && audio.ui('back');
        if (curScreen === 'tracks' && setup.mode === 'split') show('menu');
        else if (curScreen === 'garage') { updateMenuStats(); show('menu'); }
        else show('menu');
      }
    };
    var bs = doc.querySelectorAll('[data-act]');
    for (var i = 0; i < bs.length; i++) {
      (function (b) {
        b.onclick = function () { audio && audio.ui('ok'); acts[b.getAttribute('data-act')](); };
      })(bs[i]);
    }

    $('g-buy').onclick = function () {
      var c = carDefById(garageSel);
      if (P.coins < c.price) { toast('سکه کافی نداری', 'bad'); return; }
      P.coins -= c.price; P.owned.push(c.id); saveProfile();
      audio && audio.ui('buy');
      toast(c.name + ' به گاراژ اضافه شد', 'ok');
      renderGarage();
    };
    $('g-select').onclick = function () {
      P.selected = garageSel; saveProfile(); audio && audio.ui('ok');
      toast(carDefById(garageSel).name + ' خودروی فعال توست', 'ok');
      renderGarage();
    };

    $('s-go').onclick = function () { audio && audio.ui('go'); startRace(); };

    $('r-again').onclick = function () { audio && audio.ui('ok'); startRace(); };
    $('r-garage').onclick = function () { updateMenuStats(); renderGarage(); show('garage'); };
    $('r-menu').onclick = function () { updateMenuStats(); show('menu'); };

    $('p-resume').onclick = function () { game.paused = false; show(null); $('touch').classList.toggle('hidden', !game.touchMode); };
    $('p-restart').onclick = function () { game.paused = false; startRace(); };
    $('p-quit').onclick = function () {
      game.paused = false;
      game = null; touchState = null;
      updateMenuStats();
      show('menu');
    };

    $('set-master').oninput = function () { P.settings.master = +this.value; applyAudio(); saveProfile(); };
    $('set-sfx').oninput = function () { P.settings.sfx = +this.value; applyAudio(); saveProfile(); };
    $('set-music').oninput = function () { P.settings.music = +this.value; applyAudio(); saveProfile(); };
    $('set-reset').onclick = function () {
      P = defaultProfile(); saveProfile(); applyAudio();
      toast('پیشرفت بازی پاک شد');
      updateMenuStats(); renderSettings();
    };

    doc.addEventListener('keydown', function (e) {
      if (game) game.keys[e.code] = true;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (curScreen === null && game && game.state !== 'done') { game.paused = true; show('pause'); }
        else if (curScreen === 'pause') { game.paused = false; show(null); }
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash'].indexOf(e.code) >= 0) e.preventDefault();
      // شروع با Enter در منوها
      if (e.code === 'Enter' && curScreen === 'menu') acts.quick();
    });
    doc.addEventListener('keyup', function (e) { if (game) game.keys[e.code] = false; });
    root.addEventListener('blur', function () { if (game) for (var k in game.keys) game.keys[k] = false; });

    root.addEventListener('resize', function () {
      if (renderer) renderer.resize();
      sizeHud();
    });
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden && game && curScreen === null) { game.paused = true; show('pause'); }
    });
  }

  function sizeHud() {
    var h = $('hud');
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    h.width = Math.floor(root.innerWidth * dpr);
    h.height = Math.floor(root.innerHeight * dpr);
  }

  function updateMenuStats() {
    $('m-coins').textContent = money(P.coins);
    $('m-cars').textContent = fa(P.owned.length) + '/' + fa(KK.CARS.length);
    $('m-tracks').textContent = fa(P.tracks.length) + '/' + fa(KK.TRACKS.length);
  }

  function boot() {
    P = loadProfile();
    var cv = $('gl');
    try {
      renderer = new KK.rendererModule.Renderer(cv);
    } catch (e) {
      $('loadmsg').innerHTML = 'WebGL روی این دستگاه در دسترس نیست.<br>' + e.message;
      return;
    }
    renderer.quality = [0.5, 1, 1.5][P.settings.quality] || 1;
    renderer.resize();
    sizeHud();

    audio = new KK.AudioEngine();
    applyAudio();
    var unlock = function () { audio.init(); applyAudio(); root.removeEventListener('pointerdown', unlock); root.removeEventListener('keydown', unlock); };
    root.addEventListener('pointerdown', unlock);
    root.addEventListener('keydown', unlock);

    wireUI();

    // پیش‌نمایش پیش‌فرض گاراژ
    garageSel = P.selected;
    rebuildShowroom();
    buildStage();

    $('loadbar').style.width = '100%';
    $('loadmsg').textContent = 'آماده‌ای؟';
    updateMenuStats();

    setTimeout(function () { show('menu'); lastT = performance.now(); root.requestAnimationFrame(frame); }, 550);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

  root.KK = root.KK || {};
  root.KK.app = {
    get profile() { return P; },
    get game() { return game; },
    get renderer() { return renderer; },
    startRace: startRace
  };
})(typeof window !== 'undefined' ? window : globalThis);
