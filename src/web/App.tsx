import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { I18nProvider } from './i18n';
import { ToastProvider } from './components/Toast';
import { PublicLayout, AppShell, AdminShell } from './components/Layout';
import { PageLoader, Empty } from './components/ui';
import { IconWarn } from './components/Icons';

import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Forgot from './pages/auth/Forgot';
import Reset from './pages/auth/Reset';
import Verify from './pages/auth/Verify';
import Setup from './pages/Setup';
import Chat from './pages/app/Chat';
import Video from './pages/app/Video';
import Dashboard from './pages/app/Dashboard';
import Pricing from './pages/app/Pricing';
import Settings from './pages/app/Settings';
import PayResult from './pages/app/PayResult';
import PayManual from './pages/app/PayManual';
import NotFound from './pages/NotFound';

import AdminOverview from './pages/admin/Overview';
import AdminUsers from './pages/admin/Users';
import AdminPlans from './pages/admin/Plans';
import AdminProviders from './pages/admin/Providers';
import AdminPayments from './pages/admin/Payments';
import AdminTransactions from './pages/admin/Transactions';
import AdminReview from './pages/admin/Review';
import AdminAudit from './pages/admin/Audit';
import AdminFeatures from './pages/admin/Features';
import AdminBranding from './pages/admin/Branding';
import AdminVideoJobs from './pages/admin/VideoJobs';
import { useI18n } from './i18n';

function Guard({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { me, meLoading, setupRequired } = useStore();
  const loc = useLocation();
  if (meLoading || setupRequired === null) return <PageLoader />;
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (!me?.user) return <Navigate to="/auth/login" state={{ from: loc.pathname }} replace />;
  if (admin && me.user.role !== 'admin') return <Navigate to="/app/chat" replace />;
  return <>{children}</>;
}

function HomeGate() {
  const { setupRequired } = useStore();
  if (setupRequired === null) return <PageLoader />;
  if (setupRequired) return <Navigate to="/setup" replace />;
  return <Landing />;
}

function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { config, me } = useStore();
  const { t } = useI18n();
  if (config?.maintenance && me?.user?.role !== 'admin') {
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
        <Empty icon={<IconWarn size={34} />} title={t.errors.maintenance} sub="منتظر بمانید؛ به‌زودی برمی‌گردیم." />
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <I18nProvider>
      <StoreProvider>
        <ToastProvider>
          <a href="#main" className="skip-link">پرش به محتوا</a>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomeGate />} />
              <Route path="/pricing" element={<Pricing publicView />} />
              <Route path="/auth/login" element={<Login />} />
              <Route path="/auth/register" element={<Register />} />
              <Route path="/auth/forgot" element={<Forgot />} />
              <Route path="/auth/reset" element={<Reset />} />
              <Route path="/auth/verify" element={<Verify />} />
            </Route>

            <Route path="/setup" element={<Setup />} />

            <Route element={<Guard><MaintenanceGate><AppShell /></MaintenanceGate></Guard>}>
              <Route path="/app/chat" element={<Chat />} />
              <Route path="/app/chat/:id" element={<Chat />} />
              <Route path="/app/video" element={<Video />} />
              <Route path="/app/dashboard" element={<Dashboard />} />
              <Route path="/app/pricing" element={<Pricing />} />
              <Route path="/app/settings" element={<Settings />} />
              <Route path="/pay/result" element={<PayResult />} />
              <Route path="/pay/manual" element={<PayManual />} />
            </Route>

            <Route element={<Guard admin><AdminShell /></Guard>}>
              <Route path="/admin" element={<AdminOverview />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/plans" element={<AdminPlans />} />
              <Route path="/admin/providers" element={<AdminProviders />} />
              <Route path="/admin/payments" element={<AdminPayments />} />
              <Route path="/admin/transactions" element={<AdminTransactions />} />
              <Route path="/admin/review" element={<AdminReview />} />
              <Route path="/admin/video-jobs" element={<AdminVideoJobs />} />
              <Route path="/admin/branding" element={<AdminBranding />} />
              <Route path="/admin/features" element={<AdminFeatures />} />
              <Route path="/admin/audit" element={<AdminAudit />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </StoreProvider>
    </I18nProvider>
  );
}
