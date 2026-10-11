/* ==========================================================================
   track.js  ::  تولیدکننده‌ی پیست و محیط
   --------------------------------------------------------------------------
   خط مرکزی با یک منحنی بسته‌ی Catmull-Rom از نقاط تصادفیِ قطعی ساخته می‌شود،
   سپس بر حسب طول قوس باز‌نمونه‌برداری می‌شود. ارتفاع، شیب عرضی (banking)،
   عرض، جدول، گاردریل، زمین، کوه، آب و تمام اشیاء کنار پیست از همان دانه‌ی
   تصادفی تولید می‌شوند — برای هر ۲۰ پیست.
   ========================================================================== */
(function (root) {
  'use strict';
  var KK = root.KK;
  var MB = KK.MeshBuilder, MAT = KK.MAT, M4 = KK.M4;
  var clamp = KK.clamp, lerp = KK.lerp, smooth = KK.smooth, PI = KK.PI, TAU = KK.TAU;

  /* پارامترهای پیش‌فرض زمین برای هر تم */
  var TERRAIN_DEFAULTS = {
    embank: 0.14, blend: 110, amp: 26, freq: 0.0045, waterLevel: -60, gridStep: 22, margin: 400
  };

  function themeCfg(theme) {
    var c = {
      embank: TERRAIN_DEFAULTS.embank, blend: TERRAIN_DEFAULTS.blend,
      amp: TERRAIN_DEFAULTS.amp, freq: TERRAIN_DEFAULTS.freq
    };
    if (theme.mountains) { c.embank = 0.42; c.blend = 80; c.amp = 70; c.freq = 0.006; }
    if (theme.canyon) { c.embank = 0.95; c.blend = 55; c.amp = 40; c.freq = 0.010; }
    if (theme.dunes) { c.embank = 0.10; c.blend = 130; c.amp = 18; c.freq = 0.0035; }
    if (theme.water) { c.embank = 0.06; c.blend = 120; c.amp = 14; c.freq = 0.005; }
    if (theme.neon) { c.embank = 0.05; c.blend = 90; c.amp = 6; c.freq = 0.004; }
    if (theme.pine && !theme.mountains) { c.embank = 0.24; c.blend = 90; c.amp = 34; }
    if (theme.containers) { c.embank = 0.03; c.blend = 70; c.amp = 4; c.freq = 0.003; }
    if (theme.columns) { c.embank = 0.08; c.blend = 100; c.amp = 12; c.freq = 0.004; }
    return c;
  }

  /* ========================================================================
     خط مرکزی
     ======================================================================== */
  function buildCenterline(def, theme) {
    var rnd = KK.mulberry32(KK.hashSeed(def.seed));
    var cpCount = 9 + Math.round(def.curve * 7) + Math.round(def.tech * 4);
    var R = def.len / TAU * (0.86 + def.curve * 0.34);
    var pts = [], i;
    for (i = 0; i < cpCount; i++) {
      var a = (i / cpCount) * TAU;
      var rr = R * (1 + (rnd() - 0.5) * (0.30 + def.curve * 0.55));
      rr = Math.max(rr, R * 0.42);
      var aj = a + (rnd() - 0.5) * (0.30 / cpCount) * TAU * (0.4 + def.tech);
      pts.push([Math.cos(aj) * rr, Math.sin(aj) * rr]);
    }
    // Catmull-Rom بسته
    var coarse = [], segs = 26;
    for (i = 0; i < cpCount; i++) {
      var p0 = pts[(i - 1 + cpCount) % cpCount], p1 = pts[i],
        p2 = pts[(i + 1) % cpCount], p3 = pts[(i + 2) % cpCount];
      for (var j = 0; j < segs; j++) {
        var t = j / segs;
        coarse.push([
          KK.catmull(p0[0], p1[0], p2[0], p3[0], t),
          KK.catmull(p0[1], p1[1], p2[1], p3[1], t)
        ]);
      }
    }
    // باز‌نمونه‌برداری بر حسب طول قوس
    var target = def.len, step = 5.0;
    var totalLen = 0;
    for (i = 0; i < coarse.length; i++) {
      var a2 = coarse[i], b2 = coarse[(i + 1) % coarse.length];
      totalLen += Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
    }
    var scale = target / totalLen;
    for (i = 0; i < coarse.length; i++) { coarse[i][0] *= scale; coarse[i][1] *= scale; }

    var nSamples = Math.max(60, Math.round(target / step));
    var samples = [], s;
    for (i = 0; i < nSamples; i++) {
      var u = (i / nSamples) * coarse.length;
      var i0 = Math.floor(u), f = u - i0, n = coarse.length;
      var c0 = coarse[(i0 - 1 + n) % n], c1 = coarse[i0 % n],
        c2 = coarse[(i0 + 1) % n], c3 = coarse[(i0 + 2) % n];
      var x = KK.catmull(c0[0], c1[0], c2[0], c3[0], f);
      var z = KK.catmull(c0[1], c1[1], c2[1], c3[1], f);
      samples.push({ x: x, z: z, y: 0, tx: 0, tz: 1, lx: 1, lz: 0, k: 0, bank: 0, w: def.width, s: 0 });
    }

    // طول قوس و مماس
    var cum = 0;
    for (i = 0; i < nSamples; i++) {
      var A = samples[i], B = samples[(i + 1) % nSamples];
      A.s = cum;
      cum += Math.hypot(B.x - A.x, B.z - A.z);
    }
    for (i = 0; i < nSamples; i++) {
      var P = samples[(i - 1 + nSamples) % nSamples], Q = samples[(i + 1) % nSamples];
      var tx = Q.x - P.x, tz = Q.z - P.z;
      var l = Math.hypot(tx, tz) || 1;
      samples[i].tx = tx / l; samples[i].tz = tz / l;
      samples[i].lx = samples[i].tz; samples[i].lz = -samples[i].tx;
    }
    // انحنا
    for (i = 0; i < nSamples; i++) {
      var m0 = samples[(i - 2 + nSamples) % nSamples], m1 = samples[i], m2 = samples[(i + 2) % nSamples];
      var h0 = Math.atan2(m0.tx, m0.tz), h1 = Math.atan2(m2.tx, m2.tz);
      var dh = KK.angDiff(h0, h1);
      var ds = Math.abs(samples[(i + 2) % nSamples].s - m0.s) || 1;
      if (ds > cum / 2) ds = cum - ds;
      m1.k = dh / Math.max(ds, 1);
    }
    // ارتفاع و شیب عرضی
    var elev = KK.fbm1(KK.hashSeed(def.seed + '|elev'), 4, 2.1, 0.52);
    var widthN = KK.fbm1(KK.hashSeed(def.seed + '|width'), 3, 2.0, 0.5);
    var ampY = 6 + def.elev * 62;
    var bankMax = 0.055 + def.curve * 0.055;
    for (i = 0; i < nSamples; i++) {
      var ph = i / nSamples;
      samples[i].y = elev(ph * 9) * ampY;
      samples[i].bank = clamp(samples[i].k * 260, -1, 1) * bankMax * (def.elev * 0.4 + 0.6);
      samples[i].w = def.width * (1 + widthN(ph * 7) * 0.12);
      samples[i].curb = Math.abs(samples[i].k) > (0.0055 - def.tech * 0.0022);
    }
    // هموارسازی ارتفاع
    for (var pass = 0; pass < 3; pass++) {
      var copy = samples.map(function (o) { return o.y; });
      for (i = 0; i < nSamples; i++) {
        samples[i].y = (copy[(i - 2 + nSamples) % nSamples] + copy[(i - 1 + nSamples) % nSamples] * 2 +
          copy[i] * 3 + copy[(i + 1) % nSamples] * 2 + copy[(i + 2) % nSamples]) / 9;
      }
    }
    return { samples: samples, length: cum, step: cum / nSamples };
  }

  /* ========================================================================
     پیست
     ======================================================================== */
  function Track(def) {
    this.def = def;
    this.theme = KK.THEMES[def.theme] || KK.THEMES.mountain;
    var tc = themeCfg(this.theme);
    this.tc = tc;
    this.cl = buildCenterline(def, this.theme);
    this.samples = this.cl.samples;
    this.length = this.cl.length;
    this.N = this.samples.length;

    var rnd = KK.mulberry32(KK.hashSeed(def.seed + '|terr'));
    this.terrainF = KK.fbm1(KK.hashSeed(def.seed + '|terr'), 4, 2.15, 0.5);
    this.terrainAmp = tc.amp * (0.6 + def.elev * 0.9);
    this.terrainFreq = tc.freq;
    this.waterLevel = def.theme === 'coast' || def.theme === 'redIsland' ? -5.5 : -999;

    // محدوده
    var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, i;
    for (i = 0; i < this.N; i++) {
      var s = this.samples[i];
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
    }
    this.bounds = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
    this.center = [(minX + maxX) / 2, (minZ + maxZ) / 2];
    this.radius = Math.max(maxX - minX, maxZ - minZ) * 0.5;

    this.buildGrid();
    this.buildRacingLine();
    this.buildMeshes(rnd);
    this.placeItems(rnd);
  }

  /* --------------------------------------------------- خط مسابقه (AI)
     قبل از هر پیچ به بیرون و در رأس پیچ به داخل می‌رود.                   */
  Track.prototype.buildRacingLine = function () {
    var N = this.N, i, j;
    this.line = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var k = 0;
      for (j = -3; j <= 3; j++) k += this.samples[(i + j + N) % N].k;
      k /= 7;
      var mag = clamp(Math.abs(k) * 210, 0, 1);
      this.line[i] = -sign(k) * mag * this.samples[i].w * 0.30;
    }
    // هموارسازی
    for (var pass = 0; pass < 4; pass++) {
      var cp = Float32Array.from(this.line);
      for (i = 0; i < N; i++) {
        this.line[i] = (cp[(i - 2 + N) % N] + cp[(i - 1 + N) % N] * 2 + cp[i] * 3 +
          cp[(i + 1) % N] * 2 + cp[(i + 2) % N]) / 9;
      }
    }
  };

  /** نقطه‌ی خط مسابقه در نمونه‌ی i */
  Track.prototype.linePoint = function (i, out) {
    i = ((i % this.N) + this.N) % this.N;
    var s = this.samples[i], o = this.line[i];
    out[0] = s.x + s.lx * o; out[1] = s.y; out[2] = s.z + s.lz * o;
    return out;
  };

  Track.prototype.halfW = function (i) { return this.samples[((i % this.N) + this.N) % this.N].w * 0.5; };

  /* ---------------------------------------------------- شبکه‌ی جست‌وجو */
  Track.prototype.buildGrid = function () {
    var cell = 22;
    this.cell = cell;
    this.grid = {};
    for (var i = 0; i < this.N; i++) {
      var s = this.samples[i];
      var key = Math.floor(s.x / cell) + ',' + Math.floor(s.z / cell);
      (this.grid[key] || (this.grid[key] = [])).push(i);
    }
  };

  Track.prototype.nearest = function (x, z) {
    var cell = this.cell, best = -1, bd = 1e18;
    var cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (var gx = cx - 3; gx <= cx + 3; gx++) {
      for (var gz = cz - 3; gz <= cz + 3; gz++) {
        var arr = this.grid[gx + ',' + gz];
        if (!arr) continue;
        for (var q = 0; q < arr.length; q++) {
          var s = this.samples[arr[q]];
          var dx = s.x - x, dz = s.z - z;
          var d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = arr[q]; }
        }
      }
    }
    if (best < 0) {
      for (var i = 0; i < this.N; i++) {
        var t = this.samples[i];
        var d2 = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z);
        if (d2 < bd) { bd = d2; best = i; }
      }
    }
    return best;
  };

  /** تجزیه‌ی یک نقطه به (شماره‌ی نمونه، مختصات جانبی t، طول قوس s) */
  Track.prototype.project = function (x, z, hint) {
    var i = hint !== undefined && hint >= 0 ? hint : this.nearest(x, z);
    // جست‌وجوی محلی برای دقت بیشتر
    var bestI = i, bestT = 0, bestD = 1e18, bestS = 0;
    for (var k = -3; k <= 3; k++) {
      var j = (i + k + this.N) % this.N;
      var s = this.samples[j], n2 = this.samples[(j + 1) % this.N];
      var ax = s.x, az = s.z, bx = n2.x, bz = n2.z;
      var ex = bx - ax, ez = bz - az;
      var ll = ex * ex + ez * ez;
      var u = ll > 0 ? clamp(((x - ax) * ex + (z - az) * ez) / ll, 0, 1) : 0;
      var px = ax + ex * u, pz = az + ez * u;
      var d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < bestD) {
        bestD = d; bestI = j;
        bestT = (x - px) * s.lx + (z - pz) * s.lz;
        bestS = s.s + u * (this.length / this.N);
      }
    }
    return { i: bestI, t: bestT, s: bestS, d: Math.sqrt(bestD) };
  };

  Track.prototype.roadHeight = function (i, u) {
    var a = this.samples[i], b = this.samples[(i + 1) % this.N];
    return lerp(a.y, b.y, u);
  };

  Track.prototype.heightAt = function (x, z, hint) {
    var p = this.project(x, z, hint);
    var s = this.samples[p.i];
    var u = (p.s - s.s) / (this.length / this.N);
    if (u < 0) u += this.N; if (u > 1) u = 1;
    var halfW = s.w * 0.5;
    var hRoad = lerp(s.y, this.samples[(p.i + 1) % this.N].y, clamp(u, 0, 1)) + p.t * Math.tan(s.bank);
    var d = Math.abs(t0(p.t)) - halfW;
    if (d <= 0) return hRoad;
    var terrH = this.terrainHeight(x, z);
    var w = smooth(clamp(d / this.tc.blend, 0, 1));
    var emb = sign(p.t) * d * this.tc.embank;
    return lerp(hRoad + emb, terrH, w);
  };
  function t0(v) { return v; }
  function sign(v) { return v < 0 ? -1 : 1; }

  Track.prototype.terrainHeight = function (x, z) {
    return this.terrainF(x * this.terrainFreq + z * this.terrainFreq * 0.37) * this.terrainAmp
      + this.terrainF(z * this.terrainFreq * 1.9 - x * this.terrainFreq * 0.6) * this.terrainAmp * 0.35;
  };

  Track.prototype.normalAt = function (x, z, out) {
    out = out || [0, 1, 0];
    var e = 1.4;
    var hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    var hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    var nx = hl - hr, nz = hd - hu, ny = 2 * e;
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
    return out;
  };

  Track.prototype.surfaceAt = function (x, z, out) {
    out = out || {};
    var p = this.project(x, z);
    var s = this.samples[p.i];
    var halfW = s.w * 0.5;
    var at = Math.abs(p.t);
    if (at <= halfW) {
      out.mu = 1.0; out.roll = 0.011; out.kind = 'asphalt'; out.onRoad = true; out.vibe = 0;
      return out;
    }
    if (at <= halfW + 1.4 && s.curb) {
      out.mu = 0.88; out.roll = 0.030; out.kind = 'rumble'; out.onRoad = true; out.vibe = 1;
      return out;
    }
    var th = this.theme;
    var kind = 'grass', mu = 0.62, roll = 0.048;
    if (th.dunes || th.weather === 'sand') { kind = 'sand'; mu = 0.55; roll = 0.075; }
    else if (th.weather === 'snow') { kind = 'snow'; mu = 0.48; roll = 0.05; }
    else if (th.neon || th.buildings > 0.5) { kind = 'concrete'; mu = 0.80; roll = 0.02; }
    if (th.weather === 'rain') mu *= 0.82;
    out.mu = mu; out.roll = roll; out.kind = kind; out.onRoad = false; out.vibe = 2;
    return out;
  };

  /** موقعیت و جهت شروع برای خانه‌ی شماره‌ی n از gr */
  Track.prototype.startPose = function (n) {
    var s = this.samples[this.N - 3];
    var rows = Math.floor(n / 2), col = n % 2;
    var back = 6 + rows * 6.5;
    var side = (col === 0 ? -1 : 1) * (this.samples[0].w * 0.22);
    var x = s.x - s.tx * back + s.lx * side;
    var z = s.z - s.tz * back + s.lz * side;
    var yaw = Math.atan2(s.tx, s.tz);
    return { x: x, y: this.heightAt(x, z) + 0.02, z: z, yaw: yaw };
  };

  /** پیشرفت 0..1 روی دور */
  Track.prototype.progressAt = function (x, z, hint) {
    var p = this.project(x, z, hint);
    return p.s / this.length;
  };

  /* ========================================================================
     مش‌ها
     ======================================================================== */
  Track.prototype.buildMeshes = function (rnd) {
    var th = this.theme, def = this.def, i, j;
    this.roadMesh = new MB();
    this.propMesh = new MB();
    this.decalMesh = new MB();

    var road = this.roadMesh;
    var N = this.N, S = this.samples;

    /* ------------------------------------------------------------- آسفالت */
    var left = [], right = [], cl_, cr_;
    for (i = 0; i <= N; i++) {
      var s = S[i % N];
      var hw = s.w * 0.5;
      var tb = Math.tan(s.bank);
      left.push([s.x + s.lx * hw, s.y - tb * hw, s.z + s.lz * hw]);
      right.push([s.x - s.lx * hw, s.y + tb * hw, s.z - s.lz * hw]);
    }
    road.setColorHex(th.road).setMat(MAT.ASPHALT);
    for (i = 0; i < N; i++) {
      var u0 = S[i].s, u1 = (i + 1 <= N ? S[(i + 1) % N].s : this.length);
      if (u1 < u0) u1 = this.length;
      var a0 = road.v(left[i][0], left[i][1], left[i][2], 0, 1, 0, 0, u0 * 0.1);
      var a1 = road.v(right[i][0], right[i][1], right[i][2], 0, 1, 0, 1, u0 * 0.1);
      var b0 = road.v(left[i + 1][0], left[i + 1][1], left[i + 1][2], 0, 1, 0, 0, u1 * 0.1);
      var b1 = road.v(right[i + 1][0], right[i + 1][1], right[i + 1][2], 0, 1, 0, 1, u1 * 0.1);
      road.quad(a0, a1, b1, b0);
    }

    /* ------------------------------------------------------ شانه‌ی پیست */
    road.setColorHex(KK.mixHex(th.road, 0x6a6255, 0.45)).setMat(MAT.DIRT);
    for (i = 0; i < N; i++) {
      for (var sd = 0; sd < 2; sd++) {
        var e0 = sd === 0 ? left : right;
        var s2 = S[i % N];
        var dirx = sd === 0 ? s2.lx : -s2.lx, dirz = sd === 0 ? s2.lz : -s2.lz;
        var w2 = s2.w * 0.5 + 2.2;
        var px = s2.x + dirx * w2, pz = s2.z + dirz * w2;
        var py = s2.y + (sd === 0 ? -1 : 1) * Math.tan(s2.bank) * w2 - 0.04;
        var idx0 = road.vcount;
        road.v(e0[i][0], e0[i][1] - 0.02, e0[i][2], 0, 1, 0, 0, 0);
        road.v(px, py, pz, 0, 1, 0, 1, 0);
        if (i > 0) {
          road.quad(idx0 - 2, idx0 - 1, idx0 + 1, idx0);
        } else { road.vcount -= 2; road.verts.length -= 24; }
      }
    }

    /* -------------------------------------------- خطوط سفید لبه و وسط */
    road.setColorHex(0xe8e8e2).setMat(MAT.CONCRETE);
    for (i = 0; i < N; i++) {
      var s3 = S[i % N], s4 = S[(i + 1) % N];
      var dash = (Math.floor(S[i].s / 6) % 2 === 0);
      // خط وسط
      if (dash) {
        var m0x = s3.x, m0z = s3.z, m1x = s4.x, m1z = s4.z;
        var yy = 0.014;
        var p0 = road.v(m0x + s3.lx * 0.10, s3.y + yy, s3.z + s3.lz * 0.10, 0, 1, 0, 0, 0);
        var p1 = road.v(m0x - s3.lx * 0.10, s3.y + yy, s3.z - s3.lz * 0.10, 0, 1, 0, 1, 0);
        var p2 = road.v(m1x - s4.lx * 0.10, s4.y + yy, s4.z - s4.lz * 0.10, 0, 1, 0, 1, 0);
        var p3 = road.v(m1x + s4.lx * 0.10, s4.y + yy, s4.z + s4.lz * 0.10, 0, 1, 0, 0, 0);
        road.quad(p0, p1, p2, p3);
      }
      // خطوط لبه
      for (var e2 = 0; e2 < 2; e2++) {
        var sg = e2 === 0 ? 1 : -1;
        var off = (s3.w * 0.5 - 0.55) * sg, off2 = (s4.w * 0.5 - 0.55) * sg;
        var q0 = road.v(s3.x + s3.lx * off, s3.y + 0.014, s3.z + s3.lz * off, 0, 1, 0, 0, 0);
        var q1 = road.v(s3.x + s3.lx * (off + 0.22 * sg), s3.y + 0.014, s3.z + s3.lz * (off + 0.22 * sg), 0, 1, 0, 1, 0);
        var q2 = road.v(s4.x + s4.lx * (off2 + 0.22 * sg), s4.y + 0.014, s4.z + s4.lz * (off2 + 0.22 * sg), 0, 1, 0, 1, 0);
        var q3 = road.v(s4.x + s4.lx * off2, s4.y + 0.014, s4.z + s4.lz * off2, 0, 1, 0, 0, 0);
        road.quad(q0, q1, q2, q3);
      }
    }

    /* --------------------------------------------------- جدول‌های رنگی */
    for (i = 0; i < N; i++) {
      if (!S[i % N].curb) continue;
      var s5 = S[i % N], s6 = S[(i + 1) % N];
      var seg = Math.floor(S[i].s / 3) % 2 === 0;
      road.setColorHex(seg ? th.curbA : th.curbB).setMat(MAT.CURB);
      for (var sd2 = 0; sd2 < 2; sd2++) {
        var g2 = sd2 === 0 ? 1 : -1;
        var o1 = (s5.w * 0.5) * g2, o1b = (s5.w * 0.5 + 1.05) * g2;
        var o2 = (s6.w * 0.5) * g2, o2b = (s6.w * 0.5 + 1.05) * g2;
        var tb1 = Math.tan(s5.bank), tb2 = Math.tan(s6.bank);
        var r0 = road.v(s5.x + s5.lx * o1, s5.y - tb1 * o1 + 0.02, s5.z + s5.lz * o1, 0, 1, 0, 0, 0);
        var r1 = road.v(s5.x + s5.lx * o1b, s5.y - tb1 * o1b + 0.16, s5.z + s5.lz * o1b, 0, 1, 0, 1, 0);
        var r2 = road.v(s6.x + s6.lx * o2b, s6.y - tb2 * o2b + 0.16, s6.z + s6.lz * o2b, 0, 1, 0, 1, 0);
        var r3 = road.v(s6.x + s6.lx * o2, s6.y - tb2 * o2 + 0.02, s6.z + s6.lz * o2, 0, 1, 0, 0, 0);
        road.quad(r0, r1, r2, r3);
      }
    }

    /* ------------------------------------------------- خط شروع/پایان */
    var st = S[0];
    var hw0 = st.w * 0.5, sq = 0.9;
    for (var row = 0; row < 4; row++) {
      for (var cc = 0; cc < Math.floor(hw0 * 2 / sq); cc++) {
        var on = (row + cc) % 2 === 0;
        road.setColorHex(on ? 0xf5f5f0 : 0x14161a).setMat(MAT.CONCRETE);
        var t00 = -row * sq, t11 = t00 - sq;
        var x00 = -hw0 + cc * sq, x11 = x00 + sq;
        var mk = function (tt, xx) {
          return [st.x + st.tx * tt + st.lx * xx, st.y + 0.016, st.z + st.tz * tt + st.lz * xx];
        };
        var A = mk(t00, x00), B = mk(t00, x11), C = mk(t11, x11), D = mk(t11, x00);
        road.face(A, B, C, D);
      }
    }

    /* --------------------------------------------------- گاردریل */
    if (!th.neon || true) {
      road.setColorHex(0xc8ccd2).setMat(MAT.METAL);
      for (i = 0; i < N; i += 1) {
        var s7 = S[i % N], s8 = S[(i + 1) % N];
        for (var sd3 = 0; sd3 < 2; sd3++) {
          var g3 = sd3 === 0 ? 1 : -1;
          // گاردریل در همه‌ی مسیر هست؛ دیوار نامرئی فیزیک هم همین‌جاست

          var oo1 = (s7.w * 0.5 + 2.6) * g3, oo2 = (s8.w * 0.5 + 2.6) * g3;
          var h1 = s7.y - Math.tan(s7.bank) * oo1, h2 = s8.y - Math.tan(s8.bank) * oo2;
          var g0 = road.v(s7.x + s7.lx * oo1, h1 + 0.55, s7.z + s7.lz * oo1, g3, 0, 0, 0, 0);
          var g1 = road.v(s7.x + s7.lx * oo1, h1 + 0.95, s7.z + s7.lz * oo1, g3, 0, 0, 0, 1);
          var g4 = road.v(s8.x + s8.lx * oo2, h2 + 0.95, s8.z + s8.lz * oo2, g3, 0, 0, 0, 1);
          var g5 = road.v(s8.x + s8.lx * oo2, h2 + 0.55, s8.z + s8.lz * oo2, g3, 0, 0, 0, 0);
          road.quad(g0, g1, g4, g5);
          if (i % 5 === 0) {
            road.setColorHex(0x8a8f96).setMat(MAT.METAL);
            road.box(s7.x + s7.lx * oo1, h1 + 0.35, s7.z + s7.lz * oo1, 0.12, 0.9, 0.12);
            road.setColorHex(0xc8ccd2).setMat(MAT.METAL);
          }
        }
      }
    }

    /* ---------------------------------------------- پدهای شتاب و رمپ */
    this.boostPads = [];
    var padCount = 3 + Math.round(def.tech * 3);
    for (i = 0; i < padCount; i++) {
      var pi = Math.floor(((i + 0.5) / padCount) * N) % N;
      if (S[pi].curb) continue;
      var sp = S[pi];
      var off = (rnd() - 0.5) * sp.w * 0.45;
      var px2 = sp.x + sp.lx * off, pz2 = sp.z + sp.lz * off;
      this.boostPads.push({ x: px2, z: pz2, y: sp.y, r: 2.4, tx: sp.tx, tz: sp.tz });
      road.setColorHex(th.neon ? 0x00e5ff : 0x35f0c0).setMat(MAT.NEON);
      for (var ch = 0; ch < 3; ch++) {
        var cz0 = ch * 1.5 - 1.5;
        var mkC = function (a, b) {
          return [px2 + sp.tx * a + sp.lx * b, sp.y + 0.02, pz2 + sp.tz * a + sp.lz * b];
        };
        road.face(mkC(cz0, -1.1), mkC(cz0, 1.1), mkC(cz0 + 0.75, 0.0), mkC(cz0 + 0.75, 0.0));
      }
    }
    this.ramps = [];
    if (def.tech > 0.6) {
      var ri = Math.floor(N * 0.55);
      var rs = S[ri];
      this.ramps.push({ x: rs.x, z: rs.z, y: rs.y, yaw: Math.atan2(rs.tx, rs.tz), w: rs.w * 0.5, len: 9 });
      road.setColorHex(0xe8b020).setMat(MAT.METAL);
      var rA = [rs.x - rs.tx * 9, rs.y - 0.02, rs.z - rs.tz * 9];
      var rB = [rs.x, rs.y + 1.0, rs.z];
      var wdx = rs.lx * rs.w * 0.45, wdz = rs.lz * rs.w * 0.45;
      road.face([rA[0] + wdx, rA[1], rA[2] + wdz], [rA[0] - wdx, rA[1], rA[2] - wdz],
        [rB[0] - wdx, rB[1], rB[2] - wdz], [rB[0] + wdx, rB[1], rB[2] + wdz]);
    }

    /* ------------------------------------------------------- دروازه‌ی شروع */
    this.buildStartGantry(road, st);

    /* ------------------------------------------------------------- زمین */
    this.buildTerrain();

    /* ---------------------------------------------------- آب و کوه پس‌زمینه */
    if (this.waterLevel > -900) this.buildWater();
    if (th.mountains || th.canyon || th.dunes || th.ruins) this.buildRidge(rnd);
  };

  Track.prototype.buildStartGantry = function (m, st) {
    var w = st.w * 0.5 + 2.0, h = 6.4;
    m.setColorHex(0x2a2e34).setMat(MAT.METAL);
    m.box(st.x + st.lx * w, st.y + h / 2, st.z + st.lz * w, 0.5, h, 0.5);
    m.box(st.x - st.lx * w, st.y + h / 2, st.z - st.lz * w, 0.5, h, 0.5);
    m.setColorHex(this.theme.neon ? 0x101828 : 0x1d2128).setMat(MAT.METAL);
    var cx = st.x, cz = st.z, cy = st.y + h;
    m.box(cx, cy, cz, w * 2 + 1.0, 1.5, 0.9);
    m.setColorHex(0xff3040).setMat(MAT.EMISSIVE);
    for (var i = 0; i < 5; i++) {
      var lx = -w + (i / 4) * w * 2;
      m.box(cx + st.lx * lx, cy + 0.2, cz + st.lz * lx, 0.42, 0.42, 0.2);
    }
    // تابلوی نام پیست (دِکال متنی)
    var d = this.decalMesh;
    d.setColor(1, 1, 1).setMat(MAT.CONCRETE);
    var pw = w * 1.7, ph = 1.1;
    var p = [
      [cx + st.lx * pw + st.tx * 0.47, cy + ph / 2, cz + st.lz * pw + st.tz * 0.47],
      [cx - st.lx * pw + st.tx * 0.47, cy + ph / 2, cz - st.lz * pw + st.tz * 0.47],
      [cx - st.lx * pw + st.tx * 0.47, cy - ph / 2, cz - st.lz * pw + st.tz * 0.47],
      [cx + st.lx * pw + st.tx * 0.47, cy - ph / 2, cz + st.lz * pw + st.tz * 0.47]
    ];
    this.decalSlot = this.decalIndex || 0;
    var v0 = this.decalIndex || 0;
    d.v(p[0][0], p[0][1], p[0][2], -st.tz, 0, st.tx, 0, v0 / 4);
    d.v(p[1][0], p[1][1], p[1][2], -st.tz, 0, st.tx, 1, v0 / 4);
    d.v(p[2][0], p[2][1], p[2][2], -st.tz, 0, st.tx, 1, (v0 + 1) / 4);
    d.v(p[3][0], p[3][1], p[3][2], -st.tz, 0, st.tx, 0, (v0 + 1) / 4);
    d.quad(d.vcount - 4, d.vcount - 3, d.vcount - 2, d.vcount - 1);
    this.decalIndex = v0 + 1;
  };

  Track.prototype.buildTerrain = function () {
    var m = this.roadMesh;
    var step = this.tc.gridStep, margin = TERRAIN_DEFAULTS.margin;
    var b = this.bounds;
    var x0 = Math.floor((b.minX - margin) / step) * step;
    var x1 = Math.ceil((b.maxX + margin) / step) * step;
    var z0 = Math.floor((b.minZ - margin) / step) * step;
    var z1 = Math.ceil((b.maxZ + margin) / step) * step;
    var nx = Math.round((x1 - x0) / step) + 1;
    var nz = Math.round((z1 - z0) / step) + 1;
    // محدود کردن تعداد رأس‌ها
    if (nx * nz > 60000) {
      step = step * Math.ceil(Math.sqrt(nx * nz / 60000));
      x0 = Math.floor((b.minX - margin) / step) * step;
      x1 = Math.ceil((b.maxX + margin) / step) * step;
      z0 = Math.floor((b.minZ - margin) / step) * step;
      z1 = Math.ceil((b.maxZ + margin) / step) * step;
      nx = Math.round((x1 - x0) / step) + 1;
      nz = Math.round((z1 - z0) / step) + 1;
    }
    var th = this.theme;
    var base = KK.hexToRgb(th.ground), rock = KK.hexToRgb(th.rockTint);
    var snowC = [0.94, 0.96, 0.99];
    var heights = new Float32Array(nx * nz);
    var i, j;
    for (j = 0; j < nz; j++) {
      for (i = 0; i < nx; i++) {
        heights[j * nx + i] = this.heightAt(x0 + i * step, z0 + j * step);
      }
    }
    var start = m.vcount, sIdx = m.idx.length;
    m.setMat(MAT.GRASS);
    for (j = 0; j < nz; j++) {
      for (i = 0; i < nx; i++) {
        var x = x0 + i * step, z = z0 + j * step;
        var h = heights[j * nx + i];
        var hl = heights[j * nx + Math.max(0, i - 1)];
        var hr = heights[j * nx + Math.min(nx - 1, i + 1)];
        var hd = heights[Math.max(0, j - 1) * nx + i];
        var hu = heights[Math.min(nz - 1, j + 1) * nx + i];
        var nvx = hl - hr, nvz = hd - hu, nvy = 2 * step;
        var l = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz) || 1;
        nvx /= l; nvy /= l; nvz /= l;
        var slope = 1 - nvy;
        var t = clamp((slope - 0.12) / 0.35, 0, 1);
        var col = [
          lerp(base[0], rock[0], t),
          lerp(base[1], rock[1], t),
          lerp(base[2], rock[2], t)
        ];
        if (th.weather === 'snow' && nvy > 0.7) {
          col = [lerp(col[0], snowC[0], 0.75), lerp(col[1], snowC[1], 0.75), lerp(col[2], snowC[2], 0.75)];
        }
        m.color = col;
        m.v(x, h, z, nvx, nvy, nvz, i * 0.25, j * 0.25);
      }
    }
    for (j = 0; j < nz - 1; j++) {
      for (i = 0; i < nx - 1; i++) {
        var a = start + j * nx + i, bb = a + 1, c = a + nx, d = a + nx + 1;
        m.quad(a, c, d, bb);
      }
    }
    m.color = [1, 1, 1];
    this.terrainTris = (m.idx.length - sIdx) / 3;
  };

  Track.prototype.buildWater = function () {
    var m = this.roadMesh;
    var b = this.bounds, pad = 700;
    m.setColorHex(0x1a6f96).setMat(MAT.WATER);
    var y = this.waterLevel;
    m.v(b.minX - pad, y, b.minZ - pad, 0, 1, 0, 0, 0);
    m.v(b.maxX + pad, y, b.minZ - pad, 0, 1, 0, 1, 0);
    m.v(b.maxX + pad, y, b.maxZ + pad, 0, 1, 0, 1, 1);
    m.v(b.minX - pad, y, b.maxZ + pad, 0, 1, 0, 0, 1);
    m.quad(m.vcount - 4, m.vcount - 3, m.vcount - 2, m.vcount - 1);
  };

  Track.prototype.buildRidge = function (rnd) {
    var m = this.propMesh;
    var th = this.theme;
    var count = 30, i;
    var R0 = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ) * 0.62;
    for (i = 0; i < count; i++) {
      var a = (i / count) * TAU + rnd() * 0.12;
      var rr = R0 * (1.05 + rnd() * 0.55);
      var x = this.center[0] + Math.cos(a) * rr;
      var z = this.center[1] + Math.sin(a) * rr;
      var h = (th.canyon ? 90 : 140) + rnd() * 260;
      var rw = 90 + rnd() * 190;
      var radii = [];
      for (var k = 0; k < 7; k++) radii.push(rw * (0.7 + rnd() * 0.6));
      var baseY = this.terrainHeight(x, z) - 30;
      m.setColorHex(KK.mixHex(th.rockTint, th.fog, 0.25)).setMat(MAT.ROCK);
      m.prisma(x, baseY, z, radii, h, 0, 0.45 + rnd() * 0.5);
      if (th.weather === 'snow' && h > 220) {
        m.setColorHex(0xeef4fa).setMat(MAT.SNOW);
        var r2 = [];
        for (k = 0; k < 7; k++) r2.push(radii[k] * 0.42);
        m.prisma(x, baseY + h * 0.72, z, r2, h * 0.30, 0, 0.4);
      }
    }
  };

  /* ========================================================================
     اشیاء کنار پیست
     ======================================================================== */
  Track.prototype.placeItems = function (rnd) {
    var th = this.theme, m = this.propMesh, S = this.samples, N = this.N, i;
    var self = this;

    function sidePoint(i, dist, out) {
      var s = S[i % N];
      out[0] = s.x + s.lx * dist; out[2] = s.z + s.lz * dist;
      out[1] = self.heightAt(out[0], out[2]);
      return out;
    }
    var tmp = [0, 0, 0];

    // فاصله‌ی نمونه‌برداری برای اشیاء
    var spacing = Math.max(2, Math.round(N / 190));

    for (i = 0; i < N; i += spacing) {
      var s = S[i % N];
      var base = s.w * 0.5 + 5;
      for (var sd = -1; sd <= 1; sd += 2) {
        var d = base + rnd() * (14 + 40 * (1 - (th.buildings || 0)));
        sidePoint(i, sd * d, tmp);
        var y = tmp[1];
        if (y < this.waterLevel + 0.5) continue;
        var yaw = Math.atan2(s.tx, s.tz) + (rnd() - 0.5) * 0.6;

        var r = rnd();
        if (th.buildings > 0 && r < th.buildings * 0.62) {
          this.addBuilding(m, rnd, tmp[0], y, tmp[2], yaw, th, s);
        } else if (th.trees > 0 && r < th.buildings * 0.62 + th.trees * 0.42) {
          if (th.pine) this.addPine(m, rnd, tmp[0], y, tmp[2], th);
          else if (th.palms) this.addPalm(m, rnd, tmp[0], y, tmp[2], th);
          else if (th.flowers) this.addCypress(m, rnd, tmp[0], y, tmp[2], th);
          else this.addTree(m, rnd, tmp[0], y, tmp[2], th);
        } else if (th.containers && r < 0.55) {
          this.addContainer(m, rnd, tmp[0], y, tmp[2], yaw);
        } else if (th.columns && r < 0.5) {
          this.addColumn(m, rnd, tmp[0], y, tmp[2]);
        } else if (th.windcatcher && r < 0.42) {
          this.addWindcatcher(m, rnd, tmp[0], y, tmp[2]);
        } else if (th.domes && r < 0.4) {
          this.addDome(m, rnd, tmp[0], y, tmp[2]);
        } else if (th.dunes && r < 0.35) {
          this.addCactus(m, rnd, tmp[0], y, tmp[2]);
        } else if (r > 0.93) {
          this.addRock(m, rnd, tmp[0], y, tmp[2]);
        }
      }
    }

    // چراغ‌های روشنایی
    if (th.streetLights > 0) {
      var ls = Math.max(4, Math.round(N / 46));
      for (i = 0; i < N; i += ls) {
        var s2 = S[i % N];
        for (var sd2 = -1; sd2 <= 1; sd2 += 2) {
          if (rnd() < 0.35) continue;
          var dd = s2.w * 0.5 + 3.2;
          sidePoint(i, sd2 * dd, tmp);
          this.addStreetLight(m, tmp[0], tmp[1], tmp[2], Math.atan2(s2.tx, s2.tz), sd2, th);
        }
      }
    }

    // جایگاه تماشاچی نزدیک خط شروع
    for (var g = 0; g < 2; g++) {
      var gi = (g === 0 ? 6 : N - 8);
      var gs = S[gi % N];
      var gd = (gs.w * 0.5 + 12) * (g === 0 ? 1 : -1);
      sidePoint(gi, gd, tmp);
      this.addGrandstand(m, tmp[0], tmp[1], tmp[2], Math.atan2(gs.tx, gs.tz), gd > 0 ? -1 : 1, th);
    }

    // تابلوهای تبلیغاتی
    var bs = Math.max(6, Math.round(N / 22));
    for (i = 3; i < N; i += bs) {
      var s3 = S[i % N];
      var bsd = (i / bs) % 2 === 0 ? 1 : -1;
      var bd = (s3.w * 0.5 + 4.6) * bsd;
      sidePoint(i, bd, tmp);
      this.addBillboard(m, this.decalMesh, rnd, tmp[0], tmp[1], tmp[2], Math.atan2(s3.tx, s3.tz), bsd);
    }

    // مخروط و لاستیک کنار پیچ‌ها
    for (i = 0; i < N; i += Math.max(2, Math.round(N / 120))) {
      var s4 = S[i % N];
      if (!s4.curb) continue;
      if (rnd() < 0.6) continue;
      var cd = (s4.w * 0.5 + 1.8) * (rnd() < 0.5 ? 1 : -1);
      sidePoint(i, cd, tmp);
      if (rnd() < 0.5) this.addCone(m, tmp[0], tmp[1], tmp[2], th);
      else this.addTireStack(m, tmp[0], tmp[1], tmp[2], th);
    }
  };

  Track.prototype.addBuilding = function (m, rnd, x, y, z, yaw, th, s) {
    var w = 8 + rnd() * 20, d = 8 + rnd() * 18;
    var h = th.neon ? 25 + rnd() * 90 : (th.night ? 12 + rnd() * 45 : 8 + rnd() * 22);
    var m0 = M4.create();
    var from = m.vcount, fidx = m.idx.length;
    var body = rnd();
    var c = th.neon ? KK.mixHex(0x141428, 0x2a1a48, body)
      : th.night ? KK.mixHex(0x2a2e38, 0x3a3f4a, body)
        : KK.mixHex(0x9a9284, 0xbcae96, body);
    m.setColorHex(c).setMat(th.neon ? MAT.METAL : MAT.CONCRETE);
    m.box(0, h / 2, 0, w, h, d);
    // پنجره‌ها (به‌صورت چهارگوش تخت تا تعداد مثلث‌ها منفجر نشود)
    if (th.night || th.neon) {
      m.setColorHex(th.neon ? 0x00e5ff : 0xffd98a).setMat(MAT.EMISSIVE);
      var rows = Math.min(7, Math.max(2, Math.floor(h / 6)));
      var cols = Math.min(5, Math.max(2, Math.floor(w / 4.5)));
      for (var r = 0; r < rows; r++) {
        for (var cI = 0; cI < cols; cI++) {
          if (rnd() < 0.34) continue;
          var wx = -w / 2 + 1.5 + cI * (w - 3) / Math.max(1, cols - 1);
          var wy = 2.4 + r * (h - 4) / rows;
          for (var f = 0; f < 2; f++) {
            var fz = f === 0 ? d / 2 + 0.05 : -d / 2 - 0.05;
            m.face([wx - 0.65, wy - 0.75, fz], [wx + 0.65, wy - 0.75, fz],
              [wx + 0.65, wy + 0.75, fz], [wx - 0.65, wy + 0.75, fz]);
          }
        }
      }
      if (th.neon) {
        m.setColorHex(rnd() < 0.5 ? 0xff2fb0 : 0x00e5ff).setMat(MAT.NEON);
        m.box(0, h + 0.4, 0, w * 1.02, 0.3, d * 1.02);
      }
    }
    // بام
    m.setColorHex(KK.mixHex(c, 0x222222, 0.35)).setMat(MAT.CONCRETE);
    m.box(0, h + 0.25, 0, w * 0.96, 0.5, d * 0.96);
    M4.fromRotationTranslation(m0, 0, yaw, 0, x, y, z);
    m.transform(m0, from);
  };

  Track.prototype.addTree = function (m, rnd, x, y, z, th) {
    var from = m.vcount, fidx = m.idx.length;
    var h = 3.5 + rnd() * 5;
    m.setColorHex(KK.mixHex(0x5a4028, 0x3a2a18, rnd())).setMat(MAT.FOLIAGE);
    m.cylinder(0, 0, 0, 0.18, h, 6, 'y', false, false, 0.12);
    m.setColorHex(KK.mixHex(th.grassTint, 0x1f4a1f, 0.35 + rnd() * 0.4)).setMat(MAT.FOLIAGE);
    var layers = 3;
    for (var i = 0; i < layers; i++) {
      var yy = h * (0.45 + i * 0.22);
      var rr = (1.9 - i * 0.42) * (0.8 + rnd() * 0.4);
      m.sphere(0, yy, 0, rr, 8, 5, [1, 0.72, 1]);
    }
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addPine = function (m, rnd, x, y, z, th) {
    var from = m.vcount;
    var h = 6 + rnd() * 9;
    m.setColorHex(0x4a3520).setMat(MAT.FOLIAGE);
    m.cylinder(0, 0, 0, 0.2, h * 0.35, 6, 'y', false, false, 0.14);
    var snow = th.weather === 'snow';
    m.setColorHex(snow ? 0x2f4a3a : 0x24462a).setMat(MAT.FOLIAGE);
    for (var i = 0; i < 4; i++) {
      m.cone(0, h * (0.20 + i * 0.20), 0, (2.4 - i * 0.5) * (0.85 + rnd() * 0.3), h * 0.34, 8);
      if (snow) {
        m.setColorHex(0xeef4fa).setMat(MAT.SNOW);
        m.cone(0, h * (0.20 + i * 0.20) + h * 0.18, 0, (2.4 - i * 0.5) * 0.55, h * 0.14, 8);
        m.setColorHex(0x2f4a3a).setMat(MAT.FOLIAGE);
      }
    }
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addPalm = function (m, rnd, x, y, z, th) {
    var from = m.vcount;
    var h = 6 + rnd() * 5, lean = (rnd() - 0.5) * 0.28;
    m.setColorHex(0x8a7048).setMat(MAT.FOLIAGE);
    var segs = 5;
    for (var i = 0; i < segs; i++) {
      m.cylinder(lean * i * 0.5, h * i / segs, 0, 0.22 - i * 0.02, h / segs + 0.1, 6, 'y', false, false, 0.20 - i * 0.02);
    }
    m.setColorHex(0x2e7a3a).setMat(MAT.FOLIAGE);
    var top = h, tx = lean * segs * 0.5;
    for (i = 0; i < 7; i++) {
      var a = (i / 7) * TAU + rnd();
      var f0 = m.vcount;
      m.box(0, 0, 0, 0.34, 0.06, 3.4);
      var mm = M4.create(), m2 = M4.create();
      M4.translation(mm, 0, 0, 1.7);
      m.transform(mm, f0);
      M4.fromRotationTranslation(m2, 0.45 + rnd() * 0.25, a, 0, tx, top, 0);
      m.transform(m2, f0);
    }
    m.setColorHex(0x6a4a20).setMat(MAT.FOLIAGE);
    m.sphere(tx, top - 0.1, 0, 0.3, 6, 4);
    var mm2 = M4.create();
    M4.translation(mm2, x, y, z);
    m.transform(mm2, from);
  };

  Track.prototype.addCypress = function (m, rnd, x, y, z, th) {
    var from = m.vcount;
    var h = 5 + rnd() * 5;
    m.setColorHex(0x4a3520).setMat(MAT.FOLIAGE);
    m.cylinder(0, 0, 0, 0.14, h * 0.3, 5, 'y', false, false, 0.1);
    m.setColorHex(0x2a5c2e).setMat(MAT.FOLIAGE);
    m.sphere(0, h * 0.62, 0, h * 0.42, 8, 8, [0.42, 1.5, 0.42]);
    if (rnd() < 0.4) {
      m.setColorHex(0xe8a0c0).setMat(MAT.FOLIAGE);
      m.sphere(0, h * 0.62, 0, h * 0.45, 6, 6, [0.44, 1.52, 0.44]);
    }
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addCactus = function (m, rnd, x, y, z, th) {
    var from = m.vcount;
    var h = 1.6 + rnd() * 2.6;
    m.setColorHex(0x4a7a3a).setMat(MAT.FOLIAGE);
    m.cylinder(0, 0, 0, 0.28, h, 8, 'y', true, true, 0.24);
    if (rnd() < 0.7) {
      m.cylinder(0.34, h * 0.35, 0, 0.16, h * 0.5, 7, 'y', true, true, 0.14);
      m.cylinder(-0.34, h * 0.5, 0, 0.14, h * 0.35, 7, 'y', true, true, 0.12);
    }
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addRock = function (m, rnd, x, y, z) {
    var from = m.vcount;
    var r = 0.6 + rnd() * 2.6;
    var radii = [];
    for (var i = 0; i < 6; i++) radii.push(r * (0.6 + rnd() * 0.7));
    m.setColorHex(KK.mixHex(0x8a8378, 0x5a564e, rnd())).setMat(MAT.ROCK);
    m.prisma(0, -r * 0.2, 0, radii, r * (0.8 + rnd() * 0.9), 0, rnd());
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addContainer = function (m, rnd, x, y, z, yaw) {
    var from = m.vcount;
    var cols = [0xc8402a, 0x2a6fc8, 0x2a9a5a, 0xe8a020, 0x8a8f96, 0x2a2e34];
    var w = 2.4, l = 6.1, h = 2.6;
    var stack = rnd() < 0.4 ? 2 : 1;
    for (var s = 0; s < stack; s++) {
      m.setColorHex(KK.pick ? cols[(rnd() * cols.length) | 0] : cols[0]).setMat(MAT.METAL);
      m.box(0, s * h + h / 2, 0, w, h, l);
      m.setColorHex(0x1a1d22).setMat(MAT.METAL);
      for (var i = 0; i < 5; i++) {
        m.face([-w / 2 - 0.03, s * h + 0.2, -l / 2 + 0.6 + i * (l - 1.2) / 4],
          [-w / 2 - 0.03, s * h + h - 0.2, -l / 2 + 0.6 + i * (l - 1.2) / 4],
          [-w / 2 - 0.03, s * h + h - 0.2, -l / 2 + 0.72 + i * (l - 1.2) / 4],
          [-w / 2 - 0.03, s * h + 0.2, -l / 2 + 0.72 + i * (l - 1.2) / 4]);
        m.face([w / 2 + 0.03, s * h + 0.2, -l / 2 + 0.72 + i * (l - 1.2) / 4],
          [w / 2 + 0.03, s * h + h - 0.2, -l / 2 + 0.72 + i * (l - 1.2) / 4],
          [w / 2 + 0.03, s * h + h - 0.2, -l / 2 + 0.6 + i * (l - 1.2) / 4],
          [w / 2 + 0.03, s * h + 0.2, -l / 2 + 0.6 + i * (l - 1.2) / 4]);
      }
    }
    var mm = M4.create();
    M4.fromRotationTranslation(mm, 0, yaw + (rnd() - 0.5) * 0.3, 0, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addColumn = function (m, rnd, x, y, z) {
    var from = m.vcount;
    var h = 7 + rnd() * 11;
    var broken = rnd() < 0.35;
    if (broken) h *= 0.45;
    m.setColorHex(0xcbb894).setMat(MAT.CONCRETE);
    m.cylinder(0, 0, 0, 0.72, h, 12, 'y', true, true, 0.62);
    m.box(0, -0.25, 0, 2.4, 0.5, 2.4);
    if (!broken) {
      m.setColorHex(0xd8c8a4).setMat(MAT.CONCRETE);
      m.box(0, h + 0.3, 0, 1.9, 0.6, 1.9);
      m.box(0, h + 0.85, 0, 2.3, 0.5, 2.3);
    }
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addWindcatcher = function (m, rnd, x, y, z) {
    var from = m.vcount;
    var h = 7 + rnd() * 9;
    m.setColorHex(0xc8a878).setMat(MAT.BRICK);
    m.box(0, h / 2, 0, 3.2, h, 3.2);
    m.setColorHex(0x2a2620).setMat(MAT.METAL);
    for (var i = 0; i < 3; i++) {
      m.box(-1.0 + i, h - 0.6, 1.62, 0.7, h * 0.7, 0.1);
      m.box(-1.0 + i, h - 0.6, -1.62, 0.7, h * 0.7, 0.1);
    }
    m.setColorHex(0xb09468).setMat(MAT.BRICK);
    m.box(0, h + 0.2, 0, 3.6, 0.4, 3.6);
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addDome = function (m, rnd, x, y, z) {
    var from = m.vcount;
    var r = 4 + rnd() * 5;
    m.setColorHex(0xd8c9a8).setMat(MAT.BRICK);
    m.box(0, r * 0.5, 0, r * 2.2, r, r * 2.2);
    m.setColorHex(0x2ec4b6).setMat(MAT.METAL);
    m.sphere(0, r, 0, r * 0.95, 14, 8, [1, 0.9, 1]);
    m.setColorHex(0xf2c14e).setMat(MAT.CHROME);
    m.cylinder(0, r * 1.85, 0, 0.12, 1.4, 6, 'y', true, true);
    // مناره
    if (rnd() < 0.7) {
      m.setColorHex(0xd8c9a8).setMat(MAT.BRICK);
      m.cylinder(r * 1.5, 0, r * 1.5, 0.9, r * 2.4, 10, 'y', true, true, 0.75);
      m.setColorHex(0x2ec4b6).setMat(MAT.METAL);
      m.cylinder(r * 1.5, r * 2.4, r * 1.5, 1.0, 0.8, 10, 'y', true, true, 0.8);
    }
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addStreetLight = function (m, x, y, z, yaw, side, th) {
    var from = m.vcount;
    var h = 8.5;
    m.setColorHex(0x55595f).setMat(MAT.METAL);
    m.cylinder(0, 0, 0, 0.11, h, 7, 'y', false, false, 0.07);
    m.box(-side * 1.0, h - 0.1, 0, 2.1, 0.14, 0.14);
    m.setColorHex(0xfff0c0).setMat(MAT.EMISSIVE);
    m.box(-side * 1.9, h - 0.28, 0, 1.0, 0.16, 0.42);
    var mm = M4.create();
    M4.fromRotationTranslation(mm, 0, yaw, 0, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addGrandstand = function (m, x, y, z, yaw, face, th) {
    var from = m.vcount;
    var w = 46, rows = 7;
    m.setColorHex(0x6a6f76).setMat(MAT.CONCRETE);
    for (var i = 0; i < rows; i++) {
      m.box(0, i * 0.62 + 0.31, face * (i * 0.9), w, 0.62, 1.1);
    }
    m.setColorHex(0x2a3f6a).setMat(MAT.METAL);
    m.box(0, rows * 0.62 + 1.0, face * (rows * 0.9 - 1), w, 2.2, 0.3);
    m.setColorHex(0xb8bec6).setMat(MAT.METAL);
    m.box(-w / 2 + 0.3, rows * 0.62 / 2, face * rows * 0.9, 0.3, rows * 0.62, 0.3);
    m.box(w / 2 - 0.3, rows * 0.62 / 2, face * rows * 0.9, 0.3, rows * 0.62, 0.3);
    // تماشاچی‌ها (مکعب‌های رنگی)
    var rnd = KK.mulberry32(KK.hashSeed(this.def.seed + '|crowd'));
    var pal = [0xd8402a, 0x2a6fc8, 0xf0c020, 0xf2f2f2, 0x2a9a5a, 0x8a2fd8];
    for (i = 0; i < rows; i++) {
      for (var c = 0; c < 18; c++) {
        if (rnd() < 0.22) continue;
        m.setColorHex(pal[(rnd() * pal.length) | 0]).setMat(MAT.CONCRETE);
        m.box(-w / 2 + 1.5 + c * (w - 3) / 17, i * 0.62 + 1.0, face * (i * 0.9), 0.42, 0.78, 0.36);
      }
    }
    var mm = M4.create();
    M4.fromRotationTranslation(mm, 0, yaw, 0, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addCone = function (m, x, y, z, th) {
    var from = m.vcount;
    m.setColorHex(0xff6a1a).setMat(MAT.CONCRETE);
    m.cone(0, 0, 0, 0.26, 0.62, 8);
    m.setColorHex(0xf2f2f2).setMat(MAT.CONCRETE);
    m.cylinder(0, 0.30, 0, 0.17, 0.12, 8, 'y', false, false, 0.16);
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addTireStack = function (m, x, y, z, th) {
    var from = m.vcount;
    for (var i = 0; i < 3; i++) {
      m.setColorHex(0x14161a).setMat(MAT.RUBBER);
      m.cylinder(0, i * 0.34, 0, 0.44, 0.32, 12, 'y', true, true);
      m.setColorHex(0xd8dde3).setMat(MAT.CONCRETE);
      m.cylinder(0, i * 0.34 + 0.16, 0, 0.2, 0.02, 10, 'y', true, true);
    }
    var mm = M4.create();
    M4.translation(mm, x, y, z);
    m.transform(mm, from);
  };

  Track.prototype.addBillboard = function (m, dm, rnd, x, y, z, yaw, face) {
    var from = m.vcount;
    var w = 7, h = 3.2, top = 4.4;
    m.setColorHex(0x6a6f76).setMat(MAT.METAL);
    m.cylinder(-w * 0.3, 0, 0, 0.14, top, 7, 'y', false, false, 0.12);
    m.cylinder(w * 0.3, 0, 0, 0.14, top, 7, 'y', false, false, 0.12);
    m.setColorHex(0x1d2128).setMat(MAT.METAL);
    m.box(0, top + h / 2, 0, w + 0.4, h + 0.3, 0.22);
    var mm = M4.create();
    M4.fromRotationTranslation(mm, 0, yaw, 0, x, y, z);
    m.transform(mm, from);

    // پنل متنی
    var slot = (this.decalIndex || 1) % 4;
    this.decalIndex = (this.decalIndex || 1) + 1;
    var v0 = dm.vcount;
    var p = function (lx, ly, lz) {
      var c = Math.cos(yaw), s = Math.sin(yaw);
      return [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    };
    var yb = top, yt = top + h;
    var A = p(-w / 2, yt, face * 0.13), B = p(w / 2, yt, face * 0.13);
    var C = p(w / 2, yb, face * 0.13), D = p(-w / 2, yb, face * 0.13);
    var nrm = [-Math.sin(yaw) * face, 0, -Math.cos(yaw) * face];
    dm.setColor(1, 1, 1).setMat(MAT.CONCRETE);
    dm.v(A[0], A[1], A[2], nrm[0], nrm[1], nrm[2], 0, slot / 4);
    dm.v(B[0], B[1], B[2], nrm[0], nrm[1], nrm[2], 1, slot / 4);
    dm.v(C[0], C[1], C[2], nrm[0], nrm[1], nrm[2], 1, (slot + 1) / 4);
    dm.v(D[0], D[1], D[2], nrm[0], nrm[1], nrm[2], 0, (slot + 1) / 4);
    dm.quad(v0, v0 + 1, v0 + 2, v0 + 3);
  };

  /* ---------------------------------------------------------- آمار مش‌ها */
  Track.prototype.triCount = function () {
    return this.roadMesh.idx.length / 3 + this.propMesh.idx.length / 3 + this.decalMesh.idx.length / 3;
  };

  /* --------------------------------------------------------------- صادرات */
  var API = { Track: Track };
  KK.trackModule = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
