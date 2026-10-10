import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, AuthUser } from '../env';
import { now } from '../env';
import { ok, err } from '../lib/http';
import { features, userPlan, tierAtLeast, countries, quotaPolicy } from '../lib/db';
import { listEnabledModels, getVideoModel, videoSubmit, videoPoll } from '../lib/providers';
import { reserveQuota, releaseQuota, limitFor, usageToday } from '../lib/quota';

const video = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

function userOf(c: { get: (k: string) => unknown }): AuthUser | null {
  return c.get('user') as AuthUser | null;
}

// GET /api/video/models — with tier availability + resolved daily limit
video.get('/models', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const plan = await userPlan(c.env, u.id);
  const models = await listEnabledModels(c.env, 'video');
  const videoLimit = await limitFor(c.env, u.id, 'video', plan, u.country_verified);
  const usage = await usageToday(c.env, u.id);
  const f = await features(c.env);

  // Region gate (from VERIFIED country only — never the client preference)
  let regionAllowed = f.video;
  let regionReason = '';
  if (u.country_verified) {
    const cs = await countries(c.env);
    const cc = cs.find((x) => x.code === u.country_verified);
    if (cc && cc.features && cc.features.video === false) {
      regionAllowed = false;
      regionReason = `تولید ویدیو در «${cc.fa}» برای حساب‌های تأییدشده فعال نیست. این محدودیت از سیاست منطقه‌ای ارائه‌دهندگان پیروی می‌کند.`;
    }
  }

  return ok({
    enabled: f.video,
    region_allowed: regionAllowed,
    region_reason: regionReason,
    daily_limit: videoLimit,
    used_today: usage.video,
    country_verified: u.country_verified || null,
    models: models.map((m) => ({
      id: m.id, key: m.model_key, name: m.display_name, tier: m.tier, provider: m.provider_name,
      available: tierAtLeast(plan.model_tier, m.tier),
      config: safeJson(m.config_json),
    })),
  });
});

const genSchema = z.object({
  model_id: z.string().min(1).max(200),
  prompt: z.string().min(3).max(4000),
  aspect_ratio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4']).default('16:9'),
  duration_seconds: z.number().int().min(1).max(60).default(5),
});

// POST /api/video/generate — atomic quota reservation + provider submit
video.post('/generate', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const f = await features(c.env);
  if (!f.video) return err(503, 'feature_disabled', 'استودیو ویدیو در حال حاضر غیرفعال است.');

  // Verified-region gate
  if (u.country_verified) {
    const cs = await countries(c.env);
    const cc = cs.find((x) => x.code === u.country_verified);
    if (cc && cc.features && cc.features.video === false) return err(403, 'region_unavailable');
  }

  let body: z.infer<typeof genSchema>;
  try { body = genSchema.parse(await c.req.json()); } catch { return err(400, 'validation', 'ورودی نامعتبر است. مدل، متن، نسبت تصویر و مدت را بررسی کنید.'); }

  const plan = await userPlan(c.env, u.id);
  const found = await getVideoModel(c.env, body.model_id);
  if (!found) {
    return err(503, 'provider_not_configured', 'هیچ ارائه‌دهنده تولید ویدیویی پیکربندی نشده است. مدیر باید از بخش مدیریت یک Provider ویدیو اضافه کند.');
  }
  const { model, provider } = found;
  if (!tierAtLeast(plan.model_tier, model.tier)) {
    return err(403, 'forbidden', 'این مدل ویدیویی در طرح فعلی شما در دسترس نیست.');
  }

  // Respect provider-advertised options when configured
  const cfg = safeJson(model.config_json) as { durations?: number[]; ratios?: string[] };
  if (cfg.durations && cfg.durations.length && !cfg.durations.includes(body.duration_seconds)) {
    return err(400, 'validation', `مدت مجاز برای این مدل: ${cfg.durations.join(', ')} ثانیه`);
  }
  if (cfg.ratios && cfg.ratios.length && !cfg.ratios.includes(body.aspect_ratio)) {
    return err(400, 'validation', 'نسبت تصویر انتخاب‌شده برای این مدل پشتیبانی نمی‌شود.');
  }

  // Atomic quota reservation (server-side, per verified account)
  const qp = await quotaPolicy(c.env);
  const limit = await limitFor(c.env, u.id, 'video', plan, u.country_verified);
  const reservation = await reserveQuota(c.env, u.id, 'video', limit);
  if (!reservation.allowed) {
    return err(429, 'quota_exceeded',
      `سهمیه روزانه تولید ویدیوی شما (${limit} ویدیو) تمام شده است. این سقف بر اساس طرح و کشور تأییدشده حساب تعیین می‌شود.`,
      { quota: { used: reservation.count, limit, resets: 'midnight ' + qp.day_timezone } });
  }

  const jobId = crypto.randomUUID();
  const t = now();

  try {
    const submitted = await videoSubmit(provider, {
      prompt: body.prompt,
      aspect_ratio: body.aspect_ratio,
      duration_seconds: body.duration_seconds,
      model: model.model_key,
    });
    await c.env.DB.prepare(
      `INSERT INTO video_jobs (id, user_id, model_id, model_key, prompt, aspect_ratio, duration_seconds, status, provider_job_id, counted_quota, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(jobId, u.id, model.id, model.model_key, body.prompt, body.aspect_ratio, body.duration_seconds,
      submitted.status === 'succeeded' ? 'succeeded' : 'queued', submitted.job_id, qp.video_count_only_successful ? 0 : 1, t, t).run();
    return ok({ job_id: jobId, status: submitted.status, quota: { used: reservation.count, limit } });
  } catch (e) {
    // Provider unreachable: release the reservation immediately so users are
    // never charged for a job we failed to start.
    await releaseQuota(c.env, u.id, 'video', reservation.day);
    await c.env.DB.prepare(
      `INSERT INTO video_jobs (id, user_id, model_id, model_key, prompt, aspect_ratio, duration_seconds, status, error, counted_quota, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'failed', ?, 0, ?, ?)`,
    ).bind(jobId, u.id, model.id, model.model_key, body.prompt, body.aspect_ratio, body.duration_seconds,
      (e instanceof Error ? e.message : 'provider_error').slice(0, 400), t, t).run();
    return err(502, 'internal', 'ثبت سفارش ویدیو در ارائه‌دهنده ناموفق بود. سهمیه شما کسر نشد.');
  }
});

// GET /api/video/jobs — history
video.get('/jobs', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const rows = await c.env.DB.prepare(
    `SELECT id, model_key, prompt, aspect_ratio, duration_seconds, status, progress, result_url, error, created_at, updated_at
     FROM video_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  ).bind(u.id).all();
  return ok({ jobs: rows.results || [] });
});

// GET /api/video/jobs/:id — status; polls provider for active jobs
video.get('/jobs/:id', async (c) => {
  const u = userOf(c);
  if (!u) return err(401, 'unauthorized');
  const job = await c.env.DB.prepare('SELECT * FROM video_jobs WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), u.id).first<Record<string, unknown>>();
  if (!job) return err(404, 'not_found');

  if (['queued', 'running'].includes(String(job.status)) && job.provider_job_id) {
    const found = await getVideoModel(c.env, String(job.model_key));
    if (found) {
      try {
        const poll = await videoPoll(found.provider, String(job.provider_job_id));
        const t = now();
        let newStatus: string = job.status as string;
        if (poll.status === 'succeeded') newStatus = 'succeeded';
        else if (poll.status === 'failed') newStatus = 'failed';
        else newStatus = 'running';
        // counted_quota semantics: 1 = billed, 0 = pending-billing, -1 = released on failure
        const billed = newStatus === 'succeeded' ? 1 : Number(job.counted_quota);
        await c.env.DB.prepare(
          'UPDATE video_jobs SET status = ?, progress = ?, result_url = COALESCE(?, result_url), error = COALESCE(?, error), counted_quota = ?, updated_at = ? WHERE id = ?',
        ).bind(newStatus, poll.progress, poll.result_url || null, poll.error || null, billed, t, job.id).run();

        // Billing policy: if only successful jobs count, release the
        // reservation exactly once when the job fails at the provider.
        if (newStatus === 'failed' && Number(job.counted_quota) === 0) {
          const qp = await quotaPolicy(c.env);
          if (qp.video_count_only_successful) {
            const flip = await c.env.DB.prepare(
              `UPDATE video_jobs SET counted_quota = -1 WHERE id = ? AND counted_quota = 0`,
            ).bind(job.id).run();
            if ((flip.meta.changes ?? 0) > 0) {
              await releaseQuota(c.env, u.id, 'video');
            }
          }
        }
        return ok({ job: { ...job, status: newStatus, progress: poll.progress, result_url: poll.result_url || job.result_url, error: poll.error || job.error, updated_at: t } });
      } catch {
        // Poll error: report last known state; retry happens on next poll.
      }
    }
  }
  return ok({ job });
});

export default video;

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}
