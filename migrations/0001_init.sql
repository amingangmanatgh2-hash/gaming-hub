-- ============================================================
-- AMIN AI ULTRA — D1 schema (0001_init)
-- ============================================================

-- Users & identity
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE COLLATE NOCASE,
  email_normalized TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT,                      -- NULL when only federated (Google)
  google_sub TEXT UNIQUE,                  -- OIDC subject
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  email_verified_at INTEGER,
  country_code TEXT NOT NULL DEFAULT '',   -- user preference (formatting only)
  country_verified TEXT NOT NULL DEFAULT '',-- verified residency (empty = unverified)
  country_verified_source TEXT NOT NULL DEFAULT '', -- admin|payment
  locale TEXT NOT NULL DEFAULT 'fa',
  avatar_url TEXT NOT NULL DEFAULT '',
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  deleted_at INTEGER,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Sessions (token is stored hashed)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                     -- sha256(token)
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- One-time codes: email verification / password reset
CREATE TABLE IF NOT EXISTS email_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email, purpose);

-- Subscription plans (fully editable from admin)
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_fa TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  description_fa TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  price_irr INTEGER NOT NULL DEFAULT 0,    -- ریال
  price_usd_cents INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  daily_message_limit INTEGER NOT NULL DEFAULT 20,
  daily_video_limit_default INTEGER NOT NULL DEFAULT 1,
  daily_video_limit_ir INTEGER NOT NULL DEFAULT 2, -- verified IR residents
  upload_limit_mb INTEGER NOT NULL DEFAULT 5,
  conversation_storage_limit INTEGER NOT NULL DEFAULT 50,
  model_tier TEXT NOT NULL DEFAULT 'basic' CHECK (model_tier IN ('basic','plus','pro')),
  features_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_free INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','canceled','pending')),
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system','zarinpal','manual','admin')),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id, status);

-- Payment transactions (gateway + manual transfer)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IRR',
  method TEXT NOT NULL CHECK (method IN ('zarinpal','manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','canceled','refunded','rejected')),
  authority TEXT,                          -- gateway authority / ref
  ref_id TEXT,                             -- gateway ref id after verify
  gateway_payload_json TEXT NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT UNIQUE,             -- client-supplied creation key
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_authority ON transactions(authority) WHERE authority IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_refid ON transactions(ref_id) WHERE ref_id IS NOT NULL;

-- Manual bank transfer receipts (always require admin review)
CREATE TABLE IF NOT EXISTS manual_payments (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  sender_note TEXT NOT NULL DEFAULT '',
  receipt_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  review_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manual_status ON manual_payments(status);

-- AI providers (keys stored server-side only, never serialized to clients)
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('openai_compatible','video_http')),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',        -- secret: never returned by API
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Models exposed to users
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  model_key TEXT NOT NULL,                 -- id passed to provider API
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat','video')),
  tier TEXT NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic','plus','pro')),
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',  -- durations, ratios, cost estimate...
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider_id, model_key)
);

-- Key/value platform settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- Durable quota usage mirror (authoritative counters live in Durable Object,
-- this table is the reporting/audit mirror updated by the same code path)
CREATE TABLE IF NOT EXISTS quota_usage (
  user_id TEXT NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,                       -- YYYY-MM-DD (platform TZ)
  kind TEXT NOT NULL CHECK (kind IN ('message','video')),
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, kind)
);

-- Video generation jobs
CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  model_id TEXT NOT NULL,
  model_key TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  duration_seconds INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','canceled')),
  provider_job_id TEXT,
  result_r2_key TEXT,
  result_url TEXT,
  error TEXT,
  counted_quota INTEGER NOT NULL DEFAULT 1,   -- billing policy: count/failed jobs
  progress INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vjobs_user ON video_jobs(user_id, created_at);

-- File uploads (R2 keys)
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);

-- Conversations & messages
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL DEFAULT '',
  model_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

-- Audit log (admin + security events, secrets redacted)
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);

-- Reauthentication tokens for sensitive operations
CREATE TABLE IF NOT EXISTS reauth_tokens (
  id TEXT PRIMARY KEY,                     -- sha256(token)
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
