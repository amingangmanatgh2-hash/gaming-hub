/* ==========================================================================
   tools/headless-test.js
   --------------------------------------------------------------------------
   اجرای کامل بازی بدون مرورگر: یک WebGL و Canvas و DOM ساختگی ولی صادق،
   تا تمام مسیرهای واقعی کد (ساخت پیست، ساخت خودرو، فیزیک، هوش مصنوعی،
   فهرست رندر، فراخوانی‌های GL، HUD و منوها) واقعاً اجرا شوند.
   همچنین یک بررسی ایستایی روی شیدرها انجام می‌دهد.

   اجرا:  node tools/headless-test.js
   ========================================================================== */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; failures.push(label); console.log('  ✗ ' + label + (extra ? '  ' + extra : '')); }
}

/* ======================================================================
   ۱) بررسی ایستایی شیدرها
   ====================================================================== */
function checkShaderSource(src, name) {
  const problems = [];
  let depth = 0, paren = 0;
  for (const ch of src) {
    if (ch === '{') depth++; else if (ch === '}') depth--;
    else if (ch === '(') paren++; else if (ch === ')') paren--;
    if (depth < 0) problems.push('کمانه‌ی } نابسته');
    if (paren < 0) problems.push('پرانتز نابسته');
  }
  if (depth !== 0) problems.push('بلوک نابسته: ' + depth);
  if (paren !== 0) problems.push('پرانتز نابalance: ' + paren);
  if (!/void\s+main\s*\(/.test(src)) problems.push('main ندارد');
  // هر جمله باید با ; یا { یا } تمام شود
  const lines = src.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('/*'));
  lines.forEach((l, i) => {
    const t = l.trim();
    if (/^(precision|uniform|attribute|varying|struct|#)/.test(t)) {
      if (!/;$/.test(t)) problems.push('خط ' + (i + 1) + ' بدون ;: ' + t);
    }
  });
  return problems;
}
function declared(src, kind) {
  const out = new Set();
  const re = new RegExp('\\b' + kind + '\\s+(?:lowp |mediump |highp )?[a-zA-Z0-9_]+\\s+([a-zA-Z0-9_]+)', 'g');
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

/* ======================================================================
   ۲) WebGL ساختگی — صادق نسبت به API ولی بدون GPU
   ====================================================================== */
const GLC = {
  VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
  ACTIVE_UNIFORMS: 35718, ACTIVE_ATTRIBUTES: 35721, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
  STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048, FLOAT: 5126, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
  TRIANGLES: 4, POINTS: 0, DEPTH_TEST: 2929, CULL_FACE: 2884, BLEND: 3042, LEQUAL: 515, BACK: 1029,
  DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771,
  TEXTURE0: 33984, TEXTURE_2D: 3553, RGBA: 6408, UNSIGNED_BYTE: 5121, LINEAR: 9729,
  TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240, TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243,
  CLAMP_TO_EDGE: 33071, MAX_TEXTURE_SIZE: 3379
};

class FakeGL {
  constructor(canvas) {
    this.canvas = canvas;
    Object.assign(this, GLC);
    this.stats = { draws: 0, tris: 0, bufferBytes: 0, bindErrors: 0, attribErrors: 0, uniformErrors: 0 };
    this.shaders = new Map();
    this.programs = new Map();
    this.buffers = new Set();
    this.boundArray = null; this.boundElem = null;
    this.enabledAttribs = new Set();
    this.curProgram = null;
    this.viewportRect = null;
  }
  getExtension(n) { return n === 'OES_element_index_uint' ? {} : null; }
  createShader(t) { const s = { type: t, src: '', ok: false, log: '' }; this.shaders.set(s, s); return s; }
  shaderSource(s, src) { s.src = src; }
  compileShader(s) {
    const probs = checkShaderSource(s.src, s.type);
    s.ok = probs.length === 0;
    s.log = probs.join('; ');
    if (!s.ok) console.log('    [shader] ' + s.log);
  }
  getShaderParameter(s, p) { return p === this.COMPILE_STATUS ? s.ok : true; }
  getShaderInfoLog(s) { return s.log; }
  createProgram() { const p = { shaders: [], linked: false, log: '' }; this.programs.set(p, p); return p; }
  attachShader(p, s) { p.shaders.push(s); }
  linkProgram(p) {
    const vs = p.shaders.find(s => s.type === this.VERTEX_SHADER);
    const fs = p.shaders.find(s => s.type === this.FRAGMENT_SHADER);
    const probs = [];
    if (!vs || !fs) probs.push('هر دو شیدر لازم است');
    if (vs && !vs.ok) probs.push('vs کامپایل نشد');
    if (fs && !fs.ok) probs.push('fs کامپایل نشد');
    if (vs && fs && vs.ok && fs.ok) {
      const vOut = declared(vs.src, 'varying'), fIn = declared(fs.src, 'varying');
      for (const v of fIn) if (!vOut.has(v)) probs.push('varying «' + v + '» در vertex shader اعلام نشده');
      const usedVs = declared(vs.src, 'attribute');
      p.attribs = usedVs;
      p.vsUniforms = declared(vs.src, 'uniform');
      p.fsUniforms = declared(fs.src, 'uniform');
    }
    p._uniforms = [...new Set([...(p.vsUniforms || []), ...(p.fsUniforms || [])])];
    p._attribs = [...(p.attribs || [])];
    p.linked = probs.length === 0;
    p.log = probs.join('; ');
    if (!p.linked) console.log('    [link] ' + p.log);
  }
  getProgramParameter(p, what) {
    if (what === this.LINK_STATUS) return p.linked;
    if (what === this.ACTIVE_UNIFORMS) return p._uniforms ? p._uniforms.length : 0;
    if (what === this.ACTIVE_ATTRIBUTES) return p._attribs ? p._attribs.length : 0;
    return 0;
  }
  getProgramInfoLog(p) { return p.log; }
  getActiveUniform(p, i) { return { name: p._uniforms[i] }; }
  getActiveAttrib(p, i) { return { name: p._attribs[i], type: this.FLOAT, size: 1 }; }
  getUniformLocation(p, n) {
    const base = n.replace('[0]', '');
    if (!(p.vsUniforms && p.fsUniforms)) return { name: base, ghost: true };
    if (!p.vsUniforms.has(base) && !p.fsUniforms.has(base)) {
      this.stats.uniformErrors++;
      console.log('    [uniform ناشناخته] ' + base);
      return null;
    }
    return { name: base };
  }
  getAttribLocation(p, n) {
    if (!p.attribs || !p.attribs.has(n)) {
      this.stats.attribErrors++;
      console.log('    [attribute ناشناخته] ' + n);
      return -1;
    }
    return [...p.attribs].indexOf(n);
  }
  createBuffer() { const b = { bytes: 0, vertCount: 0 }; this.buffers.add(b); return b; }
  deleteBuffer(b) { this.buffers.delete(b); }
  bindBuffer(t, b) {
    if (b && !this.buffers.has(b)) this.stats.bindErrors++;
    if (t === this.ARRAY_BUFFER) this.boundArray = b; else this.boundElem = b;
  }
  bufferData(t, data) {
    const b = t === this.ARRAY_BUFFER ? this.boundArray : this.boundElem;
    if (!b) { this.stats.bindErrors++; return; }
    if (t === this.ARRAY_BUFFER) this._lastArray = b;
    b.bytes = data.byteLength;
    if (this._lastArray === b && this._pendingStride) b.vertCount = data.length / this._pendingStride;
    this.stats.bufferBytes += data.byteLength;
    // بررسی اینکه ایندکس‌ها از تعداد رأس‌ها بیرون نزنند
    if (t === this.ELEMENT_ARRAY_BUFFER && this.boundArray && this.boundArray.vertCount) {
      let max = -1;
      for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
      if (max >= this.boundArray.vertCount) {
        this.stats.indexOverflow = (this.stats.indexOverflow || 0) + 1;
        console.log('    [index overflow] max=' + max + ' verts=' + this.boundArray.vertCount);
      }
    }
  }
  bufferSubData(t, off, data) {
    const b = t === this.ARRAY_BUFFER ? this.boundArray : this.boundElem;
    if (!b) { this.stats.bindErrors++; return; }
    if (off + data.byteLength > b.bytes) this.stats.subDataOverflow = (this.stats.subDataOverflow || 0) + 1;
  }
  createTexture() { return {}; }
  bindTexture() { } texImage2D() { } texParameteri() { } generateMipmap() { } activeTexture() { }
  useProgram(p) {
    if (p && !p.linked) { this.stats.linkErrors = (this.stats.linkErrors || 0) + 1; }
    this.curProgram = p;
  }
  viewport(x, y, w, h) {
    if (!(w > 0 && h > 0)) this.stats.badViewport = (this.stats.badViewport || 0) + 1;
    this.viewportRect = [x, y, w, h];
  }
  enable() { } disable() { } depthFunc() { } cullFace() { } clearDepth() { } clear() { }
  blendFunc() { } depthMask() { } lineWidth() { }
  enableVertexAttribArray(i) { if (i === undefined || i < 0) this.stats.attribErrors++; else this.enabledAttribs.add(i); }
  disableVertexAttribArray(i) { this.enabledAttribs.delete(i); }
  vertexAttribPointer(idx, size, type, norm, stride, off) {
    if (idx === undefined || idx < 0) { this.stats.attribErrors++; return; }
    if (!this.boundArray) this.stats.bindErrors++;
  }
  uniform1f(l, v) { if (l && Number.isNaN(v)) this.stats.nanUniform = (this.stats.nanUniform || 0) + 1; }
  uniform1i() { }
  uniform3f(l, a, b, c) { if ([a, b, c].some(Number.isNaN)) this.stats.nanUniform = (this.stats.nanUniform || 0) + 1; }
  uniform3fv(l, v) { if (l && v && (Number.isNaN(v[0]) || Number.isNaN(v[1]) || Number.isNaN(v[2]))) this.stats.nanUniform = (this.stats.nanUniform || 0) + 1; }
  uniformMatrix3fv(l, t, m) { if (l && m && Array.from(m).some(Number.isNaN)) this.stats.nanUniform = (this.stats.nanUniform || 0) + 1; }
  uniformMatrix4fv(l, t, m) { if (l && m && Array.from(m).some(Number.isNaN)) this.stats.nanUniform = (this.stats.nanUniform || 0) + 1; }
  drawArrays(mode, first, count) {
    this.stats.draws++;
    if (!(count > 0)) this.stats.badDraw = (this.stats.badDraw || 0) + 1;
  }
  drawElements(mode, count, type, off) {
    this.stats.draws++;
    this.stats.tris += count / 3;
    if (!(count > 0)) this.stats.badDraw = (this.stats.badDraw || 0) + 1;
    if (type === this.UNSIGNED_INT && this.stats.uintUsed === undefined) this.stats.uintUsed = 0;
    if (type === this.UNSIGNED_INT) this.stats.uintUsed++;
  }
  setNextStride(n) { this._pendingStride = n; }
  getParameter(p) { return p === this.MAX_TEXTURE_SIZE ? 4096 : 0; }
}

/* ======================================================================
   ۳) Canvas و DOM ساختگی
   ====================================================================== */
function makeCtx2D(canvas) {
  const noop = () => { };
  const ctx = {
    canvas,
    clearRect: noop, fillRect: noop, strokeRect: noop, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, clip: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    rect: noop, arc: noop, arcTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, stroke: noop,
    fillText(t) { if (typeof t !== 'string' || /NaN|undefined/.test(t)) ctx._badText = (ctx._badText || 0) + 1; ctx._texts = (ctx._texts || 0) + 1; },
    measureText: () => ({ width: 40 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    _texts: 0
  };
  return ctx;
}

function makeCanvas(id) {
  const c = {
    id, width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
    style: {}, _listeners: {},
    getContext(kind) {
      if (kind === '2d') return this._ctx2d || (this._ctx2d = makeCtx2D(this));
      return this._gl || (this._gl = new FakeGL(this));
    },
    addEventListener(t, f) { (this._listeners[t] || (this._listeners[t] = [])).push(f); },
    removeEventListener() { },
    getBoundingClientRect() { return { left: 40, top: 100, right: 700, bottom: 320, width: 660, height: 220 }; }
  };
  return c;
}

class FakeEl {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.children = [];
    this.classList = {
      _s: new Set(),
      add: (...c) => c.forEach(x => this.classList._s.add(x)),
      remove: (...c) => c.forEach(x => this.classList._s.delete(x)),
      toggle: (c, f) => { if (f === undefined) f = !this.classList._s.has(c); f ? this.classList._s.add(c) : this.classList._s.delete(c); },
      contains: (c) => this.classList._s.has(c)
    };
    this.style = {};
    this._html = '';
    this._text = '';
    this.value = '';
    this.disabled = false;
    this.dataset = {};
    this._attrs = {};
  }
  set innerHTML(v) { this._html = v; this.children = []; }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; }
  addEventListener(t, f) { (this._l || (this._l = {}))[t] = ((this._l || {})[t] || []).concat(f); }
  removeEventListener() { }
  getBoundingClientRect() { return { left: 60, top: 120, right: 640, bottom: 340, width: 580, height: 220 }; }
  querySelectorAll() { return []; }
  focus() { } blur() { }
}

const registry = new Map();
function getEl(id) {
  if (!registry.has(id)) {
    const isCanvas = id === 'gl' || id === 'hud';
    registry.set(id, isCanvas ? makeCanvas(id) : new FakeEl('div', id));
  }
  return registry.get(id);
}

/* شمای صفحه‌ی واقعی از index.html (فقط idها و ساختار لازم) */
const ALL_IDS = ['gl', 'hud', 'touch', 'screen-loading', 'loadbar', 'loadmsg', 'screen-menu', 'm-coins', 'm-cars', 'm-tracks',
  'screen-garage', 'g-coins', 'carlist', 'g-name', 'g-tag', 'g-stage', 'g-bars', 'g-desc', 'g-buy', 'g-select', 'g-paints', 'g-upgrades',
  'screen-tracks', 't-coins', 'trackgrid', 'screen-setup', 's-trackname', 's-carlist', 's-laps', 's-ai', 's-dif', 's-cam',
  's-p2card', 's-p2list', 's-go', 'screen-settings', 'set-quality', 'set-split', 'set-fps', 'set-master', 'set-sfx', 'set-music',
  'set-reset', 'screen-howto', 'screen-results', 'r-title', 'r-podium', 'r-table', 'r-coins', 'r-again', 'r-garage', 'r-menu',
  'screen-pause', 'p-resume', 'p-restart', 'p-quit', 'toast'];

const actButtons = [];
ALL_IDS.forEach(id => {
  const e = getEl(id);
  if (id === 'loadbar') e.style.width = '0%';
});
['quick', 'story', 'race', 'garage', 'local', 'settings', 'howto', 'back'].forEach(a => {
  for (let i = 0; i < 3; i++) {
    const b = new FakeEl('button'); b.setAttribute('data-act', a); actButtons.push(b);
  }
});

const doc = {
  readyState: 'complete',
  hidden: false,
  documentElement: { lang: 'fa', dir: 'rtl' },
  getElementById: getEl,
  createElement: (t) => (t === 'canvas' ? makeCanvas('dyn') : new FakeEl(t)),
  querySelectorAll(sel) {
    if (sel === '.screen') return ALL_IDS.filter(i => i.startsWith('screen-')).map(getEl);
    if (sel === '[data-act]') return actButtons;
    if (sel === '#touch .tbtn') {
      return ['left', 'right', 'up', 'down', 'hb', 'nitro'].map(t => {
        const b = new FakeEl('button'); b.setAttribute('data-t', t); return b;
      });
    }
    return [];
  },
  addEventListener(t, f) { (doc._l || (doc._l = {}))[t] = ((doc._l || {})[t] || []).concat(f); },
  removeEventListener() { },
  body: new FakeEl('body')
};

/* ======================================================================
   ۴) محیط جهانی
   ====================================================================== */
let vnow = 0;
let rafCb = null;
const store = {};

global.window = undefined;
const sandbox = globalThis;
sandbox.document = doc;
sandbox.devicePixelRatio = 1;
sandbox.innerWidth = 1280;
sandbox.innerHeight = 720;
Object.defineProperty(sandbox, 'navigator', { value: { maxTouchPoints: 0, userAgent: 'node', getGamepads: () => [] }, configurable: true, writable: true });
sandbox.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
sandbox.performance = { now: () => vnow };
sandbox.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
sandbox.cancelAnimationFrame = () => { };
sandbox.setTimeout = setTimeout;
sandbox.addEventListener = (t, f) => { (sandbox._l || (sandbox._l = {}))[t] = ((sandbox._l || {})[t] || []).concat(f); };
sandbox.removeEventListener = () => { };

/* ======================================================================
   ۵) بارگذاری ماژول‌ها
   ====================================================================== */
console.log('\n=== تکاور ریسینگ — آزمون هدلس ===\n');
['util', 'content', 'car', 'track', 'renderer', 'audio', 'game', 'main'].forEach(f => {
  require(path.join(ROOT, 'js', f + '.js'));
});
const KK = sandbox.KK;
ok(!!KK && !!KK.app, 'همه‌ی ماژول‌ها بارگذاری شدند');

/* ---- ۵٫۱) داده ---- */
console.log('\n— محتوا —');
ok(KK.CARS.length === 22, 'تعداد خودروها', KK.CARS.length);
ok(KK.TRACKS.length === 20, 'تعداد پیست‌ها', KK.TRACKS.length);
const ids = new Set(KK.CARS.map(c => c.id));
ok(ids.size === 22, 'شناسه‌ی خودروها یکتاست');
const tids = new Set(KK.TRACKS.map(t => t.id));
ok(tids.size === 20, 'شناسه‌ی پیست‌ها یکتاست');
ok(KK.TRACKS.every(t => KK.THEMES[t.theme]), 'همه‌ی پیست‌ها تم معتبر دارند');

/* ---- ۵٫۲) ساخت همه‌ی پیست‌ها ---- */
console.log('\n— ساخت ۲۰ پیست —');
let maxTri = 0, minTri = 1e9, totalTri = 0, maxMs = 0, closedOK = true;
KK.TRACKS.forEach(t => {
  const t0 = Date.now();
  const tr = new KK.trackModule.Track(t);
  const ms = Date.now() - t0;
  maxMs = Math.max(maxMs, ms);
  const tri = tr.triCount();
  maxTri = Math.max(maxTri, tri); minTri = Math.min(minTri, tri); totalTri += tri;
  // پیوستگی خط مرکزی: آخرین نمونه باید به اولین نزدیک باشد
  const s0 = tr.samples[0], sN = tr.samples[tr.N - 1];
  const gap = Math.hypot(s0.x - sN.x, s0.z - sN.z);
  if (gap > tr.length / tr.N * 2.2) closedOK = false;
  if (!isFinite(tr.length) || tr.length < t.len * 0.75) closedOK = false;
  // نمونه‌برداری ارتفاع در نقاط تصادفی نباید NaN بدهد
  for (let i = 0; i < 60; i++) {
    const s = tr.samples[(i * 7) % tr.N];
    const h = tr.heightAt(s.x + s.lx * (i % 9 - 4) * 4, s.z + s.lz * (i % 9 - 4) * 4);
    if (!isFinite(h)) { closedOK = false; break; }
  }
});
ok(closedOK, 'همه‌ی خط‌های مرکزی بسته و ارتفاع‌ها متناهی‌اند');
ok(maxTri < 90000, 'سنگین‌ترین پیست زیر ۹۰ هزار مثلث', Math.round(maxTri));
console.log('    مثلث/پیست: min=' + Math.round(minTri) + ' max=' + Math.round(maxTri) +
  ' avg=' + Math.round(totalTri / 20) + ' | کندترین ساخت: ' + maxMs + 'ms');

/* ---- ۵٫۳) ساخت همه‌ی خودروها ---- */
console.log('\n— ساخت ۱۶ خودرو —');
let carBad = 0, carTriTotal = 0;
KK.CARS.forEach(c => {
  const car = new KK.carModule.Car(c, { upgrades: { engine: 5, tires: 5 } });
  const b = car.geo.mesh, w = car.wheelMesh;
  if (!b.vcount || !b.idx.length || !w.vcount || !w.idx.length) carBad++;
  if (!isFinite(car.topSpeed) || car.topSpeed <= 0 || !isFinite(car.mass) || car.mass <= 0) carBad++;
  carTriTotal += b.idx.length / 3 + w.idx.length / 3 * 4;
  // چرخ‌ها باید داخل محدوده‌ی بدنه باشند
  if (Math.abs(car.geo.zF) > c.len / 2 + 0.01 || Math.abs(car.geo.zR) > c.len / 2 + 0.01) carBad++;
});
ok(carBad === 0, 'همه‌ی خودروها هندسه و آمار معتبر تولید کردند');
console.log('    مجموع مثلث ۱۶ خودرو: ' + Math.round(carTriTotal));

/* ---- ۵٫۴) فیزیک: یک دور کامل با ورودی ثابت ---- */
console.log('\n— فیزیک و هوش مصنوعی —');
const tr1 = new KK.trackModule.Track(KK.TRACKS[0]);
const car1 = new KK.carModule.Car(KK.CARS[0], {});
let pose = tr1.startPose(0);
car1.reset(pose.x, pose.y + 0.1, pose.z, pose.yaw);
car1.aiSample = tr1.nearest(car1.x, car1.z);
const dt = 1 / 60;
let nan = false, maxSpd = 0;
for (let i = 0; i < 60 * 8; i++) {
  car1.step(dt, tr1, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false });
  if (!isFinite(car1.x) || !isFinite(car1.z) || !isFinite(car1.y) || !isFinite(car1.vf)) nan = true;
  maxSpd = Math.max(maxSpd, car1.speedKmh());
}
ok(!nan, '۸ ثانیه گاز کامل بدون NaN');
ok(maxSpd > 60, 'شتاب‌گیری واقعی', 'حداکثر ' + maxSpd.toFixed(0) + ' km/h در ۸ ثانیه');

// ترمز: زمان ایست از ۱۰۰ کیلومتر بر ساعت
car1.reset(pose.x, pose.y + 0.1, pose.z, pose.yaw);
for (let i = 0; i < 60 * 9; i++) car1.step(dt, tr1, { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false });
const v100 = car1.speedKmh();
let stopT = -1;
for (let i = 0; i < 60 * 12; i++) {
  car1.step(dt, tr1, { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false });
  if (stopT < 0 && car1.speedKmh() < 4) stopT = i / 60;
}
ok(stopT > 0 && stopT < 5, 'ترمز از ' + v100.toFixed(0) + ' km/h زیر ۵ ثانیه نگه می‌دارد', stopT.toFixed(2) + 's');
ok(car1.vf >= -9.001, 'سقف دنده‌ی عقب رعایت می‌شود', (car1.vf * 3.6).toFixed(1) + ' km/h');

// دریفت با هندبریک
car1.reset(pose.x, pose.y + 0.1, pose.z, pose.yaw);
let drifted = false;
for (let i = 0; i < 60 * 6; i++) {
  const r = car1.step(dt, tr1, { throttle: 1, brake: 0, steer: i > 90 ? 0.8 : 0, handbrake: i > 90, nitro: false });
  if (r.drifting) drifted = true;
}
ok(drifted, 'هندبریک دریفت تولید می‌کند');

/* ---- ۵٫۵) هوش مصنوعی دور کامل بزند ---- */
const aiCar = new KK.carModule.Car(KK.CARS[4], {});
pose = tr1.startPose(1);
aiCar.reset(pose.x, pose.y + 0.1, pose.z, pose.yaw);
aiCar.aiSample = tr1.nearest(aiCar.x, aiCar.z);
aiCar.aiIdx = 0;
const fakeGame = { track: tr1, cars: [aiCar], cfg: { difficulty: 1 }, humanRef: null };
const aiStep = KK.gameModule.Game.prototype.updateAI.bind(fakeGame);
let aiLapStart = null, aiLaps = 0, prev = tr1.progressAt(aiCar.x, aiCar.z), aiOff = 0;
for (let i = 0; i < 60 * 240 && aiLaps < 1; i++) {
  const inp = aiStep(aiCar, dt);
  aiCar.step(dt, tr1, inp);
  const p = tr1.progressAt(aiCar.x, aiCar.z, aiCar.aiSample);
  if (p - prev < -0.5) { aiLaps++; }
  prev = p;
  const pr = tr1.project(aiCar.x, aiCar.z);
  if (Math.abs(pr.t) > tr1.halfW(pr.i) + 1.5) aiOff++;
}
ok(aiLaps >= 1, 'هوش مصنوعی یک دور کامل می‌زند');
ok(aiOff < 60 * 240 * 0.25, 'هوش مصنوعی mostly روی پیست می‌ماند',
  (100 - aiOff / (60 * 240) * 100).toFixed(1) + '% روی آسفالت');

/* ---- ۵٫۶) راه‌اندازی کامل برنامه (DOM/GL ساختگی) ---- */
console.log('\n— راه‌اندازی برنامه —');
const gl = getEl('gl').getContext('webgl');
ok(!!KK.app.renderer, 'رندرر ساخته شد');
ok(gl.stats.attribErrors === 0, 'همه‌ی attributeها معتبرند');
ok(gl.stats.uniformErrors === 0, 'همه‌ی uniformها معتبرند');
ok(!gl.stats.linkErrors, 'همه‌ی برنامه‌های شیدر لینک شدند');

/* ---- ۵٫۷) جریان منو → گاراژ → پیست → مسابقه ---- */
console.log('\n— جریان رابط کاربری —');
function clickAct(name) {
  const b = actButtons.find(x => x.getAttribute('data-act') === name);
  if (b && b.onclick) { b.onclick(); return true; }
  return false;
}
ok(clickAct('garage'), 'باز شدن گاراژ');
ok(getEl('g-name').textContent.length > 0, 'نام خودرو در گاراژ نوشته شد', getEl('g-name').textContent);
ok(getEl('carlist').children.length === 22, 'فهرست ۲۲ خودرو در گاراژ', getEl('carlist').children.length);
ok(getEl('g-upgrades').children.length === KK.UPGRADES.length, 'جعبه‌های ارتقاء ساخته شدند');

// خرید یک خودرو
const before = KK.app.profile.coins;
const buyBtn = getEl('g-buy');
if (buyBtn.onclick) buyBtn.onclick();
ok(KK.app.profile.owned.length >= 1, 'دکمه‌ی خرید کار می‌کند');

// حالت داستانی
clickAct('story');
ok(getEl('storylist').children.length === KK.STORY.length, 'فصل‌های داستان ساخته شدند', getEl('storylist').children.length);
getEl('storylist').children[0].onclick();
ok(!getEl('story-dialog').classList.contains('hidden'), 'دیالوگ فصل باز شد');
getEl('d-cancel').onclick();
ok(getEl('story-dialog').classList.contains('hidden'), 'انصراف از دیالوگ');

clickAct('back');
ok(clickAct('race'), 'باز شدن صفحه‌ی پیست‌ها');
ok(getEl('trackgrid').children.length === 20, '۲۰ کارت پیست ساخته شد', getEl('trackgrid').children.length);

/* ---- ۵٫۸) مسابقه‌ی واقعی ---- */
console.log('\n— مسابقه‌ی کامل —');
KK.app.profile.tracks = KK.TRACKS.map(t => t.id);
KK.app.profile.owned = KK.CARS.map(c => c.id);
getEl('s-go');
KK.app.startRace();

function pump(ms) {
  return new Promise(res => {
    const target = vnow + ms;
    const tick = () => {
      while (vnow < target) {
        vnow += 1000 / 60;
        if (rafCb) { const cb = rafCb; rafCb = null; cb(vnow); }
        else break;
      }
      res();
    };
    setTimeout(tick, ms + 40);
  });
}

(async function runRace() {
  await pump(1200);
  const g = KK.app.game;
  ok(!!g, 'شیء مسابقه ساخته شد');
  if (!g) return finish();
  ok(g.cars.length >= 4, 'خودروها در مسابقه حاضرند', g.cars.length + ' خودرو');
  ok(!!g._roadMeshes && g._roadMeshes.length > 0, 'هندسه‌ی پیست آپلود شد');
  ok(!!g._carMeshes && Object.keys(g._carMeshes).length > 0, 'هندسه‌ی خودروها آپلود شد');

  await pump(6000);
  ok(g.state === 'racing', 'پس از شمارش معکوس مسابقه شروع شد', 'state=' + g.state);
  const moved = g.cars.filter(c => Math.abs(c.vf) > 3).length;
  ok(moved > 0, 'خودروها حرکت می‌کنند', moved + ' خودرو در حال حرکت');

  // بازیکن انسانی ورودی ندارد؛ برای پایان‌دادن جریان، ورودی AI را به او می‌دهیم
  g.players[0].car.aiIdx = 5;
  KK.gameModule.Game.prototype.readInput = function (p, dt) {
    const ai = this.updateAI(p.car, dt);
    p.input.steer = ai.steer; p.input.throttle = ai.throttle; p.input.brake = ai.brake;
    p.input.handbrake = ai.handbrake; p.input.nitro = ai.nitro;
    return p.input;
  };

  // اجرای طولانی تا حداقل یک خودرو دور بزند
  let anyLap = false, anyFinish = false, errCount = 0;
  const t0 = Date.now();
  for (let s = 0; s < 60 * 420; s += 2) {
    vnow += 1000 / 60 * 2;
    if (rafCb) { const cb = rafCb; rafCb = null; try { cb(vnow); } catch (e) { errCount++; if (errCount < 3) console.log('    [frame] ' + e.message + '\n' + e.stack.split('\n')[1]); } }
    if (g.cars.some(c => c.lap >= 1)) anyLap = true;
    if (g.cars.some(c => c.finished)) anyFinish = true;
    if (g.state === 'done' || curScreenName() === 'results') break;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  ok(anyLap, 'حداقل یک خودرو دور زد');
  ok(errCount === 0, 'حلقه‌ی رندر بدون خطا اجرا شد', errCount + ' خطا');
  ok(gl.stats.badViewport === undefined, 'ویوپورت‌ها معتبرند');
  ok(gl.stats.badDraw === undefined, 'فراخوانی draw نامعتبر نداشتیم');
  ok(gl.stats.indexOverflow === undefined, 'ایندکس‌ها از تعداد رأس بیرون نزدند');
  ok(gl.stats.subDataOverflow === undefined, 'bufferSubData سرریز نکرد');
  ok((gl.stats.nanUniform || 0) === 0, 'هیچ uniform نان به شیدر نرفت', gl.stats.nanUniform || 0);

  const laps = g.cars.map(c => c.lap);
  console.log('    دورها: [' + laps.join(', ') + '] | زمان شبیه‌سازی: ' + elapsed + 's | drawها: ' + gl.stats.draws);

  // HUD واقعاً چیزی کشید؟
  const hudCtx = getEl('hud').getContext('2d');
  ok(hudCtx._texts > 0, 'HUD متن کشید', hudCtx._texts + ' متن');
  ok(!hudCtx._badText, 'متن HUD شامل NaN/undefined نیست');

  await pump(4500);
  ok(curScreenName() === 'results' || KK.app.game === null || KK.app.game.state === 'done',
    'پس از پایان به صفحه‌ی نتیجه رفتیم', 'screen=' + curScreenName());
  ok(getEl('r-table').children.length > 1 || getEl('r-coins').textContent !== '',
    'جدول نتیجه پر شد');

  finish();
})();

function curScreenName() {
  for (const id of ALL_IDS.filter(i => i.startsWith('screen-'))) {
    if (getEl(id).classList.contains('active')) return id.replace('screen-', '');
  }
  return null;
}

function finish() {
  console.log('\n— آمار رندر —');
  console.log('    draw calls: ' + gl.stats.draws +
    ' | مثلث ارسال‌شده: ' + Math.round(gl.stats.tris) +
    ' | بافر: ' + (gl.stats.bufferBytes / 1048576).toFixed(1) + ' MB' +
    ' | uint index: ' + (gl.stats.uintUsed || 0));
  console.log('\n=================================');
  console.log('  موفق: ' + pass + '   ناموفق: ' + fail);
  if (fail) { console.log('  موارد ناموفق:\n   - ' + failures.join('\n   - ')); }
  console.log('=================================\n');
  process.exit(fail ? 1 : 0);
}
