import { Hono } from 'hono';
import type { Env, AuthUser } from '../env';
import { now } from '../env';
import { ok, err, clientIp } from '../lib/http';
import { userPlan } from '../lib/db';
import { audit } from '../lib/audit';

const files = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

function userOf(c: { get: (k: string) => unknown }): AuthUser | null {
  return c.get('user') as AuthUser | null;
}

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'text/plain', 'text/markdown', 'application/pdf',
]);

// POST /api/files/upload — multipart upload to R2 with plan-based size cap
files.post('/upload', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const plan = await userPlan(c.env, u.id);
  const maxBytes = Math.max(1, plan.upload_limit_mb) * 1024 * 1024;

  const form = await c.req.formData().catch(() => null);
  if (!form) return err(400, 'validation', 'فرم آپلود نامعتبر است.');
  const file = form.get('file');
  if (!(file instanceof File)) return err(400, 'validation', 'فایلی انتخاب نشده است.');
  if (file.size <= 0) return err(400, 'validation', 'فایل خالی است.');
  if (file.size > maxBytes) {
    return err(413, 'quota_exceeded', `حداکثر حجم مجاز در طرح شما ${plan.upload_limit_mb} مگابایت است.`);
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mime)) return err(415, 'validation', 'نوع فایل پشتیبانی نمی‌شود.');

  const id = crypto.randomUUID();
  const safeName = (file.name || 'file').replace(/[^\w.\-آ-ی ]/g, '_').slice(0, 120);
  const key = `uploads/${u.id}/${id}-${safeName}`;
  try {
    await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
  } catch {
    return err(502, 'internal', 'بارگذاری فایل ناموفق بود.');
  }
  await c.env.DB.prepare(
    'INSERT INTO uploads (id, user_id, r2_key, filename, mime, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, u.id, key, safeName, mime, file.size, now()).run();
  await audit(c.env, 'files.uploaded', { actorId: u.id, ip: clientIp(c), meta: { size: file.size, mime } });
  return ok({ id, r2_key: key, filename: safeName, size_bytes: file.size, url: `/api/files/${id}` });
});

// GET /api/files — list user's uploads
files.get('/', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const rows = await c.env.DB.prepare(
    'SELECT id, filename, mime, size_bytes, created_at FROM uploads WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
  ).bind(u.id).all();
  return ok({ files: rows.results || [] });
});

// GET /api/files/:id — download own file
files.get('/:id', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const up = await c.env.DB.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').bind(c.req.param('id'), u.id)
    .first<{ r2_key: string; filename: string; mime: string }>();
  if (!up) return err(404, 'not_found');
  const obj = await c.env.R2.get(up.r2_key);
  if (!obj) return err(404, 'not_found', 'فایل در فضای ذخیره‌سازی یافت نشد.');
  return new Response(obj.body, {
    headers: {
      'Content-Type': up.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(up.filename)}`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

// DELETE /api/files/:id
files.delete('/:id', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const up = await c.env.DB.prepare('SELECT r2_key FROM uploads WHERE id = ? AND user_id = ?').bind(c.req.param('id'), u.id)
    .first<{ r2_key: string }>();
  if (!up) return err(404, 'not_found');
  await c.env.R2.delete(up.r2_key).catch(() => {});
  await c.env.DB.prepare('DELETE FROM uploads WHERE id = ?').bind(c.req.param('id')).run();
  return ok({});
});

export default files;
