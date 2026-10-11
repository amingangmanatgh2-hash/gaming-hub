/* ==========================================================================
   car.js  ::  سازنده‌ی هندسه‌ی خودرو + مدل فیزیکی رانندگی
   --------------------------------------------------------------------------
   بدنه با «لافِت» (loft) یک منحنی مقطع سوپر‌بیضی روی ۱۱ ایستگاه طولی ساخته
   می‌شود؛ قوس چرخ‌ها هم با بالا بردن لبه‌ی پایینی مقطع در ناحیه‌ی چرخ
   تولید می‌شود. هیچ مدل آماده‌ای بارگذاری نمی‌شود.
   ========================================================================== */
(function (root) {
  'use strict';
  var KK = root.KK;
  var M4 = KK.M4, MB = KK.MeshBuilder, MAT = KK.MAT;
  var clamp = KK.clamp, lerp = KK.lerp, smooth = KK.smooth, PI = KK.PI, TAU = KK.TAU;

  /* ========================================================== الگوهای بدنه
     هر ردیف: [z, عرض(کسری از عرض کل), کف(کسری از ارتفاع), سقف, ضریب کابین]
     z از -0.5 (عقب) تا +0.5 (جلو) نرمال شده است.                          */
  var SHAPES = {
    hatch: {
      px: 0.72, py: 0.62, tumble: 0.16, s: [
        [-0.50, 0.84, 0.34, 0.50, 0], [-0.44, 0.94, 0.24, 0.66, 0],
        [-0.34, 0.99, 0.19, 0.88, 0.6], [-0.22, 1.00, 0.17, 0.99, 1],
        [-0.06, 1.00, 0.17, 1.00, 1], [0.06, 0.99, 0.18, 0.92, 1],
        [0.16, 0.97, 0.20, 0.74, 0.5], [0.28, 0.94, 0.22, 0.64, 0],
        [0.40, 0.88, 0.25, 0.57, 0], [0.47, 0.80, 0.28, 0.52, 0],
        [0.50, 0.70, 0.33, 0.47, 0]]
    },
    sedan: {
      px: 0.70, py: 0.60, tumble: 0.17, s: [
        [-0.50, 0.86, 0.34, 0.48, 0], [-0.45, 0.95, 0.25, 0.62, 0],
        [-0.36, 1.00, 0.20, 0.74, 0.4], [-0.28, 1.00, 0.18, 0.92, 1],
        [-0.10, 1.00, 0.18, 0.98, 1], [0.06, 1.00, 0.18, 0.96, 1],
        [0.16, 0.99, 0.19, 0.80, 0.6], [0.26, 0.96, 0.21, 0.66, 0],
        [0.38, 0.92, 0.24, 0.58, 0], [0.46, 0.84, 0.27, 0.52, 0],
        [0.50, 0.74, 0.32, 0.46, 0]]
    },
    coupe: {
      px: 0.66, py: 0.58, tumble: 0.20, s: [
        [-0.50, 0.86, 0.32, 0.44, 0], [-0.44, 0.96, 0.24, 0.58, 0],
        [-0.36, 1.00, 0.20, 0.72, 0.5], [-0.26, 1.00, 0.18, 0.90, 1],
        [-0.10, 1.00, 0.18, 0.97, 1], [0.02, 1.00, 0.18, 0.98, 1],
        [0.12, 0.99, 0.19, 0.88, 0.9], [0.22, 0.97, 0.21, 0.70, 0.3],
        [0.32, 0.94, 0.23, 0.60, 0], [0.42, 0.88, 0.26, 0.52, 0],
        [0.50, 0.76, 0.31, 0.44, 0]]
    },
    muscle: {
      px: 0.78, py: 0.66, tumble: 0.13, s: [
        [-0.50, 0.88, 0.30, 0.44, 0], [-0.45, 0.98, 0.22, 0.60, 0],
        [-0.38, 1.02, 0.18, 0.72, 0.4], [-0.30, 1.02, 0.17, 0.88, 1],
        [-0.14, 1.02, 0.17, 0.94, 1], [-0.02, 1.02, 0.17, 0.92, 1],
        [0.08, 1.00, 0.18, 0.78, 0.5], [0.18, 0.98, 0.20, 0.62, 0],
        [0.30, 0.96, 0.22, 0.55, 0], [0.42, 0.92, 0.25, 0.50, 0],
        [0.50, 0.82, 0.30, 0.44, 0]]
    },
    hyper: {
      px: 0.60, py: 0.52, tumble: 0.24, s: [
        [-0.50, 0.80, 0.30, 0.40, 0], [-0.45, 0.94, 0.22, 0.52, 0],
        [-0.38, 1.00, 0.18, 0.68, 0.5], [-0.30, 1.02, 0.16, 0.86, 1],
        [-0.14, 1.02, 0.16, 0.94, 1], [-0.02, 1.02, 0.16, 0.96, 1],
        [0.10, 1.00, 0.17, 0.84, 0.7], [0.20, 0.98, 0.19, 0.62, 0.1],
        [0.32, 0.96, 0.21, 0.48, 0], [0.44, 0.90, 0.24, 0.40, 0],
        [0.50, 0.78, 0.30, 0.34, 0]]
    },
    gt: {
      px: 0.64, py: 0.56, tumble: 0.20, s: [
        [-0.50, 0.84, 0.30, 0.42, 0], [-0.45, 0.96, 0.23, 0.54, 0],
        [-0.37, 1.01, 0.19, 0.68, 0.4], [-0.28, 1.01, 0.17, 0.86, 1],
        [-0.12, 1.01, 0.17, 0.93, 1], [0.00, 1.01, 0.17, 0.94, 1],
        [0.10, 1.00, 0.18, 0.82, 0.6], [0.22, 0.98, 0.20, 0.62, 0],
        [0.34, 0.95, 0.22, 0.50, 0], [0.46, 0.90, 0.25, 0.44, 0],
        [0.50, 0.80, 0.30, 0.38, 0]]
    },
    drift: {
      px: 0.80, py: 0.70, tumble: 0.10, s: [
        [-0.50, 0.90, 0.28, 0.46, 0], [-0.45, 1.00, 0.20, 0.62, 0],
        [-0.36, 1.06, 0.16, 0.74, 0.5], [-0.27, 1.06, 0.15, 0.90, 1],
        [-0.10, 1.06, 0.15, 0.96, 1], [0.05, 1.06, 0.15, 0.94, 1],
        [0.15, 1.04, 0.16, 0.80, 0.6], [0.26, 1.00, 0.18, 0.64, 0],
        [0.38, 0.96, 0.21, 0.56, 0], [0.47, 0.90, 0.24, 0.50, 0],
        [0.50, 0.82, 0.28, 0.44, 0]]
    },
    buggy: {
      px: 0.86, py: 0.76, tumble: 0.06, s: [
        [-0.50, 0.80, 0.44, 0.58, 0], [-0.40, 0.90, 0.38, 0.64, 0],
        [-0.28, 0.92, 0.34, 0.68, 0], [-0.10, 0.92, 0.32, 0.74, 0.8],
        [0.05, 0.90, 0.32, 0.70, 0.5], [0.20, 0.86, 0.34, 0.62, 0],
        [0.34, 0.80, 0.38, 0.54, 0], [0.44, 0.72, 0.44, 0.48, 0],
        [0.50, 0.60, 0.50, 0.44, 0]]
    },
    pickup: {
      px: 0.82, py: 0.72, tumble: 0.10, s: [
        [-0.50, 0.90, 0.28, 0.46, 0], [-0.48, 0.94, 0.26, 0.72, 0],
        [-0.30, 0.94, 0.26, 0.72, 0], [-0.22, 0.96, 0.24, 0.74, 0.2],
        [-0.16, 0.98, 0.22, 0.94, 1], [-0.02, 0.98, 0.22, 0.98, 1],
        [0.08, 0.98, 0.23, 0.86, 0.8], [0.16, 0.96, 0.25, 0.66, 0],
        [0.30, 0.94, 0.27, 0.60, 0], [0.42, 0.90, 0.30, 0.56, 0],
        [0.50, 0.84, 0.34, 0.50, 0]]
    },
    truck: {
      px: 0.84, py: 0.74, tumble: 0.09, s: [
        [-0.50, 0.92, 0.30, 0.50, 0], [-0.48, 0.96, 0.26, 0.86, 0],
        [-0.20, 0.96, 0.26, 0.86, 0], [-0.14, 0.98, 0.24, 0.88, 0.1],
        [-0.06, 0.98, 0.22, 0.98, 1], [0.10, 0.98, 0.22, 1.00, 1],
        [0.18, 0.96, 0.24, 0.80, 0.4], [0.30, 0.94, 0.26, 0.68, 0],
        [0.42, 0.92, 0.28, 0.62, 0], [0.50, 0.88, 0.32, 0.56, 0]]
    }
  };

  var RING_SEG = 16;   // تعداد نقاط مقطع (بدنه‌ی نرم‌تر)

  /** ارتفاع لبه‌ی پایینی بدنه در طول z، با قوس روی چرخ‌ها */
  function bottomAt(baseY, z, axles, archTop, archHalf) {
    var y = baseY, i, d, t;
    for (i = 0; i < axles.length; i++) {
      d = Math.abs(z - axles[i]) / archHalf;
      if (d < 1) {
        t = smooth(1 - d);
        y = Math.max(y, baseY + (archTop - baseY) * t);
      }
    }
    return y;
  }

  /** یک حلقه‌ی مقطع سوپر‌بیضی */
  function ring(mesh, z, hw, yb, yt, px, py, tumble, uBase) {
    var i, a, ca, sa, w, y, start = mesh.vcount;
    for (i = 0; i <= RING_SEG; i++) {
      a = (i / RING_SEG) * PI;              // 0 → سمت راست، PI → سمت چپ
      ca = Math.cos(a); sa = Math.sin(a);
      w = hw * (1 - tumble * sa);
      var xs = Math.sign(ca) * Math.pow(Math.abs(ca), px) * w;
      y = yb + (yt - yb) * Math.pow(sa, py);
      var ny = Math.pow(sa, py - 1) * py;
      var nx = Math.sign(ca) * Math.pow(Math.abs(ca), px - 1) * px * (w / Math.max(yt - yb, 0.05));
      var l = Math.sqrt(nx * nx + ny * ny) || 1;
      mesh.v(xs, y, z, nx / l, ny / l, 0, uBase + i / RING_SEG, 0);
    }
    return start;
  }

  /** اتصال دو حلقه */
  function stitch(mesh, r0, r1, n, uFlip) {
    for (var i = 0; i < n; i++) {
      if (uFlip) mesh.quad(r0 + i, r1 + i, r1 + i + 1, r0 + i + 1);
      else mesh.quad(r0 + i + 1, r1 + i + 1, r1 + i, r0 + i);
    }
  }

  /* ========================================================================
     ساخت بدنه
     ======================================================================== */
  function buildChassis(def) {
    var sh = SHAPES[def.kind] || SHAPES.coupe;
    var L = def.len, W = def.wid, H = def.ht;
    var zF = L / 2 - def.fOffset;          // محور جلو
    var zR = -L / 2 + def.rOffset;         // محور عقب
    var axles = [zF, zR];
    var archTop = def.wr * 2 + 0.055;
    var archHalf = def.wr * 1.42;

    var mesh = new MB();
    mesh.setColorHex(def.color).setMat(MAT.PAINT);

    var bodyStart = mesh.vcount, bodyIdx = mesh.idx.length;
    var rings = [], st = sh.s, i;

    for (i = 0; i < st.length; i++) {
      var zf = st[i][0], wf = st[i][1], bf = st[i][2], tf = st[i][3];
      var z = zf * L;
      var hw = wf * W / 2;
      var yb = bottomAt(bf * H, z, axles, archTop, archHalf);
      var yt = Math.max(tf * H, yb + 0.04);
      rings.push({ z: z, hw: hw, yb: yb, yt: yt, c: st[i][4], wf: wf, bf: bf, tf: tf });
    }

    // پوسته‌ی اصلی
    var starts = [];
    for (i = 0; i < rings.length; i++) {
      starts.push(ring(mesh, rings[i].z, rings[i].hw, rings[i].yb, rings[i].yt,
        sh.px, sh.py, sh.tumble, 0));
    }
    for (i = 0; i < rings.length - 1; i++) stitch(mesh, starts[i], starts[i + 1], RING_SEG);

    // درپوش جلو و عقب (سپر)
    for (var endIdx = 0; endIdx < 2; endIdx++) {
      var R = endIdx === 0 ? 0 : rings.length - 1;
      var r = rings[R], s0 = starts[R], dir = endIdx === 0 ? 1 : -1;
      var cx = 0, cy = (r.yb + r.yt) / 2, n = RING_SEG, k;
      var c = mesh.v(cx, cy, r.z + dir * 0.02, 0, 0, dir, 0.5, 0.5);
      for (k = 0; k < n; k++) {
        if (dir > 0) mesh.tri(c, s0 + k, s0 + k + 1);
        else mesh.tri(c, s0 + k + 1, s0 + k);
      }
    }

    // کف ماشین
    var b0 = mesh.v(-rings[0].hw * 0.7, rings[0].yb, rings[0].z, 0, -1, 0, 0, 0);
    var b1 = mesh.v(rings[0].hw * 0.7, rings[0].yb, rings[0].z, 0, -1, 0, 1, 0);
    for (i = 1; i < rings.length; i++) {
      var q0 = mesh.v(-rings[i].hw * 0.7, rings[i].yb, rings[i].z, 0, -1, 0, 0, 0);
      var q1 = mesh.v(rings[i].hw * 0.7, rings[i].yb, rings[i].z, 0, -1, 0, 1, 0);
      mesh.quad(b0, b1, q1, q0);
      b0 = q0; b1 = q1;
    }

    mesh.smoothNormals(bodyStart, mesh.vcount, bodyIdx, mesh.idx.length);

    /* ------------------------------------------------------------- گلگیرها
       یک نوار برجسته روی قوس هر چرخ تا فرم بدنه نرم‌تر دیده شود.          */
    if (def.widebody) {
      for (var wIdx = 0; wIdx < 2; wIdx++) {
        var zw = wIdx === 0 ? zF : zR;
        var rr = def.wr * 1.30, y0 = def.wr * 2 + 0.06;
        for (var side = -1; side <= 1; side += 2) {
          mesh.setColorHex(def.color).setMat(MAT.PAINT);
          var f0 = mesh.vcount, fi0 = mesh.idx.length;
          var segs = 10, prev = null;
          for (k = 0; k <= segs; k++) {
            var ang = PI * (k / segs);
            var pz = zw - Math.cos(ang) * rr * 1.05;
            var py = Math.sin(ang) * rr * 0.92 + 0.02;
            var pw = (W / 2) + 0.055 * side;
            var a0 = mesh.v(pw, py, pz, side, 0.2, 0, 0, 0);
            var a1 = mesh.v(pw * 0.86, py, pz, side, 0.1, 0, 0, 1);
            if (prev) mesh.quad(prev[0], prev[1], a1, a0);
            prev = [a0, a1];
          }
          mesh.smoothNormals(f0, mesh.vcount, fi0, mesh.idx.length);
        }
      }
    }

    /* --------------------------------------------------------------- کابین
       شیشه‌ها به‌صورت یک لافِت جداگانه کمی بیرون‌تر از بدنه ساخته می‌شوند. */
    var cabRings = [];
    for (i = 0; i < rings.length; i++) if (rings[i].c > 0.22) cabRings.push(rings[i]);

    var glassStart = mesh.vcount, glassIdx = mesh.idx.length;
    if (cabRings.length >= 2 && def.kind !== 'buggy') {
      mesh.setColor(1, 1, 1).setMat(MAT.GLASS);
      var gs = [];
      for (i = 0; i < cabRings.length; i++) {
        var cr = cabRings[i];
        var belt = lerp(cr.yb, cr.yt, 0.56);
        gs.push(ring(mesh, cr.z, cr.hw * 0.965, belt, cr.yt + 0.012,
          sh.px * 1.05, sh.py * 0.9, sh.tumble * 0.7, 2));
      }
      for (i = 0; i < cabRings.length - 1; i++) stitch(mesh, gs[i], gs[i + 1], RING_SEG);
      // شیشه‌ی جلو و عقب
      for (var e2 = 0; e2 < 2; e2++) {
        var RR = e2 === 0 ? 0 : cabRings.length - 1;
        var cr2 = cabRings[RR], s2 = gs[RR], d2 = e2 === 0 ? 1 : -1;
        var belt2 = lerp(cr2.yb, cr2.yt, 0.56);
        var cc = mesh.v(0, (belt2 + cr2.yt) / 2, cr2.z + d2 * 0.03, 0, 0.2, d2, 0.5, 0.5);
        for (k = 0; k < RING_SEG; k++) {
          if (d2 > 0) mesh.tri(cc, s2 + k, s2 + k + 1);
          else mesh.tri(cc, s2 + k + 1, s2 + k);
        }
      }
      mesh.smoothNormals(glassStart, mesh.vcount, glassIdx, mesh.idx.length);

      // سقف رنگی
      mesh.setColorHex(def.color).setMat(MAT.PAINT);
      var rs = mesh.vcount, ri = mesh.idx.length;
      for (i = 0; i < cabRings.length; i++) {
        var cr3 = cabRings[i];
        var belt3 = lerp(cr3.yb, cr3.yt, 0.62);
        gs.push(ring(mesh, cr3.z, cr3.hw * 0.90, belt3 + (cr3.yt - belt3) * 0.55, cr3.yt + 0.028,
          sh.px * 1.02, sh.py * 0.85, sh.tumble * 0.6, 4));
      }
      var roofBase = gs.length - cabRings.length;
      for (i = 0; i < cabRings.length - 1; i++) stitch(mesh, gs[roofBase + i], gs[roofBase + i + 1], RING_SEG);
      mesh.smoothNormals(rs, mesh.vcount, ri, mesh.idx.length);

      // داخل کابین (کف + صندلی) تا شیشه شفاف توخالی نباشد
      mesh.setColorHex(0x14171c).setMat(MAT.METAL);
      var iz0 = cabRings[0].z + 0.05, iz1 = cabRings[cabRings.length - 1].z - 0.05;
      var iw = cabRings[0].hw * 0.8, ib = lerp(cabRings[0].yb, cabRings[0].yt, 0.56);
      mesh.box(0, ib - 0.02, (iz0 + iz1) / 2, iw * 2, 0.05, iz1 - iz0);
      mesh.setColorHex(0x1d2229).setMat(MAT.METAL);
      mesh.box(-iw * 0.45, ib + 0.28, (iz0 + iz1) / 2 - 0.05, 0.46, 0.62, 0.14);
      mesh.box(iw * 0.45, ib + 0.28, (iz0 + iz1) / 2 - 0.05, 0.46, 0.62, 0.14);
      // فرمان
      mesh.setColorHex(0x0e1116).setMat(MAT.RUBBER);
      mesh.cylinder(-iw * 0.45, ib + 0.36, (iz0 + iz1) / 2 + 0.30, 0.17, 0.03, 14, 'y', true, true);
    } else if (def.kind === 'buggy') {
      // قفس محافظ لوله‌ای
      mesh.setColorHex(def.accent).setMat(MAT.METAL);
      var bz0 = -L * 0.26, bz1 = L * 0.10, bw = W * 0.40, by0 = H * 0.60, by1 = H * 1.30;
      var tubes = [
        [[-bw, by0, bz0], [-bw, by1, bz0]], [[bw, by0, bz0], [bw, by1, bz0]],
        [[-bw, by0, bz1], [-bw, by1, bz1]], [[bw, by0, bz1], [bw, by1, bz1]],
        [[-bw, by1, bz0], [-bw, by1, bz1]], [[bw, by1, bz0], [bw, by1, bz1]],
        [[-bw, by1, bz0], [bw, by1, bz0]], [[-bw, by1, bz1], [bw, by1, bz1]],
        [[-bw, by1, bz0], [-bw, by0, bz1]], [[bw, by1, bz0], [bw, by0, bz1]]
      ];
      for (i = 0; i < tubes.length; i++) tube(mesh, tubes[i][0], tubes[i][1], 0.035);
    }

    /* ------------------------------------------------------------ چراغ‌ها */
    var noseZ = rings[rings.length - 1].z, tailZ = rings[0].z;
    var noseR = rings[rings.length - 1], tailR = rings[0];
    var hy = lerp(noseR.yb, noseR.yt, 0.62);

    mesh.setColorHex(0xf6f8ff).setMat(MAT.EMISSIVE);
    var lw = noseR.hw * 0.62;
    mesh.box(-noseR.hw * 0.52, hy, noseZ - 0.02, lw, 0.11, 0.06);
    mesh.box(noseR.hw * 0.52, hy, noseZ - 0.02, lw, 0.11, 0.06);

    // جلوپنجره
    mesh.setColorHex(0x0d0f12).setMat(MAT.METAL);
    mesh.box(0, hy - 0.14, noseZ - 0.02, noseR.hw * 0.95, 0.16, 0.05);
    mesh.setColorHex(def.accent).setMat(MAT.CHROME);
    mesh.box(0, hy - 0.05, noseZ - 0.02, noseR.hw * 0.98, 0.025, 0.05);

    // چراغ عقب
    mesh.setColorHex(0xff2020).setMat(MAT.EMISSIVE);
    var ty = lerp(tailR.yb, tailR.yt, 0.62);
    mesh.box(0, ty, tailZ + 0.02, tailR.hw * 1.5, 0.10, 0.05);

    // اگزوز
    mesh.setColorHex(0x9aa0a8).setMat(MAT.CHROME);
    var ex = def.exhaust || 2;
    for (i = 0; i < ex; i++) {
      var exx = ex === 1 ? 0 : (-tailR.hw * 0.45 + (i / (ex - 1)) * tailR.hw * 0.9);
      mesh.cylinder(exx, tailR.yb + 0.09, tailZ + 0.10, 0.05, 0.14, 10, 'z', true, true);
    }
    if (def.stack) {
      mesh.setColorHex(0xb8bec6).setMat(MAT.CHROME);
      mesh.cylinder(-W * 0.36, H * 0.9, -L * 0.05, 0.09, 1.2, 12, 'y', true, true);
      mesh.cylinder(W * 0.36, H * 0.9, -L * 0.05, 0.09, 1.2, 12, 'y', true, true);
    }

    // آینه
    mesh.setColorHex(def.color).setMat(MAT.PAINT);
    if (cabRings.length >= 2) {
      var mz = cabRings[0].z + 0.02, my = lerp(cabRings[0].yb, cabRings[0].yt, 0.60);
      mesh.box(-cabRings[0].hw - 0.07, my, mz, 0.06, 0.09, 0.15);
      mesh.box(cabRings[0].hw + 0.07, my, mz, 0.06, 0.09, 0.15);
    }

    /* --------------------------------------------------------------- بال */
    var wing = def.wing || 0, spoiler = def.spoiler || 0;
    if (wing >= 1 || spoiler >= 2) {
      var big = wing >= 1;
      mesh.setColorHex(def.accent).setMat(MAT.PAINT);
      var wz = tailZ + (big ? 0.30 : 0.12);
      var wy = big ? H * (def.kind === 'truck' ? 1.02 : 0.92) : lerp(tailR.yb, tailR.yt, 0.86);
      var ww2 = big ? W * 0.52 : tailR.hw * 0.85;
      mesh.box(0, wy, wz, ww2 * 2, 0.035, big ? 0.34 : 0.22);
      mesh.setColorHex(0x1a1d22).setMat(MAT.METAL);
      if (big) {
        mesh.box(-ww2 * 0.8, wy - 0.14, wz, 0.05, 0.28, 0.12);
        mesh.box(ww2 * 0.8, wy - 0.14, wz, 0.05, 0.28, 0.12);
        // لبه‌ی انتهایی
        mesh.setColorHex(def.accent).setMat(MAT.PAINT);
        mesh.box(-ww2, wy + 0.05, wz, 0.03, 0.16, 0.34);
        mesh.box(ww2, wy + 0.05, wz, 0.03, 0.16, 0.34);
      }
    } else if (spoiler === 1) {
      mesh.setColorHex(def.accent).setMat(MAT.PAINT);
      mesh.box(0, lerp(tailR.yb, tailR.yt, 0.90), tailZ + 0.10, tailR.hw * 1.6, 0.05, 0.16);
    }

    // دیفیوزر
    if (def.diffuser) {
      mesh.setColorHex(0x15181d).setMat(MAT.METAL);
      mesh.box(0, tailR.yb + 0.05, tailZ + 0.16, tailR.hw * 1.7, 0.12, 0.24);
    }
    // اسکوپ کاپوت
    if (def.scoop) {
      mesh.setColorHex(def.accent).setMat(MAT.METAL);
      var sz = rings[Math.floor(rings.length * 0.72)].z;
      var srr = rings[Math.floor(rings.length * 0.72)];
      mesh.box(0, srr.yt + 0.035, sz, W * 0.30, 0.07, 0.34);
      mesh.setColorHex(0x0a0c0f).setMat(MAT.METAL);
      mesh.box(0, srr.yt + 0.05, sz + 0.14, W * 0.26, 0.05, 0.06);
    }
    // رکاب جانبی
    if (def.skirt) {
      mesh.setColorHex(def.accent).setMat(MAT.PAINT);
      var sillY = Math.min(rings[3].yb, rings[5].yb);
      mesh.box(-W / 2 - 0.01, sillY + 0.01, (zF + zR) / 2, 0.05, 0.09, Math.abs(zF - zR) * 0.72);
      mesh.box(W / 2 + 0.01, sillY + 0.01, (zF + zR) / 2, 0.05, 0.09, Math.abs(zF - zR) * 0.72);
    }
    // سپر جلو (bullbar)
    if (def.bullbar) {
      mesh.setColorHex(0x2a2e34).setMat(MAT.METAL);
      mesh.box(0, noseR.yt + 0.10, noseZ + 0.10, W * 0.86, 0.07, 0.07);
      mesh.box(0, noseR.yb + 0.10, noseZ + 0.10, W * 0.86, 0.07, 0.07);
      mesh.box(-W * 0.40, (noseR.yb + noseR.yt) / 2 + 0.10, noseZ + 0.10, 0.07, 0.42, 0.07);
      mesh.box(W * 0.40, (noseR.yb + noseR.yt) / 2 + 0.10, noseZ + 0.10, 0.07, 0.42, 0.07);
    }
    // نور افکن روی سقف
    if (def.lightbar) {
      mesh.setColorHex(0xfff2c0).setMat(MAT.EMISSIVE);
      var lbY = def.kind === 'buggy' ? H * 1.30 : (cabRings.length ? cabRings[0].yt + 0.06 : H);
      mesh.box(0, lbY, (cabRings.length ? cabRings[0].z : 0) + 0.02, W * 0.62, 0.07, 0.10);
    }
    // گل‌پخش‌کن
    if (def.mudflap) {
      mesh.setColorHex(0x111318).setMat(MAT.RUBBER);
      for (i = 0; i < 2; i++) {
        var mz2 = (i ? zR : zF) - def.wr * 1.25;
        for (var sd = -1; sd <= 1; sd += 2)
          mesh.box(sd * (W / 2 - 0.02), def.wr * 0.62, mz2, 0.03, def.wr * 1.0, 0.18);
      }
    }
    // کیت زاویه‌ی دریفت
    if (def.angleKit) {
      mesh.setColorHex(def.accent).setMat(MAT.CHROME);
      mesh.box(0, tailR.yb + 0.02, tailZ + 0.02, tailR.hw * 1.7, 0.03, 0.05);
    }
    // زیرنور نئون
    if (def.underglow) {
      mesh.setColorHex(def.accent).setMat(MAT.NEON);
      var ugY = Math.min(rings[3].yb, rings[5].yb) - 0.02;
      mesh.box(0, ugY, (zF + zR) / 2, W * 0.94, 0.03, Math.abs(zF - zR) * 0.9);
    }
    // بستر وانت
    if (def.kind === 'pickup' || def.kind === 'truck') {
      mesh.setColorHex(0x22262c).setMat(MAT.METAL);
      var bx0 = tailZ + 0.06, bx1 = tailZ + Math.abs(L * (def.kind === 'truck' ? 0.36 : 0.26));
      var bwid = W * 0.86, btop = H * 0.70, bb = H * 0.30;
      mesh.box(0, bb + 0.02, (bx0 + bx1) / 2, bwid, 0.04, bx1 - bx0);
      mesh.setColorHex(def.color).setMat(MAT.PAINT);
      mesh.box(-bwid / 2 - 0.02, (bb + btop) / 2, (bx0 + bx1) / 2, 0.05, btop - bb, bx1 - bx0);
      mesh.box(bwid / 2 + 0.02, (bb + btop) / 2, (bx0 + bx1) / 2, 0.05, btop - bb, bx1 - bx0);
    }

    return {
      mesh: mesh,
      zF: zF, zR: zR, halfTrack: W / 2 - def.ww / 2 - 0.03,
      wheelbase: zF - zR, radius: Math.max(W, L) * 0.5
    };
  }

  /** لوله بین دو نقطه (قفس، نرده) */
  function tube(mesh, p0, p1, r) {
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var seg = 8, i;
    var ux = dx / len, uy = dy / len, uz = dz / len;
    var ax = uy * 0 - uz * 0, ay = uz * 1 - ux * 0, az = ux * 0 - uy * 1; // up=(0,0,1)
    var l = Math.sqrt(ax * ax + ay * ay + az * az);
    if (l < 1e-5) { ax = 1; ay = 0; az = 0; l = 1; }
    ax /= l; ay /= l; az /= l;
    var bx = uy * az - uz * ay, by = uz * ax - ux * az, bz = ux * ay - uy * ax;
    var start = mesh.vcount;
    for (i = 0; i <= seg; i++) {
      var a = (i / seg) * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      var nx = ax * ca + bx * sa, ny = ay * ca + by * sa, nz = az * ca + bz * sa;
      mesh.v(p0[0] + nx, p0[1] + ny, p0[2] + nz, nx / r, ny / r, nz / r, i / seg, 0);
    }
    for (i = 0; i <= seg; i++) {
      var a2 = (i / seg) * TAU, ca2 = Math.cos(a2) * r, sa2 = Math.sin(a2) * r;
      var nx2 = ax * ca2 + bx * sa2, ny2 = ay * ca2 + by * sa2, nz2 = az * ca2 + bz * sa2;
      mesh.v(p1[0] + nx2, p1[1] + ny2, p1[2] + nz2, nx2 / r, ny2 / r, nz2 / r, i / seg, 1);
    }
    stitch(mesh, start, start + seg + 1, seg);
  }

  /* ========================================================================
     چرخ
     ======================================================================== */
  function buildWheel(def) {
    var m = new MB();
    var R = def.wr, Wd = def.ww, seg = 22, i, k;

    // تایر
    m.setColorHex(0x12141a).setMat(MAT.RUBBER);
    m.cylinder(0, 0, 0, R, Wd, seg, 'x', false, false, R);
    // دیواره‌ها
    m.setColorHex(0x181b22).setMat(MAT.RUBBER);
    m._cap(0, 0, 0, R, seg, 'x', -1, -Wd / 2);
    m._cap(0, 0, 0, R, seg, 'x', 1, Wd / 2);

    // آج لاستیک
    var treads = def.wheels === 'offroad' ? 14 : 20;
    m.setColorHex(0x0b0d11).setMat(MAT.RUBBER);
    for (i = 0; i < treads; i++) {
      var a = (i / treads) * TAU;
      var ca = Math.cos(a), sa = Math.sin(a);
      var tw = def.wheels === 'offroad' ? 0.10 : 0.055;
      var th = def.wheels === 'offroad' ? 0.035 : 0.014;
      var base = m.vcount, bi = m.idx.length;
      var px = 0, py = ca * (R + th / 2), pz = sa * (R + th / 2);
      var halfW = Wd * 0.42;
      var tx = -ca, ty = sa;   // مماس
      var nxv = ca, nyv = sa;
      // چهار رأس روی استوانه
      var p0 = [px - halfW, py - tx * tw, pz - ty * tw];
      var p1 = [px + halfW, py - tx * tw, pz - ty * tw];
      var p2 = [px + halfW, py + tx * tw, pz + ty * tw];
      var p3 = [px - halfW, py + tx * tw, pz + ty * tw];
      m.face(p0, p1, p2, p3);
    }

    // رینگ
    var rimR = R * 0.63;
    var style = def.wheels || 'spoke10';
    m.setColorHex(0xc8ccd2).setMat(style === 'dish' ? MAT.CHROME : MAT.METAL);
    m.cylinder(0, 0, 0, rimR, Wd * 0.62, seg, 'x', false, false, rimR);
    // بشقاب رینگ
    m.setColorHex(style === 'dish' ? 0xe6e9ee : 0x8f959d).setMat(MAT.METAL);
    m._cap(0, 0, 0, rimR, seg, 'x', 1, Wd * 0.30);
    m._cap(0, 0, 0, rimR, seg, 'x', -1, -Wd * 0.30);

    // پره‌ها
    var spokes = style === 'spoke5' ? 5 : style === 'mesh' ? 12 : style === 'turbine' ? 7 : 10;
    m.setColorHex(style === 'dish' ? 0xf0f2f5 : 0xb0b6be).setMat(MAT.CHROME);
    for (i = 0; i < spokes; i++) {
      var an = (i / spokes) * TAU;
      var ca2 = Math.cos(an), sa2 = Math.sin(an);
      var sw = style === 'turbine' ? rimR * 0.34 : rimR * 0.16;
      var sr = rimR * 0.86;
      var p0 = [Wd * 0.28, ca2 * 0.10 - (-sa2) * sw, sa2 * 0.10 + ca2 * sw];
      var p1 = [Wd * 0.28, ca2 * 0.10 + (-sa2) * sw, sa2 * 0.10 - ca2 * sw];
      var p2 = [Wd * 0.28, ca2 * sr + (-sa2) * sw * 0.8, sa2 * sr - ca2 * sw * 0.8];
      var p3 = [Wd * 0.28, ca2 * sr - (-sa2) * sw * 0.8, sa2 * sr + ca2 * sw * 0.8];
      m.face(p3, p2, p1, p0);
      // عمق پره
      var d = 0.05;
      var q0 = [Wd * 0.28 - d, ca2 * 0.10 - (-sa2) * sw, sa2 * 0.10 + ca2 * sw];
      var q1 = [Wd * 0.28 - d, ca2 * 0.10 + (-sa2) * sw, sa2 * 0.10 - ca2 * sw];
      var q2 = [Wd * 0.28 - d, ca2 * sr + (-sa2) * sw * 0.8, sa2 * sr - ca2 * sw * 0.8];
      var q3 = [Wd * 0.28 - d, ca2 * sr - (-sa2) * sw * 0.8, sa2 * sr + ca2 * sw * 0.8];
      m.face(q0, q1, q2, q3);
    }
    // مرکز رینگ
    m.setColorHex(0x2a2e34).setMat(MAT.CHROME);
    m.cylinder(0, 0, 0, R * 0.13, Wd * 0.70, 10, 'x', true, true);
    m.setColorHex(def.accent).setMat(MAT.PAINT);
    m._cap(0, 0, 0, R * 0.10, 10, 'x', 1, Wd * 0.35);

    // دیسک ترمز و کالیپر
    m.setColorHex(0x8a8f96).setMat(MAT.METAL);
    m.cylinder(0, 0, 0, R * 0.50, Wd * 0.16, 18, 'x', true, true);
    m.setColorHex(def.accent).setMat(MAT.PAINT);
    m.box(0, R * 0.42, 0, Wd * 0.22, R * 0.30, R * 0.34);

    return m;
  }

  /* ========================================================================
     فیزیک
     ======================================================================== */
  var G = 9.81;

  function Car(def, opts) {
    opts = opts || {};
    this.def = def;
    this.geo = buildChassis(def);
    this.wheelMesh = buildWheel(def);
    this.wheelbase = this.geo.wheelbase;
    this.radius = Math.max(def.wid * 0.62, def.len * 0.30);

    // آمار (با ارتقاءها)
    var up = opts.upgrades || {};
    this.stat = {};
    var i, u;
    for (i = 0; i < KK.UPGRADES.length; i++) {
      u = KK.UPGRADES[i];
      var lv = up[u.id] || 0;
      this.stat[u.effect] = def[u.effect] + u.step * lv;
    }
    this.mass = Math.max(600, def.weight + (up.chassis || 0) * -40);
    this.muBase = 0.86 + clamp(this.stat.grip, 0, 130) / 100 * 1.15;
    this.maxForce = (2600 + this.stat.power * 92) * (def.kind === 'truck' ? 1.5 : 1);
    this.topSpeed = (58 + this.stat.power * 1.05 + this.stat.aero * 1.42) / 3.6; // m/s
    this.brakeForce = (7.5 + this.stat.brake * 0.10) * this.mass;
    this.nitroMax = 100 + (this.stat.nitro || def.power * 0.6) * 1.0;

    // وضعیت
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.vf = 0; this.vl = 0; this.yawRate = 0;
    this.steer = 0; this.steerVis = 0;
    this.throttle = 0; this.brakeIn = 0; this.handbrake = false; this.nitroOn = false;
    this.nitro = this.nitroMax;
    this.rpm = 900; this.gear = 1; this.wheelSpin = 0;
    this.pitch = 0; this.roll = 0; this.slip = 0;
    this.driftScore = 0; this.driftTimer = 0;
    this.onRoad = true; this.surface = 'asphalt';
    this.damage = 0; this.boostPad = 0;
    this.lap = 0; this.progress = 0; this.lastProgress = 0;
    this.lapTimes = []; this.bestLap = null; this.totalTime = 0;
    this.finished = false; this.finishTime = 0;
    this.position = 1; this.wrongWay = false;
    this.susp = [0, 0, 0, 0];
    this.airborne = false; this.vy = 0; this.landed = 0;
    this.driftBank = 0; this.aiSample = -1;
    this.model = M4.create();
    this.wheelMat = [M4.create(), M4.create(), M4.create(), M4.create()];
    this.ai = null;
  }

  Car.prototype.reset = function (x, y, z, yaw) {
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.vf = 0; this.vl = 0; this.yawRate = 0;
    this.nitro = this.nitroMax; this.rpm = 900; this.gear = 1;
    this.slip = 0; this.damage = 0; this.lap = 0; this.progress = 0;
    this.totalTime = 0; this.lapTimes = []; this.finished = false;
    this.pitch = 0; this.roll = 0;
    this.airborne = false; this.vy = 0; this.landed = 0;
    this.susp = [0, 0, 0, 0]; this.driftBank = 0;
  };

  Car.prototype.speedKmh = function () { return Math.abs(this.vf) * 3.6; };

  /** یک گام فیزیکی. dt ثابت (پیشنهاد 1/120) */
  Car.prototype.step = function (dt, track, input) {
    var def = this.def;
    var steerIn = input ? input.steer : 0;
    var thr = input ? input.throttle : 0;
    var brk = input ? input.brake : 0;
    var hb = input ? !!input.handbrake : false;
    var nitroReq = input ? !!input.nitro : false;

    var speed = Math.abs(this.vf);
    var speedF = clamp(speed / this.topSpeed, 0, 1);

    // فرمان: در سرعت زیاد کمتر می‌پیچد
    var maxSteer = 0.62 * (1 - 0.52 * speedF);
    if (def.angleKit) maxSteer = 0.78 * (1 - 0.34 * speedF);
    this.steer = KK.approach(this.steer, steerIn * maxSteer, 6.5 * dt * (1 + speedF));
    this.steerVis = KK.approach(this.steerVis, this.steer, 14 * dt);

    // سطح زیر چرخ
    var surf = track ? track.surfaceAt(this.x, this.z) : { mu: 1, roll: 0.012, kind: 'asphalt' };
    this.surface = surf.kind;
    this.onRoad = surf.onRoad;

    // نیترو
    this.nitroOn = nitroReq && this.nitro > 1 && !this.finished;
    if (this.nitroOn) this.nitro = Math.max(0, this.nitro - 26 * dt);
    else this.nitro = Math.min(this.nitroMax, this.nitro + 4.5 * dt);

    // چسبندگی
    var mu = this.muBase * surf.mu;
    if (hb) mu *= 1.0; // هندبریک روی محور عقب اثر می‌کند نه کل خودرو

    // --- نیروهای طولی ---------------------------------------------------
    var drive = 0;
    if (!this.finished) {
      var powerCurve = 1 - 0.45 * Math.pow(clamp(this.rpm / 9000, 0, 1), 3);
      drive = this.maxForce * thr * powerCurve;
      if (this.nitroOn) drive *= 1.55;
    }
    if (this.boostPad > 0) { drive += this.maxForce * 1.6; this.boostPad -= dt; }

    var dragK = 0.5 * 1.15 * (0.32 + def.wid * 0.06) * def.ht * (1.0 - clamp(this.stat.aero, 0, 130) / 420);
    var roll = surf.roll * this.mass * G * Math.sign(this.vf);
    var brakeF = 0;
    if (brk > 0) {
      if (this.vf > 0.4) brakeF = -this.brakeForce * brk;
      else { brakeF = -this.maxForce * 0.55 * brk; }   // دنده عقب
    }
    var engineBrake = (thr < 0.05 ? 1 : 0.15) * 260 * Math.sign(this.vf);

    var Fx = drive + brakeF - dragK * this.vf * Math.abs(this.vf) - roll - engineBrake;
    if (this.finished) Fx = -this.brakeForce * 0.6 * Math.sign(this.vf);

    // --- دینامیک جانبی (مدل دوچرخه با اشباع لاستیک) ---------------------
    var a = this.wheelbase * 0.48;      // فاصله‌ی مرکز ثقل تا محور جلو
    var b = this.wheelbase - a;
    var vRearLat = this.vl - this.yawRate * b;
    var vFrontLat = this.vl + this.yawRate * a;
    var absVf = Math.max(Math.abs(this.vf), 2.5);
    var slipF = Math.atan2(vFrontLat, absVf) - this.steer;
    var slipR = Math.atan2(vRearLat, absVf);

    var critSlip = 0.17 + 0.05 * (1 - clamp(this.stat.grip, 0, 130) / 130);
    if (hb) critSlip *= 0.7;

    var muF = mu * (0.96 - 0.10 * clamp(brk, 0, 1));
    var muR = mu * (hb ? 0.42 : 1.0) - (thr > 0.7 ? 0.09 * (thr - 0.7) / 0.3 : 0);
    muR = Math.max(0.12, muR);

    var wF = 0.48, wR = 0.52;
    var FyF = -muF * this.mass * G * wF * clamp(slipF / critSlip, -1.35, 1.35);
    var FyR = -muR * this.mass * G * wR * clamp(slipR / critSlip, -1.35, 1.35);

    // انتقال وزن
    var loadShift = clamp((drive + brakeF) / (this.mass * 12), -0.25, 0.25);
    FyF *= (1 + loadShift); FyR *= (1 - loadShift);

    var Fy = FyF + FyR;
    var torque = a * FyF - b * FyR;
    var Iz = this.mass * (def.len * def.len + def.wid * def.wid) / 12 * 0.55;

    this.vf += (Fx / this.mass) * dt;
    this.vl += (Fy / this.mass) * dt - this.vf * this.yawRate * dt;
    this.yawRate += (torque / Iz) * dt;
    this.yawRate *= (1 - 1.35 * dt);           // میرایی
    this.vl *= (1 - 2.4 * dt);

    // محدودیت سرعت (و سقف دنده‌ی عقب)
    var vmax = this.topSpeed * 1.12;
    if (this.vf > vmax) this.vf = vmax;
    if (this.vf < -9.0) this.vf = -9.0;          // دنده‌ی عقب حداکثر ~۳۲ کیلومتر

    // چرخش و جابه‌جایی
    this.yaw += this.yawRate * dt;
    var cs = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    var wx = this.vf * sn + this.vl * cs;
    var wz = this.vf * cs - this.vl * sn;
    this.x += wx * dt;
    this.z += wz * dt;

    // ارتفاع زمین / پرواز
    if (track) {
      var gy = track.heightAt(this.x, this.z);
      if (this.airborne) {
        this.vy -= 21 * dt;
        this.y += this.vy * dt;
        this.pitch = KK.approach(this.pitch, clamp(this.vy * 0.035, -0.35, 0.35), 3 * dt);
        this.roll *= (1 - 1.5 * dt);
        if (this.y <= gy) {
          this.y = gy; this.airborne = false;
          this.landed = Math.min(1.4, Math.abs(this.vy) * 0.06);
          this.vy = 0;
          this.vf *= 0.94; this.vl *= 0.7;
        }
      } else {
        var k = 1 - Math.exp(-14 * dt);
        this.y += (gy - this.y) * k;
        this.vy = 0;
        var nrm = track.normalAt(this.x, this.z);
        this.pitch = KK.approach(this.pitch, Math.atan2(nrm[2], nrm[1]) * 0.5, 8 * dt);
        var bank = Math.atan2(nrm[0], nrm[1]);
        this.roll = KK.approach(this.roll, -bank * 0.9 + clamp(this.yawRate * this.vf * 0.012, -0.22, 0.22), 7 * dt);
      }
      if (this.landed) this.landed = Math.max(0, this.landed - dt * 2.2);
    }

    // دریفت و امتیاز
    this.slip = Math.abs(slipR);
    var drifting = speed > 9 && this.slip > 0.16 && Math.abs(this.vl) > 1.2;
    if (drifting) {
      this.driftTimer += dt;
      this.driftScore += this.slip * speed * dt * 4.2;
    } else {
      if (this.driftTimer > 0.6) this.driftBank = (this.driftBank || 0) + this.driftScore;
      this.driftTimer = 0; this.driftScore = 0;
    }

    // دور موتور و دنده
    var gearCount = def.kind === 'truck' ? 5 : 6;
    var targetGear = clamp(Math.ceil(speedF * gearCount + 0.12), 1, gearCount);
    if (targetGear !== this.gear) this.gear = targetGear;
    var gearTop = this.topSpeed * (this.gear / gearCount);
    var gearBot = this.topSpeed * ((this.gear - 1) / gearCount);
    var gf = clamp((speed - gearBot) / Math.max(gearTop - gearBot, 0.5), 0, 1);
    var targetRpm = 950 + gf * 7400 + thr * 600;
    this.rpm = KK.approach(this.rpm, targetRpm, 9000 * dt);
    this.wheelSpin += (this.vf / def.wr) * dt;

    // کمک‌فنر (برای انیمیشن بدنه)
    var susp = clamp(-Fx / (this.mass * 26), -0.06, 0.06);
    this.susp[0] = KK.approach(this.susp[0], susp, 9 * dt);
    this.susp[1] = KK.approach(this.susp[1], susp, 9 * dt);
    this.susp[2] = KK.approach(this.susp[2], susp, 9 * dt);
    this.susp[3] = KK.approach(this.susp[3], susp, 9 * dt);

    if (!this.finished) this.totalTime += dt;
    return { ax: Fx / this.mass, drifting: drifting };
  };

  /** ماتریس مدل بدنه */
  Car.prototype.updateMatrices = function () {
    var bob = (Math.sin(this.totalTime * 22) * 0.004 + this.susp[0] * 0.5) * (Math.abs(this.vf) > 3 ? 1 : 0);
    M4.fromRotationTranslation(this.model,
      this.pitch + this.susp[0] * 1.6, this.yaw, this.roll,
      this.x, this.y + bob, this.z);
    var def = this.def, g = this.geo, i;
    var corners = [
      [-g.halfTrack, g.zF, 0], [g.halfTrack, g.zF, 0],
      [-g.halfTrack, g.zR, 2], [g.halfTrack, g.zR, 2]
    ];
    for (i = 0; i < 4; i++) {
      var st = (i < 2) ? this.steerVis : 0;
      var m = this.wheelMat[i];
      M4.identity(m);
      // چرخش حول Y (فرمان) سپس حول X (چرخش چرخ) سپس انتقال
      var cy = Math.cos(st), sy = Math.sin(st);
      var cx = Math.cos(this.wheelSpin), sx = Math.sin(this.wheelSpin);
      // R = Ry * Rx
      m[0] = cy; m[1] = 0; m[2] = -sy;
      m[4] = sy * sx; m[5] = cx; m[6] = cy * sx;
      m[8] = sy * cx; m[9] = -sx; m[10] = cy * cx;
      m[12] = corners[i][0]; m[13] = def.wr; m[14] = corners[i][1];
    }
  };

  Car.prototype.worldWheelPos = function (i, out) {
    var g = this.geo;
    var lx = (i % 2 === 0 ? -g.halfTrack : g.halfTrack);
    var lz = (i < 2 ? g.zF : g.zR);
    var cs = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    out[0] = this.x + lx * cs + lz * sn;
    out[1] = this.y + this.def.wr;
    out[2] = this.z - lx * sn + lz * cs;
    return out;
  };

  /* --------------------------------------------------------------- صادرات */
  var API = { buildChassis: buildChassis, buildWheel: buildWheel, Car: Car, SHAPES: SHAPES };
  KK.carModule = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
