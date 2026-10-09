import React, { useEffect, useState } from 'react';
import { useI18n, formatDateTime } from '../../i18n';
import { api } from '../../api';
import { SkeletonRows } from '../../components/ui';

interface Entry {
  id: string; action: string; target: string; meta_json: string; ip: string; created_at: number; actor_email: string | null;
}

export default function AdminAudit() {
  const { t, locale } = useI18n();
  const A = t.admin;
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setRows(null);
    api.get<{ entries: Entry[] }>(`/api/admin/audit?page=${page}`).then((d) => setRows(d.entries)).catch(() => setRows([]));
  }, [page]);

  return (
    <div className="col gap-l">
      <h1>{A.audit}</h1>
      {!rows ? <SkeletonRows n={10} /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{A.audit_time}</th><th>{A.audit_action}</th><th>{A.audit_actor}</th><th>{A.audit_target}</th><th>{A.audit_ip}</th><th>meta</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.created_at, locale)}</td>
                  <td><code className="tiny">{e.action}</code></td>
                  <td dir="ltr">{e.actor_email || '—'}</td>
                  <td dir="ltr" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.target || '—'}</td>
                  <td dir="ltr">{e.ip || '—'}</td>
                  <td><code className="tiny" style={{ maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.meta_json}</code></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}>—</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="row end gap-s">
        <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
        <span className="small num">{page + 1}</span>
        <button className="btn ghost sm" disabled={!rows || rows.length < 100} onClick={() => setPage((p) => p + 1)}>›</button>
      </div>
    </div>
  );
}
