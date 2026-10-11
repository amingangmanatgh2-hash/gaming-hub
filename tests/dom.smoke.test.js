/**
 * آزمون دودی DOM — با jsdom همان صفحه‌های واقعی را بار می‌کنیم و می‌بینیم
 * اپ بدون خطا بالا می‌آید (کت‌زدن اشتباه انتخابگرها، نبودن شناسه‌ها و…).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadPage(htmlPath, bundlePath, url) {
  const html = await readFile(join(ROOT, htmlPath), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  vc.on('error', (...a) => errors.push(a.map(String).join(' ')));
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
    resources: undefined,
  });
  const { window } = dom;
  // چیزهایی که jsdom ندارد ولی اپ ما لازم دارد
  window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  window.navigator.mediaDevices = {
    getUserMedia: async () => { throw new Error('NotAllowedError'); },
    enumerateDevices: async () => [],
    addEventListener() {},
  };
  window.MediaStream = window.MediaStream || class { constructor() { this.tracks = []; } getTracks() { return this.tracks; } getAudioTracks() { return []; } getVideoTracks() { return []; } addTrack(t) { this.tracks.push(t); } removeTrack() {} };
  window.RTCPeerConnection = class {
    constructor() { this.connectionState = 'new'; this.signalingState = 'stable'; }
    addTransceiver() { return { sender: { replaceTrack: async () => {}, getParameters: () => ({ encodings: [{}] }), setParameters: async () => {} }, receiver: { track: { kind: 'audio' } }, mid: null, stopped: false }; }
    getTransceivers() { return []; }
    getStats() { return Promise.resolve(new Map()); }
    close() {}
  };
  window.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} };
  window.fetch = async () => { throw new Error('offline'); };
  window.Notification = class { static permission = 'denied'; static requestPermission() { return Promise.resolve('denied'); } };
  const code = await readFile(join(ROOT, bundlePath), 'utf8');
  // اجرای بسته در زمینهٔ پنجره
  window.eval(code);
  await new Promise((r) => setTimeout(r, 350));
  return { window, errors, dom };
}

test('صفحهٔ خانه بدون خطا بالا می‌آید و قابلیت‌ها رندر می‌شوند', async () => {
  const { window, errors, dom } = await loadPage('public/index.html', 'public/build/home.js', 'https://hk.example/');
  assert.equal(errors.length, 0, `خطاهای جاوااسکریپت: ${errors.join(' | ')}`);
  const feats = window.document.querySelectorAll('#featGrid .feat').length;
  assert.ok(feats > 100, `تعداد قابلیت‌های رندرشده: ${feats}`);
  assert.ok(window.document.querySelector('#faqList details'));
  assert.match(window.document.title, /هم‌کلام/);
  dom.window.close();
});

test('صفحهٔ اتاق (دروازهٔ ورود) بدون خطا بالا می‌آید', async () => {
  const { window, errors, dom } = await loadPage('public/room/index.html', 'public/build/room.js', 'https://hk.example/r/TEST123');
  assert.equal(errors.length, 0, `خطاهای جاوااسکریپت: ${errors.join(' | ')}`);
  assert.equal(window.document.querySelector('#gateCode').textContent.includes('TEST123'), true);
  assert.ok(window.document.querySelector('#app').hidden, 'اپ تا قبل از ورود پنهان است');
  dom.window.close();
});

test('همهٔ شناسه‌های ارجاع‌داده‌شده در بستهٔ اتاق داخل HTML وجود دارند', async () => {
  const { window } = await loadPage('public/room/index.html', 'public/build/room.js', 'https://hk.example/r/TEST123');
  const html = await readFile(join(ROOT, 'public/room/index.html'), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const bundle = await readFile(join(ROOT, 'public/build/room.js'), 'utf8');
  const used = new Set([...bundle.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]));
  const missing = [...used].filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], `شناسه‌های غایب: ${missing.join(', ')}`);
  assert.ok(window.document.querySelector('#stage'));
  window.close();
});
