import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { useStore } from '../../store';
import { Field, Spinner, Confirm, ReauthModal, Modal } from '../../components/ui';
import { IconShield, IconGlobe, IconDownload, IconWarn } from '../../components/Icons';

export default function Settings() {
  const { t, locale, setLocale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const { me, refreshMe, config } = useStore();
  const S = t.settings;
  const user = me?.user;

  const [profile, setProfile] = useState({ name: user?.name || '', country_code: user?.country_code || '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [busySection, setBusySection] = useState('');
  const [error, setError] = useState('');
  // delete flow: closed → confirm → reauth → type (DELETE)
  const [delStep, setDelStep] = useState<'closed' | 'confirm' | 'reauth' | 'type'>('closed');
  const [delText, setDelText] = useState('');
  const [reauthToken, setReauthToken] = useState('');

  if (!user) return null;

  const saveProfile = async () => {
    setBusySection('profile'); setError('');
    try {
      await api.put('/api/account/profile', { name: profile.name, country_code: profile.country_code, locale });
      await refreshMe();
      toast.success(S.profile_saved);
    } catch (e) { setError(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusySection('');
  };

  const changePw = async () => {
    setBusySection('pw'); setError('');
    try {
      await api.post('/api/account/password', pw);
      toast.success(S.password_changed);
      await refreshMe();
      nav('/auth/login');
    } catch (e) { setError(e instanceof ApiException ? e.fa : t.common.error_generic); setBusySection(''); }
  };

  const doDelete = async () => {
    setBusySection('del');
    try {
      await api.post('/api/account/delete', { confirmation: 'DELETE', reauth_token: reauthToken });
      toast.success(S.delete_account);
      await refreshMe();
      nav('/');
    } catch (e) {
      toast.error(e instanceof ApiException ? e.fa : t.common.error_generic);
      setBusySection('');
      setDelStep('closed');
    }
  };

  return (
    <div className="col gap-xl" style={{ maxWidth: 760 }}>
      <h1>{S.title}</h1>

      {/* Profile */}
      <div className="card col gap-l">
        <h3>{S.profile}</h3>
        <div className="grid-2">
          <Field label={t.auth.name}>
            <input className="input" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          <Field label={t.auth.country}>
            <select className="select" value={profile.country_code} onChange={(e) => setProfile((p) => ({ ...p, country_code: e.target.value }))}>
              {(config?.countries || []).map((c) => <option key={c.code} value={c.code}>{locale === 'fa' ? c.fa : c.en}</option>)}
            </select>
          </Field>
        </div>
        <div className="row between wrap">
          <div className="col gap-s">
            <span className="tiny">{S.verified_country}: <span className={`badge ${user.country_verified ? 'green' : ''}`}>{user.country_verified || S.none}</span></span>
            <span className="tiny">{S.email_status}: <span className={`badge ${user.email_verified ? 'green' : 'amber'}`}>{user.email_verified ? S.verified : S.unverified}</span></span>
            <span className="tiny dim">{S.verified_country_hint}</span>
          </div>
          <button className="btn primary" onClick={saveProfile} disabled={busySection === 'profile'}>
            {busySection === 'profile' && <Spinner />} {t.common.save}
          </button>
        </div>
        {error && <p className="error-text small">{error}</p>}
      </div>

      {/* Preferences */}
      <div className="card col gap-l">
        <h3 className="row gap-s"><IconGlobe size={18} /> {S.preferences}</h3>
        <Field label={S.language}>
          <div className="row gap-s">
            <button className={`btn sm ${locale === 'fa' ? 'primary' : 'ghost'}`} onClick={() => setLocale('fa')}>فارسی</button>
            <button className={`btn sm ${locale === 'en' ? 'primary' : 'ghost'}`} onClick={() => setLocale('en')}>English</button>
          </div>
        </Field>
      </div>

      {/* Security */}
      <div className="card col gap-l">
        <h3 className="row gap-s"><IconShield size={18} /> {S.security}</h3>
        <div className="grid-2">
          <Field label={t.auth.password_current}>
            <input className="input" dir="ltr" type="password" value={pw.current_password} autoComplete="current-password"
              onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))} />
          </Field>
          <Field label={t.auth.password_new} hint={t.auth.password_hint}>
            <input className="input" dir="ltr" type="password" value={pw.new_password} autoComplete="new-password"
              onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))} />
          </Field>
        </div>
        <div className="row end">
          <button className="btn" disabled={busySection === 'pw' || !pw.current_password || !pw.new_password} onClick={changePw}>
            {busySection === 'pw' && <Spinner />} {S.change_password}
          </button>
        </div>
      </div>

      {/* Data & danger */}
      <div className="card col gap-l" style={{ borderColor: 'rgba(248,113,113,0.25)' }}>
        <h3 className="row gap-s" style={{ color: 'var(--danger)' }}><IconWarn size={18} /> {S.danger_zone}</h3>
        <div className="row between wrap">
          <div className="col gap-s">
            <b className="small">{S.export_data}</b>
            <span className="tiny dim">{S.export_hint}</span>
          </div>
          <a className="btn ghost sm" href="/api/account/export" download><IconDownload size={15} /> {S.export_data}</a>
        </div>
        <div className="row between wrap">
          <div className="col gap-s">
            <b className="small">{S.delete_account}</b>
            <span className="tiny dim">{S.delete_hint}</span>
          </div>
          <button className="btn danger sm" onClick={() => setDelStep('confirm')}>{S.delete_account}</button>
        </div>
      </div>

      {/* Delete flow modals */}
      {delStep === 'confirm' && (
        <Confirm title={S.delete_account} message={S.delete_hint} danger
          confirmText={t.common.confirm}
          onClose={() => setDelStep('closed')}
          onConfirm={() => setDelStep('reauth')} />
      )}
      {delStep === 'reauth' && (
        <ReauthModal
          onClose={() => setDelStep('closed')}
          onDone={(token) => { setReauthToken(token); setDelStep('type'); }} />
      )}
      {delStep === 'type' && (
        <Modal title={S.delete_account} onClose={() => setDelStep('closed')}>
          <div className="col">
            <p className="muted small">{S.delete_confirm_text}</p>
            <input className="input" dir="ltr" value={delText} onChange={(e) => setDelText(e.target.value)} placeholder="DELETE" />
            <div className="row end mt">
              <button className="btn ghost" onClick={() => setDelStep('closed')}>{t.common.cancel}</button>
              <button className="btn danger" disabled={delText !== 'DELETE' || busySection === 'del'} onClick={doDelete}>
                {busySection === 'del' && <Spinner />} {t.common.delete}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
