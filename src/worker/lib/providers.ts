import type { Env } from '../env';
import { now } from '../env';

export interface ProviderRow {
  id: string; kind: 'openai_compatible' | 'video_http'; name: string; base_url: string;
  api_key: string; enabled: number; priority: number; notes?: string;
}

export interface ModelRow {
  id: string; provider_id: string; model_key: string; display_name: string;
  kind: 'chat' | 'video'; tier: 'basic' | 'plus' | 'pro'; enabled: number; config_json: string;
}

export async function getChatModel(env: Env, modelId?: string): Promise<{ model: ModelRow; provider: ProviderRow } | null> {
  let model: ModelRow | undefined | null;
  if (modelId) {
    model = await env.DB.prepare(
      `SELECT * FROM models WHERE (id = ? OR model_key = ?) AND kind = 'chat' AND enabled = 1`,
    ).bind(modelId, modelId).first<ModelRow>();
  } else {
    model = await env.DB.prepare(
      `SELECT m.* FROM models m JOIN providers p ON p.id = m.provider_id
       WHERE m.kind = 'chat' AND m.enabled = 1 AND p.enabled = 1
       ORDER BY p.priority DESC, m.created_at LIMIT 1`,
    ).first<ModelRow>();
  }
  if (!model) return null;
  const provider = await env.DB.prepare('SELECT * FROM providers WHERE id = ? AND enabled = 1').bind(model.provider_id).first<ProviderRow>();
  if (!provider) return null;
  return { model, provider };
}

export async function getVideoModel(env: Env, modelId: string): Promise<{ model: ModelRow; provider: ProviderRow } | null> {
  const model = await env.DB.prepare(
    `SELECT * FROM models WHERE (id = ? OR model_key = ?) AND kind = 'video' AND enabled = 1`,
  ).bind(modelId, modelId).first<ModelRow>();
  if (!model) return null;
  const provider = await env.DB.prepare('SELECT * FROM providers WHERE id = ? AND enabled = 1').bind(model.provider_id).first<ProviderRow>();
  if (!provider) return null;
  return { model, provider };
}

export async function listEnabledModels(env: Env, kind: 'chat' | 'video'): Promise<Array<Omit<ModelRow, 'provider_id'> & { provider_name: string }>> {
  const rows = await env.DB.prepare(
    `SELECT m.id, m.model_key, m.display_name, m.kind, m.tier, m.enabled, m.config_json, p.name AS provider_name
     FROM models m JOIN providers p ON p.id = m.provider_id
     WHERE m.kind = ? AND m.enabled = 1 AND p.enabled = 1
     ORDER BY m.tier, m.display_name`,
  ).bind(kind).all<Omit<ModelRow, 'provider_id'> & { provider_name: string }>();
  return rows.results || [];
}

// ---------- OpenAI-compatible chat ----------

export interface ChatParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  stream: boolean;
  signal?: AbortSignal;
}

export async function chatCompletion(
  provider: ProviderRow,
  model: ModelRow,
  params: ChatParams,
): Promise<Response> {
  const base = provider.base_url.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.api_key) headers['Authorization'] = `Bearer ${provider.api_key}`;
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model.model_key,
      messages: params.messages,
      stream: params.stream,
    }),
    signal: params.signal,
  });
  return res;
}

// ---------- Generic HTTP video job provider ----------
//
// Expected provider contract (documented in README / admin UI):
//   POST {base}/jobs        { prompt, aspect_ratio, duration_seconds }
//       -> { job_id, status }                      (submit)
//   GET  {base}/jobs/{id}   -> { status, progress, result_url, error }
// status ∈ queued|running|succeeded|failed
// This mirrors common async video APIs (and our test stub).

function authHeaders(provider: ProviderRow): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.api_key) h['Authorization'] = `Bearer ${provider.api_key}`;
  return h;
}

export async function videoSubmit(
  provider: ProviderRow,
  payload: { prompt: string; aspect_ratio: string; duration_seconds: number; model?: string },
): Promise<{ job_id: string; status: string }> {
  const base = provider.base_url.replace(/\/+$/, '');
  const res = await fetch(base + '/jobs', {
    method: 'POST',
    headers: authHeaders(provider),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('provider_submit_' + res.status);
  const data = (await res.json()) as { job_id?: string; id?: string; status?: string };
  const jobId = data.job_id || data.id;
  if (!jobId) throw new Error('provider_bad_response');
  return { job_id: jobId, status: data.status || 'queued' };
}

export interface VideoPollResult {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  result_url?: string;
  error?: string;
}

export async function videoPoll(provider: ProviderRow, providerJobId: string): Promise<VideoPollResult> {
  const base = provider.base_url.replace(/\/+$/, '');
  const res = await fetch(`${base}/jobs/${encodeURIComponent(providerJobId)}`, { headers: authHeaders(provider) });
  if (!res.ok) {
    if (res.status === 404) return { status: 'failed', progress: 0, error: 'job_not_found_at_provider' };
    throw new Error('provider_poll_' + res.status);
  }
  const data = (await res.json()) as Partial<VideoPollResult>;
  const status = (['queued', 'running', 'succeeded', 'failed'] as const).includes(data.status as never)
    ? (data.status as VideoPollResult['status'])
    : 'running';
  return { status, progress: Math.max(0, Math.min(100, Number(data.progress ?? 0))), result_url: data.result_url, error: data.error };
}

// ---------- Provider connection test (admin) ----------

export async function testProviderConnection(provider: ProviderRow): Promise<{ ok: boolean; detail: string; latencyMs: number }> {
  const base = provider.base_url.replace(/\/+$/, '');
  const start = now();
  try {
    const url = provider.kind === 'openai_compatible' ? base + '/models' : base + '/jobs';
    const res = await fetch(url, {
      method: provider.kind === 'openai_compatible' ? 'GET' : 'OPTIONS',
      headers: authHeaders(provider),
    });
    return { ok: res.status < 500, detail: `HTTP ${res.status}`, latencyMs: now() - start };
  } catch (e) {
    return { ok: false, detail: 'network_error: ' + (e instanceof Error ? e.message : String(e)), latencyMs: now() - start };
  }
}
