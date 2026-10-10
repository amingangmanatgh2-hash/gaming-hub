import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { SkeletonRows, Field, ReauthModal, Spinner } from '../../components/ui';

interface PaySettings {
  provider: 'disabled' | 'zarinpal';
  zarinpal: { merchant_id: string; sandbox: boolean; base_url: string };
  callback_base: string; success_path: string; failure_path: string;
  currencies: string[];
  manual: { enabled: boolean; card_number: string; card_holder: string; bank_name: string; note_fa: string };
  refund_policy_fa: string;
}

interface SettingsResponse {
  payments: PaySettings & { zarinpal: PaySettings['zarinpal'] & { merchant_id_set: boolean } };
}

export default function AdminPayments() {
  const { t } = useI18n();
  const A = t.admin;
  const toast = useToast();
  const [form, setForm] = useState<(PaySettings & { keep_blanks: boolean }) | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<SettingsResponse>('/api/admin/settings').then((d) => {
      setForm({ ...d.payments, keep_blanks: true });
    }).catch(() => {});
  }, []);

  if (!form) return <SkeletonRows n={4} h={80} />;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => f && { ...f, [k]: v });
  const setZ = <K extends keyof PaySettings['zarinpal']>(k: K, v: PaySettings['zarinpal'][K]) =>
    setForm((f) => f && { ...f, zarinpal: { ...f.zarinpal, [k]: v } });
  const setM = <K extends keyof PaySettings['manual']>(k: K, v: PaySettings['manual'][K]) =>
    setForm((f) => f && { ...f, manual: { ...f.manual, [k]: v } });

  const doSave = async (reauthToken: string) => {
    setBusy(true);
    try {
      const { keep_blanks: _k, ...payload } = form;
      await api.put('/api/admin/settings/payments', { ...payload, reauth_token: reauthToken });
      toast.success(A.pay_saved);
    } catch (e) {
      toast.error(e instanceof ApiException ? e.fa : t.common.error_generic);
    }
    setBusy(false);
  };

  return (
    <div className="col gap-l" style={{ maxWidth: 820 }}>
      <div>
        <h1>{A.payments}</h1>
        <p className="tiny mt-s" style={{ color: 'var(--warn)' }}>{A.pay_save_warn}</p>
      </div>

      <div className="card col gap-l">
        <Field label={A.pay_provider}>
          <select className="select" value={form.provider} onChange={(e) => set('provider', e.target.value as PaySettings['provider'])}>
            <option value="disabled">{A.pay_disabled}</option>
            <option value="zarinpal">زرین‌پال (Zarinpal)</option>
          </select>
        </Field>

        {form.provider === 'zarinpal' && (
          <div className="grid-2">
            <Field label={A.pay_zarinpal_merchant} hint="xxxx-xxxx-xxxx-xxxx — خالی/مات = حفظ مقدار فعلی">
              <input className="input" dir="ltr" value={form.zarinpal.merchant_id}
                onChange={(e) => setZ('merchant_id', e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Base URL" hint="https://api.zarinpal.com/pg/v4">
              <input className="input" dir="ltr" value={form.zarinpal.base_url}
                onChange={(e) => setZ('base_url', e.target.value)} />
            </Field>
            <label className="row gap-s">
              <span className="switch"><input type="checkbox" checked={form.zarinpal.sandbox} onChange={(e) => setZ('sandbox', e.target.checked)} /><span className="track" /></span>
              <span className="small">{A.pay_sandbox}</span>
            </label>
            <Field label={A.pay_callback_base}>
              <input className="input" dir="ltr" value={form.callback_base} onChange={(e) => set('callback_base', e.target.value)} placeholder="https://…" />
            </Field>
            <Field label={A.pay_success_url}><input className="input" dir="ltr" value={form.success_path} onChange={(e) => set('success_path', e.target.value)} /></Field>
            <Field label={A.pay_failure_url}><input className="input" dir="ltr" value={form.failure_path} onChange={(e) => set('failure_path', e.target.value)} /></Field>
          </div>
        )}
      </div>

      <div className="card col gap-l">
        <div className="row between">
          <h3>{t.pricing.pay_manual}</h3>
          <label className="row gap-s">
            <span className="switch"><input type="checkbox" checked={form.manual.enabled} onChange={(e) => setM('enabled', e.target.checked)} /><span className="track" /></span>
            <span className="small">{t.common.enabled}</span>
          </label>
        </div>
        {form.manual.enabled && (
          <div className="grid-2">
            <Field label={A.pay_manual_card}><input className="input" dir="ltr" value={form.manual.card_number} onChange={(e) => setM('card_number', e.target.value)} placeholder="6037-****-****-****" /></Field>
            <Field label={A.pay_manual_holder}><input className="input" value={form.manual.card_holder} onChange={(e) => setM('card_holder', e.target.value)} /></Field>
            <Field label={A.pay_manual_bank}><input className="input" value={form.manual.bank_name} onChange={(e) => setM('bank_name', e.target.value)} /></Field>
            <Field label={A.pay_manual_note}><input className="input" value={form.manual.note_fa} onChange={(e) => setM('note_fa', e.target.value)} /></Field>
          </div>
        )}
        <Field label={A.pay_refund_policy}>
          <textarea className="textarea" rows={3} value={form.refund_policy_fa} onChange={(e) => set('refund_policy_fa', e.target.value)} />
        </Field>
      </div>

      <div className="row end">
        <button className="btn primary lg" disabled={busy} onClick={() => setReauthOpen(true)}>
          {busy && <Spinner />} {t.common.save}
        </button>
      </div>

      {reauthOpen && (
        <ReauthModal onClose={() => setReauthOpen(false)} onDone={(token) => { setReauthOpen(false); doSave(token); }} />
      )}
    </div>
  );
}
