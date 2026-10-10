import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="ambient" />
      <div style={{ minHeight: '80vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '5rem', fontWeight: 800, background: 'linear-gradient(135deg,#ecf7f1,#6ee7b7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>404</div>
          <p className="muted mb">{t.errors.not_found}</p>
          <Link to="/" className="btn primary">{t.nav.home}</Link>
        </div>
      </div>
    </div>
  );
}
