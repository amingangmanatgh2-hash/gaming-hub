import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

async function load(kind) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (error) => errors.push(error.message));
  vc.on('error', (...args) => errors.push(args.join(' ')));
  const { outputFiles } = await build({
    entryPoints: [`public/${kind}.js`], platform: 'browser', format: 'iife', bundle: true, write: false,
    plugins: [{ name: 'site-root', setup(builder) {
      builder.onResolve({ filter: /^\/(common|connectivity)\.js$/ }, (args) => ({ path: resolve('public', args.path.slice(1)) }));
    } }],
  });
  const html = await readFile(`public/${kind}/index.html`, 'utf8');
  const dom = new JSDOM(html, { url: `https://shop.example.com/${kind}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const win = dom.window;
  win.fetch = async (url) => {
    const path = String(url);
    if (path.includes('/ping')) return new Response(JSON.stringify({ ok: true, colo: 'TEST' }), { headers: { 'content-type': 'application/json' } });
    if (path.includes('/public')) return new Response(JSON.stringify({ ok: true, initialized: false, settings: { siteName: 'مدار', accent: 'mint' }, products: [] }), { headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: false, error: 'نشست معتبر نیست' }), { status: 401, headers: { 'content-type': 'application/json' } });
  };
  win.eval(outputFiles[0].text);
  return { win, dom, errors };
}

test('اپ همراه سنجش شبکه را بدون خطای DOM و بدون ادعای VPN نشان می‌دهد', { timeout: 5000 }, async () => {
  const { win, dom, errors } = await load('app');
  try {
    await new Promise((resolve) => setTimeout(resolve, 780));
    assert.equal(errors.length, 0, errors.join(' | '));
    assert.match(win.document.querySelector('#networkText').textContent, /۳ پاسخ از ۳ تلاش HTTPS/);
    assert.ok(win.document.querySelector('#pingTen'), 'manual ten-attempt button exists');
    assert.match(win.document.querySelector('#accessTitle').textContent, /کانفیگی فعال نیست/);
  } finally { dom.window.close(); }
});

test('پنل بدون نشست خطای DOM ندارد و کارت آدرس bootstrap بعد از نصب حاضر است', async () => {
  const { win, dom, errors } = await load('panel');
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(errors.length, 0, errors.join(' | '));
    assert.equal(win.document.querySelector('#authGate').hidden, false);
    assert.ok(win.document.querySelector('#clientOrigin'));
    assert.equal(win.document.querySelector('.bootstrap-card a').getAttribute('href'), '/api/v1/client/bootstrap');
  } finally { dom.window.close(); }
});
