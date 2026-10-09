-- ============================================================
-- AMIN AI ULTRA — seed data (0002_seed)
-- Default plans + platform settings. Everything stays editable
-- from the admin dashboard; nothing here is a hardcoded rule.
-- ============================================================

-- Default plans
INSERT OR IGNORE INTO plans (id, slug, name_fa, name_en, description_fa, description_en,
  price_irr, price_usd_cents, duration_days, daily_message_limit, daily_video_limit_default,
  daily_video_limit_ir, upload_limit_mb, conversation_storage_limit, model_tier,
  features_json, is_active, is_free, sort_order, created_at, updated_at) VALUES
('plan_free', 'free', 'رایگان', 'FREE',
 'شروع آشنایی با امین‌ای‌آی؛ مدل‌های پایه، سهمیه روزانه محدود.',
 'Get started with basic models and a limited daily allowance.',
 0, 0, 36500, 20, 1, 2, 5, 20, 'basic',
 '{"priority_queue":false,"multi_model":false}', 1, 1, 0, 1700000000000, 1700000000000),
('plan_plus', 'plus', 'پلاس', 'PLUS',
 'سهمیه بیشتر، مدل‌های قوی‌تر و اولویت پردازش.',
 'Higher limits, stronger models and priority processing.',
 490000000, 990, 30, 200, 5, 10, 50, 200, 'plus',
 '{"priority_queue":true,"multi_model":false}', 1, 0, 1, 1700000000000, 1700000000000),
('plan_pro', 'pro', 'پرو', 'PRO',
 'حداکثر سهمیه، ارکستراسیون چندمدله و ابزارهای پیشرفته.',
 'Maximum quota, multi-model orchestration and advanced tools.',
 990000000, 1990, 30, 1000, 20, 40, 200, 1000, 'pro',
 '{"priority_queue":true,"multi_model":true}', 1, 0, 2, 1700000000000, 1700000000000);

-- Platform settings
INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES
('setup_complete', 'false', 1700000000000),
('site', '{"name_fa":"امین‌ای‌آی الترا","name_en":"AMIN AI ULTRA","tagline_fa":"دستیار هوش مصنوعی فارسی‌زبان","tagline_en":"The Persian-first AI platform","default_locale":"fa","logo_text":"AMIN"}', 1700000000000),
('countries', '[{"code":"IR","fa":"ایران","en":"Iran","currency":"IRR","locales":["fa","en"],"features":{"chat":true,"video":true,"payments":true},"default":true},{"code":"US","fa":"ایالات متحده","en":"United States","currency":"USD","locales":["en"],"features":{"chat":true,"video":true,"payments":false}},{"code":"AE","fa":"امارات متحده عربی","en":"United Arab Emirates","currency":"USD","locales":["en","fa"],"features":{"chat":true,"video":true,"payments":false}},{"code":"TR","fa":"ترکیه","en":"Türkiye","currency":"USD","locales":["en"],"features":{"chat":true,"video":false,"payments":false}},{"code":"DE","fa":"آلمان","en":"Germany","currency":"USD","locales":["en"],"features":{"chat":true,"video":true,"payments":false}}]', 1700000000000),
('features', '{"chat":true,"video":true,"payments":true,"registration":true,"google_auth":true,"manual_transfer":true,"maintenance_mode":false}', 1700000000000),
('payments', '{"provider":"disabled","zarinpal":{"merchant_id":"","sandbox":false,"base_url":"https://api.zarinpal.com/pg/v4"},"callback_base":"","success_path":"/pay/result?status=ok","failure_path":"/pay/result?status=failed","currencies":["IRR"],"manual":{"enabled":true,"card_number":"","card_holder":"","bank_name":"","note_fa":"پس از واریز، رسید را ثبت کنید. اشتراک شما پس از تأیید مدیر فعال می‌شود."},"refund_policy_fa":"بازگشت وجه طبق قوانین درگاه و پس از بررسی مدیر انجام می‌شود."}', 1700000000000),
('auth_policy', '{"require_email_verification":false,"allow_dev_code_echo":true,"session_days":30,"max_login_attempts":5,"lockout_minutes":15}', 1700000000000),
('quota_policy', '{"video_count_only_successful":true,"message_count_each":true,"day_timezone":"Asia/Tehran","anti_abuse_note":"Eligibility is determined from verified account data, never from client-supplied country flags."}', 1700000000000),
('email', '{"provider":"none","from":""}', 1700000000000);
