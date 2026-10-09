# AMIN AI ULTRA — امین‌ای‌آی الترا

Persian-first AI platform on Cloudflare Workers: smart chat, AI video studio, subscriptions & payments (Zarinpal + manual), secure admin panel, full RTL/LTR i18n, PWA.

> **🇮🇷 مستندات کامل فارسی (راه‌اندازی، استقرار، امنیت): [README.fa.md](README.fa.md)**

## Developer quickstart (English)

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev                     # build + local D1 migrations + wrangler dev :8787

# optional: full end-to-end experience with local stubs
node scripts/mock-providers.mjs # mock OpenAI/video/Zarinpal on :9999
node scripts/seed-demo.mjs      # demo admin/user + wiring
node scripts/smoke.mjs          # 63 end-to-end tests
npm test                        # 23 unit tests
```

## Stack

- **Frontend** — React 18 + Vite, React SPA (Persian-first RTL, English LTR), custom dark design system, PWA (manifest + SW + offline).
- **Backend** — Cloudflare Workers + Hono. D1 (users/sessions/plans/transactions/audit), R2 (uploads), Durable Objects (`QuotaCoordinator` atomic daily quotas, `RateLimiter`), Workers Static Assets with SPA fallback.
- **Auth** — email/password (PBKDF2 310k), Google OIDC (real flow, env-gated), 6-digit email codes, secure HTTP-only sessions, CSRF protection, reauth for sensitive ops.
- **Payments** — Zarinpal REST v4 (request/verify, idempotent, replay-safe, authority+amount verified server-side) + manual bank transfer with mandatory admin review.
- **Admin** — users, plans, providers/models, payment settings (reauth-gated), transactions, manual review, country feature gates, feature flags, maintenance mode, audit log.

## Production deploy

See the step-by-step guide (Persian) in [README.fa.md](README.fa.md#۴-استقرار-واقعی-روی-cloudflare). TL;DR: `wrangler login` → create D1 + set `database_id` in `wrangler.toml` → apply migrations `--remote` → create R2 bucket → `wrangler secret put APP_SECRET` → `npm run deploy`.
