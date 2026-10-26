/* اعتبارسنجی نشانی سایت و بررسی زنده‌بودن آن (فقط اطلاعات عمومی؛ هیچ رازی داخل برنامه نیست). */
function safeOrigin(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 500) return '';
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash
      || host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/.test(host)
      || /\.(?:local|internal|test|invalid|example|onion|arpa)$/.test(host)) return '';
    return url.origin;
  } catch { return ''; }
}

function parseBootstrap(value, origin) {
  if (!value || value.ok !== true || value.app !== 'hamyar-plus' || value.origin !== origin
    || value.appUrl !== `${origin}/` || typeof value.siteName !== 'string') {
    throw new Error('Invalid bootstrap');
  }
  return { ok: true, appUrl: value.appUrl, siteName: value.siteName.slice(0, 70), catalogVersion: value.catalogVersion };
}

async function fetchBootstrap(raw, { fetchImpl = globalThis.fetch, timeoutMs = 4500 } = {}) {
  const origin = safeOrigin(raw);
  if (!origin) return { ok: false, message: 'نشانی عمومی HTTPS معتبر نیست.' };
  try {
    const response = await fetchImpl(`${origin}/api/v1/client/bootstrap`, {
      redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    });
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('Unexpected response');
    if (Number(response.headers.get('content-length')) > 16384) throw new Error('Oversized response');
    const text = await response.text();
    if (text.length > 16384) throw new Error('Oversized response');
    return parseBootstrap(JSON.parse(text), origin);
  } catch {
    return { ok: false, message: 'سایت پاسخ نداد؛ نسخهٔ لوکال برنامه فعال است.' };
  }
}
module.exports = { safeOrigin, parseBootstrap, fetchBootstrap };
