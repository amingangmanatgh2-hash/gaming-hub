/**
 * مدیریت صدا و تصویر محلی: دستگاه‌ها، سطح صدا (تشخیص صحبت)، اشتراک صفحه،
 * افکت تصویری سبک، عکس‌برداری و ضبط جلسه.
 */
import { Emitter } from './util.js';
import { PROFILES } from './rtc.js';

const audioConstraints = (deviceId, noiseSuppression = true, echoCancel = true) => ({
  ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}),
  echoCancellation: echoCancel,
  noiseSuppression,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
});

const videoConstraints = (deviceId, profile = 'normal', mirror = false) => {
  const p = PROFILES[profile] || PROFILES.normal;
  return {
    ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: p.video.w },
    height: { ideal: p.video.h },
    frameRate: { ideal: p.video.fps, max: p.video.fps + 6 },
    ...(mirror ? { facingMode: 'user' } : {}),
  };
};

export class MediaManager extends Emitter {
  constructor() {
    super();
    this.local = new MediaStream();
    this.micTrack = null;
    this.camTrack = null;
    this.rawCamTrack = null;
    this.screenStream = null;
    this.devices = { audioinput: [], videoinput: [], audiooutput: [] };
    this.micId = null;
    this.camId = null;
    this.profile = 'normal';
    this.noise = true;
    this.echoCancel = true;
    this.gain = 1;
    this.fx = { mode: 'none', image: null, raf: 0, canvas: null, srcVideo: null, outStream: null };
    this.ctx = null;
    this.meters = new Set();
    navigator.mediaDevices?.addEventListener?.('devicechange', () => this.refreshDevices());
  }

  audioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  async refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return this.devices;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      this.devices = { audioinput: [], videoinput: [], audiooutput: [] };
      for (const d of list) if (this.devices[d.kind]) this.devices[d.kind].push({ id: d.deviceId, label: d.label || `${d.kind} ${this.devices[d.kind].length + 1}` });
      this.emit('devices', this.devices);
    } catch { /* ignore */ }
    return this.devices;
  }

  /** راه‌اندازی اولیه — اگر دوربین نبود، فقط صدا؛ اگر میکروفن نبود، فقط تصویر */
  async init({ audio = true, video = true, profile = this.profile } = {}) {
    this.profile = profile;
    const errors = [];
    if (audio) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(this.micId, this.noise, this.echoCancel), video: false });
        this.micTrack = s.getAudioTracks()[0];
        this.micTrack.enabled = true;
        this.micTrack.onended = () => this.emit('mic-ended');
        this.local.addTrack(this.micTrack);
      } catch (e) { errors.push(['mic', e.name || String(e)]); this.emit('mic-error', e); }
    }
    if (video) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints(this.camId, this.profile) });
        this.rawCamTrack = s.getVideoTracks()[0];
        this.camTrack = this.applyFxIfNeeded(this.rawCamTrack);
        if (this.camTrack) this.local.addTrack(this.camTrack);
      } catch (e) { errors.push(['cam', e.name || String(e)]); this.emit('cam-error', e); }
    }
    await this.refreshDevices();
    this.emit('local', this.local);
    return { ok: !!this.local.getTracks().length, errors };
  }

  setProfile(profile) {
    this.profile = profile;
    if (this.rawCamTrack) this.restartCam();
  }

  async toggleMic(on) {
    if (on) {
      if (this.micTrack) {
        this.micTrack.enabled = true;
        return true;
      }
      const s = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(this.micId, this.noise, this.echoCancel) });
      this.micTrack = s.getAudioTracks()[0];
      this.local.addTrack(this.micTrack);
      this.emit('local', this.local, { mic: true });
      return true;
    }
    if (this.micTrack) {
      this.micTrack.enabled = false;
      this.micTrack.stop();
      try { this.local.removeTrack(this.micTrack); } catch { /* ignore */ }
      this.micTrack = null;
    }
    this.emit('local', this.local, { mic: false });
    return false;
  }

  async toggleCam(on) {
    if (on) {
      if (this.camTrack) return true;
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints(this.camId, this.profile) });
      this.rawCamTrack = s.getVideoTracks()[0];
      this.camTrack = this.applyFxIfNeeded(this.rawCamTrack);
      if (this.camTrack) this.local.addTrack(this.camTrack);
      this.emit('local', this.local, { cam: true });
      return true;
    }
    if (this.camTrack) { try { this.camTrack.stop(); } catch { /* ignore */ } }
    this.stopFx();
    if (this.rawCamTrack) { try { this.rawCamTrack.stop(); } catch { /* ignore */ } }
    try { this.local.removeTrack(this.camTrack); } catch { /* ignore */ }
    this.camTrack = null;
    this.rawCamTrack = null;
    this.emit('local', this.local, { cam: false });
    return false;
  }

  async restartCam() {
    if (!this.camTrack && !this.rawCamTrack) return;
    const wasOn = !!this.camTrack;
    await this.toggleCam(false);
    if (wasOn) await this.toggleCam(true);
    this.emit('local', this.local);
  }

  async switchDevice(kind, deviceId) {
    if (kind === 'audioinput') {
      this.micId = deviceId;
      const wasOn = !!this.micTrack;
      if (wasOn) {
        await this.toggleMic(false);
        await this.toggleMic(true);
      }
    } else if (kind === 'videoinput') {
      this.camId = deviceId;
      await this.restartCam();
    }
    this.emit('devices', this.devices);
  }

  /** بازسازی میکروفن با تنظیمات نویزکشی */
  async setNoise(on) {
    this.noise = !!on;
    if (this.micTrack) { await this.toggleMic(false); await this.toggleMic(true); }
    this.emit('noise', on);
  }

  /* ── سطح صدا و تشخیص صحبت ── */
  attachMeter(stream, cb) {
    const ctx = this.audioCtx();
    if (!ctx || !stream || !stream.getAudioTracks?.().length) return () => {};
    let src;
    let analyser;
    try {
      src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
    } catch { return () => {}; }
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let idleFrames = 0;
    const entry = { stop: () => { cancelAnimationFrame(raf); try { src.disconnect(); } catch { /* ignore */ } } };
    const loop = () => {
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      const level = Math.min(1, sum / buf.length / 90);
      cb(level);
      raf = requestAnimationFrame(loop);
      if (level > 0.02) idleFrames = 0; else idleFrames++;
    };
    loop();
    this.meters.add(entry);
    return () => { entry.stop(); this.meters.delete(entry); };
  }

  /* ── افکت تصویری سبک (محو اطراف / پس‌زمینه مجازی) — بدون مدل سنگین ── */
  applyFxIfNeeded(track) {
    if (!track || this.fx.mode === 'none') return track;
    return this.startFx(this.fx.mode, this.fx.image, track) || track;
  }

  startFx(mode, image, track = this.rawCamTrack) {
    if (!track) return null;
    this.stopFx();
    const c = document.createElement('canvas');
    c.width = PROFILES[this.profile]?.video.w >= 640 ? 640 : 480;
    c.height = Math.round((c.width * 9) / 16);
    const g = c.getContext('2d');
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = new MediaStream([track]);
    v.play().catch(() => {});
    const img = image ? new Image() : null;
    if (img) img.src = image;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!v.videoWidth) return;
      const { width: W, height: H } = c;
      g.save();
      if (mode === 'blur') {
        g.filter = 'blur(14px) saturate(1.2) brightness(0.75)';
        g.drawImage(v, -20, -20, W + 40, H + 40);
        g.filter = 'none';
        g.beginPath();
        g.ellipse(W / 2, H / 2, W * 0.34, H * 0.42, 0, 0, Math.PI * 2);
        g.clip();
        g.drawImage(v, 0, 0, W, H);
      } else if (mode === 'vbg') {
        if (img && img.complete) g.drawImage(img, 0, 0, W, H);
        else {
          const grd = g.createLinearGradient(0, 0, W, H);
          grd.addColorStop(0, '#0b1020');
          grd.addColorStop(0.5, '#20305e');
          grd.addColorStop(1, '#4b2f8f');
          g.fillStyle = grd;
          g.fillRect(0, 0, W, H);
        }
        const pad = 14;
        g.beginPath();
        g.roundRect ? g.roundRect(pad, pad, W - pad * 2, H - pad * 2, 18) : g.rect(pad, pad, W - pad * 2, H - pad * 2);
        g.clip();
        g.drawImage(v, pad, pad, W - pad * 2, H - pad * 2);
      } else {
        g.drawImage(v, 0, 0, W, H);
      }
      g.restore();
    };
    draw();
    const out = c.captureStream(15);
    this.fx = { mode, image, raf, canvas: c, srcVideo: v, outStream: out };
    const vt = out.getVideoTracks()[0];
    return vt;
  }

  async setFx(mode, image = null) {
    const wasOn = !!this.camTrack;
    if (!wasOn) { this.fx.mode = mode; this.fx.image = image; return null; }
    const old = this.camTrack;
    const nt = mode === 'none' ? this.rawCamTrack : this.startFx(mode, image);
    this.camTrack = nt;
    try { this.local.removeTrack(old); } catch { /* ignore */ }
    if (nt) this.local.addTrack(nt);
    if (old && old !== this.rawCamTrack) { try { old.stop(); } catch { /* ignore */ } }
    this.emit('local', this.local, { cam: true, fx: mode });
    return nt;
  }

  stopFx() {
    cancelAnimationFrame(this.fx.raf);
    try { this.fx.srcVideo?.pause(); } catch { /* ignore */ }
    try { this.fx.outStream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    this.fx = { mode: this.fx.mode || 'none', image: this.fx.image || null, raf: 0, canvas: null, srcVideo: null, outStream: null };
  }

  /* ── اشتراک صفحه ── */
  async startScreen({ audio = true, quality = 'normal', element = null } = {}) {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('نمایشگر پشتیبانی نمی‌شود');
    const p = PROFILES[quality] || PROFILES.normal;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: quality === 'lite' ? 8 : 15, max: 30 }, width: { ideal: p.screenW } },
      audio: audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      preferCurrentTab: element === 'tab',
      surfaceSwitching: 'include',
      selfBrowserSurface: 'include',
      systemAudio: audio ? 'include' : 'exclude',
    });
    this.screenStream = stream;
    stream.getVideoTracks()[0].onended = () => this.emit('screen-ended');
    return stream;
  }

  stopScreen() {
    try { this.screenStream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    this.screenStream = null;
  }

  /* ── عکس‌برداری و ضبط ── */
  async snapshotFromTrack(track = this.rawCamTrack, opts = {}) {
    if (!track) return null;
    if ('ImageCapture' in window) {
      try {
        const cap = new ImageCapture(track);
        const bmp = await cap.grabFrame();
        const c = document.createElement('canvas');
        c.width = opts.w || bmp.width;
        c.height = Math.round((c.width * bmp.height) / bmp.width);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.8);
      } catch { /* برگشت به روش تصویری */ }
    }
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = new MediaStream([track]);
    await v.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 350));
    const c = document.createElement('canvas');
    c.width = opts.w || v.videoWidth || 640;
    c.height = Math.round((c.width * (v.videoHeight || 360)) / (v.videoWidth || 640));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    try { v.pause(); } catch { /* ignore */ }
    return c.toDataURL('image/jpeg', 0.8);
  }

  /** عکس از یک عنصر ویدیویی (هر شرکت‌کننده یا استیج) */
  snapElement(vid, w = 1280) {
    if (!vid || !vid.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = Math.min(w, vid.videoWidth);
    c.height = Math.round((c.width * vid.videoHeight) / vid.videoWidth);
    c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }

  /** ضبط جلسه: تصویر شبکه‌ای از ویدیوها + صدای میکس همه */
  startRecording(elements, { fps = 6 } = {}) {
    const cols = Math.ceil(Math.sqrt(Math.max(1, elements.length)));
    const rows = Math.ceil(elements.length / cols);
    const tw = 480;
    const th = 270;
    const canvas = document.createElement('canvas');
    canvas.width = cols * tw;
    canvas.height = rows * th;
    const g = canvas.getContext('2d');
    const ctx = this.audioCtx();
    const dest = ctx.createMediaStreamDestination();
    for (const s of this.recordingSources || []) {
      try {
        const src = ctx.createMediaStreamSource(s);
        const gn = ctx.createGain();
        gn.gain.value = 1;
        src.connect(gn).connect(dest);
      } catch { /* ignore */ }
    }
    let raf = 0;
    const interval = 1000 / fps;
    let last = 0;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - last < interval) return;
      last = t;
      g.fillStyle = '#05070f';
      g.fillRect(0, 0, canvas.width, canvas.height);
      elements.forEach((v, i) => {
        const cx = (i % cols) * tw;
        const cy = Math.floor(i / cols) * th;
        g.fillStyle = '#0d1428';
        g.fillRect(cx, cy, tw, th);
        if (v && v.videoWidth) {
          const r = Math.min(tw / v.videoWidth, th / v.videoHeight);
          const w = v.videoWidth * r;
          const h = v.videoHeight * r;
          g.drawImage(v, cx + (tw - w) / 2, cy + (th - h) / 2, w, h);
        }
      });
    };
    raf = requestAnimationFrame(loop);
    const vStream = canvas.captureStream(fps);
    const mixed = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
    const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 900_000, audioBitsPerSecond: 64_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      cancelAnimationFrame(raf);
      const blob = new Blob(chunks, { type: 'video/webm' });
      this.emit('recording', { blob, url: URL.createObjectURL(blob) });
    };
    rec.start(2000);
    return rec;
  }

  setSpeaker(deviceId) {
    const els = document.querySelectorAll('video, audio');
    let ok = false;
    els.forEach((el) => { if (el.setSinkId) { el.setSinkId(deviceId).catch(() => {}); ok = true; } });
    return ok;
  }

  stop() {
    this.stopFx();
    try { this.local.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    this.stopScreen();
    for (const m of this.meters) m.stop();
    this.meters.clear();
  }
}
