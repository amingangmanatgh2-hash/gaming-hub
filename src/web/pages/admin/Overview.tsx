import React, { useEffect, useState } from 'react';
import { useI18n, formatNumber, formatPrice } from '../../i18n';
import { api } from '../../api';
import { SkeletonRows } from '../../components/ui';
import { Link } from 'react-router-dom';

interface Overview {
  users_total: number; users_new_24h: number;
  active_subscriptions_by_plan: Array<{ slug: string; n: number }>;
  payments: { settled_count: number; settled_total_irr: number; pending: number };
  usage_24h: { messages: number; video_jobs: number };
  pending_manual_payments: number;
  config: { providers_enabled: number; models_enabled: number };
}

export default function AdminOverview() {
  const { t, locale } = useI18n();
  const A = t.admin;
  const [d, setD] = useState<Overview | null>(null);

  useEffect(() => { api.get<Overview>('/api/admin/overview').then(setD).catch(() => {}); }, []);
  if (!d) return <SkeletonRows n={4} h={100} />;

  const stats = [
    { label: A.stats_users, val: d.users_total },
    { label: A.stats_users_24h, val: d.users_new_24h },
    { label: A.stats_messages, val: d.usage_24h.messages },
    { label: A.stats_videos, val: d.usage_24h.video_jobs },
    { label: A.stats_revenue, val: formatPrice(d.payments.settled_total_irr, locale), raw: true },
    { label: A.stats_pending_tx, val: d.payments.pending },
    { label: A.stats_pending_manual, val: d.pending_manual_payments },
    { label: A.stats_providers, val: d.config.providers_enabled },
  ];

  return (
    <div className="col gap-xl">
      <h1>{A.overview}</h1>
      <div className="grid-4">
        {stats.map((s) => (
          <div key={s.label} className="card stat">
            <span className="tiny">{s.label}</span>
            <span className="val num" style={{ fontSize: '1.5rem' }}>{s.raw ? s.val : formatNumber(Number(s.val), locale)}</span>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="mb">{A.plans}</h3>
          <div className="col gap-s">
            {d.active_subscriptions_by_plan.map((p) => (
              <div key={p.slug} className="row between">
                <span className="badge">{p.slug}</span>
                <span className="num">{formatNumber(p.n, locale)}</span>
              </div>
            ))}
            {d.active_subscriptions_by_plan.length === 0 && <p className="muted small">—</p>}
          </div>
        </div>
        <div className="card">
          <h3 className="mb">{t.common.actions}</h3>
          <div className="col gap-s">
            <Link className="btn ghost" to="/admin/providers">{A.providers}</Link>
            <Link className="btn ghost" to="/admin/plans">{A.plans}</Link>
            <Link className="btn ghost" to="/admin/payments">{A.payments}</Link>
            <Link className="btn ghost" to="/admin/review">{A.manual_review}{d.pending_manual_payments > 0 ? ` (${formatNumber(d.pending_manual_payments, locale)})` : ''}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
