import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { SkeletonRows, Modal, Field, Confirm } from '../../components/ui';
import { IconPlus } from '../../components/Icons';

interface ProviderInfo {
  id: string; kind: 'openai_compatible' | 'video_http'; name: string; base_url: string;
  api_key_set: boolean; enabled: boolean; priority: number; notes: string;
}
interface ModelInfoAdmin {
  id: string; provider_id: string; model_key: string; display_name: string;
  kind: 'chat' | 'video'; tier: string; enabled: boolean | number; config: Record<string, unknown>;
}

export default function AdminProviders() {
  const { t } = useI18n();
  const A = t.admin;
  const toast = useToast();
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [models, setModels] = useState<ModelInfoAdmin[]>([]);
  const [editingProv, setEditingProv] = useState<Partial<ProviderInfo> & { api_key?: string } | null>(null);
  const [editingModel, setEditingModel] = useState<Partial<ModelInfoAdmin> & { configText?: string } | null>(null);
  const [deleting, setDeleting] = useState<{ type: 'provider' | 'model'; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState('');

  const load = () => api.get<{ providers: ProviderInfo[]; models: ModelInfoAdmin[] }>('/api/admin/providers')
    .then((d) => { setProviders(d.providers); setModels(d.models); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const saveProv = async () => {
    if (!editingProv || busy) return;
    setBusy(true);
    const { id, ...body } = editingProv;
    try {
      if (id) await api.put(`/api/admin/providers/${id}`, body);
      else await api.post('/api/admin/providers', body);
      toast.success(t.common.save);
      setEditingProv(null);
      load();
    } catch (e) { toast.error(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusy(false);
  };

  const saveModel = async () => {
    if (!editingModel || busy) return;
    setBusy(true);
    let config: Record<string, unknown> = {};
    if (editingModel.configText) {
      try { config = JSON.parse(editingModel.configText); } catch { toast.error('JSON نامعتبر است'); setBusy(false); return; }
    }
    const { id, configText: _ct, ...body } = editingModel;
    try {
      if (id) await api.put(`/api/admin/models/${id}`, { ...body, config });
      else await api.post('/api/admin/models', { ...body, config });
      toast.success(t.common.save);
      setEditingModel(null);
      load();
    } catch (e) { toast.error(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusy(false);
  };

  const test = async (id: string) => {
    setTesting(id);
    try {
      const r = await api.post<{ ok: boolean; detail: string; latencyMs: number }>(`/api/admin/providers/${id}/test`);
      if (r.ok) toast.success(`${A.provider_test_ok} — ${r.detail} (${r.latencyMs}ms)`);
      else toast.error(`${A.provider_test_fail} — ${r.detail}`);
    } catch { toast.error(A.provider_test_fail); }
    setTesting('');
  };

  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/${deleting.type === 'provider' ? 'providers' : 'models'}/${deleting.id}`);
      toast.success(t.common.delete);
      setDeleting(null);
      load();
    } catch (e) { toast.error(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusy(false);
  };

  if (!providers) return <SkeletonRows n={3} h={90} />;

  return (
    <div className="col gap-l">
      <div className="row between wrap">
        <h1>{A.providers}</h1>
        <div className="row gap-s">
          <button className="btn" onClick={() => setEditingModel({ kind: 'chat', enabled: true, tier: 'basic', provider_id: providers[0]?.id, configText: '{}' })} disabled={!providers.length}><IconPlus size={15} /> {A.model_new}</button>
          <button className="btn primary" onClick={() => setEditingProv({ kind: 'openai_compatible', enabled: true, priority: 0 })}><IconPlus size={15} /> {A.provider_new}</button>
        </div>
      </div>

      {providers.length === 0 && (
        <div className="card"><p className="muted">
          هنوز ارائه‌دهنده‌ای ثبت نشده است. برای فعال‌شدن چت، یک ارائه‌دهنده «سازگار با OpenAI» (مثلاً OpenAI، OpenRouter، LiteLLM خودمیزبان) و برای ویدیو یک ارائه‌دهنده «HTTP» اضافه کنید.
        </p></div>
      )}

      {providers.map((p) => (
        <div key={p.id} className="card col gap-s">
          <div className="row between wrap">
            <div className="row gap-s wrap">
              <h3>{p.name}</h3>
              <span className="badge">{p.kind === 'openai_compatible' ? '💬 chat' : '🎬 video'}</span>
              <span className={`badge ${p.enabled ? 'green' : 'red'}`}>{p.enabled ? t.common.enabled : t.common.disabled}</span>
              <span className="badge num" dir="ltr">priority {p.priority}</span>
              <span className="badge">{p.api_key_set ? '🔑 key ✓' : 'no key'}</span>
            </div>
            <div className="row gap-s">
              <button className="btn ghost sm" disabled={testing === p.id} onClick={() => test(p.id)}>{testing === p.id ? '…' : A.provider_test}</button>
              <button className="btn ghost sm" onClick={() => setEditingProv({ ...p, api_key: '' })}>{t.common.edit}</button>
              <button className="btn danger sm" onClick={() => setDeleting({ type: 'provider', id: p.id })}>{t.common.delete}</button>
            </div>
          </div>
          <code className="tiny" dir="ltr" style={{ color: 'var(--text-3)' }}>{p.base_url}</code>
          <div className="row wrap gap-s">
            {models.filter((m) => m.provider_id === p.id).map((m) => (
              <span key={m.id} className="badge" style={{ opacity: m.enabled ? 1 : 0.5 }}>
                {m.display_name} <span className="dim">({m.tier})</span>
                <button className="btn ghost sm" style={{ padding: '0 4px' }} onClick={() => setEditingModel({ ...m, configText: JSON.stringify(m.config) })}>✎</button>
                <button className="btn ghost sm" style={{ padding: '0 4px', color: 'var(--danger)' }} onClick={() => setDeleting({ type: 'model', id: m.id })}>✕</button>
              </span>
            ))}
          </div>
        </div>
      ))}

      {editingProv && (
        <Modal title={editingProv.id ? t.common.edit : A.provider_new} onClose={() => setEditingProv(null)}>
          <div className="col">
            <Field label={t.auth.name}><input className="input" value={editingProv.name || ''} onChange={(e) => setEditingProv((p) => ({ ...p, name: e.target.value }))} /></Field>
            <Field label={A.provider_kind}>
              <select className="select" value={editingProv.kind} onChange={(e) => setEditingProv((p) => ({ ...p, kind: e.target.value as ProviderInfo['kind'] }))}>
                <option value="openai_compatible">{A.provider_kind_chat}</option>
                <option value="video_http">{A.provider_kind_video}</option>
              </select>
            </Field>
            <Field label={A.provider_base_url} hint="مثال: https://api.openai.com/v1">
              <input className="input" dir="ltr" value={editingProv.base_url || ''} onChange={(e) => setEditingProv((p) => ({ ...p, base_url: e.target.value }))} />
            </Field>
            <Field label={A.provider_api_key} hint={editingProv.id ? A.provider_api_key_keep : ''}>
              <input className="input" dir="ltr" type="password" value={editingProv.api_key || ''} onChange={(e) => setEditingProv((p) => ({ ...p, api_key: e.target.value }))} autoComplete="off" />
            </Field>
            <Field label={A.provider_priority}><input className="input num" dir="ltr" value={editingProv.priority ?? 0} onChange={(e) => setEditingProv((p) => ({ ...p, priority: parseInt(e.target.value) || 0 }))} /></Field>
            <label className="row gap-s"><span className="switch"><input type="checkbox" checked={Boolean(editingProv.enabled)} onChange={(e) => setEditingProv((p) => ({ ...p, enabled: e.target.checked }))} /><span className="track" /></span> {A.plan_active}</label>
            <div className="row end gap-s mt">
              <button className="btn ghost" onClick={() => setEditingProv(null)}>{t.common.cancel}</button>
              <button className="btn primary" disabled={busy || !editingProv.name || !editingProv.base_url} onClick={saveProv}>{t.common.save}</button>
            </div>
          </div>
        </Modal>
      )}

      {editingModel && (
        <Modal title={editingModel.id ? t.common.edit : A.model_new} onClose={() => setEditingModel(null)}>
          <div className="col">
            <Field label={A.providers}>
              <select className="select" value={editingModel.provider_id} onChange={(e) => setEditingModel((m) => ({ ...m, provider_id: e.target.value }))} disabled={Boolean(editingModel.id)}>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label={A.model_key} hint="مثال: gpt-4o-mini">
              <input className="input" dir="ltr" value={editingModel.model_key || ''} onChange={(e) => setEditingModel((m) => ({ ...m, model_key: e.target.value }))} />
            </Field>
            <Field label={A.model_display}><input className="input" value={editingModel.display_name || ''} onChange={(e) => setEditingModel((m) => ({ ...m, display_name: e.target.value }))} /></Field>
            <div className="grid-2">
              <Field label={A.model_kind}>
                <select className="select" value={editingModel.kind} onChange={(e) => setEditingModel((m) => ({ ...m, kind: e.target.value as 'chat' | 'video' }))}>
                  <option value="chat">chat</option><option value="video">video</option>
                </select>
              </Field>
              <Field label={A.plan_tier}>
                <select className="select" value={editingModel.tier} onChange={(e) => setEditingModel((m) => ({ ...m, tier: e.target.value }))}>
                  <option value="basic">basic</option><option value="plus">plus</option><option value="pro">pro</option>
                </select>
              </Field>
            </div>
            {editingModel.kind === 'video' && (
              <Field label="پیکربندی JSON (نسبت‌ها/مدت‌ها)" hint={'مثال: {"durations":[3,5,10],"ratios":["16:9","9:16"]}'}>
                <textarea className="textarea" dir="ltr" value={editingModel.configText || '{}'} onChange={(e) => setEditingModel((m) => ({ ...m, configText: e.target.value }))} rows={3} />
              </Field>
            )}
            <label className="row gap-s"><span className="switch"><input type="checkbox" checked={Boolean(editingModel.enabled)} onChange={(e) => setEditingModel((m) => ({ ...m, enabled: e.target.checked }))} /><span className="track" /></span> {A.plan_active}</label>
            <div className="row end gap-s mt">
              <button className="btn ghost" onClick={() => setEditingModel(null)}>{t.common.cancel}</button>
              <button className="btn primary" disabled={busy || !editingModel.model_key || !editingModel.display_name} onClick={saveModel}>{t.common.save}</button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && <Confirm title={t.common.delete} message={A.plan_delete_q} danger busy={busy} onConfirm={remove} onClose={() => setDeleting(null)} />}
    </div>
  );
}
