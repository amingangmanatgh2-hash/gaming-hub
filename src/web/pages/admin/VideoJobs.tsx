import React, { useEffect, useState } from 'react';
import { useI18n, formatDateTime } from '../../i18n';
import { api } from '../../api';
import { SkeletonRows } from '../../components/ui';

interface Job {
  id: string; status: string; model_key: string; aspect_ratio: string; duration_seconds: number;
  error: string | null; created_at: number; user_email: string | null; counted_quota: number;
}

const STATUS: Record<string, string> = { queued: 'blue', running: 'amber', succeeded: 'green', failed: 'red' };

export default function AdminVideoJobs() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<Job[] | null>(null);

  useEffect(() => {
    api.get<{ jobs: Job[] }>('/api/admin/video-jobs').then((d) => setRows(d.jobs)).catch(() => setRows([]));
  }, []);

  return (
    <div className="col gap-l">
      <h1>{t.admin.video_jobs}</h1>
      {!rows ? <SkeletonRows n={8} /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>{t.admin.tx_time}</th><th>{t.admin.tx_user}</th><th>{t.admin.model_display || 'model'}</th>
              <th>{t.common.status}</th><th>quota</th><th>خطا</th>
            </tr></thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id}>
                  <td className="num">{formatDateTime(j.created_at, locale)}</td>
                  <td dir="ltr">{j.user_email || '—'}</td>
                  <td><code className="tiny">{j.model_key}</code> <span className="tiny num" dir="ltr">{j.aspect_ratio} · {j.duration_seconds}s</span></td>
                  <td><span className={`badge ${STATUS[j.status] || ''}`}>{(t.video as Record<string, string>)[`status_${j.status}`] || j.status}</span></td>
                  <td>{j.counted_quota ? '✓' : '—'}</td>
                  <td className="tiny" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.error || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}>—</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
