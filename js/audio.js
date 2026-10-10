/* ==========================================================================
   audio.js  ::  موتور صدای کاملاً سنتزشده (WebAudio)
   --------------------------------------------------------------------------
   هیچ فایل صوتی‌ای وجود ندارد: صدای موتور از دو نوسان‌ساز اره‌دندانه + نویز
   عبوری از فیلتر پایین‌گذر ساخته می‌شود و فرکانسش با دور موتور عوض می‌شود.
   جیغ لاستیک، برخورد، نیترو، باد، رابط کاربری و موسیقی همگی رویه‌ای‌اند.
   ========================================================================== */
(function (root) {
  'use strict';

  function AudioEngine() {
    this.ctx = null;
    this.enabled = true;
    this.masterVol = 0.8;
    this.musicVol = 0.35;
    this.sfxVol = 0.9;
    this.ready = false;
    this.voiceCount = 0;
  }

  AudioEngine.prototype.init = function () {
    if (this.ready) return true;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) { this.enabled = false; return false; }
    try {
      this.ctx = new AC();
    } catch (e) { this.enabled = false; return false; }
    var c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = this.masterVol;
    this.master.connect(c.destination);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);

    // فشرده‌ساز تا صداها با هم گِل نشوند
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 6;
    this.comp.disconnect();
    this.comp.connect(this.master);

    // نویز سفید مشترک
    var len = c.sampleRate * 2;
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.ready = true;
    this.buildEngine();
    return true;
  };

  AudioEngine.prototype.resume = function () {
    if (!this.ready) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  AudioEngine.prototype.setMaster = function (v) {
    this.masterVol = v;
    if (this.master) this.master.gain.value = v;
  };
  AudioEngine.prototype.setMusic = function (v) {
    this.musicVol = v;
    if (this.musicBus) this.musicBus.gain.value = v;
  };
  AudioEngine.prototype.setSfx = function (v) {
    this.sfxVol = v;
    if (this.sfxBus) this.sfxBus.gain.value = v;
  };

  /* ------------------------------------------------------------- موتور */
  AudioEngine.prototype.buildEngine = function () {
    var c = this.ctx;
    this.engines = [];
  };

  /** یک صدای موتور مستقل (برای بازیکن و نزدیک‌ترین رقیب) */
  AudioEngine.prototype.makeEngineVoice = function (isPlayer) {
    if (!this.ready) return null;
    var c = this.ctx;
    var g = c.createGain(); g.gain.value = 0;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3;
    var o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    var o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 30; o2.detune.value = 8;
    var o3 = c.createOscillator(); o3.type = 'sawtooth'; o3.frequency.value = 120;
    var g2 = c.createGain(); g2.gain.value = 0.35;
    var g3 = c.createGain(); g3.gain.value = 0.16;
    var nz = c.createBufferSource(); nz.buffer = this.noiseBuf; nz.loop = true;
    var nzg = c.createGain(); nzg.gain.value = 0.05;
    var nzf = c.createBiquadFilter(); nzf.type = 'bandpass'; nzf.frequency.value = 700; nzf.Q.value = 0.8;

    o1.connect(lp); o2.connect(g2); g2.connect(lp); o3.connect(g3); g3.connect(lp);
    nz.connect(nzf); nzf.connect(nzg); nzg.connect(lp);
    lp.connect(g); g.connect(this.sfxBus);
    o1.start(); o2.start(); o3.start(); nz.start();

    return {
      g: g, lp: lp, o1: o1, o2: o2, o3: o3, nzg: nzg, nzf: nzf, isPlayer: isPlayer,
      update: function (rpm, load, active, dist) {
        var f = 22 + rpm * 0.020;
        var t = this.g.context ? 0 : 0;
        var now = g.context.currentTime;
        o1.frequency.setTargetAtTime(f, now, 0.03);
        o2.frequency.setTargetAtTime(f * 0.5, now, 0.03);
        o3.frequency.setTargetAtTime(f * 2.01, now, 0.04);
        lp.frequency.setTargetAtTime(320 + rpm * 0.30 + load * 900, now, 0.06);
        var vol = active ? (0.045 + load * 0.13) : 0.012;
        if (!this.isPlayer && dist > 0) vol *= Math.max(0, 1 - dist / 130);
        g.gain.setTargetAtTime(active || dist < 130 ? vol : 0, now, 0.08);
        nzg.gain.setTargetAtTime(0.02 + load * 0.06, now, 0.1);
      },
      stop: function () {
        var now = g.context.currentTime;
        g.gain.setTargetAtTime(0, now, 0.1);
        setTimeout(function () { try { o1.stop(); o2.stop(); o3.stop(); nz.stop(); } catch (e) { } }, 600);
      }
    };
  };

  /** جیغ لاستیک */
  AudioEngine.prototype.screech = function (voice, amount) {
    if (!this.ready || !voice) return;
    var now = this.ctx.currentTime;
    voice.nzf.frequency.setTargetAtTime(1400 + amount * 1800, now, 0.05);
  };

  AudioEngine.prototype.noise = function (dur, freq, q, vol, type) {
    if (!this.ready) return;
    var c = this.ctx, now = c.currentTime;
    var s = c.createBufferSource(); s.buffer = this.noiseBuf;
    var f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    var g = c.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(now); s.stop(now + dur + 0.02);
  };

  AudioEngine.prototype.tone = function (freq, dur, vol, type, slide) {
    if (!this.ready) return;
    var c = this.ctx, now = c.currentTime;
    var o = c.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), now + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(now); o.stop(now + dur + 0.02);
  };

  AudioEngine.prototype.impact = function (force) {
    var v = Math.min(1, force);
    this.noise(0.22 + v * 0.2, 240, 0.7, 0.10 + v * 0.34, 'lowpass');
    this.tone(90 - v * 40, 0.20 + v * 0.15, 0.10 + v * 0.22, 'sine', 40);
    if (v > 0.5) this.noise(0.10, 3200, 2.5, v * 0.10, 'highpass');
  };

  AudioEngine.prototype.nitro = function () {
    this.noise(0.55, 900, 0.6, 0.16, 'bandpass');
    this.tone(180, 0.5, 0.09, 'sawtooth', 900);
  };

  AudioEngine.prototype.ui = function (kind) {
    if (kind === 'move') this.tone(660, 0.06, 0.05, 'triangle');
    else if (kind === 'ok') { this.tone(520, 0.09, 0.07, 'triangle'); this.tone(780, 0.12, 0.05, 'triangle'); }
    else if (kind === 'back') this.tone(330, 0.08, 0.06, 'triangle');
    else if (kind === 'buy') { this.tone(520, 0.1, 0.08, 'square'); setTimeout(this.tone.bind(this, 780, 0.14, 0.06, 'square'), 90); }
    else if (kind === 'count') this.tone(440, 0.16, 0.10, 'square');
    else if (kind === 'go') this.tone(880, 0.5, 0.14, 'square');
  };

  AudioEngine.prototype.gearShift = function (voice) {
    this.noise(0.09, 1800, 1.6, 0.07, 'bandpass');
  };

  /* ------------------------------------------------------- موسیقی رویه‌ای */
  AudioEngine.prototype.startMusic = function (mood) {
    if (!this.ready) return;
    this.stopMusic();
    var self = this, c = this.ctx;
    this.musicOn = true;
    this.step = 0;
    // گام‌های گامِ minor برای حس حماسی
    var scale = mood === 'neon' ? [0, 3, 5, 7, 10, 12, 15] : [0, 2, 3, 5, 7, 8, 10, 12];
    var rootF = mood === 'neon' ? 55 : 49;
    var bpm = mood === 'menu' ? 96 : 138;
    var spb = 60 / bpm / 2;
    var pat = [0, 0, 4, 0, 5, 0, 3, 2];
    this.musicTimer = setInterval(function () {
      if (!self.musicOn || !self.ctx) return;
      var s = self.step++;
      var now = self.ctx.currentTime;
      // بیس
      if (s % 2 === 0) {
        var n = scale[pat[(s / 2) % pat.length] % scale.length];
        var f = rootF * Math.pow(2, n / 12);
        var o = self.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        var lp = self.ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(700, now);
        lp.frequency.exponentialRampToValueAtTime(180, now + spb * 1.6);
        var g = self.ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + spb * 1.7);
        o.connect(lp); lp.connect(g); g.connect(self.musicBus);
        o.start(now); o.stop(now + spb * 1.8);
      }
      // های‌هت
      if (mood !== 'menu' && s % 2 === 1) {
        var hs = self.ctx.createBufferSource(); hs.buffer = self.noiseBuf;
        var hf = self.ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 7000;
        var hg = self.ctx.createGain();
        hg.gain.setValueAtTime(0.05, now);
        hg.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        hs.connect(hf); hf.connect(hg); hg.connect(self.musicBus);
        hs.start(now); hs.stop(now + 0.06);
      }
      // ملودی
      if (s % 8 === 4) {
        var m = scale[(s * 3 + 2) % scale.length] + 12;
        var mf = rootF * 2 * Math.pow(2, m / 12);
        var mo = self.ctx.createOscillator(); mo.type = mood === 'neon' ? 'square' : 'triangle';
        mo.frequency.value = mf;
        var mg = self.ctx.createGain();
        mg.gain.setValueAtTime(0.0001, now);
        mg.gain.exponentialRampToValueAtTime(0.055, now + 0.03);
        mg.gain.exponentialRampToValueAtTime(0.0001, now + spb * 3.4);
        mo.connect(mg); mg.connect(self.musicBus);
        mo.start(now); mo.stop(now + spb * 3.6);
      }
    }, spb * 1000);
  };

  AudioEngine.prototype.stopMusic = function () {
    this.musicOn = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  };

  root.KK = root.KK || {};
  root.KK.AudioEngine = AudioEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = { AudioEngine: AudioEngine };
})(typeof window !== 'undefined' ? window : globalThis);
