/**
 * سوکت سیگنالینگ — با اتصال مجدد خودکار، صف پیام، ضربان و اندازه‌گیری تأخیر
 * (سبک، بدون کتابخانه)
 */
import { Emitter } from './util.js';

export class Socket extends Emitter {
  constructor(url, { maxRetry = 30, pingEvery = 25000 } = {}) {
    super();
    this.url = url;
    this.ws = null;
    this.queue = [];
    this.retry = 0;
    this.maxRetry = maxRetry;
    this.pingEvery = pingEvery;
    this.closedByUs = false;
    this.rtt = 0;
    this.samples = [];
    this.lastPong = 0;
    addEventListener('online', () => { if (!this.closedByUs) this.open(); });
  }

  get connected() { return this.ws && this.ws.readyState === 1; }

  open() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.closedByUs = false;
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { this.schedule(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.emit('open');
      const q = this.queue;
      this.queue = [];
      for (const m of q) this.send(m);
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (!this.connected) return;
        this.pingSent = performance.now();
        this.sendRaw(JSON.stringify({ t: 'ping', ts: Date.now() }));
      }, this.pingEvery);
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') {
        const rtt = Math.round(performance.now() - (this.pingSent || performance.now()));
        this.lastPong = Date.now();
        this.samples.push(rtt);
        if (this.samples.length > 8) this.samples.shift();
        this.rtt = Math.min(...this.samples);
        this.emit('rtt', this.rtt);
        return;
      }
      this.emit('msg', m);
      this.emit(m.t || 'unknown', m);
    };
    ws.onclose = (ev) => {
      clearInterval(this.timer);
      this.emit('close', ev);
      if (!this.closedByUs) this.schedule();
    };
    ws.onerror = () => this.emit('error');
  }

  schedule() {
    if (this.closedByUs) return;
    this.retry++;
    if (this.retry > this.maxRetry) {
      this.emit('gaveup');
      return;
    }
    const wait = Math.min(400, 120 * this.retry) + Math.random() * 150;
    this.emit('retry', this.retry, wait);
    clearTimeout(this.rt);
    this.rt = setTimeout(() => this.open(), wait);
  }

  sendRaw(str) {
    try { this.ws.send(str); return true; } catch { return false; }
  }

  send(obj) {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    if (this.connected) {
      if (!this.sendRaw(str)) this.queue.push(str);
    } else {
      // پیام‌های چت و سیگنال در صف می‌مانند تا اتصال برگردد (متناهی)
      this.queue.push(str);
      if (this.queue.length > 60) this.queue.shift();
    }
  }

  close(reason = 'client') {
    this.closedByUs = true;
    clearInterval(this.timer);
    clearTimeout(this.rt);
    try { this.ws?.close(1000, reason); } catch { /* ignore */ }
  }
}
