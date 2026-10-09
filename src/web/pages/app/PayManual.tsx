import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n, formatPrice } from '../../i18n';
import { api, ApiException, type PlanInfo } from '../../api';
import { useToast } from '../../components/Toast';
import { useStore } from '../../store';
import { Field, Spinner } from '../../components/ui';
import { IconCard, IconCopy, IconUpload } from '../../components/Icons';

export default function PayManual() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { transaction_id?: string; plan?: PlanInfo } };
  const { config } = useStore();
  const manual = config?.payments?.manual;
  const plan = loc.state?.plan;
  const [note, setNote] = useState('');
  const [receiptKey, setReceiptKey] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const txId = loc.state?.transaction_id || '';

  if (!txId || !manual) {
    return <div className="card" style={{ maxWidth: 480, margin: '50px auto' }}><p className="muted">{t.errors.not_found}</p></div>;
  }

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t.common.copied); } catch { /* clipboard unavailable */ }
  };

  const uploadReceipt = async (file: File) => {
    setUploadBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const d = await api.upload<{ r2_key: string }>('/api/files/upload', form);
      setReceiptKey(d.r2_key);
      toast.success(t.common.save);
    } catch (e) {
      toast.error(e instanceof ApiException ? e.fa : t.common.error_generic);
    }
    setUploadBusy(false);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const d = await api.post<{ message_fa: string }>('/api/payments/manual/receipt', {
        transaction_id: txId, sender_note: note, receipt_r2_key: receiptKey || undefined,
      });
      toast.success(d.message_fa || t.pay.receipt_done);
      nav('/app/dashboard');
    } catch (e) {
      toast.error(e instanceof ApiException ? e.fa : t.common.error_generic);
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '30px auto' }} className="col gap-l">
      <div className="card col gap-l">
        <h2 className="row gap-s"><IconCard /> {t.pay.manual_title}</h2>
        <p className="muted small">{t.pay.manual_steps}</p>

        <div className="card flat col gap-s">
          <div className="row between wrap">
            <span className="tiny">{t.pay.card_number}</span>
            <div className="copy-chip">
              <b className="num">{manual.card_number || '—'}</b>
              <button className="btn ghost sm" onClick={() => copy(manual.card_number)} aria-label={t.common.copy}><IconCopy size={14} /></button>
            </div>
          </div>
          <div className="row between"><span className="tiny">{t.pay.card_holder}</span><b>{manual.card_holder || '—'}</b></div>
          <div className="row between"><span className="tiny">{t.pay.bank}</span><b>{manual.bank_name || '—'}</b></div>
          {plan && <div className="row between"><span className="tiny">{t.pay.amount}</span><b className="num">{formatPrice(plan.price_irr, locale)}</b></div>}
          {manual.note_fa && <p className="tiny" style={{ color: 'var(--info)' }}>{manual.note_fa}</p>}
        </div>

        <Field label={t.pay.receipt_note}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: ۴ رقم آخر کارت و تاریخ واریز" />
        </Field>

        <Field label={t.pay.receipt_file}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
            onChange={(e) => e.target.files?.[0] && uploadReceipt(e.target.files[0])} />
          <div className="row gap-s">
            <button className="btn ghost" onClick={() => fileRef.current?.click()} disabled={uploadBusy}>
              {uploadBusy ? <Spinner /> : <IconUpload size={16} />} {receiptKey ? '✓' : t.pay.receipt_file}
            </button>
            {receiptKey && <span className="badge green">{t.common.save}</span>}
          </div>
        </Field>

        <button className="btn primary block lg" onClick={submit} disabled={busy}>
          {busy && <Spinner />} {t.pay.submit_receipt}
        </button>
      </div>
    </div>
  );
}
