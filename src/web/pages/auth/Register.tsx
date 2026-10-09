import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { useStore } from '../../store';
import { Field, Spinner } from '../../components/ui';
import { IconGoogle } from '../../components/Icons';

export default function Register() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const { refreshMe, config } = useStore();
  const [form, setForm] = useState({ name: '', email: '', password: '', country_code: 'IR' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [googleMsg, setGoogleMsg] = useState('');

  const googleEnabled = Boolean(config?.google?.enabled && config?.google?.configured);
  const countryList = config?.countries || [];
  const registrationOpen = config?.features?.registration !== false;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post<{ requires_verification: boolean; dev_code?: string }>('/api/auth/register', {
        ...form, locale,
      });
      await refreshMe();
      toast.success(t.auth.register_success);
      if (r.dev_code) {
        // Dev mode only (when no email service is configured)
        toast.info(`کد تأیید (حالت توسعه): ${r.dev_code}`);
      }
      nav(r.requires_verification ? '/auth/verify' : '/app/chat', { replace: true });
    } catch (err) {
      setError(err instanceof ApiException ? err.fa : t.common.error_generic);
      setBusy(false);
    }
  };

  if (!registrationOpen) {
    return (
      <div className="auth-layout"><div className="card auth-card">
        <h2>{t.auth.register_title}</h2>
        <p className="muted mt">{t.errors.forbidden} — {t.common.unavailable}</p>
      </div></div>
    );
  }

  return (
    <div className="auth-layout">
      <div className="card auth-card">
        <h2>{t.auth.register_title}</h2>
        <p className="muted small mt-s">{t.auth.register_sub}</p>

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
          <Field label={t.auth.name}>
            <input className="input" required value={form.name} onChange={set('name')} placeholder={locale === 'fa' ? 'مثلاً: امین محمدی' : 'e.g. Amin M'} />
          </Field>
          <Field label={t.auth.email}>
            <input className="input" type="email" dir="ltr" required value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
          </Field>
          <Field label={t.auth.password} hint={t.auth.password_hint}>
            <input className="input" type="password" dir="ltr" required value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete="new-password" />
          </Field>
          <Field label={t.auth.country} hint={t.auth.country_hint}>
            <select className="select" value={form.country_code} onChange={set('country_code')}>
              {countryList.map((c) => (
                <option key={c.code} value={c.code}>{locale === 'fa' ? c.fa : c.en}</option>
              ))}
            </select>
          </Field>
          {error && <p className="error-text small">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy && <Spinner />} {t.nav.register}</button>
        </form>

        <p className="small mt muted">{t.auth.have_account} <Link to="/auth/login">{t.nav.login}</Link></p>
      </div>
    </div>
  );
}
