#!/usr/bin/env bash
# ============================================================
# AMIN AI ULTRA — استقرار مستقیم روی Cloudflare برای Workers
# کافی است این را روی سیستم خودتان اجرا کنید:
#     bash scripts/deploy.sh
# اسکریپت خودش: ورود به کلادفلر، ساخت D1/R2، ست‌کردن APP_SECRET،
# مایگریشن، بیلد و دیپلوی را انجام می‌دهد و در پایان لینک می‌دهد.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }

# ---------- 0) prerequisites ----------
step "بررسی پیش‌نیازها"
command -v node >/dev/null || { echo "❌ Node.js لازم است (نسخه ۲۰ به بالا):"; echo "   https://nodejs.org"; exit 1; }
NODE_MAJOR=$(node -e 'process.exit(Number(process.versions.node.split(".")[0])<20?1:0)' 2>/dev/null && echo ok)
[ "${NODE_MAJOR:-}" = "ok" ] || { echo "❌ نسخه Node.js باید ۲۰ به بالا باشد."; exit 1; }
echo "✓ Node.js $(node -v)"

# ---------- 1) login ----------
step "اتصال به حساب کلادفلر"
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "در حال باز کردن صفحه ورود کلادفلر در مرورگر…"
  npx wrangler login
fi
npx wrangler whoami | grep -E "email|Account" || true

# ---------- 2) D1 database ----------
step "ساخت/یافتن دیتابیس D1"
DB_ID=""
if [ -n "${CF_D1_DATABASE_ID:-}" ]; then
  DB_ID="$CF_D1_DATABASE_ID"
  echo "✓ database_id از متغیر محیطی"
elif [ -f wrangler.toml ] && grep -q 'database_id = "' wrangler.toml && ! grep -q 'REPLACE_WITH_YOUR_D1_DATABASE_ID' wrangler.toml; then
  DB_ID=$(grep 'database_id' wrangler.toml | sed -E 's/.*"([^"]+)".*/\1/')
  echo "✓ database_id از wrangler.toml"
else
  # try creating (idempotent name); if it exists, look it up
  if npx wrangler d1 create amin-ai-ultra > /tmp/d1create.txt 2>&1; then
    DB_ID=$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' /tmp/d1create.txt | head -1 || true)
    echo "✓ دیتابیس ساخته شد"
  else
    echo "دیتابیس از قبل وجود دارد؛ شناسه را می‌خوانم…"
    DB_ID=$(npx wrangler d1 list 2>/dev/null | grep -B2 'amin-ai-ultra' | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)
  fi
fi
[ -n "$DB_ID" ] || { echo "❌ شناسه D1 پیدا نشد. دیتابیسی با نام amin-ai-ultra بسازید و CF_D1_DATABASE_ID=<id> را پیش از اجرا ست کنید."; exit 1; }
sed -i.bak "s/^database_id = \".*\"$/database_id = \"$DB_ID\"/" wrangler.toml
echo "✓ database_id = $DB_ID"

# ---------- 3) R2 bucket ----------
step "ساخت سطل R2"
if npx wrangler r2 bucket create amin-ai-ultra-assets >/dev/null 2>&1; then
  echo "✓ ساخته شد"
else
  echo "✓ از قبل وجود دارد"
fi

# ---------- 4) APP_SECRET ----------
step "بررسی APP_SECRET"
if npx wrangler secret list 2>/dev/null | grep -q "APP_SECRET"; then
  echo "✓ از قبل ست شده"
else
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "$SECRET" | npx wrangler secret put APP_SECRET >/dev/null
  echo "✓ APP_SECRET تصادفی تولید و ست شد"
fi

# ---------- 5) install & build ----------
step "نصب وابستگی‌ها و بیلد فرانت"
npm ci --legacy-peer-deps --no-audit --no-fund
npm run build

# ---------- 6) migrations ----------
step "اعمال مایگریشن‌های دیتابیس"
npx wrangler d1 migrations apply DB --remote

# ---------- 7) deploy ----------
step "دیپلوی روی کلادفلر"
npx wrangler deploy

cat << 'MSG'

============================================================
✅ دیپلوی کامل شد.
لینک عمومی شما:
   https://amin-ai-ultra.<subdomain>.workers.dev
   (subdomain را در داشبورد کلادفلر → Workers & Pages می‌بینید;
    لینک کامل هم در خروجی wrangler deploy بالا چاپ شده است.)

قدم بعدی: آدرس /setup را باز کنید و حساب مدیر بسازید.
============================================================
MSG
