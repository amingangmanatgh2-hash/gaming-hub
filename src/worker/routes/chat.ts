import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, AuthUser } from '../env';
import { now } from '../env';
import { ok, err } from '../lib/http';
import { features, userPlan, tierAtLeast, countries } from '../lib/db';
import { getChatModel, chatCompletion, listEnabledModels } from '../lib/providers';
import { reserveQuota, limitFor, usageToday } from '../lib/quota';
import { audit } from '../lib/audit';

const chat = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

function userOf(c: { get: (k: string) => unknown }): AuthUser | null {
  return c.get('user') as AuthUser | null;
}

const TIER_RANK: Record<string, number> = { basic: 0, plus: 1, pro: 2 };

// GET /api/chat/models — models the current user may use
chat.get('/models', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const plan = await userPlan(c.env, u.id);
  const all = await listEnabledModels(c.env, 'chat');
  return ok({
    plan_tier: plan.model_tier,
    models: all.map((m) => ({
      id: m.id, key: m.model_key, name: m.display_name, tier: m.tier, provider: m.provider_name,
      available: tierAtLeast(plan.model_tier, m.tier),
    })),
  });
});

// GET /api/chat/conversations
chat.get('/conversations', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const rows = await c.env.DB.prepare(
    `SELECT id, title, model_id, created_at, updated_at FROM conversations
     WHERE user_id = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 100`,
  ).bind(u.id).all();
  return ok({ conversations: rows.results || [] });
});

// POST /api/chat/conversations — create
chat.post('/conversations', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const plan = await userPlan(c.env, u.id);
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND archived_at IS NULL',
  ).bind(u.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= plan.conversation_storage_limit) {
    return err(403, 'quota_exceeded', 'به سقف ذخیره‌سازی گفتگو در طرح فعلی رسیده‌اید. گفتگوهای قدیمی را حذف یا طرح خود را ارتقا دهید.');
  }
  const body = (await c.req.json().catch(() => ({}))) as { title?: string; model_id?: string };
  const id = crypto.randomUUID();
  const t = now();
  await c.env.DB.prepare(
    'INSERT INTO conversations (id, user_id, title, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, u.id, (body.title || 'گفتگوی جدید').slice(0, 120), body.model_id || '', t, t).run();
  return ok({ id });
});

// GET /api/chat/conversations/:id — messages
chat.get('/conversations/:id', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const conv = await c.env.DB.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), u.id).first();
  if (!conv) return err(404, 'not_found');
  const msgs = await c.env.DB.prepare(
    'SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at LIMIT 500',
  ).bind(c.req.param('id')).all();
  return ok({ conversation: conv, messages: msgs.results || [] });
});

// DELETE /api/chat/conversations/:id
chat.delete('/conversations/:id', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), u.id).first();
  if (!conv) return err(404, 'not_found');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(c.req.param('id')),
  ]);
  return ok({});
});

const sendSchema = z.object({
  conversation_id: z.string().min(1).max(64).optional(),
  model_id: z.string().max(200).optional(),
  message: z.string().min(1).max(16000),
  stream: z.boolean().optional(),
});

// POST /api/chat/send — quota-enforced chat completion
chat.post('/send', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const f = await features(c.env);
  if (!f.chat) return err(503, 'feature_disabled', 'قابلیت چت در حال حاضر غیرفعال است.');

  // Country feature gate
  if (u.country_verified) {
    const cs = await countries(c.env);
    const cc = cs.find((x) => x.code === u.country_verified);
    if (cc && cc.features && cc.features.chat === false) {
      return err(403, 'region_unavailable', 'سرویس چت در منطقه تأییدشده حساب شما در دسترس نیست.');
    }
  }

  let body: z.infer<typeof sendSchema>;
  try { body = sendSchema.parse(await c.req.json()); } catch { return err(400, 'validation'); }

  const plan = await userPlan(c.env, u.id);
  const found = await getChatModel(c.env, body.model_id);
  if (!found) {
    return err(503, 'provider_not_configured', 'هنوز هیچ مدل چتی پیکربندی نشده است. مدیر سامانه باید از بخش مدیریت، ارائه‌دهنده و مدل را اضافه کند.');
  }
  const { model, provider } = found;
  if (!tierAtLeast(plan.model_tier, model.tier)) {
    return err(403, 'forbidden', `مدل «${model.display_name}» در طرح فعلی شما در دسترس نیست. برای استفاده، طرح خود را ارتقا دهید.`);
  }

  // Conversation ownership / creation
  let convId = body.conversation_id || '';
  const t = now();
  if (convId) {
    const conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').bind(convId, u.id).first();
    if (!conv) return err(404, 'not_found', 'گفتگو یافت نشد.');
  } else {
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND archived_at IS NULL').bind(u.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= plan.conversation_storage_limit) {
      return err(403, 'quota_exceeded', 'به سقف ذخیره‌سازی گفتگو رسیده‌اید.');
    }
    convId = crypto.randomUUID();
    const title = body.message.slice(0, 60);
    await c.env.DB.prepare('INSERT INTO conversations (id, user_id, title, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(convId, u.id, title, model.id, t, t).run();
  }

  // Atomic quota reservation — before any provider call
  const limit = await limitFor(c.env, u.id, 'message', plan);
  const reservation = await reserveQuota(c.env, u.id, 'message', limit);
  if (!reservation.allowed) {
    return err(429, 'quota_exceeded', `سهمیه روزانه پیام شما (${limit} پیام) به پایان رسیده است. فردا دوباره در دسترس است یا طرح خود را ارتقا دهید.`, {
      quota: { used: reservation.count, limit },
    });
  }

  // History for context (last 20)
  await c.env.DB.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), convId, 'user', body.message, t).run();
  const history = await c.env.DB.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 20',
  ).bind(convId).all<{ role: 'user' | 'assistant' | 'system'; content: string }>();
  const messages = (history.results || []).reverse();

  let providerRes: Response;
  try {
    providerRes = await chatCompletion(provider, model, { messages, stream: false });
  } catch (e) {
    return err(502, 'internal', 'اتصال به ارائه‌دهنده هوش مصنوعی برقرار نشد. لطفاً بعداً تلاش کنید.', {
      detail: e instanceof Error ? e.message : undefined,
    });
  }

  if (!providerRes.ok) {
    const status = providerRes.status;
    const detail = await providerRes.text().catch(() => '');
    if (status === 429) {
      return err(429, 'rate_limited', 'ارائه‌دهنده هوش مصنوعی موقتاً با محدودیت ظرفیت مواجه است. چند لحظه بعد دوباره تلاش کنید.');
    }
    return err(502, 'internal', 'ارائه‌دهنده هوش مصنوعی خطا برگرداند.', { provider_status: status, detail: detail.slice(0, 300) });
  }

  let assistantText = '';
  try {
    const data = (await providerRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
    assistantText = data.choices?.[0]?.message?.content?.trim() || '';
  } catch {
    return err(502, 'internal', 'پاسخ ارائه‌دهنده قابل خواندن نبود.');
  }
  if (!assistantText) return err(502, 'internal', 'ارائه‌دهنده پاسخ خالی برگرداند.');

  await c.env.DB.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), convId, 'assistant', assistantText, now()).run();
  await c.env.DB.prepare('UPDATE conversations SET updated_at = ?, model_id = ? WHERE id = ?').bind(now(), model.id, convId).run();

  const usage = await usageToday(c.env, u.id);
  return ok({ conversation_id: convId, reply: assistantText, usage: { message: usage.message, video: usage.video }, message_limit: limit });
});

export default chat;
