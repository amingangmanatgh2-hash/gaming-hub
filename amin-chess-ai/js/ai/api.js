/* AMIN CHESS AI — مدیریت API (Cloudflare / Groq)
 * توکن‌ها فقط در IndexedDB همین دستگاه ذخیره می‌شوند و هرگز در کد سمت عمومی
 * قرار نمی‌گیرند. تست اتصال مستقیم از دستگاه کاربر انجام می‌شود؛
 * اگر بک‌اند امن (Cloudflare Worker همراه پروژه) تنظیم شده باشد،
 * درخواست‌های هوش مصنوعی از مسیر آن Worker هم می‌توانند بروند. */
(function (global) {
  'use strict';

  var db = global.AMIN.db;

  var creds = {
    cloudflare: { accountId: '', apiToken: '', saved: false },
    groq: { apiKey: '', model: 'llama-3.1-8b-instant', enabled: false, saved: false },
    provider: 'auto' /* auto | cloudflare | groq | offline */
  };

  var GROQ_MODELS = [
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 Instant (سریع)' },
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (قدرتمند)' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B' }
  ];

  function load() {
    return Promise.all([
      db.kvGet('creds', null)
    ]).then(function (r) {
      var saved = r[0];
      if (saved) {
        creds.cloudflare = Object.assign(creds.cloudflare, saved.cloudflare || {});
        creds.groq = Object.assign(creds.groq, saved.groq || {});
        creds.provider = saved.provider || 'auto';
      }
      return creds;
    });
  }

  function save() {
    /* ذخیره فقط محلی (IndexedDB). توکن‌ها به هیچ سرور دیگری فرستاده نمی‌شوند. */
    return db.kvSet('creds', {
      cloudflare: creds.cloudflare,
      groq: creds.groq,
      provider: creds.provider
    }).then(function () { return creds; });
  }

  function clear() {
    creds.cloudflare = { accountId: '', apiToken: '', saved: false };
    creds.groq = { apiKey: '', model: 'llama-3.1-8b-instant', enabled: false, saved: false };
    creds.provider = 'auto';
    return save();
  }

  function hasCloudflare() { return !!(creds.cloudflare.saved && creds.cloudflare.accountId && creds.cloudflare.apiToken); }
  function hasGroq() { return !!(creds.groq.saved && creds.groq.apiKey && creds.groq.enabled); }

  /* ---------- تست اتصال Cloudflare ----------
   * روش استاندارد: فراخوانی AIModels.list روی Accounts API.
   * پاسخ ۲۰۰ یعنی Account ID و توکن درست‌اند. */
  function testCloudflare(accountId, apiToken) {
    accountId = accountId || creds.cloudflare.accountId;
    apiToken = apiToken || creds.cloudflare.apiToken;
    if (!accountId || !apiToken) return Promise.resolve({ ok: false, error: 'Account ID و API Token را وارد کنید.' });
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    return fetch('https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) + '/ai/models/search?per_page=1', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiToken },
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (res.status === 200) {
        return res.json().then(function (j) {
          return { ok: true, models: (j.result || []).length, message: 'اتصال به Cloudflare برقرار است.' };
        });
      }
      if (res.status === 401 || res.status === 403) return { ok: false, error: 'توکن نامعتبر یا بدون دسترسی است (کد ' + res.status + ').' };
      if (res.status === 404) return { ok: false, error: 'Account ID پیدا نشد — درست وارد کرده‌اید؟' };
      return { ok: false, error: 'خطای Cloudflare با کد ' + res.status };
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'زمان تست اتصال تمام شد (اینترنت؟).' };
      return { ok: false, error: 'خطای شبکه: ' + (e && e.message || 'نامشخص') };
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  /* ---------- تست اتصال Groq ---------- */
  function testGroq(apiKey) {
    apiKey = apiKey || creds.groq.apiKey;
    if (!apiKey) return Promise.resolve({ ok: false, error: 'API Key را وارد کنید.' });
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    return fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (res.status === 200) return { ok: true, message: 'اتصال به Groq برقرار است.' };
      if (res.status === 401) return { ok: false, error: 'API Key نامعتبر است (کد ۴۰۱).' };
      return { ok: false, error: 'خطای Groq با کد ' + res.status };
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'زمان تست اتصال تمام شد (اینترنت؟).' };
      return { ok: false, error: 'خطای شبکه: ' + (e && e.message || 'نامشخص') };
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  /* انتخاب سرویس فعال بر اساس تنظیمات کاربر */
  function activeProvider() {
    if (creds.provider === 'groq' && hasGroq()) return 'groq';
    if (creds.provider === 'cloudflare' && hasCloudflare()) return 'cloudflare';
    if (creds.provider === 'auto') {
      if (hasGroq()) return 'groq';
      if (hasCloudflare()) return 'cloudflare';
    }
    return 'offline';
  }

  function statusSummary() {
    return {
      provider: activeProvider(),
      cloudflareOk: hasCloudflare(),
      groqOk: hasGroq()
    };
  }

  /* استخراج پاسخ متن از Workers AI (Cloudflare) */
  function cloudflareChat(messages, opts) {
    opts = opts || {};
    var model = opts.model || '@cf/meta/llama-3.1-8b-instruct';
    var url = 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(creds.cloudflare.accountId) +
      '/ai/run/' + encodeURIComponent(model);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + creds.cloudflare.apiToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, max_tokens: opts.maxTokens || 700 }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok || !j.success) {
          var errs = (j.errors || []).map(function (e) { return e.message || e.code; }).join('، ');
          throw new Error(errs || ('کد ' + res.status));
        }
        return (j.result && (j.result.response || j.result.text)) || '';
      });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  /* استخراج پاسخ متن از Groq (سازگار OpenAI) */
  function groqChat(messages, opts) {
    opts = opts || {};
    var url = 'https://api.groq.com/openai/v1/chat/completions';
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + creds.groq.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model || creds.groq.model || 'llama-3.1-8b-instant',
        messages: messages,
        max_tokens: opts.maxTokens || 700,
        temperature: opts.temperature == null ? 0.5 : opts.temperature
      }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) throw new Error((j.error && j.error.message) || ('کد ' + res.status));
        return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  /* چت با انتخاب خودکار سرویس؛ در صورت خطا به آفلاین برمی‌گردد (caller تصمیم می‌گیرد) */
  function chat(messages, opts) {
    opts = opts || {};
    var provider = activeProvider();
    if (provider === 'groq') return groqChat(messages, opts).then(function (t) { return { text: t, provider: 'groq' }; });
    if (provider === 'cloudflare') return cloudflareChat(messages, opts).then(function (t) { return { text: t, provider: 'cloudflare' }; });
    return Promise.reject(new Error('هیچ سرویس آنلاینی فعال نیست'));
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.api = {
    creds: creds, load: load, save: save, clear: clear,
    testCloudflare: testCloudflare, testGroq: testGroq,
    hasCloudflare: hasCloudflare, hasGroq: hasGroq,
    activeProvider: activeProvider, statusSummary: statusSummary,
    chat: chat, GROQ_MODELS: GROQ_MODELS
  };
})(window);
