import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useStore } from '../store';
import { api } from '../api';
import { useToast } from './Toast';
import { IconChat, IconVideo, IconDash, IconPricing, IconSettings, IconLogout, IconMenu, IconShield, IconUsers, IconChart, IconCard, IconGlobe, IconWrench, IconBook, IconHistory, IconFlag, IconSparkle } from './Icons';
import type { Locale } from '../i18n';

export function Brand() {
  const { config } = useStore();
  const { locale } = useI18n();
  const name = config ? (locale === 'fa' ? config.site.name_fa : config.site.name_en) : 'AMIN AI ULTRA';
  const logo = config?.site.logo_text || 'AMIN';
  return (
    <Link to="/" className="brand">
      <span className="logo-mark">{logo.slice(0, 2)}</span>
      <span>{name}</span>
    </Link>
  );
}

export function LangSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <button className="btn ghost sm" onClick={() => setLocale(locale === 'fa' ? 'en' : 'fa')} aria-label="language">
      <IconGlobe size={15} /> {locale === 'fa' ? 'EN' : 'فا'}
    </button>
  );
}

export function UserMenu() {
  const { me, refreshMe } = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const logout = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
    await refreshMe();
    toast.info(t.common.logout);
    nav('/');
  };
  if (!me?.user) return null;
  const u = me.user;
  return (
    <div className="row gap-s">
      {u.role === 'admin' && (
        <Link to="/admin" className="badge amber" title={t.nav.admin}><IconShield size={13} /> {t.nav.admin}</Link>
      )}
      <Link to="/app/dashboard" className="badge" title={u.email}>
        {u.avatar_url ? <img src={u.avatar_url} alt="" width={18} height={18} style={{ borderRadius: 6 }} /> : null}
        {u.name || u.email}
      </Link>
      <button className="btn ghost sm" onClick={logout} title={t.common.logout}><IconLogout size={15} /></button>
    </div>
  );
}

// ---------- Public (marketing) layout ----------
export function PublicLayout() {
  const { t } = useI18n();
  const { me } = useStore();
  return (
    <div className="page">
      <div className="ambient" />
      <header className="topbar">
        <div className="container topbar-inner">
          <Brand />
          <nav className="row grow center" style={{ gap: 4 }}>
            <NavLink className="nav-link" to="/pricing">{t.nav.pricing}</NavLink>
            {me?.user && <NavLink className="nav-link" to="/app/chat">{t.nav.chat}</NavLink>}
          </nav>
          <LangSwitch />
          {me?.user ? <UserMenu /> : (
            <div className="row gap-s">
              <Link to="/auth/login" className="btn ghost sm">{t.nav.login}</Link>
              <Link to="/auth/register" className="btn primary sm">{t.nav.register}</Link>
            </div>
          )}
        </div>
      </header>
      <main id="main" className="grow">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container row between wrap">
          <span>{t.landing.footer_right}</span>
          <span className="row gap-s"><LangSwitch /></span>
        </div>
      </footer>
    </div>
  );
}

// ---------- App shell (authenticated) ----------
const APP_LINKS = [
  { to: '/app/chat', key: 'chat', Icon: IconChat },
  { to: '/app/video', key: 'video', Icon: IconVideo },
  { to: '/app/dashboard', key: 'dashboard', Icon: IconDash },
  { to: '/app/pricing', key: 'pricing', Icon: IconPricing },
  { to: '/app/settings', key: 'settings', Icon: IconSettings },
] as const;

export function AppShell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { me } = useStore();
  return (
    <div className="shell">
      <div className="ambient" />
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="app navigation">
        <div className="row between mb">
          <Brand />
          <button className="btn ghost sm hamburger" style={{ display: 'inline-flex' }} onClick={() => setOpen(false)}>✕</button>
        </div>
        <div className="sidebar-section">{t.nav.my_account}</div>
        {APP_LINKS.map(({ to, key, Icon }) => (
          <NavLink key={to} to={to} className="side-link" onClick={() => setOpen(false)}>
            <Icon size={17} /> {t.nav[key as keyof typeof t.nav]}
          </NavLink>
        ))}
        <div className="grow" />
        {me?.usage && (
          <div className="card flat" style={{ padding: 14, fontSize: '0.8rem' }}>
            <div className="row between"><span className="dim">{t.chat.quota_left}</span><span className="num" style={{ color: 'var(--accent-2)' }}>{Math.max(0, me.usage.message_limit - me.usage.message)}</span></div>
            <div className="row between mt-s"><span className="dim">{t.video.quota_left}</span><span className="num" style={{ color: 'var(--accent-2)' }}>{Math.max(0, me.usage.video_limit - me.usage.video)}</span></div>
          </div>
        )}
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="container topbar-inner" style={{ maxWidth: '100%', padding: '0 18px' }}>
            <button className="btn ghost sm hamburger" onClick={() => setOpen(true)} aria-label="menu"><IconMenu size={18} /></button>
            <div className="grow" />
            <LangSwitch />
            <UserMenu />
          </div>
        </header>
        <main className="main-content" id="main"><Outlet /></main>
      </div>
    </div>
  );
}

// ---------- Admin shell ----------
const ADMIN_LINKS = [
  { to: '/admin', key: 'overview', Icon: IconChart, end: true },
  { to: '/admin/users', key: 'users', Icon: IconUsers },
  { to: '/admin/plans', key: 'plans', Icon: IconPricing },
  { to: '/admin/providers', key: 'providers', Icon: IconSparkle },
  { to: '/admin/payments', key: 'payments', Icon: IconCard },
  { to: '/admin/transactions', key: 'transactions', Icon: IconHistory },
  { to: '/admin/review', key: 'manual_review', Icon: IconFlag },
  { to: '/admin/video-jobs', key: 'video_jobs', Icon: IconVideo },
  { to: '/admin/branding', key: 'branding', Icon: IconGlobe },
  { to: '/admin/features', key: 'features', Icon: IconWrench },
  { to: '/admin/audit', key: 'audit', Icon: IconBook },
] as const;

export function AdminShell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="shell admin-shell">
      <div className="ambient" />
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="admin navigation">
        <div className="row between mb">
          <Brand />
        </div>
        <div className="row gap-s mb">
          <span className="badge amber"><IconShield size={13} /> {t.admin.title}</span>
        </div>
        {ADMIN_LINKS.map(({ to, key, Icon, ...rest }) => (
          <NavLink key={to} to={to} end={'end' in rest && rest.end} className="side-link" onClick={() => setOpen(false)}>
            <Icon size={17} /> {t.admin[key as keyof typeof t.admin]}
          </NavLink>
        ))}
        <div className="grow" />
        <NavLink to="/app/chat" className="side-link"><IconChat size={17} /> {t.nav.chat}</NavLink>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="container topbar-inner" style={{ maxWidth: '100%', padding: '0 18px' }}>
            <button className="btn ghost sm hamburger" onClick={() => setOpen(true)} aria-label="menu"><IconMenu size={18} /></button>
            <h4>{t.admin.title}</h4>
            <div className="grow" />
            <LangSwitch />
            <UserMenu />
          </div>
        </header>
        <main className="main-content" id="main"><Outlet /></main>
      </div>
    </div>
  );
}
