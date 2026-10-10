import { Hono } from 'hono';
import type { Env } from '../env';
import { ok } from '../lib/http';
import { siteSettings, countries, features, paymentSettings, quotaPolicy } from '../lib/db';
import { listEnabledModels } from '../lib/providers';

const config = new Hono<{ Bindings: Env }>();

// GET /api/config/public — everything the SPA needs at boot. Never includes secrets.
config.get('/public', async (c) => {
  const [site, countryList, f, pay, qp] = await Promise.all([
    siteSettings(c.env), countries(c.env), features(c.env), paymentSettings(c.env), quotaPolicy(c.env),
  ]);
  const chatModels = await listEnabledModels(c.env, 'chat');
  const videoModels = await listEnabledModels(c.env, 'video');
  const plans = await c.env.DB.prepare(
    `SELECT id, slug, name_fa, name_en, description_fa, description_en, price_irr, price_usd_cents,
            duration_days, daily_message_limit, daily_video_limit_default, daily_video_limit_ir,
            upload_limit_mb, model_tier, features_json, is_active, is_free, sort_order
     FROM plans ORDER BY sort_order`,
  ).all();

  return ok({
    site,
    countries: countryList,
    features: f,
    google: { configured: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET), enabled: f.google_auth },
    payments: {
      // Public-safe projection of payment settings
      provider: pay.provider,
      zarinpal_configured: pay.provider === 'zarinpal' && Boolean(pay.zarinpal.merchant_id),
      currencies: pay.currencies,
      manual: {
        enabled: pay.manual.enabled && f.manual_transfer,
        card_number: pay.manual.card_number,
        card_holder: pay.manual.card_holder,
        bank_name: pay.manual.bank_name,
        note_fa: pay.manual.note_fa,
      },
      refund_policy_fa: pay.refund_policy_fa,
    },
    email: { configured: Boolean(c.env.EMAIL_API_KEY) },
    models: {
      chat: chatModels.map((m) => ({ id: m.id, key: m.model_key, name: m.display_name, tier: m.tier, provider: m.provider_name })),
      video: videoModels.map((m) => ({
        id: m.id, key: m.model_key, name: m.display_name, tier: m.tier, provider: m.provider_name,
        config: safeJson(m.config_json),
      })),
    },
    plans: (plans.results || []).map((p) => ({
      ...p,
      features: safeJson((p as { features_json?: string }).features_json || '{}'),
      features_json: undefined,
    })),
    quota_policy: { day_timezone: qp.day_timezone },
    maintenance: f.maintenance_mode,
  });
});

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return {}; }
}

export default config;
