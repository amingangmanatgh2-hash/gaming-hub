import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { Field, Spinner } from '../../components/ui';

export default function Forgot() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post<{ dev_code?: string }>('/api/auth/password/forgot', { email });
      if (r.dev_code) toast.info(`کد بازیابی (حالت توسعه): ${r.dev_code}`);
      toast.success(t.auth.code_sent);
      nav('/auth/reset', { state: { email } });
    } catch (err) {
      setError(err instanceof ApiException ? err.fa : t.common.error_generic);
      setBusy(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="card auth-card">
        <h2>{t.auth.forgot_title}</h2>
        <p className="muted small mt-s">{t.auth.forgot_sub}</p>
        <form onSubmit={submit} className="col mt">
          <Field label={t.auth.email} error={error}>
            <input className="input" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <button className="btn primary block" disabled={busy}>{busy && <Spinner />} {t.auth.send_code}</button>
        </form>
        <p className="small mt muted"><Link to="/auth/login">← {t.common.back}</Link></p>
      </div>
    </div>
  );
}
