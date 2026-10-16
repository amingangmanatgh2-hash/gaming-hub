// Tiny WebAudio synth SFX — no audio assets needed, works fully offline.
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  tone(freq, dur = 0.08, type = 'square', gain = 0.15, slide = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.12, gain = 0.25, freq = 1800) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  shoot(cls) {
    if (cls === 'Sniper') { this.noise(0.28, 0.5, 900); this.tone(120, 0.22, 'sawtooth', 0.25, -70); }
    else if (cls === 'Shotgun') { this.noise(0.22, 0.5, 700); this.tone(90, 0.15, 'sawtooth', 0.2, -50); }
    else if (cls === 'Special') { this.tone(880, 0.14, 'sine', 0.22, -500); this.noise(0.08, 0.12, 3000); }
    else { this.noise(0.09, 0.32, 2200); this.tone(190, 0.06, 'square', 0.1, -90); }
  }
  reload() { this.tone(300, 0.05, 'square', 0.12); setTimeout(() => this.tone(210, 0.05, 'square', 0.12), 120); setTimeout(() => this.tone(420, 0.06, 'square', 0.14), 320); }
  hit(head = false) { this.tone(head ? 1250 : 950, 0.05, 'square', 0.16); }
  kill() { this.tone(660, 0.09, 'square', 0.16); setTimeout(() => this.tone(990, 0.12, 'square', 0.16), 70); }
  hurt() { this.tone(140, 0.12, 'sawtooth', 0.14, -60); }
  jump() { this.noise(0.06, 0.05, 800); }
  ui() { this.tone(740, 0.04, 'square', 0.07); }
  empty() { this.tone(1400, 0.03, 'square', 0.08); }
  explosion() { this.noise(0.5, 0.5, 400); this.tone(60, 0.4, 'sine', 0.3, -30); }
}
