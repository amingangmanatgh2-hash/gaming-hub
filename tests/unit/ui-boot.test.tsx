// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';

/**
 * Boot test: renders the real React tree on key routes with a mocked API layer
 * and asserts the app mounts, fetches initial state, and renders Persian UI.
 */

const freePlan = {
  id: 'plan_free', slug: 'free', name_fa: 'رایگان', name_en: 'Free', description_fa: '', description_en: '',
  price_irr: 0, price_usd_cents: 0, duration_days: 0, daily_message_limit: 20,
  daily_video_limit_default: 1, daily_video_limit_ir: 2, upload_limit_mb: 10,
  conversation_storage_limit: 20, model_tier: 'basic',
  features: { chat: true, video: true }, is_active: 1, is_free: 1, sort_order: 1,
};

const mockConfig = {
  site: { name_fa: 'امین‌ای‌آی الترا', name_en: 'AMIN AI ULTRA', tagline_fa: 'دستیار هوش مصنوعی فارسی‌زبان', tagline_en: 'The Persian-first AI platform', default_locale: 'fa', logo_text: 'AMIN' },
  countries: [{ code: 'IR', fa: 'ایران', en: 'Iran', currency: 'IRR', locales: ['fa', 'en'], features: { chat: true, video: true, payments: true }, default: true }],
  features: { chat: true, video: true, payments: true, registration: true, google_auth: false, manual_transfer: true, maintenance_mode: false },
  google: { configured: false, enabled: false },
  payments: {
    provider: 'zarinpal', zarinpal_configured: false, currencies: ['IRR'],
    manual: { enabled: true, card_number: '6037-9977-0000-0000', card_holder: 'شرکت نمونه', bank_name: 'بانک ملی', note_fa: 'رسید را ارسال کنید.' },
    refund_policy_fa: '',
  },
  email: { configured: false },
  models: { chat: [{ id: 'm1', key: 'gpt-mini', name: 'جمینی مینی', tier: 'basic', provider: 'mock', available: true }], video: [{ id: 'v1', key: 'vid', name: 'ویدیو پایه', tier: 'basic', provider: 'mock', available: true, config: { durations: [5], ratios: ['16:9'] } }] },
  plans: [freePlan],
  quota_policy: { day_timezone: 'Asia/Tehran' },
  maintenance: false,
};

function mockFetch(data: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url, 'http://localhost').pathname;
    const entry = data[path];
    if (init?.method === 'POST' && path === '/api/auth/login') {
      return new Response(JSON.stringify({ ok: false, error: { code: 'invalid_credentials', message_fa: 'ایمیل یا رمز عبور اشتباه است.' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const body = entry !== undefined ? entry : { not: 'mocked' };
    return new Response(JSON.stringify({ ok: true, data: body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

let root: Root | null;
let container: HTMLDivElement;

async function renderAppAt(route: string, data: Record<string, unknown>) {
  const { default: App } = await import('../../src/web/App');
  const { BrowserRouter } = await import('react-router-dom');
  globalThis.IS_REACT_ACT_ENVIRONMENT = true as unknown as globalThis['IS_REACT_ACT_ENVIRONMENT'];
  window.history.replaceState(null, '', route);
  mockFetch({
    '/api/setup/status': route === '/setup' ? { needs_setup: true, version: '1.0' } : { needs_setup: false },
    '/api/config/public': mockConfig,
    '/api/auth/me': { user: null, session: null },
    '/api/payments/plans': { plans: [freePlan] },
    '/api/chat/models': { models: mockConfig.models.chat },
    '/api/chat/conversations': { conversations: [] },
    ...data,
  });
  localStorage.clear();
  document.body.innerHTML = '';
  container = document.createElement('div');
  container.setAttribute('data-test-root', route);
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(BrowserRouter, null, React.createElement(App)));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  return container;
}

describe('frontend boot', () => {
  beforeAll(() => {
    // jsdom lacks these; app must tolerate
    (window as unknown as { scrollTo: () => void }).scrollTo = vi.fn();
    const sc = function (this: Element) { /* noop */ };
    (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = sc;
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = sc;
  });

  it('renders landing page in Persian RTL without crash', async () => {
    const el = await renderAppAt('/', {});
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(el.textContent).toContain('امین‌ای‌آی الترا');
    expect(el.textContent).toContain('شروع رایگان');
    act(() => { root?.unmount(); });
  });

  it('renders login page with Persian password field', async () => {
    const el = await renderAppAt('/auth/login', {});
    expect(el.textContent).toContain('گذرواژه');
    expect(el.textContent).toContain('ورود');
    act(() => { root?.unmount(); });
  });

  it('redirects anonymous user from /app/chat to login', async () => {
    await renderAppAt('/app/chat', {});
    expect(window.location.pathname).toBe('/auth/login');
    act(() => { root?.unmount(); });
  });

  it('shows setup wizard step 1 when setup required', async () => {
    const el = await renderAppAt('/setup', { '/api/setup': {} });
    expect(el.textContent).toContain('ایجاد حساب مدیر سامانه');
    act(() => { root?.unmount(); });
  });

  it('renders pricing page with plan names', async () => {
    const el = await renderAppAt('/pricing', {});
    expect(el.textContent).toContain('رایگان');
    act(() => { root?.unmount(); });
  });

  it('renders chat page for a logged-in free user', async () => {
    const el = await renderAppAt('/app/chat', {
      '/api/auth/me': {
        user: { id: 'u1', email: 'user@amin.demo', name: 'کاربر نمونه', role: 'user', locale: 'fa', country_code: 'IR', country_verified: 'iran_verified', email_verified: true, avatar_url: '' },
        plan: { slug: 'free', name_fa: 'رایگان', name_en: 'Free', model_tier: 'basic', price_irr: 0, duration_days: 0 },
        subscription: null,
        usage: { day: '2026-10-09', message: 3, video: 0, message_limit: 20, video_limit: 2 },
      },
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(el.textContent).toContain('گفتگوی جدید');
    expect(el.textContent).toContain('پیام باقی‌مانده');
    act(() => { root?.unmount(); });
  });

  it('renders admin overview for an admin user', async () => {
    const el = await renderAppAt('/admin', {
      '/api/auth/me': {
        user: { id: 'a1', email: 'admin@amin.demo', name: 'مدیر', role: 'admin', locale: 'fa', country_code: 'IR', country_verified: 'iran_verified', email_verified: true, avatar_url: '' },
        plan: { slug: 'pro', name_fa: 'حرفه‌ای', name_en: 'Pro', model_tier: 'pro', price_irr: 0, duration_days: 0 },
        subscription: null,
        usage: { day: '2026-10-09', message: 0, video: 0, message_limit: 100000, video_limit: 100 },
      },
      '/api/admin/overview': {
        users_total: 2, users_new_24h: 1,
        active_subscriptions_by_plan: [{ slug: 'free', n: 2 }],
        payments: { settled_count: 1, settled_total_irr: 2400000, pending: 0 },
        usage_24h: { messages: 3, video_jobs: 1 },
        pending_manual_payments: 0,
        config: { providers_enabled: 2, models_enabled: 2 },
        recent_signups: [], recent_transactions: [],
      },
    });
    // admin shell must render its navigation without crashing
    expect(el.textContent).toContain('مدیر');
    act(() => { root?.unmount(); });
  });

  it('non-admin is redirected away from /admin', async () => {
    await renderAppAt('/admin', {
      '/api/auth/me': {
        user: { id: 'u1', email: 'user@amin.demo', name: 'x', role: 'user', locale: 'fa', country_code: 'IR', country_verified: 'iran_verified', email_verified: true, avatar_url: '' },
        plan: { slug: 'free', name_fa: 'رایگان', name_en: 'Free', model_tier: 'basic', price_irr: 0, duration_days: 0 },
        subscription: null,
        usage: { day: '2026-10-09', message: 0, video: 0, message_limit: 20, video_limit: 2 },
      },
    });
    expect(window.location.pathname).not.toBe('/admin');
    act(() => { root?.unmount(); });
  });

  it('switches language to English (LTR) without crash', async () => {
    await renderAppAt('/', {});
    const buttons = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'EN');
    expect(buttons.length).toBeGreaterThan(0);
    await act(async () => { (buttons[0] as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(container.textContent).toContain('Start for free');
    act(() => { root?.unmount(); });
  });
});
