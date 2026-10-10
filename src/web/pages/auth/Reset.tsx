import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { Field, Spinner } from '../../components/ui';

export default function Reset() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { email?: string } };
  const [form, setForm] = useState({ email: loc.state?.email || '', code: '', new_password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/password/reset', form);
      toast.success(t.auth.reset_success);
      nav('/auth/login');
    } catch (err) {
      setError(err instanceof ApiException ? err.fa : t.common.error_generic);
      setBusy(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="card auth-card">
        <h2>{t.auth.reset_title}</h2>
        <p className="muted small mt-s">{t.auth.code_sent}</p>
        <form onSubmit={submit} className="col mt">
          <Field label={t.auth.email}>
            <input className="input" type="email" dir="ltr" required value={form.email} onChange={set('email')} />
          </Field>
          <Field label={t.auth.code_label}>
            <input className="input" dir="ltr" required inputMode="numeric" pattern="\d{6}" maxLength={6}
              value={form.code} onChange={set('code')} placeholder="123456" style={{ textAlign: 'center', letterSpacing: 6, fontWeight: 700 }} />
          </Field>
          <Field label={t.auth.password_new} hint={t.auth.password_hint} error={error}>
            <input className="input" type="password" dir="ltr" required value={form.new_password} onChange={set('new_password')} autoComplete="new-password" />
          </Field>
          <button className="btn primary block" disabled={busy}>{busy && <Spinner />} {t.common.confirm}</button>
        </form>
        <p className="small mt muted"><Link to="/auth/forgot">← {t.auth.resend}</Link></p>
      </div>
    </div>
  );
}
