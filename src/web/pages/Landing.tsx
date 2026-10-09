import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useStore } from '../store';
import { IconChat, IconVideo, IconShield, IconGlobe, IconPricing, IconDash, IconSparkle } from '../components/Icons';

export default function Landing() {
  const { t } = useI18n();
  const { me } = useStore();
  const L = t.landing;
  const features = [
    { Icon: IconChat, title: L.f1_t, desc: L.f1_d },
    { Icon: IconVideo, title: L.f2_t, desc: L.f2_d },
    { Icon: IconShield, title: L.f3_t, desc: L.f3_d },
    { Icon: IconGlobe, title: L.f4_t, desc: L.f4_d },
    { Icon: IconPricing, title: L.f5_t, desc: L.f5_d },
    { Icon: IconDash, title: L.f6_t, desc: L.f6_d },
  ];
  return (
    <div className="container">
      <section className="hero">
        <div className="hero-glow" />
        <span className="badge green pill"><IconSparkle size={14} /> {L.pill}</span>
        <h1>{L.title_1}<br /><span style={{ background: 'linear-gradient(135deg,#34d399,#0ea5e9)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{L.title_2}</span></h1>
        <p className="sub">{L.subtitle}</p>
        <div className="row center gap-l mt-l wrap">
          {me?.user ? (
            <Link to="/app/chat" className="btn primary lg">{t.nav.chat}</Link>
          ) : (
            <Link to="/auth/register" className="btn primary lg">{L.cta_start}</Link>
          )}
          <Link to="/pricing" className="btn lg">{L.cta_pricing}</Link>
        </div>
      </section>

      <section className="mt-xl">
        <h2 style={{ textAlign: 'center' }}>{L.features_title}</h2>
        <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>{L.features_sub}</p>
        <div className="grid-3 mt-l">
          {features.map(({ Icon, title, desc }) => (
            <div key={title} className="card hoverable">
              <div className="feature-icon"><Icon size={24} /></div>
              <h3 className="mt">{title}</h3>
              <p className="muted small mt-s">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-xl mb" style={{ paddingBottom: 80 }}>
        <h2 style={{ textAlign: 'center' }}>{L.how_title}</h2>
        <div className="grid-3 mt-l">
          {[1, 2, 3].map((n) => {
            const title = (L as Record<string, string>)[`how_${n}`];
            const desc = (L as Record<string, string>)[`how_${n}d`];
            return (
              <div key={n} className="card" style={{ textAlign: 'center' }}>
                <div className="feature-icon" style={{ margin: '0 auto', fontWeight: 800, fontSize: '1.2rem' }}>{n}</div>
                <h3 className="mt">{title}</h3>
                <p className="muted small mt-s">{desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
