/* ==========================================================================
   renderer.js  ::  موتور رندر WebGL
   --------------------------------------------------------------------------
   یک شیدر واحد با «مواد» مختلف (رنگ بدنه، شیشه، کروم، لاستیک، آسفالت، چمن،
   صخره، شن، آب، برف، نئون، ...)، نورپردازی نیم‌کره‌ای + جهت‌دار، مه،
   آسمان رویه‌ای (گرادیان + خورشید + ستاره + ابر)، سایه‌ی تماسی، جای ترمز،
   ذرات و نور افکن. تمام بافت‌ها هم به‌صورت رویه‌ای در شیدر تولید می‌شوند.
   ========================================================================== */
(function (root) {
  'use strict';
  var KK = root.KK, M4 = KK.M4;

  /* ---------------------------------------------------------------- شیدرها */
  var VS_MAIN = [
    'attribute vec3 aPos;', 'attribute vec3 aNormal;', 'attribute vec2 aUV;',
    'attribute vec3 aColor;', 'attribute float aMat;',
    'uniform mat4 uProj;', 'uniform mat4 uView;', 'uniform mat4 uModel;', 'uniform mat3 uNrm;',
    'varying vec3 vW;', 'varying vec3 vN;', 'varying vec2 vUV;', 'varying vec3 vC;', 'varying float vMat;', 'varying float vD;',
    'void main(){',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vW = wp.xyz;',
    '  vN = normalize(uNrm * aNormal);',
    '  vUV = aUV; vC = aColor; vMat = aMat;',
    '  vec4 vp = uView * wp;',
    '  vD = length(vp.xyz);',
    '  gl_Position = uProj * vp;',
    '}'
  ].join('\n');

  var FS_MAIN = [
    'precision mediump float;',
    'varying vec3 vW;', 'varying vec3 vN;', 'varying vec2 vUV;', 'varying vec3 vC;', 'varying float vMat;', 'varying float vD;',
    'uniform vec3 uLightDir;', 'uniform vec3 uLightCol;', 'uniform vec3 uAmbTop;', 'uniform vec3 uAmbBot;',
    'uniform vec3 uFogCol;', 'uniform float uFogNear;', 'uniform float uFogFar;',
    'uniform vec3 uCam;', 'uniform vec3 uTint;', 'uniform vec3 uRock;', 'uniform float uTime;',
    'uniform sampler2D uTex;', 'uniform float uUseTex;',

    'float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }',
    'float vnz(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
    '  return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }',
    'float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnz(p); p*=2.07; a*=0.5; } return s; }',

    'void main(){',
    '  int mat = int(vMat + 0.5);',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(uCam - vW);',
    '  if (dot(N,V) < 0.0 && mat != 12) N = -N;',              // سطوح دوطرفه
    '  vec3 base = vC * uTint;',
    '  float rough = 0.75, metal = 0.0, emis = 0.0, alpha = 1.0;',
    '  vec2 uvw = vW.xz;',

    '  if (mat == 0) {                                        /* آسفالت */',
    '    float g = fbm(uvw*2.2);',
    '    base *= 0.80 + g*0.42;',
    '    base = mix(base, base*0.55, smoothstep(0.62,0.72,fbm(uvw*0.35)));',
    '    rough = 0.62;',
    '  } else if (mat == 1) {                                 /* جدول */',
    '    rough = 0.5;',
    '  } else if (mat == 2) {                                 /* رنگ بدنه */',
    '    float flake = vnz(uvw*260.0);',
    '    base *= 0.93 + flake*0.16;',
    '    rough = 0.16; metal = 0.55;',
    '  } else if (mat == 3) {                                 /* شیشه */',
    '    base = mix(base*0.22, uAmbTop*0.85, pow(1.0 - max(dot(N,V),0.0), 2.2));',
    '    rough = 0.05; metal = 0.2; emis = 0.35;',
    '  } else if (mat == 4) {                                 /* کروم */',
    '    base = mix(base*0.5, mix(uAmbBot, uAmbTop, N.y*0.5+0.5), 0.75);',
    '    rough = 0.08; metal = 1.0;',
    '  } else if (mat == 5) {                                 /* لاستیک */',
    '    base *= 0.85 + vnz(uvw*90.0)*0.3;',
    '    rough = 0.95;',
    '  } else if (mat == 6) {                                 /* چراغ */',
    '    emis = 1.0; rough = 0.3;',
    '  } else if (mat == 7) {                                 /* چمن/خاک */',
    '    float slope = 1.0 - N.y;',
    '    float patch = fbm(uvw*0.16);',
    '    vec3 grass = base * (0.78 + patch*0.5);',
    '    base = mix(grass, uRock*(0.7+patch*0.55), smoothstep(0.16,0.46,slope));',
    '    base = mix(base, grass*1.06, smoothstep(0.0,1.0,vnz(uvw*0.05)));',
    '    rough = 0.92;',
    '  } else if (mat == 8) {                                 /* صخره */',
    '    float n = fbm(uvw*0.5);',
    '    base = base*(0.62+n*0.8);',
    '    base = mix(base, uRock*1.1, smoothstep(0.2,0.6,1.0-N.y)*0.5);',
    '    rough = 0.9;',
    '  } else if (mat == 9) {                                 /* شن */',
    '    base *= 0.9 + fbm(uvw*1.4)*0.24;',
    '    rough = 0.85;',
    '  } else if (mat == 10) {                                /* فلز */',
    '    base *= 0.86 + vnz(uvw*12.0)*0.3;',
    '    rough = 0.42; metal = 0.6;',
    '  } else if (mat == 11) {                                /* بتن */',
    '    base *= 0.88 + fbm(uvw*1.1)*0.26;',
    '    rough = 0.8;',
    '  } else if (mat == 12) {                                /* آب */',
    '    vec2 wp2 = vW.xz*0.09;',
    '    float w1 = sin(wp2.x*3.0 + uTime*1.1) * 0.5 + sin(wp2.y*2.3 - uTime*0.8)*0.5;',
    '    vec3 nw = normalize(vec3(w1*0.16, 1.0, cos(wp2.y*2.7 + uTime*0.9)*0.16));',
    '    N = normalize(mix(N, nw, 0.85));',
    '    float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);',
    '    base = mix(base*0.55, mix(uAmbBot, uAmbTop, 0.55), fres*0.9 + 0.18);',
    '    base += uLightCol * pow(max(dot(reflect(-uLightDir,N), V),0.0), 90.0) * 0.9;',
    '    rough = 0.1; metal = 0.2; alpha = 0.86;',
    '  } else if (mat == 13) {                                /* برگ */',
    '    base *= 0.82 + vnz(uvw*3.0)*0.36;',
    '    rough = 0.88;',
    '  } else if (mat == 14) {                                /* آجر */',
    '    vec2 b = uvw*1.6;',
    '    float row = floor(b.y);',
    '    vec2 bb = vec2(fract(b.x + step(1.0, mod(row,2.0))*0.5), fract(b.y));',
    '    float mortar = step(bb.x,0.06) + step(bb.y,0.10);',
    '    base *= 0.88 + vnz(floor(b)*7.0)*0.24 - mortar*0.30;',
    '    rough = 0.9;',
    '  } else if (mat == 15) {                                /* نئون */',
    '    emis = 0.85 + 0.15*sin(uTime*3.0 + vW.x*0.2);',
    '    rough = 0.3;',
    '  } else if (mat == 16) {                                /* خاکِ شانه */',
    '    base *= 0.86 + fbm(uvw*0.9)*0.3;',
    '    rough = 0.95;',
    '  } else if (mat == 17) {                                /* برف */',
    '    base *= 0.94 + vnz(uvw*40.0)*0.12;',
    '    rough = 0.55;',
    '  }',

    '  if (uUseTex > 0.5) base *= texture2D(uTex, vUV).rgb * 1.6;',

    '  vec3 L = normalize(uLightDir);',
    '  float ndl = max(dot(N, L), 0.0);',
    '  float wrap = max(dot(N, L)*0.5 + 0.5, 0.0);',
    '  vec3 amb = mix(uAmbBot, uAmbTop, N.y*0.5 + 0.5);',
    '  vec3 col = base * (amb + uLightCol * ndl);',
    '  col += base * uLightCol * pow(wrap, 3.0) * 0.18;',        /* نور پراکنده */
    '  vec3 H = normalize(L + V);',
    '  float spec = pow(max(dot(N,H), 0.0), mix(6.0, 220.0, 1.0 - rough));',
    '  col += uLightCol * spec * (0.10 + metal*0.85) * (1.0 - rough*0.7);',
    '  float fres = pow(1.0 - max(dot(N,V), 0.0), 4.0);',
    '  col += mix(uAmbBot, uAmbTop, 0.5) * fres * (0.10 + metal*0.55);',
    '  col = mix(col, base * (1.15 + emis), emis);',

    '  float fog = smoothstep(uFogNear, uFogFar, vD);',
    '  col = mix(col, uFogCol, fog);',
    '  col = col / (col + vec3(0.85)) * 1.35;',                  /* تون‌مپینگ */
    '  col = pow(max(col, 0.0), vec3(0.86));',                   /* گاما */
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  /* آسمان رویه‌ای */
  var VS_SKY = [
    'attribute vec2 aP;', 'varying vec2 vP;',
    'void main(){ vP = aP; gl_Position = vec4(aP, 0.999, 1.0); }'
  ].join('\n');
  var FS_SKY = [
    'precision mediump float;',
    'varying vec2 vP;',
    'uniform vec3 uRight;', 'uniform vec3 uUp;', 'uniform vec3 uFwd;',
    'uniform float uTanHalf;', 'uniform float uAspect;',
    'uniform vec3 uTop;', 'uniform vec3 uBot;', 'uniform vec3 uSunCol;', 'uniform vec3 uLightDir;',
    'uniform float uNight;', 'uniform float uTime;', 'uniform vec3 uFogCol;', 'uniform float uCloud;',
    'float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }',
    'float vnz(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
    '  return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }',
    'float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vnz(p); p*=2.11; a*=0.5; } return s; }',
    'void main(){',
    '  vec3 rd = normalize(uFwd + uRight*(vP.x*uTanHalf*uAspect) + uUp*(vP.y*uTanHalf));',
    '  float hgt = clamp(rd.y*0.5 + 0.5, 0.0, 1.0);',
    '  vec3 col = mix(uBot, uTop, pow(hgt, 0.72));',
    '  col = mix(uFogCol, col, smoothstep(-0.06, 0.22, rd.y));',
    '  float sd = max(dot(rd, normalize(uLightDir)), 0.0);',
    '  col += uSunCol * pow(sd, 900.0) * 3.0;',
    '  col += uSunCol * pow(sd, 14.0) * 0.30 * (1.0 - uNight);',
    '  col += uSunCol * pow(sd, 3.0) * 0.10 * (1.0 - uNight);',
    '  if (uNight > 0.5 && rd.y > 0.0) {',
    '    vec2 sp = rd.xz / max(rd.y, 0.06) * 22.0;',
    '    float st = hsh(floor(sp*14.0));',
    '    float tw = step(0.9955, st) * (0.55 + 0.45*sin(uTime*2.0 + st*90.0));',
    '    col += vec3(tw) * smoothstep(0.0, 0.25, rd.y);',
    '  }',
    '  if (rd.y > 0.01 && uCloud > 0.01) {',
    '    vec2 cp = rd.xz / rd.y * 1.6 + vec2(uTime*0.006, 0.0);',
    '    float c = fbm(cp*1.7);',
    '    c = smoothstep(0.52 - uCloud*0.22, 0.86, c) * smoothstep(0.0, 0.18, rd.y);',
    '    vec3 cc = mix(uFogCol*1.25, vec3(1.0), 0.5) * (0.55 + 0.45*max(dot(normalize(uLightDir), vec3(0,1,0)),0.0));',
    '    col = mix(col, cc, c * uCloud * 0.85);',
    '  }',
    '  col = col / (col + vec3(0.9)) * 1.42;',
    '  col = pow(max(col,0.0), vec3(0.86));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* سایه‌ی تماسی / جای ترمز / نور افکن */
  var VS_SOFT = [
    'attribute vec3 aPos;', 'attribute vec4 aCol;', 'attribute vec2 aUV;',
    'uniform mat4 uProj;', 'uniform mat4 uView;',
    'varying vec4 vCol;', 'varying vec2 vUV;',
    'void main(){ vCol = aCol; vUV = aUV; gl_Position = uProj * uView * vec4(aPos,1.0); }'
  ].join('\n');
  var FS_SOFT = [
    'precision mediump float;',
    'varying vec4 vCol;', 'varying vec2 vUV;', 'uniform float uMode;',
    'void main(){',
    '  float a = vCol.a;',
    '  if (uMode < 0.5) { float d = length(vUV - 0.5)*2.0; a *= smoothstep(1.0, 0.15, d); }',
    '  else if (uMode < 1.5) { a *= smoothstep(1.0, 0.35, abs(vUV.x-0.5)*2.0); }',
    '  /* uMode == 2 : بدون افت (جای ترمز) */',
    '  gl_FragColor = vec4(vCol.rgb, a);',
    '}'
  ].join('\n');

  /* ذرات */
  var VS_PART = [
    'attribute vec3 aPos;', 'attribute vec4 aCol;', 'attribute float aSize;',
    'uniform mat4 uProj;', 'uniform mat4 uView;', 'uniform float uScale;',
    'varying vec4 vCol;',
    'void main(){ vec4 vp = uView * vec4(aPos,1.0); gl_Position = uProj * vp;',
    '  gl_PointSize = clamp(aSize * uScale / max(-vp.z, 1.0), 1.0, 90.0); vCol = aCol; }'
  ].join('\n');
  var FS_PART = [
    'precision mediump float;', 'varying vec4 vCol;',
    'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d)*2.0;',
    '  float a = smoothstep(1.0, 0.25, r) * vCol.a; gl_FragColor = vec4(vCol.rgb, a); }'
  ].join('\n');

  /* ======================================================================= */
  function compile(gl, type, src, name) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      throw new Error('shader ' + name + ': ' + log + '\n' + src.split('\n').map(function (l, i) { return (i + 1) + ': ' + l; }).join('\n'));
    }
    return s;
  }
  function program(gl, vs, fs, name) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name + '.vs'));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name + '.fs'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link ' + name + ': ' + gl.getProgramInfoLog(p));
    var o = { p: p, u: {}, a: {} };
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), i;
    for (i = 0; i < nu; i++) { var inf = gl.getActiveUniform(p, i); o.u[inf.name.replace('[0]', '')] = gl.getUniformLocation(p, inf.name); }
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (i = 0; i < na; i++) { var ai = gl.getActiveAttrib(p, i); o.a[ai.name] = gl.getAttribLocation(p, ai.name); }
    return o;
  }

  function GLMesh(gl, verts, idx, dynamic, floatsPerVert) {
    this.gl = gl;
    this.count = idx.length;
    this.vertCount = verts.length / (floatsPerVert || KK.STRIDE);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    if (gl.setNextStride) gl.setNextStride(floatsPerVert || KK.STRIDE);
    gl.bufferData(gl.ARRAY_BUFFER, verts, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  }
  GLMesh.prototype.update = function (verts, idx) {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, idx);
    this.count = idx.length;
  };
  GLMesh.prototype.dispose = function () {
    this.gl.deleteBuffer(this.vbo); this.gl.deleteBuffer(this.ibo);
  };

  /* ========================================================================
     رندرر
     ======================================================================== */
  function Renderer(canvas) {
    this.canvas = canvas;
    var opts = { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false };
    var gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('WebGL در دسترس نیست');
    this.gl = gl;
    this.uint32 = !!gl.getExtension('OES_element_index_uint');
    this.idxType = this.uint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    this.maxIdx = this.uint32 ? 4294967295 : 65535;

    this.pMain = program(gl, VS_MAIN, FS_MAIN, 'main');
    this.pSky = program(gl, VS_SKY, FS_SKY, 'sky');
    this.pSoft = program(gl, VS_SOFT, FS_SOFT, 'soft');
    this.pPart = program(gl, VS_PART, FS_PART, 'part');

    // بافت دِکال (تابلوها) به‌صورت رویه‌ای روی canvas ساخته می‌شود
    this.tex = this.makeDecalTexture();

    // کوآد آسمان
    var skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.skyBuf = skyBuf;

    // بافرهای پویا
    this.shadowMax = 300;
    this.shadowBuf = new Float32Array(this.shadowMax * 4 * 9);
    this.shadowIdx = new Uint16Array(this.shadowMax * 6);
    for (var i = 0; i < this.shadowMax; i++) {
      var b = i * 4;
      this.shadowIdx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
    }
    this.emptyIdx = new Uint16Array([0]);

    // جای ترمز (ماندگار روی آسفالت)
    this.skidMax = 1400;
    this.skidBuf = new Float32Array(this.skidMax * 4 * 9);
    this.skidIdx = new Uint16Array(this.skidMax * 6);
    for (var si = 0; si < this.skidMax; si++) {
      var sb = si * 4;
      this.skidIdx.set([sb, sb + 1, sb + 2, sb, sb + 2, sb + 3], si * 6);
    }
    this.skidMesh = new GLMesh(gl, this.skidBuf, this.skidIdx, true, 9);
    this.skidHead = 0; this.skidCount = 0;
    this.shadowMesh = new GLMesh(gl, this.shadowBuf, this.shadowIdx, true, 9);
    this.shadowN = 0;

    this.partMax = 1800;
    this.partBuf = new Float32Array(this.partMax * 8);
    this.partMesh = new GLMesh(gl, this.partBuf, new Uint16Array([0]), true, 8);
    this.partN = 0;

    this.stats = { calls: 0, tris: 0 };
    this.quality = 1;
  }

  Renderer.prototype.makeDecalTexture = function () {
    var gl = this.gl;
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.decalCanvas = null;
    return t;
  };

  /** ساخت بافت تابلوها از متن فارسی (یک‌بار برای هر پیست) */
  Renderer.prototype.buildDecalTexture = function (lines, colors) {
    var gl = this.gl, cv;
    if (typeof document === 'undefined') return;
    if (!this.decalCanvas) {
      cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 256;
      this.decalCanvas = cv;
    } else cv = this.decalCanvas;
    var c = cv.getContext('2d');
    c.clearRect(0, 0, 1024, 256);
    for (var i = 0; i < 4; i++) {
      var y0 = i * 64;
      var g = c.createLinearGradient(0, y0, 1024, y0 + 64);
      var col = colors ? colors[i % colors.length] : '#101820';
      g.addColorStop(0, col); g.addColorStop(1, '#05080c');
      c.fillStyle = g;
      c.fillRect(0, y0, 1024, 64);
      c.fillStyle = ['#00e5ff', '#ff2fb0', '#ffd24a', '#00ffa3'][i];
      c.fillRect(0, y0, 1024, 4);
      c.fillRect(0, y0 + 60, 1024, 4);
      c.direction = 'rtl';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = 'bold 40px Vazirmatn, Tahoma, sans-serif';
      c.fillStyle = '#ffffff';
      c.fillText(lines[i % lines.length] || '', 512, y0 + 34);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  /** آپلود یک MeshBuilder به کارت گرافیک (در صورت نیاز تکه‌تکه) */
  Renderer.prototype.upload = function (mb) {
    var gl = this.gl;
    var out = [];
    var verts = new Float32Array(mb.verts);
    var limit = this.maxIdx;
    if (mb.vcount <= limit) {
      out.push(new GLMesh(gl, verts, new (this.uint32 ? Uint32Array : Uint16Array)(mb.idx)));
      return out;
    }
    // تکه‌تکه‌کردن برای زمانی که افزونه‌ی uint وجود ندارد
    var CH = 60000, start = 0;
    while (start < mb.vcount) {
      var end = Math.min(mb.vcount, start + CH);
      var remap = {}, map = [], n = 0, i;
      var newIdx = [];
      for (i = 0; i < mb.idx.length; i += 3) {
        var a = mb.idx[i], b = mb.idx[i + 1], c = mb.idx[i + 2];
        if (a < start || a >= end || b < start || b >= end || c < start || c >= end) continue;
        newIdx.push(a - start, b - start, c - start);
      }
      if (newIdx.length) {
        var sub = new Float32Array(verts.subarray(start * KK.STRIDE, end * KK.STRIDE));
        out.push(new GLMesh(gl, sub, new Uint16Array(newIdx)));
      }
      start = end;
    }
    return out;
  };

  Renderer.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(root.devicePixelRatio || 1, this.quality > 0.7 ? 2 : 1.25);
    var w = Math.max(1, Math.floor(c.clientWidth * dpr));
    var h = Math.max(1, Math.floor(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.w = w; this.h = h;
    this.aspect = w / h;
  };

  /* -------------------------------------------------------- حالت جهانی نور */
  Renderer.prototype.setEnv = function (env) { this.env = env; };

  /** یک ویوپورت را با دوربین داده‌شده رندر می‌کند */
  Renderer.prototype.renderView = function (cam, scene, vp) {
    var gl = this.gl, env = this.env, i;
    this.stats.calls = 0; this.stats.tris = 0;
    gl.viewport(vp.x, vp.y, vp.w, vp.h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    var aspect = vp.w / vp.h;
    var proj = M4.create();
    M4.perspective(proj, cam.fov, aspect, 0.35, env.fogFar * 2.6);

    /* --- آسمان --- */
    var sp = this.pSky;
    gl.useProgram(sp.p);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.enableVertexAttribArray(sp.a.aP);
    gl.vertexAttribPointer(sp.a.aP, 2, gl.FLOAT, false, 0, 0);
    var th = Math.tan(cam.fov / 2);
    gl.uniform3fv(sp.u.uRight, cam.right);
    gl.uniform3fv(sp.u.uUp, cam.up);
    gl.uniform3fv(sp.u.uFwd, cam.fwd);
    gl.uniform1f(sp.u.uTanHalf, th);
    gl.uniform1f(sp.u.uAspect, aspect);
    gl.uniform3fv(sp.u.uTop, env.skyTop);
    gl.uniform3fv(sp.u.uBot, env.skyBot);
    gl.uniform3fv(sp.u.uSunCol, env.sun);
    gl.uniform3fv(sp.u.uLightDir, env.lightDir);
    gl.uniform1f(sp.u.uNight, env.night);
    gl.uniform1f(sp.u.uTime, env.time);
    gl.uniform3fv(sp.u.uFogCol, env.fog);
    gl.uniform1f(sp.u.uCloud, env.cloud);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(sp.a.aP);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    /* --- هندسه‌ی اصلی --- */
    var mp = this.pMain;
    gl.useProgram(mp.p);
    gl.uniformMatrix4fv(mp.u.uProj, false, proj);
    gl.uniformMatrix4fv(mp.u.uView, false, cam.view);
    gl.uniform3fv(mp.u.uLightDir, env.lightDir);
    gl.uniform3fv(mp.u.uLightCol, env.lightCol);
    gl.uniform3fv(mp.u.uAmbTop, env.ambTop);
    gl.uniform3fv(mp.u.uAmbBot, env.ambBot);
    gl.uniform3fv(mp.u.uFogCol, env.fog);
    gl.uniform1f(mp.u.uFogNear, env.fogNear);
    gl.uniform1f(mp.u.uFogFar, env.fogFar);
    gl.uniform3fv(mp.u.uCam, cam.pos);
    gl.uniform3fv(mp.u.uRock, env.rock);
    gl.uniform1f(mp.u.uTime, env.time);
    gl.uniform1f(mp.u.uUseTex, 0);
    gl.uniform3f(mp.u.uTint, 1, 1, 1);
    var nrm = new Float32Array(9);
    var ident = M4.create();

    var bindAttribs = this._bindAttribs;

    var draws = scene.draws;
    for (i = 0; i < draws.length; i++) {
      var d = draws[i];
      if (!d.meshes) continue;
      if (d.blend) continue;
      if (d.tex) { gl.uniform1f(mp.u.uUseTex, 1); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(mp.u.uTex, 0); }
      else gl.uniform1f(mp.u.uUseTex, 0);
      if (d.tint) gl.uniform3fv(mp.u.uTint, d.tint); else gl.uniform3f(mp.u.uTint, 1, 1, 1);
      gl.uniformMatrix4fv(mp.u.uModel, false, d.model || ident);
      if (d.model) M4.normalFromMat4(nrm, d.model); else M4.normalFromMat4(nrm, ident);
      gl.uniformMatrix3fv(mp.u.uNrm, false, nrm);
      for (var m = 0; m < d.meshes.length; m++) {
        var g = d.meshes[m];
        gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibo);
        bindAttribs.call(this, mp);
        gl.drawElements(gl.TRIANGLES, g.count, this.idxType, 0);
        this.stats.calls++; this.stats.tris += g.count / 3;
      }
    }

    /* --- شفاف‌ها (آب) --- */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (i = 0; i < draws.length; i++) {
      var d2 = draws[i];
      if (!d2.blend || d2.soft) continue;
      gl.uniform1f(mp.u.uUseTex, 0);
      if (d2.tint) gl.uniform3fv(mp.u.uTint, d2.tint); else gl.uniform3f(mp.u.uTint, 1, 1, 1);
      gl.uniformMatrix4fv(mp.u.uModel, false, d2.model || ident);
      M4.normalFromMat4(nrm, d2.model || ident);
      gl.uniformMatrix3fv(mp.u.uNrm, false, nrm);
      for (var m2 = 0; m2 < d2.meshes.length; m2++) {
        var g2 = d2.meshes[m2];
        gl.bindBuffer(gl.ARRAY_BUFFER, g2.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g2.ibo);
        bindAttribs.call(this, mp);
        gl.drawElements(gl.TRIANGLES, g2.count, this.idxType, 0);
        this.stats.calls++; this.stats.tris += g2.count / 3;
      }
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    /* --- جای ترمز و سایه‌ها --- */
    if (this.skidCount > 0 || this.shadowN > 0) {
      var sf = this.pSoft;
      gl.useProgram(sf.p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(sf.u.uProj, false, proj);
      gl.uniformMatrix4fv(sf.u.uView, false, cam.view);

      if (this.skidCount > 0) {
        gl.uniform1f(sf.u.uMode, 2);
        this.skidMesh.update(this.skidBuf, this.skidIdx);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.skidMesh.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skidMesh.ibo);
        gl.enableVertexAttribArray(sf.a.aPos);
        gl.vertexAttribPointer(sf.a.aPos, 3, gl.FLOAT, false, 36, 0);
        gl.enableVertexAttribArray(sf.a.aCol);
        gl.vertexAttribPointer(sf.a.aCol, 4, gl.FLOAT, false, 36, 12);
        gl.enableVertexAttribArray(sf.a.aUV);
        gl.vertexAttribPointer(sf.a.aUV, 2, gl.FLOAT, false, 36, 28);
        gl.drawElements(gl.TRIANGLES, this.skidCount * 6, gl.UNSIGNED_SHORT, 0);
        this.stats.calls++;
      }
      gl.uniform1f(sf.u.uMode, 0);
      gl.enableVertexAttribArray(sf.a.aPos);
      gl.enableVertexAttribArray(sf.a.aCol);
      gl.enableVertexAttribArray(sf.a.aUV);
      this.shadowMesh.update(this.shadowBuf, this.shadowIdx);
      if (this.shadowN > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowMesh.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.shadowMesh.ibo);
        gl.vertexAttribPointer(sf.a.aPos, 3, gl.FLOAT, false, 36, 0);
        gl.vertexAttribPointer(sf.a.aCol, 4, gl.FLOAT, false, 36, 12);
        gl.vertexAttribPointer(sf.a.aUV, 2, gl.FLOAT, false, 36, 28);
        gl.drawElements(gl.TRIANGLES, this.shadowN * 6, gl.UNSIGNED_SHORT, 0);
        this.stats.calls++;
      }
      gl.disableVertexAttribArray(sf.a.aCol);
      gl.disableVertexAttribArray(sf.a.aUV);
      gl.disableVertexAttribArray(sf.a.aPos);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /* --- ذرات --- */
    if (this.partN > 0) {
      var pf = this.pPart;
      gl.useProgram(pf.p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(pf.u.uProj, false, proj);
      gl.uniformMatrix4fv(pf.u.uView, false, cam.view);
      gl.uniform1f(pf.u.uScale, vp.h * 0.9);
      this.partMesh.update(this.partBuf, this.emptyIdx);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.partMesh.vbo);
      gl.enableVertexAttribArray(pf.a.aPos);
      gl.vertexAttribPointer(pf.a.aPos, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(pf.a.aCol);
      gl.vertexAttribPointer(pf.a.aCol, 4, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(pf.a.aSize);
      gl.vertexAttribPointer(pf.a.aSize, 1, gl.FLOAT, false, 32, 28);
      gl.drawArrays(gl.POINTS, 0, this.partN);
      this.stats.calls++;
      gl.disableVertexAttribArray(pf.a.aSize);
      gl.disableVertexAttribArray(pf.a.aCol);
      gl.disableVertexAttribArray(pf.a.aPos);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    this.shadowN = 0;
    this.partN = 0;
  };

  /* ----------------------------------------------------------- ابزار کمکی */
  Renderer.prototype._bindAttribs = function (prog) {
    var gl = this.gl, S = KK.STRIDE * 4;
    gl.enableVertexAttribArray(prog.a.aPos);
    gl.vertexAttribPointer(prog.a.aPos, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(prog.a.aNormal);
    gl.vertexAttribPointer(prog.a.aNormal, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(prog.a.aUV);
    gl.vertexAttribPointer(prog.a.aUV, 2, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(prog.a.aColor);
    gl.vertexAttribPointer(prog.a.aColor, 3, gl.FLOAT, false, S, 32);
    gl.enableVertexAttribArray(prog.a.aMat);
    gl.vertexAttribPointer(prog.a.aMat, 1, gl.FLOAT, false, S, 44);
  };

  /** سایه‌ی تماسی نرم زیر خودرو */
  Renderer.prototype.pushShadow = function (x, y, z, yaw, sx, sz, alpha) {
    if (this.shadowN >= this.shadowMax) return;
    var c = Math.cos(yaw), s = Math.sin(yaw);
    var hx = sx / 2, hz = sz / 2;
    var B = this.shadowBuf, o = this.shadowN * 4 * 9, i, k;
    var pts = [
      [x + (-hx) * c + (-hz) * s, y, z + (-hx) * -s + (-hz) * c],
      [x + (hx) * c + (-hz) * s, y, z + (hx) * -s + (-hz) * c],
      [x + (hx) * c + (hz) * s, y, z + (hx) * -s + (hz) * c],
      [x + (-hx) * c + (hz) * s, y, z + (-hx) * -s + (hz) * c]
    ];
    var uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (i = 0; i < 4; i++) {
      k = o + i * 9;
      B[k] = pts[i][0]; B[k + 1] = pts[i][1]; B[k + 2] = pts[i][2];
      B[k + 3] = 0; B[k + 4] = 0; B[k + 5] = 0; B[k + 6] = alpha;
      B[k + 7] = uv[i][0]; B[k + 8] = uv[i][1];
    }
    this.shadowN++;
  };

  /** مخروط نور چراغ جلو (افزودنی روی زمین) */
  Renderer.prototype.pushHeadlight = function (x, y, z, yaw, len, spread, alpha, col) {
    if (this.shadowN >= this.shadowMax) return;
    var c = Math.cos(yaw), s = Math.sin(yaw);
    var tip = [x + s * len, y, z + c * len];
    var l1 = [x + (-spread) * c + s * 1.4, y, z + (-spread) * -s + c * 1.4];
    var l2 = [x + (spread) * c + s * 1.4, y, z + (spread) * -s + c * 1.4];
    var B = this.shadowBuf, o = this.shadowN * 4 * 9, i, k;
    var pts = [l1, l2, tip, tip], als = [alpha, alpha, 0, 0];
    for (i = 0; i < 4; i++) {
      k = o + i * 9;
      B[k] = pts[i][0]; B[k + 1] = pts[i][1]; B[k + 2] = pts[i][2];
      B[k + 3] = col[0]; B[k + 4] = col[1]; B[k + 5] = col[2]; B[k + 6] = als[i];
      B[k + 7] = 0.5; B[k + 8] = 0.5;
    }
    this.shadowN++;
  };

  /** یک چهارگوش جای ترمز به بافر ماندگار اضافه می‌کند */
  Renderer.prototype.addSkid = function (x0, z0, x1, z1, y, w, alpha) {
    var dx = x1 - x0, dz = z1 - z0;
    var l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.06) return;
    var nx = -dz / l * w * 0.5, nz = dx / l * w * 0.5;
    var o = this.skidHead * 4 * 9, B = this.skidBuf, i, k;
    var pts = [
      [x0 + nx, y, z0 + nz], [x0 - nx, y, z0 - nz],
      [x1 - nx, y, z1 - nz], [x1 + nx, y, z1 + nz]
    ];
    for (i = 0; i < 4; i++) {
      k = o + i * 9;
      B[k] = pts[i][0]; B[k + 1] = pts[i][1]; B[k + 2] = pts[i][2];
      B[k + 3] = 0.02; B[k + 4] = 0.02; B[k + 5] = 0.02; B[k + 6] = alpha;
      B[k + 7] = 0.5; B[k + 8] = 0.5;
    }
    this.skidHead = (this.skidHead + 1) % this.skidMax;
    if (this.skidCount < this.skidMax) this.skidCount++;
  };

  Renderer.prototype.clearSkids = function () { this.skidHead = 0; this.skidCount = 0; };

  Renderer.prototype.pushParticle = function (x, y, z, r, g, b, a, size) {
    if (this.partN >= this.partMax) return;
    var o = this.partN * 8, B = this.partBuf;
    B[o] = x; B[o + 1] = y; B[o + 2] = z;
    B[o + 3] = r; B[o + 4] = g; B[o + 5] = b; B[o + 6] = a;
    B[o + 7] = size;
    this.partN++;
  };

  var API = { Renderer: Renderer, GLMesh: GLMesh };
  KK.rendererModule = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
