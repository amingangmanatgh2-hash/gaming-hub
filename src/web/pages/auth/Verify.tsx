import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { useStore } from '../../store';
import { Field, Spinner } from '../../components/ui';

export default function Verify() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const { refreshMe } = useStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/verify/confirm', { code });
      await refreshMe();
      toast.success(t.auth.verify_success);
      nav('/app/chat');
    } catch (err) {
      setError(err instanceof ApiException ? err.fa : t.common.error_generic);
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const r = await api.post<{ dev_code?: string }>('/api/auth/verify/request');
      if (r.dev_code) toast.info(`کد (حالت توسعه): ${r.dev_code}`);
      else toast.success(t.auth.code_sent);
    } catch (err) {
      toast.error(err instanceof ApiException ? err.fa : t.common.error_generic);
    }
  };

  return (
    <div className="auth-layout">
      <div className="card auth-card">
        <h2>{t.auth.verify_title}</h2>
        <p className="muted small mt-s">{t.auth.verify_sub}</p>
        <form onSubmit={submit} className="col mt">
          <Field label={t.auth.code_label} error={error}>
            <input className="input" dir="ltr" required inputMode="numeric" pattern="\d{6}" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456"
              style={{ textAlign: 'center', letterSpacing: 8, fontWeight: 700, fontSize: '1.3rem' }} />
          </Field>
          <button className="btn primary block" disabled={busy}>{busy && <Spinner />} {t.auth.verify}</button>
        </form>
        <p className="small mt"><button className="btn ghost sm" onClick={resend}>{t.auth.resend}</button></p>
      </div>
    </div>
  );
}
