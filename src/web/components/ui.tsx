import React, { useEffect, useRef, useState } from 'react';
import { useI18n, formatNumber } from '../i18n';
import { api, ApiException } from '../api';

// ---------- Spinner / loading ----------
export function Spinner({ lg }: { lg?: boolean }) {
  return <span className={`spinner ${lg ? 'lg' : ''}`} role="progressbar" aria-label="loading" />;
}

export function PageLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
      <Spinner lg />
    </div>
  );
}

export function SkeletonRows({ n = 3, h = 54 }: { n?: number; h?: number }) {
  return (
    <div className="col">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: h }} />
      ))}
    </div>
  );
}

// ---------- Empty state ----------
export function Empty({ icon, title, sub, action }: { icon?: React.ReactNode; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="icon">{icon}</div>}
      <h3>{title}</h3>
      {sub && <p className="muted" style={{ maxWidth: 480 }}>{sub}</p>}
      {action}
    </div>
  );
}

// ---------- Modal ----------
export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus();
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { maxWidth: 760 } : undefined}>
        <div className="row between mb">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Confirmation dialog ----------
export function Confirm({ title, message, confirmText, danger, onConfirm, onClose, busy }: {
  title: string; message: string; confirmText?: string; danger?: boolean;
  onConfirm: () => void; onClose: () => void; busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted" style={{ lineHeight: 2 }}>{message}</p>
      <div className="row end mt-l">
        <button className="btn ghost" onClick={onClose}>{t.common.cancel}</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>
          {busy && <Spinner />} {confirmText || t.common.confirm}
        </button>
      </div>
    </Modal>
  );
}

// ---------- Field wrapper ----------
export function Field({ label, hint, error, children }: {
  label?: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

// ---------- Reauthentication modal (sensitive ops) ----------
export function ReauthModal({ onDone, onClose }: { onDone: (token: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post<{ reauth_token: string }>('/api/auth/reauth', { password });
      onDone(r.reauth_token);
    } catch (e) {
      setError(e instanceof ApiException ? e.fa : t.common.error_generic);
      setBusy(false);
    }
  };
  return (
    <Modal title={t.admin.reauth_title} onClose={onClose}>
      <p className="muted small">{t.admin.reauth_sub}</p>
      <div className="col mt">
        <Field label={t.auth.password} error={error}>
          <input className="input" type="password" dir="ltr" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        <button className="btn primary block mt-s" onClick={submit} disabled={busy || !password}>
          {busy && <Spinner />} {t.common.confirm}
        </button>
      </div>
    </Modal>
  );
}

// ---------- Quota bar ----------
export function QuotaBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const { t, fmt, locale } = useI18n();
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="col gap-s">
      <div className="row between">
        <span className="small">{label}</span>
        <span className="tiny num">{fmt(t.dash.used_of, { used: formatNumber(used, locale), limit: formatNumber(limit, locale) })}</span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--danger)' : undefined }} />
      </div>
    </div>
  );
}
