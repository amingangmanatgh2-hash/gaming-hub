import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { IconCheck, IconX } from '../../components/Icons';
import { useStore } from '../../store';

export default function PayResult() {
  const { t } = useI18n();
  const [params] = useSearchParams();
 const { refreshMe } = useStore();
  const ok = params.get('status') === 'ok';
  const reason = params.get('reason') || '';
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    if (ok && !refreshed) { refreshMe(); setRefreshed(true); }
  }, [ok, refreshed, refreshMe]);

  return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div className="card" style={{ padding: 40 }}>
        <div className="feature-icon" style={{
          margin: '0 auto 20px', width: 80, height: 80, borderRadius: 26,
          background: ok ? 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(6,95,70,0.2))' : 'linear-gradient(135deg, rgba(248,113,113,0.22), rgba(153,27,27,0.15))',
          color: ok ? 'var(--accent-2)' : 'var(--danger)',
          borderColor: ok ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
        }}>
          {ok ? <IconCheck size={40} /> : <IconX size={40} />}
        </div>
        <h2>{ok ? t.pay.result_ok : t.pay.result_failed}</h2>
        <p className="muted mt">{ok ? t.pay.result_ok_sub : `${t.pay.result_failed_sub}${reason ? ` (${reason})` : ''}`}</p>
        <div className="row center gap-s mt-l">
          <Link to="/app/dashboard" className="btn primary">{t.pay.go_dashboard}</Link>
          <Link to="/app/pricing" className="btn ghost">{t.nav.pricing}</Link>
        </div>
      </div>
    </div>
  );
}
