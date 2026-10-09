import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n, formatDateTime } from '../../i18n';
import { api, ApiException, type ModelInfo } from '../../api';
import { useToast } from '../../components/Toast';
import { useStore } from '../../store';
import { Spinner, Empty, Field } from '../../components/ui';
import { IconVideo, IconDownload, IconClock } from '../../components/Icons';

interface Job {
  id: string; prompt: string; status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number; result_url?: string; error?: string; created_at: number;
  aspect_ratio?: string; duration_seconds?: number; model_key?: string;
}

interface VideoModelsResponse {
  enabled: boolean; region_allowed: boolean; region_reason: string;
  daily_limit: number; used_today: number; country_verified: string | null;
  models: ModelInfo[];
}

const STATUS_BADGE: Record<string, string> = { queued: 'blue', running: 'amber', succeeded: 'green', failed: 'red' };

export default function Video() {
  const { t, locale, fmt } = useI18n();
  const toast = useToast();
  const { refreshMe } = useStore();
  const V = t.video;

  const [info, setInfo] = useState<VideoModelsResponse | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [ratio, setRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);
  const [busy, setBusy] = useState(false);
  const [limitInfo, setLimitInfo] = useState<string>('');
  const pollRef = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const d = await api.get<VideoModelsResponse>('/api/video/models');
      setInfo(d);
      const avail = d.models.filter((m) => m.available);
      if (!modelId && avail.length) setModelId(avail[0].id);
      const cfg = avail[0]?.config;
      if (cfg?.durations?.length && !cfg.durations.includes(duration)) setDuration(cfg.durations[0]);
      if (cfg?.ratios?.length && !cfg.ratios.includes(ratio)) setRatio(cfg.ratios[0]);
      if (d.country_verified === 'IR') setLimitInfo(fmt(V.limit_note_ir, { n: d.daily_limit }));
      else setLimitInfo(fmt(V.limit_note_other, { n: d.daily_limit }));
      const j = await api.get<{ jobs: Job[] }>('/api/video/jobs');
      setJobs(j.jobs);
    } catch (e) {
      if (e instanceof ApiException) toast.error(e.fa);
    }
  }, [modelId, duration, ratio, V, fmt]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  // Poll active jobs
  useEffect(() => {
    const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    if (!active.length) return;
    const timers = active.map((j) => window.setTimeout(async () => {
      try {
        const d = await api.get<{ job: Job }>(`/api/video/jobs/${j.id}`);
        setJobs((prev) => prev.map((p) => (p.id === j.id ? { ...p, ...d.job } : p)));
        if (d.job.status === 'succeeded') { toast.success(V.status_succeeded); refreshMe(); }
        if (d.job.status === 'failed') { refreshMe(); }
      } catch { /* retry next cycle */ }
      pollRef.current[j.id] = 0;
    }, 4000));
    return () => timers.forEach(clearTimeout);
  }, [jobs, toast, V, refreshMe]);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const d = await api.post<{ job_id: string }>('/api/video/generate', {
        model_id: modelId, prompt: prompt.trim(), aspect_ratio: ratio, duration_seconds: duration,
      });
      toast.info(V.status_queued);
      setPrompt('');
      setJobs((prev) => [{ id: d.job_id, prompt: '', status: 'queued', progress: 0, created_at: Date.now() }, ...prev]);
      load();
      refreshMe();
    } catch (e) {
      toast.error(e instanceof ApiException ? e.fa : t.common.error_generic);
      load();
    } finally { setBusy(false); }
  };

  if (!info) return <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><Spinner lg /></div>;

  if (!info.enabled || !info.region_allowed) {
    return <Empty icon={<IconVideo size={32} />} title={V.title}
      sub={info.region_reason || V.region_blocked} />;
  }

  const selected = info.models.find((m) => m.id === modelId);
  const cfgDurations = selected?.config?.durations || [3, 5, 10];
  const cfgRatios = selected?.config?.ratios || ['16:9', '9:16', '1:1'];
  const remaining = Math.max(0, info.daily_limit - info.used_today);

  return (
    <div className="col gap-xl">
      <div>
        <h1>{V.title}</h1>
        <p className="muted mt-s">{V.sub}</p>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* generator form */}
        <div className="card col gap-l">
          {info.models.length === 0 ? (
            <Empty icon={<IconVideo size={30} />} title={V.no_provider_title} sub={V.no_provider_sub} />
          ) : (
            <>
              <div className="row between">
                <span className="badge green num">{V.quota_left}: {remaining}</span>
                <span className="tiny">{limitInfo}</span>
              </div>
              <Field label={V.prompt}>
                <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  placeholder={V.prompt_ph} rows={5} maxLength={4000} />
              </Field>
              <div className="grid-3">
                <Field label={V.model}>
                  <select className="select" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                    {info.models.map((m) => (
                      <option key={m.id} value={m.id} disabled={!m.available}>{m.name}{!m.available ? ' 🔒' : ''}</option>
                    ))}
                  </select>
                </Field>
                <Field label={V.aspect}>
                  <select className="select" value={ratio} onChange={(e) => setRatio(e.target.value)}>
                    {cfgRatios.map((r) => <option key={r} value={r} dir="ltr">{r}</option>)}
                  </select>
                </Field>
                <Field label={V.duration}>
                  <select className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    {cfgDurations.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
              </div>
              {selected?.config?.cost_hint && <p className="tiny">{V.cost_hint} — {selected.config.cost_hint}</p>}
              <button className="btn primary lg" onClick={generate} disabled={busy || !prompt.trim() || remaining <= 0}>
                {busy ? <Spinner /> : <IconVideo size={18} />} {V.generate}
              </button>
              {remaining <= 0 && <p className="error-text small">{t.errors.quota_exceeded}</p>}
              <p className="tiny dim">{V.verification_note}</p>
            </>
          )}
        </div>

        {/* history */}
        <div className="card col">
          <h3 className="mb">{V.history}</h3>
          {jobs.length === 0 ? (
            <Empty icon={<IconClock size={28} />} title={V.empty_jobs} />
          ) : (
            <div className="col">
              {jobs.map((j) => (
                <div key={j.id} className="video-job card flat" style={{ padding: 14 }}>
                  <div className="video-thumb">
                    {j.status === 'succeeded' && j.result_url ? (
                      <video src={j.result_url} controls preload="metadata" />
                    ) : j.status === 'failed' ? (
                      <span className="dim tiny">{V.status_failed}</span>
                    ) : (
                      <Spinner />
                    )}
                  </div>
                  <div className="grow col gap-s" style={{ minWidth: 0 }}>
                    <div className="row between">
                      <span className={`badge ${STATUS_BADGE[j.status]}`}>{(V as Record<string, string>)[`status_${j.status}`]}</span>
                      <span className="tiny num">{formatDateTime(j.created_at, locale)}</span>
                    </div>
                    {j.prompt && <p className="tiny" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.prompt}</p>}
                    {(j.status === 'queued' || j.status === 'running') && (
                      <div className="progress"><i style={{ width: `${j.progress || 8}%` }} /></div>
                    )}
                    {j.status === 'failed' && <p className="tiny" style={{ color: 'var(--warn)' }}>{V.failed_note}</p>}
                  </div>
                  {j.status === 'succeeded' && j.result_url && (
                    <a className="btn ghost sm" href={j.result_url} download target="_blank" rel="noreferrer" aria-label={V.download}>
                      <IconDownload size={15} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
