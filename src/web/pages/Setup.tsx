import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, ApiException } from '../api';
import { useToast } from '../components/Toast';
import { useStore } from '../store';
import { Field, Spinner } from '../components/ui';
import { IconShield, IconCheck } from '../components/Icons';

export default function Setup() {
  const { t } = useI18n(); // Wizard UI strings (Persian-first, English fallback)
  const toast = useToast();
  const nav = useNavigate();
  const { refreshMe, setupRequired } = useStore();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    admin_name: '', admin_email: '', admin_password: '', admin_password2: '',
    site_name_fa: 'امین‌ای‌آی الترا', site_name_en: 'AMIN AI ULTRA', default_locale: 'fa' as 'fa' | 'en',
  });

  useEffect(() => {
    if (setupRequired === false) nav('/', { replace: true });
  }, [setupRequired, nav]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const step0Valid = form.admin_name.trim().length >= 1
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_email)
    && form.admin_password.length >= 10
    && /[a-zA-Z]/.test(form.admin_password) && /[0-9]/.test(form.admin_password)
    && form.admin_password === form.admin_password2;

  const finish = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/api/setup', {
        admin_name: form.admin_name,
        admin_email: form.admin_email,
        admin_password: form.admin_password,
        site_name_fa: form.site_name_fa,
        site_name_en: form.site_name_en,
        default_locale: form.default_locale,
      });
      await refreshMe();
      setStep(2);
    } catch (e) {
      setError(e instanceof ApiException ? e.fa : t.common.error_generic);
      if (e instanceof ApiException && e.code === 'setup_completed') nav('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="ambient" />
      <div className="auth-layout" dir={form.default_locale === 'fa' ? 'rtl' : 'ltr'}>
        <div className="card" style={{ width: '100%', maxWidth: 560 }}>
          <div className="row gap-s mb">
            <span className="badge green"><IconShield size={14} /> {t.setup.title}</span>
          </div>
          <div className="wizard-steps mb">
            {[0, 1, 2].map((i) => <div key={i} className={`wizard-step ${step >= i ? 'done' : ''}`} />)}
          </div>

          {step === 0 && (
            <>
              <h2>{t.setup.admin_account}</h2>
              <p className="muted small mt-s">{t.setup.admin_account_sub}</p>
              <div className="col mt-l">
                <Field label={t.auth.name}>
                  <input className="input" value={form.admin_name} onChange={set('admin_name')} placeholder="نام مدیر سامانه" />
                </Field>
                <Field label={t.auth.email}>
                  <input className="input" dir="ltr" type="email" value={form.admin_email} onChange={set('admin_email')} placeholder="admin@example.com" />
                </Field>
                <Field label={t.auth.password} hint={t.auth.password_hint}>
                  <input className="input" dir="ltr" type="password" value={form.admin_password} onChange={set('admin_password')} autoComplete="new-password" />
                </Field>
                <Field label={t.auth.password + ' (تکرار)'}>
                  <input className="input" dir="ltr" type="password" value={form.admin_password2} onChange={set('admin_password2')} autoComplete="new-password" />
                </Field>
                {form.admin_password2 && form.admin_password !== form.admin_password2 && (
                  <span className="error-text small">گذرواژه و تکرار آن یکسان نیستند.</span>
                )}
                <div className="row end mt">
                  <button className="btn primary" disabled={!step0Valid} onClick={() => setStep(1)}>{t.setup.next}</button>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2>{t.setup.site_info}</h2>
              <p className="muted small mt-s">{t.setup.sub}</p>
              <div className="col mt-l">
                <Field label={t.setup.site_name_fa}>
                  <input className="input" value={form.site_name_fa} onChange={set('site_name_fa')} />
                </Field>
                <Field label={t.setup.site_name_en}>
                  <input className="input" dir="ltr" value={form.site_name_en} onChange={set('site_name_en')} />
                </Field>
                <Field label={t.setup.default_lang}>
                  <select className="select" value={form.default_locale} onChange={set('default_locale')}>
                    <option value="fa">فارسی (راست‌به‌چپ)</option>
                    <option value="en">English (left-to-right)</option>
                  </select>
                </Field>
                <p className="tiny">{t.setup.security_note}</p>
                {error && <p className="error-text small">{error}</p>}
                <div className="row between mt">
                  <button className="btn ghost" onClick={() => setStep(0)}>{t.setup.prev}</button>
                  <button className="btn primary" disabled={busy} onClick={finish}>
                    {busy && <Spinner />} {t.setup.finish}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <div style={{ textAlign: 'center', padding: '26px 0' }}>
              <div className="feature-icon" style={{ margin: '0 auto 18px', width: 74, height: 74, borderRadius: 24 }}>
                <IconCheck size={36} />
              </div>
              <h2>{t.setup.done_title}</h2>
              <p className="muted mt" style={{ maxWidth: 420, margin: '12px auto 0' }}>{t.setup.done_sub}</p>
              <button className="btn primary lg mt-l" onClick={() => { toast.success(t.setup.done_title); nav('/admin'); }}>
                {t.setup.go_admin}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
