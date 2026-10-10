import React, { useEffect, useState } from 'react';
import { useI18n, formatDateTime, formatPrice } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { SkeletonRows, Confirm, Empty, Modal } from '../../components/ui';
import { IconFlag, IconCheck, IconX } from '../../components/Icons';

interface Mp {
  id: string; transaction_id: string; sender_note: string; status: string;
  created_at: number; amount: number; plan_name: string | null; user_email: string | null;
  review_note: string;
}

export default function AdminReview() {
  const { t, locale } = useI18n();
  const A = t.admin;
  const toast = useToast();
  const [rows, setRows] = useState<Mp[] | null>(null);
  const [action, setAction] = useState<{ mp: Mp; decision: 'approved' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = () => api.get<{ manual_payments: Mp[] }>('/api/admin/manual-payments').then((d) => setRows(d.manual_payments)).catch(() => {});
  useEffect(() => { load(); }, []);

  const review = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/manual-payments/${action.mp.id}/review`, { decision: action.decision, note });
      toast.success(t.common.save);
      setAction(null); setNote('');
      load();
    } catch (e) { toast.error(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusy(false);
  };

  const visible = rows?.filter((m) => showDone || m.status === 'pending') ?? null;

  return (
    <div className="col gap-l">
      <div className="row between wrap">
        <h1>{A.manual_review}</h1>
        <label className="row gap-s small">
          <span className="switch"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /><span className="track" /></span>
          {t.common.view_all}
        </label>
      </div>
      {!visible ? <SkeletonRows n={4} h={80} /> : visible.length === 0 ? (
        <Empty icon={<IconFlag size={30} />} title={A.empty_pending} />
      ) : (
        <div className="col gap-s">
          {visible.map((mp) => (
            <div key={mp.id} className="card col gap-s">
              <div className="row between wrap">
                <div className="row gap-s wrap">
                  <b dir="ltr">{mp.user_email}</b>
                  <span className="badge">{mp.plan_name}</span>
                  <span className="badge num">{formatPrice(mp.amount, locale)}</span>
                  <span className={`badge ${mp.status === 'pending' ? 'amber' : mp.status === 'approved' ? 'green' : 'red'}`}>
                    {(t.dash as Record<string, string>)[`status_${mp.status}`] || mp.status}
                  </span>
                </div>
                <span className="tiny num">{formatDateTime(mp.created_at, locale)}</span>
              </div>
              {mp.sender_note && <p className="small muted">📝 {mp.sender_note}</p>}
              {mp.review_note && <p className="tiny dim">💬 {mp.review_note}</p>}
              {mp.status === 'pending' && (
                <div className="row end gap-s">
                  <button className="btn danger sm" onClick={() => { setAction({ mp, decision: 'rejected' }); }}><IconX size={14} /> {A.reject}</button>
                  <button className="btn primary sm" onClick={() => { setAction({ mp, decision: 'approved' }); }}><IconCheck size={14} /> {A.approve}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {action && (
        <Modal title={action.decision === 'approved' ? A.approve : A.reject} onClose={() => setAction(null)}>
          <div className="col">
            <p className="muted small">{action.decision === 'approved' ? A.approve_q : A.reject_q}</p>
            <input className="input" placeholder={A.review_note} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row end gap-s mt">
              <button className="btn ghost" onClick={() => setAction(null)}>{t.common.cancel}</button>
              <button className={`btn ${action.decision === 'approved' ? 'primary' : 'danger'}`} disabled={busy} onClick={review}>
                {action.decision === 'approved' ? A.approve : A.reject}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
