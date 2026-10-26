// سرور لوکال بدون نیاز به حساب Cloudflare: سایت + API روی یک پورت
// اجرا: node tools/dev-server.mjs   (پورت پیش‌فرض 8899 یا متغیر PORT)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.env.PORT || 8899);
const catalog = JSON.parse(await readFile(join(root, 'data', 'catalog.json'), 'utf8'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const sendJson = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    const p = decodeURIComponent(url.pathname);
    if (p === '/api/health') return sendJson(res, { ok: true, app: 'hamyar-plus', version: catalog.version, updatedAt: catalog.updatedAt, lessons: catalog.lessons.length });
    if (p === '/api/v1/client/bootstrap') return sendJson(res, { ok: true, app: 'hamyar-plus', version: 1, origin: `http://${req.headers.host}`, appUrl: `http://${req.headers.host}/`, catalogVersion: catalog.version, catalogUpdatedAt: catalog.updatedAt, siteName: 'همیار پلاس' });
    if (p === '/api/catalog') return sendJson(res, catalog);
    if (p.startsWith('/api/')) return sendJson(res, { ok: false, error: 'not_found' }, 404);

    let rel = normalize(p).replace(/^(\.\.[/\\])+/, '');
    if (rel === '/' || rel === '.' || rel === '\\') rel = 'index.html';
    let file = join(root, rel);
    let data;
    try { data = await readFile(file); }
    catch { file = join(root, 'index.html'); data = await readFile(file); }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    res.end(data);
  } catch (e) { res.writeHead(500); res.end('error: ' + e.message); }
}).listen(PORT, '0.0.0.0', () => console.log(`🚀 همیار پلاس (لوکال) روی http://0.0.0.0:${PORT}`));
