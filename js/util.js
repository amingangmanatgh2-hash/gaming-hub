/* ==========================================================================
   کف‌خواب ریسینگ  —  KAFKHAB RACING
   util.js  ::  ریاضیات، تولید اعداد تصادفی قطعی، و سازنده‌ی مش
   هیچ وابستگی خارجی ندارد. تمام هندسه‌ی بازی به‌صورت رویه‌ای (procedural)
   و در زمان اجرا ساخته می‌شود؛ هیچ فایل مدل یا تکسچری بارگذاری نمی‌شود.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- ریاضی */
  var PI = Math.PI, TAU = PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function smoother(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
  function approach(cur, target, step) {
    if (cur < target) return Math.min(cur + step, target);
    if (cur > target) return Math.max(cur - step, target);
    return target;
  }
  /** کوتاه‌ترین اختلاف زاویه‌ای بین دو زاویه (رادیان) */
  function angDiff(a, b) {
    var d = (b - a) % TAU;
    if (d > PI) d -= TAU; else if (d < -PI) d += TAU;
    return d;
  }
  function angLerp(a, b, t) { return a + angDiff(a, b) * t; }

  /* ------------------------------------------------- تولید عدد تصادفی قطعی
     هر پیست و هر خودرو با یک seed ثابت ساخته می‌شود تا در همه‌ی دستگاه‌ها
     دقیقاً یک شکل باشد.                                                      */
  function mulberry32(seed) {
    var a = seed >>> 0;
    var f = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = function (lo, hi) { return lo + (hi - lo) * f(); };
    f.int = function (lo, hi) { return Math.floor(lo + (hi - lo + 1) * f()) ; };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; };
    f.chance = function (p) { return f() < p; };
    f.sign = function () { return f() < 0.5 ? -1 : 1; };
    f.gauss = function () {
      var u = 0, v = 0;
      while (u === 0) u = f();
      while (v === 0) v = f();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
    };
    return f;
  }
  function hashSeed(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  /** نویز رویه‌ای یک‌بعدی با درون‌یابی نرم */
  function noise1(seed) {
    var rnd = mulberry32(seed);
    var table = new Float32Array(512);
    for (var i = 0; i < 512; i++) table[i] = rnd() * 2 - 1;
    return function (x) {
      var i = Math.floor(x), fr = x - i;
      var a = table[((i % 512) + 512) % 512];
      var b = table[(((i + 1) % 512) + 512) % 512];
      return lerp(a, b, smooth(fr));
    };
  }
  /** fBm یک‌بعدی */
  function fbm1(seed, octaves, lac, gain) {
    octaves = octaves || 4; lac = lac || 2.0; gain = gain || 0.5;
    var fns = [], amp = 1, norm = 0, freq = 1;
    for (var o = 0; o < octaves; o++) {
      fns.push({ f: noise1((seed + o * 7919) | 0), a: amp, q: freq });
      norm += amp; amp *= gain; freq *= lac;
    }
    return function (x) {
      var s = 0;
      for (var i = 0; i < fns.length; i++) s += fns[i].f(x * fns[i].q) * fns[i].a;
      return s / norm;
    };
  }

  /* ------------------------------------------------------------------ ماتریس
     همه‌ی ماتریس‌ها ۴×۴ و column-major هستند (همان قرارداد WebGL).          */
  var M4 = {
    create: function () { var m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    identity: function (o) {
      o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
      o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
      return o;
    },
    multiply: function (o, a, b) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],
        b0, b1, b2, b3;
      b0 = b[0]; b1 = b[1]; b2 = b[2]; b3 = b[3];
      o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
      o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
      o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
      o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      return o;
    },
    perspective: function (o, fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
      o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
      return o;
    },
    lookAt: function (o, eye, center, up) {
      var z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
      var len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
      z0 *= len; z1 *= len; z2 *= len;
      var x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
      len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
      if (!len) { x0 = 1; x1 = 0; x2 = 0; } else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }
      var y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
      o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
      o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
      o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
      o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
      o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
      o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
      o[15] = 1;
      return o;
    },
    fromRotationTranslation: function (o, rx, ry, rz, tx, ty, tz) {
      var cx = Math.cos(rx), sx = Math.sin(rx),
        cy = Math.cos(ry), sy = Math.sin(ry),
        cz = Math.cos(rz), sz = Math.sin(rz);
      // R = Ry * Rx * Rz
      o[0] = cy * cz + sy * sx * sz;
      o[1] = cx * sz;
      o[2] = -sy * cz + cy * sx * sz;
      o[3] = 0;
      o[4] = -cy * sz + sy * sx * cz;
      o[5] = cx * cz;
      o[6] = sy * sz + cy * sx * cz;
      o[7] = 0;
      o[8] = sy * cx;
      o[9] = -sx;
      o[10] = cy * cx;
      o[11] = 0;
      o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
      return o;
    },
    translation: function (o, x, y, z) {
      M4.identity(o); o[12] = x; o[13] = y; o[14] = z; return o;
    },
    scale: function (o, x, y, z) {
      M4.identity(o); o[0] = x; o[5] = y; o[10] = z; return o;
    },
    /** نرمال‌ماتریس ۳×۳ از یک ماتریس ۴×۴ (فرض: بدون برش نامتقارن) */
    normalFromMat4: function (o, m) {
      var a00 = m[0], a01 = m[1], a02 = m[2],
        a10 = m[4], a11 = m[5], a12 = m[6],
        a20 = m[8], a21 = m[9], a22 = m[10];
      o[0] = a00; o[1] = a01; o[2] = a02;
      o[3] = a10; o[4] = a11; o[5] = a12;
      o[6] = a20; o[7] = a21; o[8] = a22;
      return o;
    },
    /** تبدیل یک نقطه با ماتریس ۴×۴ */
    transformPoint: function (out, m, p) {
      var x = p[0], y = p[1], z = p[2];
      out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      return out;
    }
  };

  /* ------------------------------------------------------------- سازنده‌ی مش
     تمام هندسه‌ی بازی (پیست، ماشین، درخت، ساختمان، ...) با این سازنده
     تولید می‌شود. فرمت رأس: pos(3) normal(3) uv(2) color(3) mat(1) = 12 float */
  var MAT = {
    ASPHALT: 0, CURB: 1, PAINT: 2, GLASS: 3, CHROME: 4, RUBBER: 5,
    EMISSIVE: 6, GRASS: 7, ROCK: 8, SAND: 9, METAL: 10, CONCRETE: 11,
    WATER: 12, FOLIAGE: 13, BRICK: 14, NEON: 15, DIRT: 16, SNOW: 17
  };

  var STRIDE = 12;

  function MeshBuilder() {
    this.verts = [];   // Float32Array-backed plain array for speed of building
    this.idx = [];
    this.vcount = 0;
    this.color = [1, 1, 1];
    this.mat = 0;
    this.uvScale = 1;
    this.bounds = { minX: 1e9, minY: 1e9, minZ: 1e9, maxX: -1e9, maxY: -1e9, maxZ: -1e9 };
  }
  MeshBuilder.prototype.setColor = function (r, g, b) { this.color[0] = r; this.color[1] = g; this.color[2] = b; return this; };
  MeshBuilder.prototype.setColorHex = function (hex) {
    this.color[0] = ((hex >> 16) & 255) / 255;
    this.color[1] = ((hex >> 8) & 255) / 255;
    this.color[2] = (hex & 255) / 255;
    return this;
  };
  MeshBuilder.prototype.setMat = function (m) { this.mat = m; return this; };
  MeshBuilder.prototype.setUVScale = function (s) { this.uvScale = s; return this; };

  MeshBuilder.prototype.v = function (x, y, z, nx, ny, nz, u, v) {
    var a = this.verts;
    a.push(x, y, z, nx, ny, nz, u * this.uvScale, v * this.uvScale,
      this.color[0], this.color[1], this.color[2], this.mat);
    var b = this.bounds;
    if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
    if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z;
    return this.vcount++;
  };
  MeshBuilder.prototype.tri = function (a, b, c) { this.idx.push(a, b, c); return this; };
  MeshBuilder.prototype.quad = function (a, b, c, d) { this.idx.push(a, b, c, a, c, d); return this; };

  /** نرمال‌های یک مثلث را محاسبه و روی رأس‌ها اعمال می‌کند */
  MeshBuilder.prototype._n = function (ia, ib, ic, out) {
    var v = this.verts;
    var ax = v[ia * STRIDE], ay = v[ia * STRIDE + 1], az = v[ia * STRIDE + 2];
    var bx = v[ib * STRIDE], by = v[ib * STRIDE + 1], bz = v[ib * STRIDE + 2];
    var cx = v[ic * STRIDE], cy = v[ic * STRIDE + 1], cz = v[ic * STRIDE + 2];
    var ux = bx - ax, uy = by - ay, uz = bz - az;
    var wx = cx - ax, wy = cy - ay, wz = cz - az;
    var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  };

  /** چهارگوش مسطح با نرمال خودکار (ترتیب ساعتگرد از دید بیرون) */
  var _tn = [0, 0, 0];
  MeshBuilder.prototype.face = function (p0, p1, p2, p3, u0, v0, u1, v1) {
    this._nArr = this._nArr || new Float32Array(3);
    var base = this.vcount;
    // mکنیم رأس‌ها را با نرمال موقت می‌گذاریم و بعد اصلاح می‌کنیم
    var i0 = this.v(p0[0], p0[1], p0[2], 0, 1, 0, u0 === undefined ? 0 : u0, v0 === undefined ? 0 : v0);
    var i1 = this.v(p1[0], p1[1], p1[2], 0, 1, 0, u1 === undefined ? 1 : u1, v0 === undefined ? 0 : v0);
    var i2 = this.v(p2[0], p2[1], p2[2], 0, 1, 0, u1 === undefined ? 1 : u1, v1 === undefined ? 1 : v1);
    var i3 = this.v(p3[0], p3[1], p3[2], 0, 1, 0, u0 === undefined ? 0 : u0, v1 === undefined ? 1 : v1);
    this._n(i0, i1, i2, _tn);
    var s = STRIDE, V = this.verts;
    V[i0 * s + 3] = _tn[0]; V[i0 * s + 4] = _tn[1]; V[i0 * s + 5] = _tn[2];
    V[i1 * s + 3] = _tn[0]; V[i1 * s + 4] = _tn[1]; V[i1 * s + 5] = _tn[2];
    V[i2 * s + 3] = _tn[0]; V[i2 * s + 4] = _tn[1]; V[i2 * s + 5] = _tn[2];
    V[i3 * s + 3] = _tn[0]; V[i3 * s + 4] = _tn[1]; V[i3 * s + 5] = _tn[2];
    this.quad(i0, i1, i2, i3);
    return base;
  };

  /** جعبه‌ی محورتراز */
  MeshBuilder.prototype.box = function (cx, cy, cz, sx, sy, sz) {
    var x0 = cx - sx / 2, x1 = cx + sx / 2;
    var y0 = cy - sy / 2, y1 = cy + sy / 2;
    var z0 = cz - sz / 2, z1 = cz + sz / 2;
    var u = Math.max(sx, sz), vv = Math.max(sy, sx);
    // بالا (+Y)
    this.face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 0, u, u);
    // پایین (-Y)
    this.face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, 0, u, u);
    // جلو (+Z)
    this.face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, u, vv);
    // عقب (-Z)
    this.face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, u, vv);
    // راست (+X)
    this.face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0, 0, u, vv);
    // چپ (-X)
    this.face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0, 0, u, vv);
    return this;
  };

  /** جعبه‌ای که عرض/ارتفاع آن در دو انتهای Z متفاوت است (برای بدنه‌ی ماشین) */
  MeshBuilder.prototype.taperBox = function (z, len, w0, h0, w1, h1, yBase, yTop0, yTop1) {
    // مقطع z0 و z1
    var z0 = z, z1 = z + len;
    var a0 = w0 / 2, a1 = w1 / 2;
    var b0 = yBase, t0 = yTop0, b1 = yBase, t1 = yTop1;
    this.face([-a0, t0, z1], [a0, t0, z1], [a1, t1, z0], [-a1, t1, z0]);
    this.face([-a1, b1, z0], [a1, b1, z0], [a0, b0, z1], [-a0, b0, z1]);
    this.face([-a0, b0, z1], [a0, b0, z1], [a0, t0, z1], [-a0, t0, z1]);
    this.face([a1, b1, z0], [-a1, b1, z0], [-a1, t1, z0], [a1, t1, z0]);
    this.face([a0, b0, z1], [a1, b1, z0], [a1, t1, z0], [a0, t0, z1]);
    this.face([-a1, b1, z0], [-a0, b0, z1], [-a0, t0, z1], [-a1, t1, z0]);
    return this;
  };

  /** استوانه با تعداد ضلع دلخواه (چرخ‌ها، ستون‌ها، لوله‌ها) */
  MeshBuilder.prototype.cylinder = function (cx, cy, cz, r, h, seg, axis, capTop, capBottom, r2) {
    seg = Math.max(3, seg | 0);
    axis = axis || 'y';
    if (r2 === undefined) r2 = r;
    var i, a, ca, sa, base = this.vcount;
    var rings = [];
    for (var k = 0; k < 2; k++) {
      var rad = k === 0 ? r : r2;
      var off = k === 0 ? 0 : h;
      var start = this.vcount;
      for (i = 0; i <= seg; i++) {
        a = (i / seg) * TAU; ca = Math.cos(a); sa = Math.sin(a);
        var px, py, pz, nx, ny, nz;
        if (axis === 'y') { px = cx + ca * rad; py = cy + off; pz = cz + sa * rad; nx = ca; ny = 0; nz = sa; }
        else if (axis === 'z') { px = cx + ca * rad; py = cy + sa * rad; pz = cz + off; nx = ca; ny = sa; nz = 0; }
        else { px = cx + off; py = cy + ca * rad; pz = cz + sa * rad; nx = 0; ny = ca; nz = sa; }
        this.v(px, py, pz, nx, ny, nz, i / seg, k);
      }
      rings.push(start);
    }
    for (i = 0; i < seg; i++) {
      var a0 = rings[0] + i, a1 = rings[0] + i + 1, b1 = rings[1] + i + 1, b0 = rings[1] + i;
      this.quad(a0, a1, b1, b0);
    }
    if (capBottom) this._cap(cx, cy, cz, r, seg, axis, -1, 0);
    if (capTop) this._cap(cx, cy, cz, r2, seg, axis, 1, h);
    return this;
  };
  MeshBuilder.prototype._cap = function (cx, cy, cz, r, seg, axis, dir, off) {
    var i, a, ca, sa, c;
    if (axis === 'y') c = this.v(cx, cy + off, cz, 0, dir, 0, 0.5, 0.5);
    else if (axis === 'z') c = this.v(cx, cy, cz + off, 0, 0, dir, 0.5, 0.5);
    else c = this.v(cx + off, cy, cz, dir, 0, 0, 0.5, 0.5);
    var start = this.vcount;
    for (i = 0; i <= seg; i++) {
      a = (i / seg) * TAU; ca = Math.cos(a); sa = Math.sin(a);
      if (axis === 'y') this.v(cx + ca * r, cy + off, cz + sa * r, 0, dir, 0, 0.5 + ca * 0.5, 0.5 + sa * 0.5);
      else if (axis === 'z') this.v(cx + ca * r, cy + sa * r, cz + off, 0, 0, dir, 0.5 + ca * 0.5, 0.5 + sa * 0.5);
      else this.v(cx + off, cy + ca * r, cz + sa * r, dir, 0, 0, 0.5 + ca * 0.5, 0.5 + sa * 0.5);
    }
    for (i = 0; i < seg; i++) {
      if (dir > 0) this.tri(c, start + i, start + i + 1);
      else this.tri(c, start + i + 1, start + i);
    }
  };

  /** کره (گنبد، سر ستون، ...) */
  MeshBuilder.prototype.sphere = function (cx, cy, cz, r, seg, rings, scale) {
    seg = Math.max(4, seg | 0); rings = Math.max(2, rings | 0);
    scale = scale || [1, 1, 1];
    var ringStart = [], i, j;
    for (j = 0; j <= rings; j++) {
      var phi = (j / rings) * PI;
      var y = Math.cos(phi), rr = Math.sin(phi);
      var start = this.vcount;
      for (i = 0; i <= seg; i++) {
        var th = (i / seg) * TAU;
        var nx = rr * Math.cos(th), ny = y, nz = rr * Math.sin(th);
        this.v(cx + nx * r * scale[0], cy + ny * r * scale[1], cz + nz * r * scale[2],
          nx / (scale[0] || 1), ny / (scale[1] || 1), nz / (scale[2] || 1), i / seg, j / rings);
      }
      ringStart.push(start);
    }
    for (j = 0; j < rings; j++) {
      for (i = 0; i < seg; i++) {
        var a = ringStart[j] + i, b = ringStart[j] + i + 1,
          c = ringStart[j + 1] + i + 1, d = ringStart[j + 1] + i;
        if (j !== 0) this.tri(a, b, c);
        if (j !== rings - 1) this.tri(a, c, d);
      }
    }
    return this;
  };

  /** مخروط */
  MeshBuilder.prototype.cone = function (cx, cy, cz, r, h, seg) {
    seg = Math.max(3, seg | 0);
    var tip = this.v(cx, cy + h, cz, 0, 1, 0, 0.5, 0);
    var start = this.vcount, i;
    var sl = r / Math.sqrt(r * r + h * h), sy = h / Math.sqrt(r * r + h * h);
    for (i = 0; i <= seg; i++) {
      var a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      this.v(cx + ca * r, cy, cz + sa * r, ca * sl, sy, sa * sl, i / seg, 1);
    }
    for (i = 0; i < seg; i++) this.tri(tip, start + i, start + i + 1);
    this._cap(cx, cy, cz, r, seg, 'y', -1, 0);
    return this;
  };

  /** منشور چندضلعی نامنظم از روی شعاع‌ها (بدنه‌ی صخره، ساختمان هشت‌ضلعی) */
  MeshBuilder.prototype.prisma = function (cx, cy, cz, radii, h, jitterSeed, twist) {
    var n = radii.length, i, j;
    var rnd = jitterSeed ? mulberry32(jitterSeed) : null;
    var rings = [], k;
    for (k = 0; k <= 1; k++) {
      var start = this.vcount, y = cy + k * h, sc = k === 0 ? 1 : (twist === undefined ? 1 : twist);
      for (i = 0; i <= n; i++) {
        var a = (i / n) * TAU + (k * (twist ? 0.2 : 0));
        var r = radii[i % n] * sc * (k ? 1 : (rnd ? 1 + (rnd() - 0.5) * 0.15 : 1));
        var ca = Math.cos(a), sa = Math.sin(a);
        this.v(cx + ca * r, y, cz + sa * r, ca, 0, sa, i / n, k);
      }
      rings.push(start);
    }
    for (i = 0; i < n; i++) this.quad(rings[0] + i, rings[0] + i + 1, rings[1] + i + 1, rings[1] + i);
    var top = this.v(cx, cy + h, cz, 0, 1, 0, 0.5, 0.5);
    for (i = 0; i < n; i++) this.tri(top, rings[1] + i, rings[1] + i + 1);
    var bot = this.v(cx, cy, cz, 0, -1, 0, 0.5, 0.5);
    for (i = 0; i < n; i++) this.tri(bot, rings[0] + i + 1, rings[0] + i);
    return this;
  };

  /** اعمال یک ماتریس ۴×۴ روی تمام رأس‌های اضافه‌شده از `from` به بعد */
  MeshBuilder.prototype.transform = function (m, from) {
    from = from || 0;
    var V = this.verts, s = STRIDE, nm = new Float32Array(9);
    M4.normalFromMat4(nm, m);
    for (var i = from; i < this.vcount; i++) {
      var o = i * s, x = V[o], y = V[o + 1], z = V[o + 2];
      V[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
      V[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      V[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      var nx = V[o + 3], ny = V[o + 4], nz = V[o + 5];
      var tx = nm[0] * nx + nm[3] * ny + nm[6] * nz;
      var ty = nm[1] * nx + nm[4] * ny + nm[7] * nz;
      var tz = nm[2] * nx + nm[5] * ny + nm[8] * nz;
      var l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      V[o + 3] = tx / l; V[o + 4] = ty / l; V[o + 5] = tz / l;
      this._updBound(V[o], V[o + 1], V[o + 2]);
    }
    return this;
  };
  MeshBuilder.prototype._updBound = function (x, y, z) {
    var b = this.bounds;
    if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
    if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z;
  };

  /**
   * محاسبه‌ی نرمال نرم برای رأس‌های بازه‌ی [from, to) با میانگین‌گیری از
   * نرمال تمام مثلث‌هایی که در بازه‌ی ایندکس [idxFrom, idxTo) به آن‌ها
   * اشاره می‌شوند. برای بدنه‌ی ماشین ضروری است تا سطوح پیوسته دیده شوند.
   */
  MeshBuilder.prototype.smoothNormals = function (from, to, idxFrom, idxTo) {
    from = from || 0;
    to = to === undefined ? this.vcount : to;
    idxFrom = idxFrom || 0;
    idxTo = idxTo === undefined ? this.idx.length : idxTo;
    var V = this.verts, s = STRIDE, n = to - from;
    if (n <= 0) return this;
    var acc = new Float32Array(n * 3), i;
    var tn = [0, 0, 0];
    for (i = idxFrom; i + 2 < idxTo + 2; i += 3) {
      if (i + 2 >= idxTo) break;
      var ia = this.idx[i], ib = this.idx[i + 1], ic = this.idx[i + 2];
      this._n(ia, ib, ic, tn);
      var ids = [ia, ib, ic];
      for (var q = 0; q < 3; q++) {
        var d = ids[q] - from;
        if (d < 0 || d >= n) continue;
        acc[d * 3] += tn[0]; acc[d * 3 + 1] += tn[1]; acc[d * 3 + 2] += tn[2];
      }
    }
    for (i = 0; i < n; i++) {
      var l = Math.sqrt(acc[i * 3] * acc[i * 3] + acc[i * 3 + 1] * acc[i * 3 + 1] + acc[i * 3 + 2] * acc[i * 3 + 2]);
      if (l > 1e-8) {
        V[(i + from) * s + 3] = acc[i * 3] / l;
        V[(i + from) * s + 4] = acc[i * 3 + 1] / l;
        V[(i + from) * s + 5] = acc[i * 3 + 2] / l;
      }
    }
    return this;
  };

  /** جابه‌جایی ساده */
  MeshBuilder.prototype.translate = function (dx, dy, dz, from) {
    from = from || 0;
    var V = this.verts, s = STRIDE;
    for (var i = from; i < this.vcount; i++) {
      var o = i * s;
      V[o] += dx; V[o + 1] += dy; V[o + 2] += dz;
      this._updBound(V[o], V[o + 1], V[o + 2]);
    }
    return this;
  };

  /**
   * آینه‌سازی روی صفحه‌ی YZ (قرینه‌ی X) برای رأس‌های از `from` به بعد.
   * `fromIdx` = اولین ایندکسِ فهرستِ مثلث‌ها که باید جهتشان برعکس شود.
   */
  MeshBuilder.prototype.mirrorX = function (from, fromIdx) {
    from = from || 0; fromIdx = fromIdx || 0;
    var V = this.verts, s = STRIDE, i;
    for (i = from; i < this.vcount; i++) {
      var o = i * s;
      V[o] = -V[o]; V[o + 3] = -V[o + 3];
      this._updBound(V[o], V[o + 1], V[o + 2]);
    }
    for (var t = fromIdx; t < this.idx.length; t += 3) {
      var tmp = this.idx[t + 1]; this.idx[t + 1] = this.idx[t + 2]; this.idx[t + 2] = tmp;
    }
    return this;
  };

  /** میان‌یابی Catmull-Rom روی یک بعد */
  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  /** درون‌یابی رنگ به‌صورت hex */
  function mixHex(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((ar + (br - ar) * t) << 16 | (ag + (bg - ag) * t) << 8 | (ab + (bb - ab) * t)) & 0xffffff;
  }
  function hexToRgb(hex) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }

  /* ------------------------------------------------------------- خروجی ماژول */
  var API = {
    PI: PI, TAU: TAU,
    clamp: clamp, lerp: lerp, smooth: smooth, smoother: smoother, sign: sign,
    approach: approach, angDiff: angDiff, angLerp: angLerp,
    mulberry32: mulberry32, hashSeed: hashSeed, noise1: noise1, fbm1: fbm1,
    M4: M4, MeshBuilder: MeshBuilder, MAT: MAT, STRIDE: STRIDE,
    catmull: catmull, mixHex: mixHex, hexToRgb: hexToRgb
  };

  root.KK = root.KK || {};
  for (var k in API) if (API.hasOwnProperty(k)) root.KK[k] = API[k];

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
