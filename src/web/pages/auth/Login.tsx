import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { useStore } from '../../store';
import { Field, Spinner } from '../../components/ui';
import { IconGoogle, IconLock, IconMail } from '../../components/Icons';

export default function Login() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const { refreshMe, config } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [googleMsg, setGoogleMsg] = useState('');

  const googleEnabled = Boolean(config?.google?.enabled && config?.google?.configured);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/login', { email, password });
      await refreshMe();
      toast.success(t.auth.login_success);
      nav(loc.state?.from || '/app/chat', { replace: true });
    } catch (err) {
      setError(err instanceof ApiException ? err.fa : t.common.error_generic);
      setBusy(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="card auth-card">
        <h2>{t.auth.login_title}</h2>
        <p className="muted small mt-s">{t.auth.login_sub}</p>

        <div className="mt">
          {googleEnabled ? (
            <a className="btn google-btn block" href="/api/auth/google/start"><IconGoogle /> {t.auth.continue_google}</a>
          ) : (
            <button className="btn google-btn block" onClick={() => setGoogleMsg(t.auth.google_unavailable)}>
              <IconGoogle /> {t.auth.continue_google}
            </button>
          )}
          {googleMsg && <p className="small mt-s" style={{ color: 'var(--warn)' }}>{googleMsg}</p>}
        </div>

        <div className="divider">{t.auth.or_email}</div>

        <form onSubmit={submit} className="col">
          <Field label={t.auth.email}>
            <div style={{ position: 'relative' }}>
              <input className="input" type="email" dir="ltr" required value={email} autoComplete="email"
                placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
              <span style={{ position: 'absolute', insetInlineEnd: 12, top: 13, color: 'var(--text-3)' }}><IconMail size={16} /></span>
            </div>
          </Field>
          <Field label={t.auth.password} error={error}>
            <div style={{ position: 'relative' }}>
              <input className="input" type="password" dir="ltr" required value={password} autoComplete="current-password"
                placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} />
              <span style={{ position: 'absolute', insetInlineEnd: 12, top: 13, color: 'var(--text-3)' }}><IconLock size={16} /></span>
            </div>
          </Field>
          <button className="btn primary block" disabled={busy}>{busy && <Spinner />} {t.nav.login}</button>
        </form>

        <div className="row between mt small">
          <Link to="/auth/forgot">{t.auth.forgot}</Link>
          <span className="muted">{t.auth.no_account} <Link to="/auth/register">{t.nav.register}</Link></span>
        </div>
      </div>
    </div>
  );
}
