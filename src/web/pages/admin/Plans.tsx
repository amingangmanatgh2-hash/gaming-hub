import React, { useEffect, useState } from 'react';
import { useI18n, formatPrice, formatNumber } from '../../i18n';
import { api, ApiException, type PlanInfo } from '../../api';
import { useToast } from '../../components/Toast';
import { SkeletonRows, Modal, Field, Confirm } from '../../components/ui';
import { IconPlus } from '../../components/Icons';

type PlanForm = {
  slug: string; name_fa: string; name_en: string; description_fa: string; description_en: string;
  price_irr: number; duration_days: number; daily_message_limit: number;
  daily_video_limit_default: number; daily_video_limit_ir: number;
  upload_limit_mb: number; conversation_storage_limit: number; model_tier: 'basic' | 'plus' | 'pro';
  is_active: boolean; is_free: boolean; sort_order: number;
};

const emptyForm: PlanForm = {
  slug: '', name_fa: '', name_en: '', description_fa: '', description_en: '',
  price_irr: 0, duration_days: 30, daily_message_limit: 20,
  daily_video_limit_default: 1, daily_video_limit_ir: 2,
  upload_limit_mb: 5, conversation_storage_limit: 20, model_tier: 'basic',
  is_active: true, is_free: false, sort_order: 0,
};

export default function AdminPlans() {
  const { t, locale } = useI18n();
  const A = t.admin;
  const toast = useToast();
  const [plans, setPlans] = useState<PlanInfo[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: PlanForm } | null>(null);
  const [deleting, setDeleting] = useState<PlanInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<{ plans: PlanInfo[] }>('/api/admin/plans').then((d) => setPlans(d.plans)).catch(() => {});
  useEffect(() => { load(); }, []);

  const openEdit = (p?: PlanInfo) => {
    if (!p) { setEditing({ id: null, form: { ...emptyForm } }); return; }
    setEditing({
      id: p.id,
      form: {
        slug: p.slug, name_fa: p.name_fa, name_en: p.name_en, description_fa: p.description_fa, description_en: p.description_en,
        price_irr: p.price_irr, duration_days: p.duration_days, daily_message_limit: p.daily_message_limit,
        daily_video_limit_default: p.daily_video_limit_default, daily_video_limit_ir: p.daily_video_limit_ir,
        upload_limit_mb: p.upload_limit_mb, conversation_storage_limit: (p as { conversation_storage_limit?: number }).conversation_storage_limit || 20,
        model_tier: p.model_tier, is_active: Boolean(p.is_active), is_free: Boolean(p.is_free), sort_order: p.sort_order,
      },
    });
  };

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    const payload = { ...editing.form, features: {} };
    try {
      if (editing.id) await api.put(`/api/admin/plans/${editing.id}`, payload);
      else await api.post('/api/admin/plans', payload);
      toast.success(A.plan_saved);
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof ApiException ? e.fa : t.common.error_generic);
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/plans/${deleting.id}`);
      toast.success(t.common.delete);
      setDeleting(null);
      load();
    } catch (e) { toast.error(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusy(false);
  };

  const num = (v: string) => Math.max(0, parseInt(v.replace(/\D/g, '')) || 0);
  const setF = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setEditing((e) => e && { ...e, form: { ...e.form, [k]: v } });

  if (!plans) return <SkeletonRows n={3} h={100} />;

  return (
    <div className="col gap-l">
      <div className="row between wrap">
        <div>
          <h1>{A.plans}</h1>
          <p className="tiny mt-s">{A.quota_by_country_sub}</p>
        </div>
        <button className="btn primary" onClick={() => openEdit()}><IconPlus size={16} /> {A.plan_new}</button>
      </div>

      <div className="grid-2">
        {plans.map((p) => (
          <div key={p.id} className="card plan-card">
            <div className="row between wrap">
              <div className="row gap-s">
                <h3>{locale === 'fa' ? p.name_fa : p.name_en}</h3>
                <code className="tiny" dir="ltr">{p.slug}</code>
              </div>
              <div className="row gap-s">
                {p.is_free ? <span className="badge blue">{A.plan_free}</span> : null}
                <span className={`badge ${p.is_active ? 'green' : 'red'}`}>{p.is_active ? t.common.enabled : t.common.disabled}</span>
              </div>
            </div>
            <div className="price num">{formatPrice(p.price_irr, locale)} <small>/ {formatNumber(p.duration_days, locale)} {t.common.day}</small></div>
            <div className="row wrap gap-s tiny">
              <span className="badge">💬 {formatNumber(p.daily_message_limit, locale)}</span>
              <span className="badge">🎬 {formatNumber(p.daily_video_limit_default, locale)} (IR: {formatNumber(p.daily_video_limit_ir, locale)})</span>
              <span className="badge">📤 {formatNumber(p.upload_limit_mb, locale)}MB</span>
              <span className="badge">⭐ {p.model_tier}</span>
            </div>
            <div className="row end gap-s">
              <button className="btn ghost sm" onClick={() => setDeleting(p)}>{t.common.delete}</button>
              <button className="btn sm" onClick={() => openEdit(p)}>{t.common.edit}</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal title={editing.id ? `${t.common.edit} — ${editing.form.name_fa}` : A.plan_new} onClose={() => setEditing(null)} wide>
          <div className="grid-2">
            <Field label={A.plan_slug}><input className="input" dir="ltr" value={editing.form.slug} onChange={(e) => setF('slug', e.target.value.toLowerCase())} /></Field>
            <Field label={A.plan_sort}><input className="input num" value={editing.form.sort_order} onChange={(e) => setF('sort_order', num(e.target.value))} /></Field>
            <Field label={A.plan_name_fa}><input className="input" value={editing.form.name_fa} onChange={(e) => setF('name_fa', e.target.value)} /></Field>
            <Field label={A.plan_name_en}><input className="input" dir="ltr" value={editing.form.name_en} onChange={(e) => setF('name_en', e.target.value)} /></Field>
            <Field label={A.plan_price_irr}><input className="input num" dir="ltr" value={editing.form.price_irr} onChange={(e) => setF('price_irr', num(e.target.value))} /></Field>
            <Field label={A.plan_duration}><input className="input num" value={editing.form.duration_days} onChange={(e) => setF('duration_days', Math.max(1, num(e.target.value)))} /></Field>
            <Field label={A.plan_msg_limit}><input className="input num" value={editing.form.daily_message_limit} onChange={(e) => setF('daily_message_limit', num(e.target.value))} /></Field>
            <Field label={A.plan_tier}>
              <select className="select" value={editing.form.model_tier} onChange={(e) => setF('model_tier', e.target.value as PlanForm['model_tier'])}>
                <option value="basic">basic</option><option value="plus">plus</option><option value="pro">pro</option>
              </select>
            </Field>
            <Field label={A.plan_video_default}><input className="input num" value={editing.form.daily_video_limit_default} onChange={(e) => setF('daily_video_limit_default', num(e.target.value))} /></Field>
            <Field label={A.plan_video_ir}><input className="input num" value={editing.form.daily_video_limit_ir} onChange={(e) => setF('daily_video_limit_ir', num(e.target.value))} /></Field>
            <Field label={A.plan_upload}><input className="input num" value={editing.form.upload_limit_mb} onChange={(e) => setF('upload_limit_mb', num(e.target.value))} /></Field>
            <Field label={A.plan_conv_limit}><input className="input num" value={editing.form.conversation_storage_limit} onChange={(e) => setF('conversation_storage_limit', Math.max(1, num(e.target.value)))} /></Field>
          </div>
          <div className="row gap-l mt">
            <label className="switch"><input type="checkbox" checked={editing.form.is_active} onChange={(e) => setF('is_active', e.target.checked)} /><span className="track" /></label><span className="small">{A.plan_active}</span>
            <label className="switch"><input type="checkbox" checked={editing.form.is_free} onChange={(e) => setF('is_free', e.target.checked)} /><span className="track" /></label><span className="small">{A.plan_free}</span>
          </div>
          <div className="row end gap-s mt-l">
            <button className="btn ghost" onClick={() => setEditing(null)}>{t.common.cancel}</button>
            <button className="btn primary" disabled={busy || !editing.form.slug || !editing.form.name_fa} onClick={save}>{t.common.save}</button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Confirm title={t.common.delete} message={A.plan_delete_q} danger busy={busy}
          onConfirm={remove} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
