// Mock AI/video/Zarinpal servers for end-to-end testing.
// Mimics:
//   OpenAI-compatible:  GET /v1/models, POST /v1/chat/completions
//   Video job API:      POST /video/jobs, GET /video/jobs/:id
//   Zarinpal v4:        POST /zp/pg/v4/payment/request.json, /payment/verify.json
// Run: node scripts/mock-providers.mjs   (listens on 127.0.0.1:9999)

import http from 'node:http';

const videoJobs = new Map(); // id -> { polls, prompt }
const zpAuths = new Map();   // authority -> { amount, verified, refId }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = await readBody(req);
  const json = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  // ---------- OpenAI-compatible ----------
  if (url.pathname === '/v1/models' && req.method === 'GET') {
    return json(200, { object: 'list', data: [{ id: 'mock-gpt-1', object: 'model' }] });
  }
  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    const last = body?.messages?.[body.messages.length - 1]?.content || '';
    return json(200, {
      id: 'chatcmpl-mock',
      choices: [{ index: 0, message: { role: 'assistant', content: `پاسخ آزمایشی: «${String(last).slice(0, 120)}» — مدل ساختگی برای تست.` }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    });
  }

  // ---------- Video job provider ----------
  if (url.pathname === '/video/jobs' && req.method === 'POST') {
    const id = 'vjob_' + Math.random().toString(36).slice(2, 10);
    videoJobs.set(id, { polls: 0, prompt: String(body?.prompt || '') });
    return json(200, { job_id: id, status: 'queued' });
  }
  if (url.pathname.startsWith('/video/jobs/') && req.method === 'GET') {
    const id = url.pathname.split('/').pop();
    const job = videoJobs.get(id);
    if (!job) return json(404, { error: 'not_found' });
    job.polls += 1;
    if (job.prompt.toLowerCase().includes('fail')) {
      return json(200, { status: 'failed', progress: 0, error: 'content_rejected_by_provider' });
    }
    if (job.polls < 2) return json(200, { status: 'running', progress: job.polls * 40 });
    return json(200, { status: 'succeeded', progress: 100, result_url: `http://127.0.0.1:9999/assets/${id}.mp4` });
  }

  // ---------- Zarinpal stub ----------
  if (url.pathname === '/zp/pg/v4/payment/request.json' && req.method === 'POST') {
    if (body?.merchant_id !== 'TEST-MERCHANT-0001') return json(200, { data: {}, errors: { code: -12, message: 'invalid merchant' } });
    const authority = 'A' + String(Date.now()) + String(Math.floor(Math.random() * 900 + 100));
    zpAuths.set(authority, { amount: body.amount, verified: false, refId: Math.floor(Math.random() * 1e9) });
    return json(200, { data: { code: 100, message: 'ok', authority, fee: 0, fee_type: 'Merchant' }, errors: {} });
  }
  if (url.pathname === '/zp/pg/v4/payment/verify.json' && req.method === 'POST') {
    const rec = zpAuths.get(body?.authority);
    if (!rec) return json(200, { data: {}, errors: { code: -11, message: 'no record' } });
    if (body.merchant_id !== 'TEST-MERCHANT-0001') return json(200, { data: {}, errors: { code: -12, message: 'invalid merchant' } });
    if (Number(body.amount) !== Number(rec.amount)) return json(200, { data: {}, errors: { code: -9, message: 'amount mismatch' } });
    if (rec.verified) {
      return json(200, { data: { code: 101, message: 'verified before', ref_id: rec.refId, card_pan: '6104****8899' }, errors: {} });
    }
    rec.verified = true;
    return json(200, { data: { code: 100, message: 'success', ref_id: rec.refId, card_pan: '6104****8899' }, errors: {} });
  }
  // Simulated bank page: clicking "pay" redirects back to callback with Status=OK
  if (url.pathname === '/zp/pg/StartPay/' ) {
    const authority = url.searchParams.get('a') || '';
    return json(200, { simulated_bank_page: true, authority, hint: `visit ${authority} with Status=OK on the app callback` });
  }

  json(404, { error: 'not_found', path: url.pathname });
});

async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

server.listen(9999, '0.0.0.0', () => console.log('[mock] providers on http://127.0.0.1:9999 (v1 chat · video · zarinpal stub)'));
