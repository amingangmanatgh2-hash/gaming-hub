import React, { useEffect, useState } from 'react';
import { useI18n, formatDateTime, formatPrice } from '../../i18n';
import { api } from '../../api';
import { SkeletonRows } from '../../components/ui';

interface Tx {
  id: string; user_email: string | null; amount: number; currency: string; method: string;
  status: string; ref_id: string | null; description: string; created_at: number; verified_at: number | null;
  plan_name: string | null;
}

const STATUS: Record<string, string> = { paid: 'green', pending: 'amber', failed: 'red', canceled: 'red', rejected: 'red', refunded: 'blue' };

export default function AdminTransactions() {
  const { t, locale } = useI18n();
  const A = t.admin;
  const [rows, setRows] = useState<Tx[] | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setRows(null);
    api.get<{ transactions: Tx[] }>(`/api/admin/transactions?page=${page}${status ? `&status=${status}` : ''}`)
      .then((d) => setRows(d.transactions)).catch(() => setRows([]));
  }, [page, status]);

  return (
    <div className="col gap-l">
      <div className="row between wrap">
        <h1>{A.transactions}</h1>
        <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t.common.status}: —</option>
          {['paid', 'pending', 'failed', 'rejected', 'refunded'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {!rows ? <SkeletonRows n={8} /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>{A.tx_user}</th><th>{A.tx_plan}</th><th>{A.tx_amount}</th><th>{A.tx_method}</th>
              <th>{t.common.status}</th><th>{A.tx_ref}</th><th>{A.tx_time}</th>
            </tr></thead>
            <tbody>
              {rows.map((tx) => (
                <tr key={tx.id}>
                  <td dir="ltr">{tx.user_email || '—'}</td>
                  <td>{tx.plan_name || '—'}</td>
                  <td className="num">{formatPrice(tx.amount, locale)}</td>
                  <td><span className="badge">{(t.dash as Record<string, string>)[`method_${tx.method}`] || tx.method}</span></td>
                  <td><span className={`badge ${STATUS[tx.status] || ''}`}>{(t.dash as Record<string, string>)[`status_${tx.status}`] || tx.status}</span></td>
                  <td className="num" dir="ltr">{tx.ref_id || '—'}</td>
                  <td className="num">{formatDateTime(tx.created_at, locale)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}>—</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="row end gap-s">
        <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
        <span className="small num">{page + 1}</span>
        <button className="btn ghost sm" disabled={!rows || rows.length < 50} onClick={() => setPage((p) => p + 1)}>›</button>
      </div>
    </div>
  );
}
