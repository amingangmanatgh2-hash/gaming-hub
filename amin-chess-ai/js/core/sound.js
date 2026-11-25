/* AMIN CHESS AI — صداها (ساخته‌شده با WebAudio، بدون فایل صوتی خارجی) */
(function (global) {
  'use strict';

  var ctx = null;
  var pack = 'classic';
  var enabled = true;

  function ensureCtx() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') { ctx.resume(); }
    return ctx;
  }

  function tone(freq, dur, type, vol, delay) {
    var c = ensureCtx();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol == null ? 0.16 : vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, delay) {
    var c = ensureCtx();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var gain = c.createGain(); gain.gain.value = vol == null ? 0.2 : vol;
    var filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900;
    src.connect(filter); filter.connect(gain); gain.connect(c.destination);
    src.start(t0);
  }

  var packs = {
    classic: {
      move: function () { tone(520, 0.09, 'sine', 0.15); },
      capture: function () { tone(300, 0.14, 'triangle', 0.2); noise(0.05, 0.12); },
      check: function () { tone(760, 0.1, 'square', 0.1); tone(980, 0.12, 'square', 0.1, 0.09); },
      win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.18, 'sine', 0.14, i * 0.11); }); },
      lose: function () { [400, 330, 260].forEach(function (f, i) { tone(f, 0.22, 'sine', 0.14, i * 0.14); }); },
      coin: function () { tone(1180, 0.09, 'sine', 0.13); tone(1560, 0.12, 'sine', 0.12, 0.07); },
      click: function () { tone(660, 0.04, 'sine', 0.07); }
    },
    wood: {
      move: function () { noise(0.06, 0.22); tone(340, 0.05, 'sine', 0.1); },
      capture: function () { noise(0.1, 0.3); tone(220, 0.1, 'triangle', 0.15); },
      check: function () { noise(0.06, 0.2); tone(880, 0.14, 'triangle', 0.12, 0.05); },
      win: function () { [392, 494, 587, 784].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.13, i * 0.12); }); },
      lose: function () { [330, 262, 196].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.13, i * 0.15); }); },
      coin: function () { tone(1000, 0.08, 'triangle', 0.12); tone(1400, 0.1, 'triangle', 0.1, 0.07); },
      click: function () { noise(0.03, 0.1); }
    },
    digital: {
      move: function () { tone(880, 0.05, 'square', 0.08); },
      capture: function () { tone(440, 0.06, 'square', 0.1); tone(220, 0.09, 'sawtooth', 0.09, 0.05); },
      check: function () { tone(1100, 0.06, 'square', 0.09); tone(1320, 0.09, 'square', 0.09, 0.06); },
      win: function () { [659, 880, 1175].forEach(function (f, i) { tone(f, 0.12, 'square', 0.09, i * 0.09); }); },
      lose: function () { [440, 349, 277].forEach(function (f, i) { tone(f, 0.16, 'sawtooth', 0.08, i * 0.13); }); },
      coin: function () { tone(1320, 0.06, 'square', 0.1); tone(1760, 0.09, 'square', 0.09, 0.06); },
      click: function () { tone(1200, 0.03, 'square', 0.05); }
    }
  };

  function setPack(p) { if (packs[p]) pack = p; }
  function setEnabled(v) { enabled = !!v; }
  function play(name) {
    if (!enabled) return;
    var p = packs[pack] || packs.classic;
    var fn = p[name];
    if (fn) { try { fn(); } catch (e) { /* صدا نباید بازی را قطع کند */ } }
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.sound = { play: play, setPack: setPack, setEnabled: setEnabled, packs: Object.keys(packs) };
})(window);
