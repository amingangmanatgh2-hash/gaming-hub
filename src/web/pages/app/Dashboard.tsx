import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, formatNumber, formatDateTime, formatDate, formatPrice } from '../../i18n';
import { api } from '../../api';
import { SkeletonRows, QuotaBar, Empty } from '../../components/ui';
import { IconChat, IconVideo, IconCard, IconSparkle } from '../../components/Icons';

interface DashData {
  user: { name: string; email: string; country_verified: string };
  subscription: { slug: string; ends_at: number | null; source: string } | null;
  plan: { name_fa: string; name_en: string; model_tier: string };
  quotas: { message: { used: number; limit: number }; video: { used: number; limit: number } };
  models_available: { chat: Array<{ id: string; name: string; tier: string }>; video: Array<{ id: string; name: string; tier: string }> };
  recent: {
    conversations: Array<{ id: string; title: string; updated_at: number }>;
    videos: Array<{ id: string; prompt: string; status: string; created_at: number }>;
    transactions: Array<{ id: string; amount: number; currency: string; method: string; status: string; created_at: number }>;
  };
  usage_history: Array<{ day: string; message: number; video: number }>;
}

const TX_BADGE: Record<string, string> = { paid: 'green', pending: 'amber', failed: 'red', canceled: 'red', rejected: 'red', refunded: 'blue' };

export default function Dashboard() {
  const { t, locale, fmt } = useI18n();
  const D = t.dash;
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get<DashData>('/api/account/dashboard').then(setData).catch(() => setError(true));
  }, []);

  if (error) return <Empty title={t.common.error_generic} />;
  if (!data) return <div className="col gap-l"><div className="skeleton" style={{ height: 120 }} /><SkeletonRows n={3} h={90} /></div>;

  const maxMsg = Math.max(...data.usage_history.map((u) => u.message), 1);

  return (
    <div className="col gap-xl">
      <div className="row between wrap">
        <div>
          <h1>{D.title}</h1>
          <p className="muted mt-s">{fmt(D.welcome, { name: data.user.name || data.user.email })}</p>
        </div>
        <Link to="/app/pricing" className="btn primary"><IconSparkle size={16} /> {D.upgrade}</Link>
      </div>

      {/* top stats */}
      <div className="grid-3">
        <div className="card stat">
          <span className="small muted">{D.plan}</span>
          <span className="val">{locale === 'fa' ? data.plan.name_fa : data.plan.name_en}</span>
          <span className="tiny">{D.renewal}: {data.subscription?.ends_at ? formatDate(data.subscription.ends_at, locale) : D.no_expiry}</span>
        </div>
        <div className="card col" style={{ justifyContent: 'center' }}>
          <QuotaBar used={data.quotas.message.used} limit={data.quotas.message.limit} label={D.quota_messages} />
        </div>
        <div className="card col" style={{ justifyContent: 'center' }}>
          <QuotaBar used={data.quotas.video.used} limit={data.quotas.video.limit} label={D.quota_videos} />
        </div>
      </div>

      {/* usage chart */}
      <div className="card">
        <h3 className="mb">{D.usage_history}</h3>
        {data.usage_history.length === 0 ? <p className="muted small">{D.no_data}</p> : (
          <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 110 }} aria-hidden="true">
            {data.usage_history.map((u) => (
              <div key={u.day} className="grow col" style={{ alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', maxWidth: 30, borderRadius: '6px 6px 0 0', background: 'linear-gradient(180deg,#34d399,#065f46)', height: `${Math.max(4, (u.message / maxMsg) * 100)}%`, transition: 'height .4s' }} title={`${u.day}: ${u.message}`} />
                <span className="tiny num" style={{ fontSize: '0.6rem' }}>{u.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* recent conversations */}
        <div className="card">
          <div className="row between mb"><h3>{D.recent_chats}</h3><Link className="small" to="/app/chat">{t.common.view_all}</Link></div>
          {data.recent.conversations.length === 0 ? (
            <Empty icon={<IconChat size={26} />} title={D.no_data} action={<Link className="btn sm primary" to="/app/chat">{t.nav.chat}</Link>} />
          ) : (
            <div className="col gap-s">
              {data.recent.conversations.map((c) => (
                <Link key={c.id} to={`/app/chat/${c.id}`} className="card flat row between" style={{ padding: '10px 14px' }}>
                  <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  <span className="tiny num">{formatDateTime(c.updated_at, locale)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* recent videos */}
        <div className="card">
          <div className="row between mb"><h3>{D.recent_videos}</h3><Link className="small" to="/app/video">{t.common.view_all}</Link></div>
          {data.recent.videos.length === 0 ? (
            <Empty icon={<IconVideo size={26} />} title={D.no_data} action={<Link className="btn sm primary" to="/app/video">{t.nav.video}</Link>} />
          ) : (
            <div className="col gap-s">
              {data.recent.videos.map((v) => (
                <div key={v.id} className="card flat row between" style={{ padding: '10px 14px' }}>
                  <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{v.prompt || '—'}</span>
                  <span className={`badge ${TX_BADGE[v.status] || 'blue'}`}>{(t.video as Record<string, string>)[`status_${v.status}`] || v.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* payments */}
        <div className="card">
          <h3 className="mb row gap-s"><IconCard size={18} /> {D.payments}</h3>
          {data.recent.transactions.length === 0 ? <p className="muted small">{D.no_data}</p> : (
            <div className="col gap-s">
              {data.recent.transactions.map((tx) => (
                <div key={tx.id} className="card flat row between" style={{ padding: '10px 14px' }}>
                  <div className="col">
                    <span className="small num">{formatPrice(tx.amount, locale)}</span>
                    <span className="tiny">{(D as Record<string, string>)[`method_${tx.method}`] || tx.method} · {formatDateTime(tx.created_at, locale)}</span>
                  </div>
                  <span className={`badge ${TX_BADGE[tx.status] || ''}`}>{(D as Record<string, string>)[`status_${tx.status}`] || tx.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* models */}
        <div className="card">
          <h3 className="mb">{D.models}</h3>
          {data.models_available.chat.length === 0 && data.models_available.video.length === 0 ? (
            <p className="muted small">{D.no_data}</p>
          ) : (
            <div className="row wrap gap-s">
              {data.models_available.chat.map((m) => <span key={m.id} className="badge green"><IconChat size={12} /> {m.name}</span>)}
              {data.models_available.video.map((m) => <span key={m.id} className="badge blue"><IconVideo size={12} /> {m.name}</span>)}
            </div>
          )}
          <div className="mt">
            <span className="tiny">{t.settings.verified_country}: <b>{data.user.country_verified || t.settings.none}</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}
