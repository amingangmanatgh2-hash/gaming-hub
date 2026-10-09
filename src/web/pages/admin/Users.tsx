import React, { useCallback, useEffect, useState } from 'react';
import { useI18n, formatDateTime, formatNumber } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { SkeletonRows, Modal, Field, ReauthModal } from '../../components/ui';
import type { PlanInfo } from '../../api';

interface UserRow {
  id: string; email: string; name: string; role: 'user' | 'admin'; status: string;
  country_code: string; country_verified: string; locale: string; plan_slug: string | null;
  created_at: number; last_login_at: number | null;
}

interface UserDetail {
  user: UserRow & { country_verified_source: string };
  subscriptions: Array<{ id: string; status: string; plan_name: string; created_at: number; ends_at: number | null }>;
  transactions: Array<{ id: string; amount: number; method: string; status: string; ref_id: string | null; created_at: number }>;
  usage: Array<{ day: string; kind: string; count: number }>;
}

export default function AdminUsers() {
  const { t, locale } = useI18n();
  const A = t.admin;
  const toast = useToast();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [pendingRole, setPendingRole] = useState<{ id: string; role: 'user' | 'admin' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query = q) => {
    const d = await api.get<{ users: UserRow[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`);
    setRows(d.users);
  }, [q]);

  useEffect(() => { load('').catch(() => {}); api.get<{ plans: PlanInfo[] }>('/api/admin/plans').then((d) => setPlans(d.plans)).catch(() => {}); }, []); // eslint-disable-line

  const open = async (id: string) => {
    try {
      const d = await api.get<UserDetail>(`/api/admin/users/${id}`);
      setDetail(d);
    } catch { toast.error(t.common.error_generic); }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api.patch(`/api/admin/users/${id}`, body);
      toast.success(t.common.save);
      if (detail) open(id);
      load();
    } catch (e) {
      if (e instanceof ApiException && e.code === 'reauth_required') {
        setPendingRole(body.role ? { id, role: body.role as 'user' | 'admin' } : null);
      } else {
        toast.error(e instanceof ApiException ? e.fa : t.common.error_generic);
      }
    }
    setBusy(false);
  };

  const grantPlan = async (planId: string) => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/users/${detail.user.id}/subscription`, { plan_id: planId, action: 'activate', note: 'manual_admin' });
      toast.success(t.common.save);
      open(detail.user.id);
      load();
    } catch (e) { toast.error(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusy(false);
  };

  return (
    <div className="col gap-l">
      <div className="row between wrap">
        <h1>{A.users}</h1>
        <div className="row gap-s">
          <input className="input" style={{ width: 220 }} placeholder={t.common.search} value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          <button className="btn" onClick={() => load()}>{t.common.search}</button>
        </div>
      </div>

      {!rows ? <SkeletonRows n={6} /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>{A.user_email}</th><th>{A.user_name}</th><th>{A.user_plan}</th><th>{A.user_role}</th>
              <th>{A.user_country}</th><th>{t.common.status}</th><th>{A.user_joined}</th><th>{t.common.actions}</th>
            </tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td dir="ltr">{u.email}</td>
                  <td>{u.name || '—'}</td>
                  <td><span className="badge">{u.plan_slug || '—'}</span></td>
                  <td>{u.role === 'admin' ? <span className="badge amber">{A.user_role}: admin</span> : 'user'}</td>
                  <td>{u.country_verified ? <span className="badge green">{u.country_verified}</span> : (u.country_code || '—')}</td>
                  <td><span className={`badge ${u.status === 'active' ? 'green' : 'red'}`}>{(t.dash as Record<string, string>)[`status_${u.status}`] || u.status}</span></td>
                  <td className="num">{formatDateTime(u.created_at, locale)}</td>
                  <td><button className="btn ghost sm" onClick={() => open(u.id)}>{A.detail}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <Modal title={`${A.users} — ${detail.user.email}`} onClose={() => setDetail(null)} wide>
          <div className="col gap-l">
            <div className="row wrap gap-s">
              <span className="badge">{detail.user.role}</span>
              <span className={`badge ${detail.user.status === 'active' ? 'green' : 'red'}`}>{detail.user.status}</span>
              <span className="badge">{A.user_verified}: {detail.user.country_verified || '—'}{detail.user.country_verified_source ? ` (${detail.user.country_verified_source})` : ''}</span>
              <span className="badge num">{A.user_last_login}: {formatDateTime(detail.user.last_login_at, locale)}</span>
            </div>

            <div className="row wrap gap-s">
              {detail.user.status === 'active' ? (
                <button className="btn danger sm" disabled={busy} onClick={() => patch(detail.user.id, { status: 'suspended' })}>{A.suspend}</button>
              ) : (
                <button className="btn primary sm" disabled={busy} onClick={() => patch(detail.user.id, { status: 'active' })}>{A.unsuspend}</button>
              )}
              {detail.user.role !== 'admin' ? (
                <button className="btn sm" disabled={busy} onClick={() => patch(detail.user.id, { role: 'admin' })}>{A.make_admin}</button>
              ) : (
                <button className="btn sm" disabled={busy} onClick={() => patch(detail.user.id, { role: 'user' })}>{A.make_user}</button>
              )}
              <select className="select" style={{ width: 'auto' }} value={detail.user.country_verified}
                onChange={(e) => patch(detail.user.id, { country_verified: e.target.value })}>
                <option value="">{A.user_verified}: —</option>
                {['IR', 'US', 'AE', 'TR', 'DE'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <Field label={A.grant_plan}>
              <div className="row wrap gap-s">
                {plans.filter((p) => p.is_active).map((p) => (
                  <button key={p.id} className="btn ghost sm" disabled={busy} onClick={() => grantPlan(p.id)}>
                    {A.grant}: {locale === 'fa' ? p.name_fa : p.name_en}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid-2">
              <div>
                <h4 className="mb">{t.nav.pricing}</h4>
                <div className="col gap-s">
                  {detail.subscriptions.slice(0, 5).map((s) => (
                    <div key={s.id} className="card flat row between" style={{ padding: 10 }}>
                      <span className="small">{s.plan_name}</span>
                      <span className={`badge ${s.status === 'active' ? 'green' : ''}`}>{s.status}</span>
                    </div>
                  ))}
                  {detail.subscriptions.length === 0 && <p className="muted small">—</p>}
                </div>
              </div>
              <div>
                <h4 className="mb">{t.dash.payments}</h4>
                <div className="col gap-s">
                  {detail.transactions.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="card flat row between" style={{ padding: 10 }}>
                      <span className="small num">{formatNumber(tx.amount, locale)} {tx.method}</span>
                      <span className={`badge ${tx.status === 'paid' ? 'green' : tx.status === 'pending' ? 'amber' : 'red'}`}>{tx.status}</span>
                    </div>
                  ))}
                  {detail.transactions.length === 0 && <p className="muted small">—</p>}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {pendingRole && (
        <ReauthModal
          onClose={() => setPendingRole(null)}
          onDone={async (token) => {
            const pr = pendingRole;
            setPendingRole(null);
            await patch(pr.id, { role: pr.role, reauth_token: token });
          }} />
      )}
    </div>
  );
}
