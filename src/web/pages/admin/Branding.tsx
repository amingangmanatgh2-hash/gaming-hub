import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { api, ApiException } from '../../api';
import { useToast } from '../../components/Toast';
import { SkeletonRows, Field, Spinner } from '../../components/ui';
import { useStore } from '../../store';

interface Country { code: string; fa: string; en: string; currency: string; locales: string[]; features: Record<string, boolean> }
interface SiteForm { name_fa: string; name_en: string; tagline_fa: string; tagline_en: string; default_locale: string; logo_text: string }

export default function AdminBranding() {
  const { t } = useI18n();
  const A = t.admin;
  const toast = useToast();
  const { refreshConfig } = useStore();
  const [site, setSite] = useState<SiteForm | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api.get<{ site: SiteForm; countries: Country[] }>('/api/admin/settings').then((d) => {
      setSite(d.site); setCountries(d.countries);
    }).catch(() => {});
  }, []);

  const saveSite = async () => {
    if (!site) return;
    setBusy('site');
    try {
      await api.put('/api/admin/settings/site', site);
      await refreshConfig();
      toast.success(A.brand_saved);
    } catch (e) { toast.error(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusy('');
  };

  const saveCountries = async (next: Country[]) => {
    setBusy('countries');
    try {
      await api.put('/api/admin/settings/countries', next);
      setCountries(next);
      await refreshConfig();
      toast.success(A.feat_saved);
    } catch (e) { toast.error(e instanceof ApiException ? e.fa : t.common.error_generic); }
    setBusy('');
  };

  if (!site) return <SkeletonRows n={4} h={80} />;

  return (
    <div className="col gap-l" style={{ maxWidth: 820 }}>
      <h1>{A.branding}</h1>

      <div className="card col gap-l">
        <h3>{t.setup.site_info}</h3>
        <div className="grid-2">
          <Field label={t.setup.site_name_fa}><input className="input" value={site.name_fa} onChange={(e) => setSite({ ...site, name_fa: e.target.value })} /></Field>
          <Field label={t.setup.site_name_en}><input className="input" dir="ltr" value={site.name_en} onChange={(e) => setSite({ ...site, name_en: e.target.value })} /></Field>
          <Field label={A.tagline_fa}><input className="input" value={site.tagline_fa} onChange={(e) => setSite({ ...site, tagline_fa: e.target.value })} /></Field>
          <Field label={A.tagline_en}><input className="input" dir="ltr" value={site.tagline_en} onChange={(e) => setSite({ ...site, tagline_en: e.target.value })} /></Field>
          <Field label={t.setup.default_lang}>
            <select className="select" value={site.default_locale} onChange={(e) => setSite({ ...site, default_locale: e.target.value })}>
              <option value="fa">فارسی</option><option value="en">English</option>
            </select>
          </Field>
          <Field label="لوگو (متن کوتاه)"><input className="input" dir="ltr" maxLength={8} value={site.logo_text} onChange={(e) => setSite({ ...site, logo_text: e.target.value })} /></Field>
        </div>
        <div className="row end">
          <button className="btn primary" disabled={busy === 'site'} onClick={saveSite}>{busy === 'site' && <Spinner />} {t.common.save}</button>
        </div>
      </div>

      <div className="card col gap-l">
        <h3>کشورها و دسترسی منطقه‌ای قابلیت‌ها</h3>
        <p className="tiny dim">برای هر کشور مشخص کنید کدام قابلیت‌ها برای حساب‌های «تأییدشده» آن کشور فعال است.</p>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>کشور</th><th>ارز</th><th>💬 چت</th><th>🎬 ویدیو</th><th>💳 پرداخت</th></tr></thead>
            <tbody>
              {countries.map((c, i) => (
                <tr key={c.code}>
                  <td><b>{c.fa}</b> <span className="tiny">({c.code})</span></td>
                  <td className="num">{c.currency}</td>
                  {['chat', 'video', 'payments'].map((f) => (
                    <td key={f}>
                      <span className="switch" style={{ transform: 'scale(0.85)' }}>
                        <input type="checkbox" checked={c.features?.[f] !== false}
                          onChange={(e) => {
                            const next = countries.map((x, j) => j === i ? { ...x, features: { ...x.features, [f]: e.target.checked } } : x);
                            saveCountries(next);
                          }} />
                        <span className="track" />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {busy === 'countries' && <Spinner />}
      </div>
    </div>
  );
}
