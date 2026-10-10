/* ==========================================================================
   game.js  ::  منطق مسابقه، هوش مصنوعی، دوربین، ذرات و HUD
   ========================================================================== */
(function (root) {
  'use strict';
  var KK = root.KK, M4 = KK.M4;
  var clamp = KK.clamp, lerp = KK.lerp, smooth = KK.smooth, PI = KK.PI, TAU = KK.TAU;

  /* ======================================================== نقشه‌ی ورودی */
  var KEYMAPS = [
    { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], brake: ['Space'], nitro: ['ShiftLeft'], reset: ['KeyR'] },
    { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], brake: ['ShiftRight', 'Slash'], nitro: ['Enter', 'NumpadEnter', 'Numpad0'], reset: ['NumpadDecimal'] }
  ];

  function InputState() {
    this.throttle = 0; this.brake = 0; this.steer = 0;
    this.handbrake = false; this.nitro = false;
  }

  /* ========================================================================
     ذرات
     ======================================================================== */
  function Particles(max) {
    this.max = max;
    this.list = [];
  }
  Particles.prototype.emit = function (x, y, z, vx, vy, vz, life, size, col, kind) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, life: life, max: life, size: size, col: col, kind: kind || 0 });
  };
  Particles.prototype.update = function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 0) { p.vy -= 12 * dt; p.vx *= 0.98; p.vz *= 0.98; }
      else { p.vy += 2.4 * dt; p.vx *= 0.94; p.vz *= 0.94; }
    }
  };

  /* ========================================================================
     دوربین
     ======================================================================== */
  function Camera() {
    this.pos = [0, 5, -10];
    this.look = [0, 0, 0];
    this.fwd = [0, 0, 1]; this.up = [0, 1, 0]; this.right = [1, 0, 0];
    this.view = M4.create();
    this.fov = 1.05;
    this.shake = 0;
    this.dist = 7;
    this.height = 2.4;
    this.roll = 0;
  }
  var _tmp = [0, 0, 0], _tmp2 = [0, 0, 0];
  Camera.prototype.follow = function (car, dt, mode) {
    var spd = Math.abs(car.vf);
    var sf = clamp(spd / 55, 0, 1);
    var dist = (mode === 'hood' ? 0.2 : 6.0 + sf * 2.6 + car.def.len * 0.35);
    var height = (mode === 'hood' ? car.def.ht * 0.82 : 2.05 + sf * 0.55);
    var sn = Math.sin(car.yaw), cs = Math.cos(car.yaw);

    // نقطه‌ی نگاه کمی جلوتر از ماشین
    var la = 5 + spd * 0.22;
    this.look[0] = car.x + sn * la;
    this.look[1] = car.y + car.def.ht * 0.7;
    this.look[2] = car.z + cs * la;

    var tx, ty, tz;
    if (mode === 'hood') {
      tx = car.x + sn * 0.2; ty = car.y + height; tz = car.z + cs * 0.2;
    } else {
      // در دریفت دوربین کمی به بیرون می‌چرخد
      var yawCam = car.yaw - clamp(car.vl * 0.022, -0.35, 0.35);
      var s2 = Math.sin(yawCam), c2 = Math.cos(yawCam);
      tx = car.x - s2 * dist;
      tz = car.z - c2 * dist;
      ty = car.y + height;
      // برخورد با زمین
      if (this.groundH) {
        var gh = this.groundH(tx, tz);
        if (ty < gh + 1.1) ty = gh + 1.1;
      }
    }
    var k = 1 - Math.exp(-(mode === 'hood' ? 30 : 8.5) * dt);
    this.pos[0] += (tx - this.pos[0]) * k;
    this.pos[1] += (ty - this.pos[1]) * k;
    this.pos[2] += (tz - this.pos[2]) * k;

    // لرزش
    this.shake = Math.max(0, this.shake - dt * 3.2);
    if (this.shake > 0) {
      this.pos[0] += (Math.random() - 0.5) * this.shake * 0.5;
      this.pos[1] += (Math.random() - 0.5) * this.shake * 0.4;
      this.pos[2] += (Math.random() - 0.5) * this.shake * 0.5;
    }

    this.fov = 1.02 + sf * 0.20 + (car.nitroOn ? 0.10 : 0) + (car.landed || 0) * 0.12;

    M4.lookAt(this.view, this.pos, this.look, [0, 1, 0]);
    this.right[0] = this.view[0]; this.right[1] = this.view[4]; this.right[2] = this.view[8];
    this.up[0] = this.view[1]; this.up[1] = this.view[5]; this.up[2] = this.view[9];
    this.fwd[0] = -this.view[2]; this.fwd[1] = -this.view[6]; this.fwd[2] = -this.view[10];
  };
  Camera.prototype.snap = function (car, mode) {
    var sn = Math.sin(car.yaw), cs = Math.cos(car.yaw);
    if (mode === 'hood') { this.pos[0] = car.x; this.pos[1] = car.y + car.def.ht * 0.82; this.pos[2] = car.z; }
    else { this.pos[0] = car.x - sn * 7; this.pos[1] = car.y + 2.3; this.pos[2] = car.z - cs * 7; }
    this.follow(car, 0.1, mode);
  };

  /* ========================================================================
     مسابقه
     ======================================================================== */
  function Game(cfg) {
    this.cfg = cfg;
    this.renderer = cfg.renderer;
    this.audio = cfg.audio;
    this.hud = cfg.hudCanvas ? cfg.hudCanvas.getContext('2d') : null;
    this.hudCanvas = cfg.hudCanvas;
    this.settings = cfg.settings || {};
    this.keys = {};
    this.pads = [null, null];
    this.state = 'loading';
    this.countdown = 3.9;
    this.raceTime = 0;
    this.time = 0;
    this.paused = false;
    this.finishedAll = false;
    this.resultRows = [];
    this.particles = new Particles(1400);
    this.draws = [];
    this.cameras = [];
    this.viewports = [];
    this.envTime = 0;
    this.wrongWayT = 0;
    this.messages = [];
    this.onFinish = cfg.onFinish || function () { };
    this.onEvent = cfg.onEvent || function () { };
  }

  Game.prototype.load = function (trackDef, entries) {
    var i;
    this.track = new KK.trackModule.Track(trackDef);
    this.trackDef = trackDef;
    this.theme = this.track.theme;
    this.entries = entries;
    this.cars = [];
    this.players = [];

    for (i = 0; i < entries.length; i++) {
      var e = entries[i];
      var car = new KK.carModule.Car(e.carDef, { upgrades: e.upgrades || {} });
      var pose = this.track.startPose(i);
      car.reset(pose.x, pose.y + 0.1, pose.z, pose.yaw);
      car.name = e.name;
      car.isPlayer = !!e.player;
      car.colorHex = e.colorHex;
      car.index = i;
      car.aiIdx = e.aiIdx;
      car.progress = this.track.progressAt(car.x, car.z);
      car.prevProg = car.progress;
      car.aiSample = this.track.nearest(car.x, car.z);
      car.prevWheel = [null, null, null, null];
      car.wheelCur = [0, 0, 0, 0];
      this.cars.push(car);
      if (e.player) {
        var cam = new Camera();
        cam.groundH = this.track.heightAt.bind(this.track);
        cam.snap(car, this.settings.camMode || 'chase');
        this.players.push({
          car: car, cam: cam, input: new InputState(),
          keymap: KEYMAPS[e.player - 1] || KEYMAPS[0], padIdx: e.player - 1,
          viewportIndex: this.players.length
        });
        this.cameras.push(cam);
      }
    }

    // صدا
    if (this.audio) {
      this.voice0 = this.audio.makeEngineVoice(true);
      this.voice1 = this.audio.makeEngineVoice(false);
    }

    // بافت تابلوها
    if (this.renderer && this.renderer.buildDecalTexture) {
      this.renderer.buildDecalTexture(
        ['تکاور ریسینگ', trackDef.name, 'گاراژ تهران', 'نیترو ۱۰۰٪'],
        ['#101820', '#1a1030', '#0d2430', '#2a0f18']
      );
    }
    this.renderer.clearSkids();

    // محیط نور
    this.env = this.buildEnv();
    this.renderer.setEnv(this.env);

    // ویوپورت‌ها
    this.layoutViewports();
    this.state = 'countdown';
    this.countdown = 3.9;
    this.raceTime = 0;
    return this;
  };

  Game.prototype.layoutViewports = function () {
    var W = this.renderer.w, H = this.renderer.h;
    this.viewports = [];
    if (this.players.length <= 1) this.viewports.push({ x: 0, y: 0, w: W, h: H });
    else if (this.settings.splitDir === 'vertical') {
      this.viewports.push({ x: 0, y: 0, w: W / 2, h: H });
      this.viewports.push({ x: W / 2, y: 0, w: W / 2, h: H });
    } else {
      this.viewports.push({ x: 0, y: H / 2, w: W, h: H / 2 });
      this.viewports.push({ x: 0, y: 0, w: W, h: H / 2 });
    }
  };

  Game.prototype.buildEnv = function () {
    var th = this.theme;
    var el = th.sunEl === undefined ? 0.7 : th.sunEl;
    var az = th.sunAz === undefined ? 1.2 : th.sunAz;
    var dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    var l = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
    dir = [dir[0] / l, dir[1] / l, dir[2] / l];
    var sun = KK.hexToRgb(th.sun), si = th.sunIntensity;
    var hex = function (h) { return KK.hexToRgb(h); };
    return {
      lightDir: dir,
      lightCol: [sun[0] * si, sun[1] * si, sun[2] * si],
      ambTop: hex(th.ambientTop), ambBot: hex(th.ambientBot),
      fog: hex(th.fog), fogNear: th.fogNear, fogFar: th.fogFar,
      skyTop: hex(th.skyTop), skyBot: hex(th.skyBot), sun: sun,
      night: th.night ? 1 : 0,
      cloud: th.weather === 'rain' ? 0.95 : th.weather === 'snow' ? 0.8 : 0.35,
      rock: hex(th.rockTint),
      time: 0
    };
  };

  /* ------------------------------------------------------------ ورودی */
  Game.prototype.readInput = function (p, dt) {
    var inp = p.input, km = p.keymap, k = this.keys, i, j;
    var thr = 0, brk = 0, st = 0;
    for (i = 0; i < km.up.length; i++) if (k[km.up[i]]) thr = 1;
    for (i = 0; i < km.down.length; i++) if (k[km.down[i]]) brk = 1;
    for (i = 0; i < km.left.length; i++) if (k[km.left[i]]) st -= 1;
    for (i = 0; i < km.right.length; i++) if (k[km.right[i]]) st += 1;
    var hb = false, ni = false;
    for (i = 0; i < km.brake.length; i++) if (k[km.brake[i]]) hb = true;
    for (i = 0; i < km.nitro.length; i++) if (k[km.nitro[i]]) ni = true;

    // دسته‌ی بازی
    if (root.navigator && root.navigator.getGamepads) {
      var gp = root.navigator.getGamepads()[p.padIdx];
      if (gp && gp.connected) {
        var ax = gp.axes[0] || 0;
        if (Math.abs(ax) > 0.16) st = ax;
        var t = gp.buttons[7] ? gp.buttons[7].value : 0;
        var b = gp.buttons[6] ? gp.buttons[6].value : 0;
        if (t > 0.05) thr = Math.max(thr, t);
        if (b > 0.05) brk = Math.max(brk, b);
        if (gp.buttons[0] && gp.buttons[0].pressed) hb = true;
        if (gp.buttons[1] && gp.buttons[1].pressed) ni = true;
        if (gp.buttons[2] && gp.buttons[2].pressed) hb = true;
      }
    }
    // لمسی
    if (p.touch) {
      var t2 = p.touch;
      if (t2.up) thr = 1;
      if (t2.down) brk = 1;
      if (t2.left) st = -1;
      if (t2.right) st = 1;
      if (t2.hb) hb = true;
      if (t2.nitro) ni = true;
    }

    inp.throttle = thr; inp.brake = brk; inp.steer = clamp(st, -1, 1);
    inp.handbrake = hb; inp.nitro = ni;
    return inp;
  };

  /* --------------------------------------------------- هوش مصنوعی */
  Game.prototype.updateAI = function (car, dt) {
    var tr = this.track, N = tr.N, S = tr.samples;
    var drv = KK.DRIVERS[car.aiIdx % KK.DRIVERS.length];
    var skill = drv.skill * (0.86 + this.cfg.difficulty * 0.14);
    var spd = Math.abs(car.vf);

    // نمونه‌ی فعلی را جلو می‌بریم (ارزان‌تر از جست‌وجوی کامل)
    var pr = tr.project(car.x, car.z, car.aiSample);
    car.aiSample = pr.i;
    car.aiT = pr.t;

    var halfW = tr.halfW(pr.i);
    var offRoad = Math.abs(pr.t) > halfW;

    // فاصله‌ی نگاه به جلو بر حسب سرعت
    var look = Math.round(clamp(4 + spd * 0.85, 5, 46));
    var ti = (pr.i + look) % N;
    var tgt = tr.linePoint(ti, _tmp);

    // اگر از پیست بیرون رفت، مستقیم به مرکز برگرد
    if (offRoad) {
      var c = S[pr.i];
      tgt[0] = c.x; tgt[1] = c.y; tgt[2] = c.z;
    }

    // پرهیز از خودروی جلویی
    var avoid = 0;
    for (var i = 0; i < this.cars.length; i++) {
      var o = this.cars[i];
      if (o === car) continue;
      var dx = o.x - car.x, dz = o.z - car.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > 14) continue;
      var rel = Math.atan2(dx, dz);
      var diff = KK.angDiff(car.yaw, rel);
      if (Math.abs(diff) < 0.55) {
        // کمی به کنار بپیچ
        avoid += (diff > 0 ? -1 : 1) * (1 - d / 14) * 0.55;
        if (d < 8 && spd > 12) car.aiBrakeExtra = 0.5;
      }
    }

    var want = Math.atan2(tgt[0] - car.x, tgt[2] - car.z);
    var err = KK.angDiff(car.yaw, want) + avoid * 0.3;
    var steer = clamp(err * 2.6, -1, 1);

    // سرعت مجاز در پیچ پیش رو
    var kMax = 0;
    for (var j = 6; j < look + 10; j += 3) {
      var idx = (pr.i + j) % N;
      kMax = Math.max(kMax, Math.abs(S[idx].k));
    }
    var mu = car.muBase * 0.92;
    var vLimit = kMax > 0.0006 ? Math.sqrt(mu * 9.81 / kMax) * (0.72 + skill * 0.34) : 999;
    vLimit = Math.min(vLimit, car.topSpeed * (0.80 + skill * 0.22));
    if (offRoad) vLimit = Math.min(vLimit, 16);

    var thr = 1, brk = 0;
    if (spd > vLimit * 1.02) { thr = 0; brk = clamp((spd - vLimit) / 12, 0.15, 1) * (0.55 + skill * 0.45); }
    else if (spd > vLimit * 0.86) thr = 0.45;

    var hb = false;
    if (skill > 0.9 && spd > 22 && Math.abs(err) > 0.42 && drv.aggr > 0.7) hb = true;

    // لاستیک‌بندی نرم: اگر از بازیکن خیلی عقب است کمی سریع‌تر
    var rub = 0;
    if (this.humanRef) {
      var gap = (this.humanRef.lap + this.humanRef.progress) - (car.lap + car.progress);
      rub = clamp(gap * 0.10, -0.10, 0.14);
    }
    thr = clamp(thr + rub, 0, 1);

    var nitro = car.nitro > 30 && kMax < 0.0022 && spd > 18 && Math.random() < 0.05 * dt * 60;
    if (car.aiNitro === undefined) car.aiNitro = false;
    if (nitro) car.aiNitro = true;
    if (car.aiNitro && (kMax > 0.004 || car.nitro < 5)) car.aiNitro = false;

    car.aiInput = car.aiInput || new InputState();
    car.aiInput.steer = steer;
    car.aiInput.throttle = thr;
    car.aiInput.brake = Math.max(brk, car.aiBrakeExtra || 0);
    car.aiInput.handbrake = hb;
    car.aiInput.nitro = car.aiNitro;
    car.aiBrakeExtra = 0;
    return car.aiInput;
  };

  /* --------------------------------------------------- برخورد و دیوار */
  var _wp = [0, 0, 0];
  Game.prototype.collide = function (dt) {
    var cars = this.cars, i, j, tr = this.track;
    for (i = 0; i < cars.length; i++) {
      var a = cars[i];
      for (j = i + 1; j < cars.length; j++) {
        var b = cars[j];
        var dx = b.x - a.x, dz = b.z - a.z;
        var d2 = dx * dx + dz * dz;
        var rr = a.radius + b.radius;
        if (d2 > rr * rr || d2 < 1e-6) continue;
        var d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        var pen = rr - d;
        var ma = a.mass, mb = b.mass, tot = ma + mb;
        a.x -= nx * pen * (mb / tot) * 0.7; a.z -= nz * pen * (mb / tot) * 0.7;
        b.x += nx * pen * (ma / tot) * 0.7; b.z += nz * pen * (ma / tot) * 0.7;
        var rvx = (b.vf * Math.sin(b.yaw) + b.vl * Math.cos(b.yaw)) - (a.vf * Math.sin(a.yaw) + a.vl * Math.cos(a.yaw));
        var rvz = (b.vf * Math.cos(b.yaw) - b.vl * Math.sin(b.yaw)) - (a.vf * Math.cos(a.yaw) - a.vl * Math.sin(a.yaw));
        var vn = rvx * nx + rvz * nz;
        if (vn > 0) continue;
        var imp = -(1.35) * vn / (1 / ma + 1 / mb);
        var sn = Math.sin(a.yaw), cs = Math.cos(a.yaw);
        var fx = -nx * imp, fz = -nz * imp;
        a.vf += (fx * sn + fz * cs) / ma;
        a.vl += (fx * cs - fz * sn) / ma;
        a.yawRate += (Math.random() - 0.5) * 0.5;
        sn = Math.sin(b.yaw); cs = Math.cos(b.yaw);
        b.vf -= (fx * sn + fz * cs) / mb;
        b.vl -= (fx * cs - fz * sn) / mb;
        b.yawRate += (Math.random() - 0.5) * 0.5;
        var force = Math.min(1, Math.abs(vn) / 14);
        if (force > 0.12) {
          this.audio && this.audio.impact(force * 0.8);
          if (a.isPlayer || b.isPlayer) {
            var pc = a.isPlayer ? a : b;
            this.shakeFor(pc, force * 0.7);
          }
          for (var q = 0; q < 6; q++) {
            this.particles.emit((a.x + b.x) / 2, a.y + 0.6, (a.z + b.z) / 2,
              (Math.random() - 0.5) * 7, Math.random() * 4, (Math.random() - 0.5) * 7,
              0.35 + Math.random() * 0.3, 0.06, [1, 0.75, 0.3], 0);
          }
          if (this.settings.damage !== false) {
            a.damage = Math.min(100, a.damage + force * 6);
            b.damage = Math.min(100, b.damage + force * 6);
          }
        }
      }
    }
    // دیوار گاردریل
    for (i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c.airborne) continue;
      var p = tr.project(c.x, c.z);
      var hw = tr.halfW(p.i) + 3.1;
      if (Math.abs(p.t) > hw) {
        var s = tr.samples[p.i];
        var sg = p.t > 0 ? 1 : -1;
        var push = (Math.abs(p.t) - hw);
        c.x -= s.lx * sg * push;
        c.z -= s.lz * sg * push;
        var sn2 = Math.sin(c.yaw), cs2 = Math.cos(c.yaw);
        var vx = c.vf * sn2 + c.vl * cs2, vz = c.vf * cs2 - c.vl * sn2;
        var wallNx = -s.lx * sg, wallNz = -s.lz * sg;
        var vn2 = vx * wallNx + vz * wallNz;
        if (vn2 < 0) {
          vx -= wallNx * vn2 * 1.5; vz -= wallNz * vn2 * 1.5;
          c.vf = vx * sn2 + vz * cs2;
          c.vl = vx * cs2 - vz * sn2;
          c.vf *= 0.86;
          var f2 = Math.min(1, Math.abs(vn2) / 12);
          if (f2 > 0.1) {
            this.audio && this.audio.impact(f2 * 0.6);
            if (c.isPlayer) this.shakeFor(c, f2 * 0.8);
            if (this.settings.damage !== false) c.damage = Math.min(100, c.damage + f2 * 5);
            for (var q2 = 0; q2 < 5; q2++) {
              this.particles.emit(c.x, c.y + 0.7, c.z,
                (Math.random() - 0.5) * 6, Math.random() * 3.5, (Math.random() - 0.5) * 6,
                0.3, 0.05, [1, 0.85, 0.45], 0);
            }
          }
        }
      }
    }
  };

  Game.prototype.shakeFor = function (car, amount) {
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].car === car) this.players[i].cam.shake = Math.max(this.players[i].cam.shake, amount);
    }
  };

  /* --------------------------------------------------------- دور و رتبه */
  Game.prototype.updateProgress = function (car, dt) {
    var p = this.track.progressAt(car.x, car.z, car.aiSample);
    var d = p - car.prevProg;
    if (d < -0.5) {
      car.lap++;
      var lt = car.totalTime - (car.lapStart || 0);
      car.lapStart = car.totalTime;
      car.lapTimes.push(lt);
      if (!car.bestLap || lt < car.bestLap) car.bestLap = lt;
      if (car.lap >= this.cfg.laps && !car.finished) {
        car.finished = true;
        car.finishTime = car.totalTime;
        car.finalPos = this.ranking().indexOf(car) + 1;
        this.onEvent('finish', car);
      } else if (car.isPlayer) {
        this.onEvent('lap', car);
      }
    } else if (d > 0.5) {
      car.lap = Math.max(0, car.lap - 1);
    }
    car.prevProg = p;
    car.progress = p;
  };

  Game.prototype.ranking = function () {
    var arr = this.cars.slice();
    arr.sort(function (a, b) {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return (b.lap + b.progress) - (a.lap + a.progress);
    });
    return arr;
  };

  /* ------------------------------------------------------------- ذرات */
  var _cw = [0, 0, 0];
  Game.prototype.effects = function (dt, car) {
    var i;
    // دود لاستیک و جای ترمز
    var slipping = Math.abs(car.slip) > 0.18 && Math.abs(car.vf) > 6;
    var skidsOn = this.renderer.enableSkid !== false;
    for (i = 2; i < 4; i++) {
      car.worldWheelPos(i, _cw);
      var prev = car.prevWheel[i];
      if (slipping && car.onRoad && skidsOn) {
        if (prev) this.renderer.addSkid(prev[0], prev[1], _cw[0], _cw[2], car.y + 0.025, car.def.ww * 0.95,
          clamp(Math.abs(car.slip) * 1.6, 0.15, 0.75));
        if (Math.random() < 0.6) {
          this.particles.emit(_cw[0], _cw[1], _cw[2],
            (Math.random() - 0.5) * 1.4, 0.7 + Math.random(), (Math.random() - 0.5) * 1.4,
            0.7 + Math.random() * 0.5, 0.9 + Math.random(), [0.72, 0.72, 0.74], 1);
        }
      }
      if (!car.onRoad && Math.abs(car.vf) > 5 && Math.random() < 0.5) {
        var th = this.theme;
        var col = th.weather === 'snow' ? [0.92, 0.95, 1] : th.dunes ? [0.78, 0.62, 0.36] : [0.42, 0.36, 0.26];
        this.particles.emit(_cw[0], _cw[1] - 0.1, _cw[2],
          (Math.random() - 0.5) * 2.5, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 2.5,
          0.5 + Math.random() * 0.5, 0.7 + Math.random() * 0.8, col, 1);
      }
      car.prevWheel[i] = prev || [0, 0, 0];
      car.prevWheel[i][0] = _cw[0]; car.prevWheel[i][1] = _cw[1]; car.prevWheel[i][2] = _cw[2];
    }
    // شعله‌ی نیترو
    if (car.nitroOn) {
      var sn = Math.sin(car.yaw), cs = Math.cos(car.yaw);
      var ex = car.x - sn * car.def.len * 0.5, ez = car.z - cs * car.def.len * 0.5;
      for (i = 0; i < 2; i++) {
        this.particles.emit(ex, car.y + 0.35, ez,
          -sn * 6 + (Math.random() - 0.5) * 2, 0.4 + Math.random(), -cs * 6 + (Math.random() - 0.5) * 2,
          0.22, 0.55, [0.35 + Math.random() * 0.4, 0.6, 1], 1);
      }
    }
    // دود اگزوز
    if (Math.random() < 0.06 * (this.renderer.partScale || 1) && Math.abs(car.vf) > 2) {
      var sn3 = Math.sin(car.yaw), cs3 = Math.cos(car.yaw);
      this.particles.emit(car.x - sn3 * car.def.len * 0.5, car.y + 0.3, car.z - cs3 * car.def.len * 0.5,
        (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.5, 0.3, [0.5, 0.5, 0.52], 1);
    }
    // دود خرابی موتور (آسیب بالا) — سیاه از کاپوت
    if (car.damage > 55 && Math.random() < 0.5 * (this.renderer.partScale || 1)) {
      var sn4 = Math.sin(car.yaw), cs4 = Math.cos(car.yaw);
      var heavy = car.damage > 80;
      this.particles.emit(car.x + sn4 * car.def.len * 0.3, car.y + car.def.ht * 0.7, car.z + cs4 * car.def.len * 0.3,
        (Math.random() - 0.5), 1.4 + Math.random() * 1.5, (Math.random() - 0.5),
        0.6 + Math.random() * 0.5, heavy ? 1.2 : 0.8,
        heavy ? [0.16, 0.16, 0.17] : [0.45, 0.45, 0.47], 1);
    }
  };

  Game.prototype.weatherParticles = function (cam) {
    var th = this.theme;
    if (th.weather !== 'rain' && th.weather !== 'snow' && th.weather !== 'sand' && th.weather !== 'petals' && th.weather !== 'leaves') return;
    var n = Math.round((th.weather === 'rain' ? 320 : 150) * (this.renderer.weatherScale || 1));
    var R = 42;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, r = Math.random() * R;
      var x = cam.pos[0] + Math.cos(a) * r;
      var z = cam.pos[2] + Math.sin(a) * r;
      var y = cam.pos[1] - 12 + Math.random() * 30;
      if (th.weather === 'rain') {
        this.renderer.pushParticle(x, y, z, 0.62, 0.75, 0.9, 0.35, 0.055);
      } else if (th.weather === 'snow') {
        this.renderer.pushParticle(x, y, z, 0.95, 0.97, 1, 0.7, 0.10);
      } else if (th.weather === 'sand') {
        this.renderer.pushParticle(x, y * 0.4 + cam.pos[1] * 0.2, z, 0.82, 0.66, 0.40, 0.30, 0.14);
      } else if (th.weather === 'petals') {
        this.renderer.pushParticle(x, y, z, 1, 0.85, 0.92, 0.6, 0.09);
      } else {
        this.renderer.pushParticle(x, y, z, 0.85, 0.45, 0.15, 0.6, 0.11);
      }
    }
  };

  /* --------------------------------------------------------- گام اصلی */
  Game.prototype.step = function (dt) {
    var i, p;
    this.time += dt;
    this.envTime += dt;
    this.env.time = this.envTime;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      var ci = Math.ceil(this.countdown - 0.4);
      if (ci !== this.lastBeep && ci >= 0 && ci <= 3) {
        this.lastBeep = ci;
        if (ci > 0) this.audio && this.audio.ui('count');
        else this.audio && this.audio.ui('go');
      }
      if (this.countdown <= 0) { this.state = 'racing'; }
      for (i = 0; i < this.cars.length; i++) {
        var c0 = this.cars[i];
        c0.step(dt, this.track, { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false });
        c0.updateMatrices();
      }
      this.updateCameras(dt);
      return;
    }

    if (this.state !== 'racing' && this.state !== 'finished') return;
    this.raceTime += dt;

    // ورودی‌ها (یا خودران)
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      if (this.settings.autopilot) {
        p.car.aiIdx = p.car.aiIdx === undefined ? 2 : p.car.aiIdx;
        var ap = this.updateAI(p.car, dt);
        p.input.steer = ap.steer; p.input.throttle = ap.throttle; p.input.brake = ap.brake;
        p.input.handbrake = ap.handbrake; p.input.nitro = ap.nitro;
        p.autopilot = true;
      } else {
        this.readInput(p, dt);
        p.autopilot = false;
      }
    }
    for (i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      if (car.isPlayer) continue;
      if (car.finished) {
        car.aiInput = car.aiInput || new InputState();
        car.aiInput.throttle = 0.18; car.aiInput.brake = 0; car.aiInput.nitro = false;
        car.aiInput.handbrake = false;
        car.aiInput.steer = this.updateAI(car, dt).steer * 0.5;
      } else {
        this.updateAI(car, dt);
      }
    }

    // زیرگام‌های فیزیک
    var SUB = 3, sdt = dt / SUB;
    for (var s = 0; s < SUB; s++) {
      for (i = 0; i < this.cars.length; i++) {
        var c = this.cars[i];
        var inp;
        if (c.isPlayer) {
          var pl = this.playerOf(c);
          inp = pl ? pl.input : null;
        } else inp = c.aiInput;
        var before = c.gear;
        var res = c.step(sdt, this.track, inp);
        if (c.gear !== before && c.isPlayer && Math.abs(c.vf) > 4) this.audio && this.audio.gearShift();
        if (res && res.drifting) c.driftActive = true; else c.driftActive = false;
      }
      this.collide(sdt);
    }

    // پد شتاب، رمپ، پیشرفت
    for (i = 0; i < this.cars.length; i++) {
      var cc = this.cars[i];
      cc.updateMatrices();
      for (var bp = 0; bp < this.track.boostPads.length; bp++) {
        var pad = this.track.boostPads[bp];
        var ddx = cc.x - pad.x, ddz = cc.z - pad.z;
        if (ddx * ddx + ddz * ddz < pad.r * pad.r && cc.boostPad <= 0) {
          cc.boostPad = 0.55;
          if (cc.isPlayer) { this.shakeFor(cc, 0.25); this.onEvent('boost', cc); }
          this.audio && this.audio.nitro();
        }
      }
      for (var rp = 0; rp < this.track.ramps.length; rp++) {
        var rm = this.track.ramps[rp];
        var rdx = cc.x - rm.x, rdz = cc.z - rm.z;
        if (rdx * rdx + rdz * rdz < 20 && !cc.airborne && Math.abs(cc.vf) > 12) {
          cc.airborne = true;
          cc.vy = clamp(Math.abs(cc.vf) * 0.28, 3, 11);
          if (cc.isPlayer) this.onEvent('jump', cc);
        }
      }
      this.updateProgress(cc, dt);
      this.effects(dt, cc);
    }

    // مسیر اشتباه
    var human = this.players.length ? this.players[0].car : null;
    this.humanRef = human;
    if (human) {
      var smp = this.track.samples[human.aiSample || 0];
      var dot = Math.sin(human.yaw) * smp.tx + Math.cos(human.yaw) * smp.tz;
      if (dot < -0.2 && Math.abs(human.vf) > 4) this.wrongWayT = Math.min(3, this.wrongWayT + dt * 2.5);
      else this.wrongWayT = Math.max(0, this.wrongWayT - dt * 2);
    }

    this.particles.update(dt);
    this.updateCameras(dt);
    this.updateAudio(dt);

    // پایان مسابقه
    if (this.state === 'racing') {
      var allHumanDone = true;
      for (i = 0; i < this.players.length; i++) if (!this.players[i].car.finished) allHumanDone = false;
      var timeUp = this.raceTime > (this.cfg.laps * 260);
      if ((allHumanDone && this.players.length) || timeUp) {
        this.state = 'finished';
        this.finishTimer = 3.2;
        this.audio && this.audio.stopMusic();
        this.onEvent('raceEnd', this.ranking());
      }
    } else if (this.state === 'finished') {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) {
        this.onFinish(this.ranking());
        this.state = 'done';
      }
    }
  };

  Game.prototype.playerOf = function (car) {
    for (var i = 0; i < this.players.length; i++) if (this.players[i].car === car) return this.players[i];
    return null;
  };

  Game.prototype.updateCameras = function (dt) {
    var mode = this.settings.camMode || 'chase';
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.cam.follow(p.car, dt, mode);
    }
  };

  Game.prototype.updateAudio = function (dt) {
    if (!this.audio) return;
    var p0 = this.players[0];
    if (p0 && this.voice0) {
      var c = p0.car;
      this.voice0.update(c.rpm, c.throttle, !c.finished, 0);
      this.audio.screech(this.voice0, clamp(Math.abs(c.slip) * 2, 0, 1));
    }
    // نزدیک‌ترین رقیب
    if (p0) {
      var best = null, bd = 1e9;
      for (var i = 0; i < this.cars.length; i++) {
        var o = this.cars[i];
        if (o.isPlayer) continue;
        var d = (o.x - p0.car.x) * (o.x - p0.car.x) + (o.z - p0.car.z) * (o.z - p0.car.z);
        if (d < bd) { bd = d; best = o; }
      }
      if (best && this.voice1) this.voice1.update(best.rpm, best.throttle, !best.finished, Math.sqrt(bd));
    }
  };

  /* ------------------------------------------------------- فهرست رندر */
  var _ident = null;
  Game.prototype.buildDrawList = function () {
    if (!_ident) _ident = M4.create();
    var d = [];
    d.push({ meshes: this._roadMeshes, model: _ident });
    d.push({ meshes: this._propMeshes, model: _ident });
    if (this._decalMeshes && this._decalMeshes.length) d.push({ meshes: this._decalMeshes, model: _ident, tex: true });
    var m = new Float32Array(16), wm = new Float32Array(16);
    for (var i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      var cm = M4.create();
      for (var q = 0; q < 16; q++) cm[q] = car.model[q];
      d.push({ meshes: this._carMeshes[car.def.id].body, model: cm });
      for (var w = 0; w < 4; w++) {
        var wmm = M4.create();
        M4.multiply(wmm, car.model, car.wheelMat[w]);
        d.push({ meshes: this._carMeshes[car.def.id].wheel, model: wmm });
      }
    }
    return d;
  };

  Game.prototype.uploadAssets = function () {
    var R = this.renderer, i;
    this._roadMeshes = R.upload(this.track.roadMesh);
    this._propMeshes = R.upload(this.track.propMesh);
    this._decalMeshes = R.upload(this.track.decalMesh);
    this._carMeshes = {};
    for (i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      if (this._carMeshes[car.def.id]) continue;
      this._carMeshes[car.def.id] = {
        body: R.upload(car.geo.mesh),
        wheel: R.upload(car.wheelMesh)
      };
    }
  };

  Game.prototype.render = function () {
    var R = this.renderer;
    var draws = this.draws;
    for (var v = 0; v < this.players.length; v++) {
      var vp = this.viewports[v];
      if (!vp) continue;
      var cam = this.players[v].cam;

      // سایه‌ها و نور افکن
      R.shadowN = 0;
      if (R.enableShadow !== false) {
        for (var i = 0; i < this.cars.length; i++) {
          var c = this.cars[i];
          R.pushShadow(c.x, c.y + 0.035, c.z, c.yaw, c.def.wid * 1.28, c.def.len * 1.06, 0.42);
        }
      }
      if (this.theme.night && R.enableHeadlight !== false) {
        for (i = 0; i < this.cars.length; i++) {
          var c2 = this.cars[i];
          R.pushHeadlight(c2.x, c2.y + 0.05, c2.z, c2.yaw, 22, 3.4, 0.16, [1, 0.93, 0.72]);
        }
      }
      // ذرات
      R.partN = 0;
      var ps = this.particles.list;
      for (i = 0; i < ps.length; i++) {
        var p = ps[i];
        var t = p.life / p.max;
        R.pushParticle(p.x, p.y, p.z, p.col[0], p.col[1], p.col[2], t * 0.75, p.size * (0.5 + t));
      }
      this.weatherParticles(cam);

      R.renderView(cam, { draws: draws }, vp);
    }
  };

  /* ================================================================ HUD */
  Game.prototype.drawHUD = function () {
    var ctx = this.hud;
    if (!ctx) return;
    var cv = this.hudCanvas;
    var W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    var dpr = W / Math.max(1, cv.clientWidth);
    var n = this.players.length;
    for (var i = 0; i < n; i++) {
      var vp = this.viewports[i];
      if (!vp) continue;
      this.drawPlayerHUD(ctx, this.players[i], i, vp, W, H);
    }
    if (n > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      if (this.settings.splitDir === 'vertical') ctx.fillRect(W / 2 - 2, 0, 4, H);
      else ctx.fillRect(0, H / 2 - 2, W, 4);
    }
    if (this.state === 'countdown') this.drawCountdown(ctx, W, H);
    if (this.state === 'finished') this.drawFinishBanner(ctx, W, H);
  };

  Game.prototype.drawCountdown = function (ctx, W, H) {
    var n = Math.ceil(this.countdown - 0.4);
    var txt = n > 0 ? String(n) : 'حرکت!';
    var frac = 1 - ((this.countdown - 0.4) - Math.floor(this.countdown - 0.4));
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.round(H * 0.22) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.globalAlpha = clamp(frac * 1.6, 0, 1);
    ctx.fillStyle = n > 0 ? '#ffd24a' : '#00e5a0';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 24;
    ctx.fillText(txt, W / 2, H * 0.40);
    ctx.restore();
  };

  Game.prototype.drawFinishBanner = function (ctx, W, H) {
    var car = this.players[0].car;
    var rank = this.ranking().indexOf(car) + 1;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H * 0.30, W, H * 0.22);
    ctx.font = 'bold ' + Math.round(H * 0.09) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('پایان مسابقه — جایگاه ' + this.faNum(rank), W / 2, H * 0.41);
    ctx.restore();
  };

  Game.prototype.faNum = function (n) {
    var s = String(n), o = '';
    for (var i = 0; i < s.length; i++) o += '۰۱۲۳۴۵۶۷۸۹'[+s[i]] !== undefined && /\d/.test(s[i]) ? '۰۱۲۳۴۵۶۷۸۹'[+s[i]] : s[i];
    return o;
  };

  Game.prototype.fmtTime = function (t) {
    if (t === null || t === undefined || !isFinite(t)) return '--:--.--';
    var m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  };

  Game.prototype.drawPlayerHUD = function (ctx, p, idx, vp, W, H) {
    var car = p.car;
    var scale = Math.min(vp.w / 900, vp.h / 520);
    scale = clamp(scale, 0.55, 1.6);
    var cx = vp.x, cy = vp.y, cw = vp.w, ch = vp.h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cw, ch);
    ctx.clip();
    ctx.translate(cx, cy);

    var rank = this.ranking().indexOf(car) + 1;
    var total = this.cars.length;

    /* --- بالا راست: جایگاه و دور --- */
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    var bx = cw - 14 * scale, by = 12 * scale;
    ctx.fillStyle = 'rgba(8,12,18,0.62)';
    this.roundRect(ctx, bx - 178 * scale, by - 4 * scale, 178 * scale, 62 * scale, 10 * scale);
    ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold ' + Math.round(34 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(this.faNum(rank), bx - 8 * scale, by + 2 * scale);
    ctx.fillStyle = '#9fb0c0';
    ctx.font = Math.round(14 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText('از ' + this.faNum(total), bx - 46 * scale, by + 18 * scale);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.round(20 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText('دور ' + this.faNum(Math.min(car.lap + 1, this.cfg.laps)) + '/' + this.faNum(this.cfg.laps), bx - 8 * scale, by + 30 * scale);

    /* --- بالا چپ: زمان‌ها --- */
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(8,12,18,0.62)';
    this.roundRect(ctx, 14 * scale, by - 4 * scale, 190 * scale, 62 * scale, 10 * scale);
    ctx.fill();
    ctx.fillStyle = '#8fe9ff';
    ctx.font = 'bold ' + Math.round(20 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(this.fmtTime(car.totalTime - (car.lapStart || 0)), 24 * scale, by + 2 * scale);
    ctx.fillStyle = '#9fb0c0';
    ctx.font = Math.round(13 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText('بهترین دور: ' + this.fmtTime(car.bestLap), 24 * scale, by + 28 * scale);
    if (this.settings.showFps) {
      ctx.fillStyle = '#5f7080';
      ctx.fillText((this.fps | 0) + ' FPS', 24 * scale, by + 45 * scale);
    }

    /* --- نقشه (پایین راست) --- */
    this.drawMinimap(ctx, car, cw - 150 * scale, ch - 150 * scale, 132 * scale);

    /* --- سرعت‌سنج (پایین چپ) --- */
    this.drawSpeedo(ctx, car, 118 * scale, ch - 104 * scale, 82 * scale);

    /* --- نیترو --- */
    var nx = 14 * scale, ny = ch - 34 * scale, nw = 190 * scale, nh = 15 * scale;
    ctx.fillStyle = 'rgba(8,12,18,0.6)';
    this.roundRect(ctx, nx - 4 * scale, ny - 4 * scale, nw + 8 * scale, nh + 8 * scale, 7 * scale);
    ctx.fill();
    var frac = clamp(car.nitro / car.nitroMax, 0, 1);
    var grd = ctx.createLinearGradient(nx, 0, nx + nw, 0);
    grd.addColorStop(0, '#00b3ff'); grd.addColorStop(1, '#00ffa3');
    ctx.fillStyle = grd;
    this.roundRect(ctx, nx, ny, nw * frac, nh, 5 * scale);
    ctx.fill();
    ctx.fillStyle = '#cfe6f5';
    ctx.font = Math.round(11 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('نیترو', nx, ny - 6 * scale);

    /* --- امتیاز دریفت --- */
    if (car.driftTimer > 0.25 && car.driftScore > 10) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + Math.round(30 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.fillStyle = 'rgba(255,180,60,' + clamp(0.5 + Math.sin(this.time * 12) * 0.3, 0, 1) + ')';
      ctx.fillText('دریفت! ' + this.faNum(Math.round(car.driftScore)), cw / 2, ch * 0.24);
    }

    /* --- مسیر اشتباه --- */
    if (this.wrongWayT > 0.5 && idx === 0) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + Math.round(34 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.fillStyle = 'rgba(255,60,60,' + (0.5 + Math.sin(this.time * 10) * 0.5) + ')';
      ctx.fillText('⟵ مسیر اشتباه ⟶', cw / 2, ch * 0.16);
    }

    /* --- نشان خودران --- */
    if (p.autopilot) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,255,163,0.85)';
      this.roundRect(ctx, 14 * scale, 12 * scale, 96 * scale, 24 * scale, 8 * scale);
      ctx.fill();
      ctx.fillStyle = '#03130c';
      ctx.font = 'bold ' + Math.round(14 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('خودران فعال', 14 * scale + 48 * scale, 16 * scale);
    }

    /* --- برچسب بازیکن در حالت دو نفره --- */
    if (this.players.length > 1) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = idx === 0 ? 'rgba(0,180,255,0.85)' : 'rgba(255,90,180,0.85)';
      this.roundRect(ctx, cw / 2 - 62 * scale, 8 * scale, 124 * scale, 26 * scale, 8 * scale);
      ctx.fill();
      ctx.fillStyle = '#05101a';
      ctx.font = 'bold ' + Math.round(16 * scale) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('بازیکن ' + this.faNum(idx + 1) + ' — ' + car.name, cw / 2, 12 * scale);
    }
    ctx.restore();
  };

  Game.prototype.roundRect = function (ctx, x, y, w, h, r) {
    if (w < 0) { x += w; w = -w; }
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  Game.prototype.drawSpeedo = function (ctx, car, cx, cy, r) {
    var spd = car.speedKmh();
    var max = Math.max(180, Math.ceil(car.topSpeed * 3.6 / 20) * 20);
    var a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,18,0.62)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = r * 0.10;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.80, a0, a1); ctx.stroke();
    var f = clamp(spd / max, 0, 1);
    var grd = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grd.addColorStop(0, '#00e5a0'); grd.addColorStop(0.6, '#ffd24a'); grd.addColorStop(1, '#ff3040');
    ctx.strokeStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.80, a0, a0 + (a1 - a0) * f); ctx.stroke();
    // درجه‌ها
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    for (var i = 0; i <= 8; i++) {
      var a = a0 + (a1 - a0) * (i / 8);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66);
      ctx.lineTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
      ctx.stroke();
    }
    // دور موتور
    var rpmF = clamp((car.rpm - 900) / 7600, 0, 1);
    ctx.strokeStyle = rpmF > 0.86 ? '#ff3040' : 'rgba(140,200,255,0.75)';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.60, a0, a0 + (a1 - a0) * rpmF); ctx.stroke();
    // عقربه
    var na = a0 + (a1 - a0) * f;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * r * 0.62, cy + Math.sin(na) * r * 0.62);
    ctx.stroke();
    // عدد
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.round(r * 0.46) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(this.faNum(Math.round(spd)), cx, cy + r * 0.20);
    ctx.fillStyle = '#8fa4b8';
    ctx.font = Math.round(r * 0.17) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText('km/h', cx, cy + r * 0.48);
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold ' + Math.round(r * 0.24) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(this.faNum(car.gear), cx, cy - r * 0.30);
    ctx.restore();
  };

  Game.prototype.drawMinimap = function (ctx, focus, x, y, size) {
    var tr = this.track, S = tr.samples, N = tr.N;
    var b = tr.bounds;
    var w = b.maxX - b.minX, h = b.maxZ - b.minZ;
    var sc = size / Math.max(w, h) * 0.88;
    var ox = x + size / 2 - (b.minX + w / 2) * sc;
    var oy = y + size / 2 - (b.minZ + h / 2) * sc;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,18,0.58)';
    this.roundRect(ctx, x - 6, y - 6, size + 12, size + 12, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(2.5, size * 0.035);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i <= N; i += 2) {
      var s = S[i % N];
      var px = ox + s.x * sc, py = oy + s.z * sc;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    // خط شروع
    var s0 = S[0];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ox + s0.x * sc, oy + s0.z * sc, 3.5, 0, TAU);
    ctx.fill();
    // ماشین‌ها
    for (i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      var isFocus = c === focus;
      ctx.fillStyle = isFocus ? '#00e5ff' : (c.isPlayer ? '#ff5ab4' : '#' + ('000000' + c.def.color.toString(16)).slice(-6));
      ctx.beginPath();
      ctx.arc(ox + c.x * sc, oy + c.z * sc, isFocus ? 5.5 : 3.8, 0, TAU);
      ctx.fill();
      if (isFocus) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  /* --------------------------------------------------------------- صادرات */
  var API = { Game: Game, Camera: Camera, Particles: Particles, KEYMAPS: KEYMAPS };
  KK.gameModule = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
