import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n, formatPrice, formatNumber } from '../../i18n';
import { api, ApiException, type PlanInfo } from '../../api';
import { useToast } from '../../components/Toast';
import { useStore } from '../../store';
import { Spinner, Modal, Field } from '../../components/ui';
import { IconCheck, IconSparkle } from '../../components/Icons';

export default function Pricing({ publicView }: { publicView?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const { config, me } = useStore();
  const P = t.pricing;
  const [checkoutPlan, setCheckoutPlan] = useState<PlanInfo | null>(null);
  const [method, setMethod] = useState<'zarinpal' | 'manual'>('zarinpal');
  const [busy, setBusy] = useState(false);

  const plans = (config?.plans || []).filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const currentSlug = me?.plan?.slug;
  const payments = config?.payments;
  const zarinpalReady = Boolean(payments?.zarinpal_configured);
  const manualReady = Boolean(payments?.manual?.enabled && payments?.manual?.card_number);
  const canPay = zarinpalReady || manualReady;

  const features = (p: PlanInfo): string[] => {
    const f: string[] = [];
    f.push(`${formatNumber(p.daily_message_limit, locale)} ${P.messages_daily}`);
    f.push(`${formatNumber(p.daily_video_limit_default, locale)} ${P.videos_daily}`);
    if (p.daily_video_limit_ir !== p.daily_video_limit_default) {
      f.push(`${formatNumber(p.daily_video_limit_ir, locale)} ${P.videos_daily_ir}`);
    }
    f.push(`${formatNumber(p.upload_limit_mb, locale)} MB ${P.uploads}`);
    f.push(`${formatNumber(p.conversation_storage_limit || 20, locale)} ${P.conversations}`);
    f.push(p.model_tier === 'pro' ? P.tier_pro : p.model_tier === 'plus' ? P.tier_plus : P.tier_basic);
    if (p.features?.priority_queue) f.push(P.priority);
    if (p.features?.multi_model) f.push(P.multi_model);
    return f;
  };

  const startCheckout = async () => {
    if (!checkoutPlan || busy) return;
    if (!me?.user) { nav('/auth/login', { state: { from: '/pricing' } }); return; }
    setBusy(true);
    try {
      const idemp = crypto.randomUUID();
      const d = await api.post<{ method: string; payment_url?: string; transaction_id: string }>(
        '/api/payments/checkout', { plan_id: checkoutPlan.id, method, idempotency_key: idemp },
      );
      if (d.method === 'zarinpal' && d.payment_url) {
        window.location.href = d.payment_url;
        return;
      }
      // manual → go to receipt page
      nav('/pay/manual', { state: { transaction_id: d.transaction_id, plan: checkoutPlan } });
    } catch (e) {
      toast.error(e instanceof ApiException ? e.fa : t.common.error_generic);
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
        <h1>{P.title}</h1>
        <p className="muted mt-s">{P.sub}</p>
      </div>

      <div className="grid-3 mt-l">
        {plans.map((p, idx) => {
          const isCurrent = currentSlug === p.slug;
          const featured = idx === 1 && plans.length > 2;
          return (
            <div key={p.id} className={`card plan-card hoverable ${featured ? 'featured' : ''}`}>
              {featured && <span className="plan-ribbon">{P.popular}</span>}
              <div className="row between">
                <h3>{locale === 'fa' ? p.name_fa : p.name_en || p.name_fa}</h3>
                {isCurrent && <span className="badge green">{P.current_plan}</span>}
              </div>
              <p className="small muted">{locale === 'fa' ? p.description_fa : p.description_en || p.description_fa}</p>
              <div className="price">
                {formatPrice(p.price_irr, locale)}
                {!p.is_free && <small> / {formatNumber(p.duration_days, locale)} {t.common.day}</small>}
                {p.is_free && <small> · {P.free_forever}</small>}
              </div>
              <div className="col gap-s">
                {features(p).map((f) => (
                  <div key={f} className="plan-feature"><IconCheck size={15} /><span>{f}</span></div>
                ))}
              </div>
              <div className="grow" />
              {p.is_free ? (
                <button className="btn block" disabled={isCurrent} onClick={() => me?.user ? nav('/app/chat') : nav('/auth/register')}>
                  {isCurrent ? P.current_plan : P.choose}
                </button>
              ) : isCurrent ? (
                <button className="btn block" disabled>{P.current_plan}</button>
              ) : (
                <button className={`btn block ${featured ? 'primary' : ''}`} onClick={() => me?.user || !publicView ? setCheckoutPlan(p) : nav('/auth/login', { state: { from: '/pricing' } })}>
                  <IconSparkle size={16} /> {P.buy}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* checkout modal */}
      {checkoutPlan && (
        <Modal title={`${P.buy} — ${locale === 'fa' ? checkoutPlan.name_fa : checkoutPlan.name_en}`} onClose={() => !busy && setCheckoutPlan(null)}>
          <div className="col gap-l">
            <div className="row between">
              <span className="muted">{t.settings.profile}:</span>
              <b>{formatPrice(checkoutPlan.price_irr, locale)} / {formatNumber(checkoutPlan.duration_days, locale)} {t.common.day}</b>
            </div>
            {!canPay ? (
              <p className="small" style={{ color: 'var(--warn)' }}>{P.contact_admin}</p>
            ) : (
              <Field label={P.pay_method}>
                <div className="col gap-s">
                  {zarinpalReady && (
                    <label className={`card flat row gap-s ${method === 'zarinpal' ? '' : ''}`} style={{ cursor: 'pointer', borderColor: method === 'zarinpal' ? 'var(--accent)' : undefined, padding: 14 }}>
                      <input type="radio" name="paym" checked={method === 'zarinpal'} onChange={() => setMethod('zarinpal')} />
                      <span>{t.pricing.pay_zarinpal}</span>
                    </label>
                  )}
                  {manualReady && (
                    <label className="card flat row gap-s" style={{ cursor: 'pointer', borderColor: method === 'manual' ? 'var(--accent)' : undefined, padding: 14 }}>
                      <input type="radio" name="paym" checked={method === 'manual'} onChange={() => setMethod('manual')} />
                      <span>{t.pricing.pay_manual}</span>
                    </label>
                  )}
                </div>
              </Field>
            )}
            <button className="btn primary block" onClick={startCheckout} disabled={busy || !canPay}>
              {busy && <Spinner />} {busy ? t.pay.gateway_redirect : P.buy}
            </button>
            {payments?.refund_policy_fa && <p className="tiny dim">{payments.refund_policy_fa}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
