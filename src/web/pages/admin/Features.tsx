import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { SkeletonRows, Spinner } from '../../components/ui';
import { useStore } from '../../store';

const FLAG_LABELS: Record<string, string> = {
  chat: '💬 چت', video: '🎬 استودیو ویدیو', payments: '💳 پرداخت', registration: '📝 ثبت‌نام',
  google_auth: '🔐 ورود با گوگل', manual_transfer: '🏦 کارت‌به‌کارت', maintenance_mode: '🔧 حالت تعمیرات',
};

export default function AdminFeatures() {
  const { t } = useI18n();
  const A = t.admin;
  const toast = useToast();
  const { refreshConfig } = useStore();
  const [flags, setFlags] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ features: Record<string, boolean> }>('/api/admin/settings').then((d) => setFlags(d.features)).catch(() => {});
  }, []);

  const save = async (next: Record<string, boolean>) => {
    setBusy(true);
    try {
      await api.put('/api/admin/settings/features', next);
      setFlags(next);
      await refreshConfig();
      toast.success(A.feat_saved);
    } catch (e) { toast.error(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusy(false);
  };

  if (!flags) return <SkeletonRows n={5} h={70} />;

  return (
    <div className="col gap-l" style={{ maxWidth: 640 }}>
      <h1>{A.features}</h1>
      <div className="card col gap-l">
        {busy && <Spinner />}
        {Object.entries(flags).map(([k, v]) => (
          <div key={k} className="row between">
            <div className="col gap-s">
              <b className="small">{FLAG_LABELS[k] || k}</b>
              {k === 'maintenance_mode' && <span className="tiny dim">{A.feat_maintenance_sub}</span>}
            </div>
            <span className="switch">
              <input type="checkbox" checked={v} disabled={busy}
                onChange={(e) => save({ ...flags, [k]: e.target.checked })} />
              <span className="track" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
