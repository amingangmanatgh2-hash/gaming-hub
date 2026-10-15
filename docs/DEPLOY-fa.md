# استقرار مدار روی Cloudflare — راهنمای اجرایی

> **این راهنما مربوط به مدار در شاخهٔ `arena/9ca26ff9-gaming-hub` است.** راهنمای سرویس قدیمی در [DEPLOY-LEGACY-fa.md](DEPLOY-LEGACY-fa.md) قرار دارد.

## پیش‌نیازها

- حساب Cloudflare با دسترسی Workers، Durable Objects و در صورت تمایل Workers AI؛ دامنهٔ HTTPS عمومی برای webhook تلگرام.
- حساب GitHub برای سورس و Actions (خروجی APK و Setup).
- Node.js 22+ و npm روی دستگاهی که استقرار را انجام می‌دهید.
- شرایط استفاده، محدودیت ترافیک و هزینه‌های حساب Cloudflare خود را بررسی کنید. تونل این نسخه TCP-only است و حتی در شبکهٔ محدود همیشه کار نمی‌کند.

## مسیر توصیه‌شده: یک Worker برای سایت + API + تونل

1. **شاخهٔ درست** را بگیرید (تا قبل از merge روی `Main` نسخهٔ قدیمی است):

   ```bash
   git clone --branch arena/9ca26ff9-gaming-hub https://github.com/amingangmanatgh2-hash/gaming-hub.git madar
   cd madar
   npm ci
   npm test
   ```

2. حساب Cloudflare خودتان را متصل و استقرار را اجرا کنید:

   ```bash
   npx wrangler login
   npm run deploy
   ```

   دستور `deploy` فایل‌های `public/`، کلاس `MarketState` و کلاس `Room` قدیمی را منتشر می‌کند. آدرس واقعی `workers.dev` در خروجی خود Wrangler است؛ تا این مرحله **هیچ رمز مدیر** وجود ندارد و ثبت سفارش/فعال‌سازی رایگان قفل است.

3. دو Secret تولید کنید و **در password manager نگه دارید** (نمونه‌های این راهنما را استفاده نکنید):

   ```bash
   openssl rand -hex 24          # ۴۸ نویسه؛ این خروجی را نزد خود نگه دارید
   npx wrangler secret put SETUP_KEY   # همان رشتهٔ ۴۸ نویسه‌ای را وارد کنید
   openssl rand -hex 32          # خروجی متفاوت ۶۴ نویسه؛ برای پشتیبان نگه دارید
   npx wrangler secret put APP_SECRET  # رشتهٔ دوم را وارد کنید
   ```

   هیچ‌کدام را در `wrangler.toml`، `.env` پابلیک یا GitHub Issue نگذارید. `APP_SECRET` کلید رمزگشایی توکن ربات در Durable Object است؛ گم‌شدن/تعویض آن مستلزم ثبت دوبارهٔ توکن است.

4. آدرس `https://<خروجی-واقعی>/setup` را باز کنید. **گام اول**: `SETUP_KEY`، رمز پنل حداقل ۸ نویسه و در صورت تمایل توکن BotFather. **گام دوم**: نام فروشگاه و نرخ هر دلار به **تومان**. پس از تأیید به `/panel` می‌روید. رمز پنل همان رمز انتخابی شماست؛ از پیش رمز پیش‌فرضی وجود ندارد.

5. در `/panel` طرح‌ها، فعال‌بودن رایگان/پولی، نرخ، سفارش‌ها و متن سایت را تنظیم کنید. در «تنظیمات سایت» آدرس عمومی همراه‌ها و لینک مانفیست نسخه‌دار را هم می‌بینید؛ آدرس `localhost` در پیش‌نمایش برای ساخت همراه بومی مناسب نیست. سفارش پولی به‌صورت pending ثبت می‌شود؛ قبل از فشردن «تأیید» باید پرداخت را **خارج از این سایت** بررسی کرده باشید. می‌توانید دسترسی تأییدشده را لغو کنید.

6. سلامت: `https://<آدرس>/api/v1/health` باید `ok:true` بدهد. `/api/v1/ping` کد لبه را برای سنجش کاربر برمی‌گرداند. `GET /api/v1/client/bootstrap` **قبل از setup** پاسخ 409 با `setup_required` و **بعد از setup** پاسخ JSON نسخهٔ ۱ شامل `origin`, `appUrl`, `siteName`, `transport` می‌دهد؛ هیچ رمز/UUID در این مانفیست عمومی نیست و `cache-control: no-store` دارد. یک حساب آزمایشی رایگان و یک سفارش را در `/app` بررسی کنید. اتصال واقعی را با کلاینت VLESS سازگار روی شبکهٔ خودتان امتحان کنید؛ این تست‌ها جای آزمون شبکهٔ مقصد و سیاست Cloudflare را نمی‌گیرند.

### ربات Telegram

توکن را در گام اول نصب یا بخش ربات پنل وارد کنید. Worker پس از ذخیرهٔ رمزنگاری‌شده، `setWebhook` را با `secret_token` تصادفی روی `https://<دامنه>/api/v1/telegram/webhook` صدا می‌زند. وضعیت ثبت در پنل نشان داده می‌شود. اگر نصب را روی `localhost` انجام دهید، Telegram نمی‌تواند آن را صدا بزند؛ پس از استقرار، توکن را مجدداً در پنل ثبت کنید. دستورات: `/start`، `/plans`، `/help`. ربات پرداخت یا ساخت سرور جداگانه انجام نمی‌دهد.

### نرخ دلار خودکار (اختیاری)

در `wrangler.toml` مقدار `FX_RATE_URL` را به آدرس HTTPS **مطمئن و متعلق به خودتان/ارائه‌دهندهٔ معتبر** تغییر دهید و دوباره deploy کنید. پاسخ باید JSON کوتاه و دقیقاً به شکل زیر باشد:

```json
{"usdToToman": 93000}
```

Cron هر ساعت آن را واکشی می‌کند. خطا یا مقدار نامعتبر نرخ فعلی را حفظ می‌کند. واحد **تومان** است؛ اگر سرویس‌تان ریال می‌دهد، قبل از ارائه باید آن را تبدیل کنید. بدون این منبع، مدیر نرخ را دستی در پنل تغییر می‌دهد و تمام قیمت‌های نمایشی همان لحظه محاسبهٔ مجدد می‌شوند؛ مبلغ سفارش‌های ثبت‌شده ثابت است.

### Workers AI (اختیاری)

برای دستیار واقعی، ابتدا دسترسی/هزینهٔ Workers AI را در حساب خود بررسی کنید. این دو خط را به `wrangler.toml` اضافه و مجدداً `npm run deploy` کنید:

```toml
[ai]
binding = "AI"
```

در توسعهٔ محلی، فعال‌بودن این binding ممکن است Wrangler را به اتصال ریموت و توکن Cloudflare نیازمند کند؛ بنابراین به‌طور پیش‌فرض فعال نیست. بدون binding، پنل شفاف می‌گوید AI غیرفعال است و تنظیم دستی کار می‌کند. مدل در کد `@cf/meta/llama-3.1-8b-instruct` است؛ پیام‌ها تا سه مورد آخر در DO نگه داشته می‌شوند و فقط پیشنهاد معتبرِ allowlist پس از تأیید مدیر اعمال می‌شود.

## اگر Pages هم می‌خواهید

**Pages به‌تنهایی Backend نیست.** نخست Worker بالا را deploy کنید؛ کلاس DO در Worker تعریف/منتشر می‌شود. سپس یک پروژهٔ Pages از همین شاخه بسازید:

- Build command: `npm run build`
- Build output directory: `public`
- Root directory: ریشهٔ همین مخزن
- در Pages → Settings → Functions → Service bindings، نام **`CORE`** را به Worker **`gaming-hub`** (یا نام انتخابی شما در `wrangler.toml`) وصل کنید و Pages را دوباره منتشر کنید.
- توابع `functions/api/[[path]].js` درخواست‌های `/api/*` و `functions/edge.js` درخواست‌های `/edge` را به Worker می‌دهند. کوکی/CSRF روی دامنهٔ Pages باقی می‌ماند. بسته به سیاست/قابلیت حساب، مسیر WebSocket از service binding Pages را جداگانه تست کنید؛ برای ورودی مطمئن‌تر کانفیگ، `EDGE_HOST` را روی hostname واقعی Worker (بدون `https://`) تنظیم کنید.
- `npm run deploy:pages` بعد از ساخت پروژهٔ Pages هم قابل استفاده است. بدون CORE، API عمداً 503 می‌دهد؛ سایت استاتیک به‌تنهایی فروشگاه عملیاتی نیست.

## دو اپ همراه

**مسیر خودکار:** در تنظیمات GitHub Actions مخزن دو Secret با نام `CLOUDFLARE_API_TOKEN` و `CLOUDFLARE_ACCOUNT_ID` ثبت کنید (با سطح دسترسی لازم برای استقرار Worker). گردش‌کار [Deploy Madar Worker and build companions](https://github.com/amingangmanatgh2-hash/gaming-hub/actions/workflows/deploy.yml) را روی شاخهٔ حاوی این کد اجرا کنید. پس از deploy موفق، URL واقعی از خروجی Wrangler دریافت می‌شود؛ workflow پاسخ `/api/v1/health` را بررسی می‌کند و سپس همان URL **عمومی** را هنگام build در APK و setup.exe قرار می‌دهد. URL در فایل قرار می‌گیرد، **نه رمز مدیر، SETUP_KEY، APP_SECRET یا لینک اشتراک**. از صفحهٔ همان اجرا دو artifact را دانلود کنید. هنگام Run workflow شاخهٔ حاوی این کد را انتخاب کنید؛ دکمهٔ یک‌کلیک Cloudflare همچنان نسخهٔ `Main` را می‌گیرد. خطای Cloudflare Builds جداگانه باید در داشبورد حساب بررسی شود.

**استقرار دستی/Cloudflare Git integration:** این روش‌ها خودبه‌خود workflow ساخت بعد از deploy را صدا نمی‌زنند؛ در [workflow ساخت همراه‌ها](https://github.com/amingangmanatgh2-hash/gaming-hub/actions/workflows/clients.yml) ورودی `worker_origin` را به URL واقعی HTTPS Worker (مثلاً `https://worker.your-subdomain.workers.dev`، بدون `/app`) بدهید، یا متغیر مخزن `MADAR_WORKER_ORIGIN` را تنظیم کنید. ساخت بدون URL هم ممکن است؛ آن بسته آدرس را در اولین اجرا می‌پرسد.

خروجی Android یک **debug APK** نصب‌پذیر است؛ کلید debug هر runner ممکن است متفاوت باشد، پس ارتقای بی‌دردسر یک APK آزمایشی به APK آزمایشیِ ساخت بعدی تضمین نمی‌شود. برای توزیع و به‌روزرسانی رسمی keystore و امضای release ثابت لازم است. خروجی Windows یک **NSIS setup.exe** بدون امضای کد است (ممکن است هشدار SmartScreen بگیرید). artifactها پس از ۱۴ روز منقضی می‌شوند. هر دو پیش از setup مدیر منتظر می‌مانند، پس از setup پاسخ نسخه‌دارِ Worker را مستقیم با HTTPS واکشی می‌کنند و هنگام خطای گذرا بدون حذف آدرس دوباره تلاش می‌کنند. `/app` کانفیگ اختصاصی کاربر را پس از فعال‌سازی از همان Worker می‌خواند. برای تغییر تنظیمات پنل نیازی به «patch» باینری نیست؛ برای تغییر **آدرس Worker** باید با URL جدید rebuild کنید تا امضا معتبر بماند. این برنامه‌ها **VPN سراسری نیستند**؛ برای اتصال، کلاینت مستقل VLESS/TLS/WS روی دستگاه نصب کنید.

## محدودیت‌ها و رفع اشکال

| نشانه | بررسی |
|---|---|
| `/setup` خطای 503 | `SETUP_KEY` حداقل ۲۴ نویسه در Secret Worker ثبت نشده؛ اگر توکن وارد کرده‌اید `APP_SECRET` حداقل ۳۲ نویسه هم لازم است |
| Pages 503 | Service binding `CORE` به Worker وجود ندارد؛ Pages را redeploy کنید |
| ربات کار نمی‌کند | وضعیت bot در پنل، آدرس HTTPS عمومی، توکن صحیح و دسترسی API تلگرام از Cloudflare را بررسی کنید |
| کانفیگ باز می‌شود ولی ترافیک عبور نمی‌کند | فقط TCP و مقصد دامنه با پورت ۸۰/۴۴۳ مجاز است؛ UDP و IP مستقیم پشتیبانی نمی‌شوند؛ صحت دسترسی Cloudflare/TLS/WS را تست کنید |
| شبکهٔ ملی/قطعی بین‌الملل | اگر Worker دسترس‌پذیر نباشد این معماری نمی‌تواند مسیر ایجاد کند؛ عدد ۸/۱۰ تضمین نیست. «۱۰ تلاش» در `/app` تنها پاسخ HTTPS Worker را می‌سنجد، نه اتصال واقعی VLESS. اتصال را با کلاینت مستقل و شبکهٔ مقصد ۱۰ بار جداگانه آزمایش کنید |
| AI خطای 503 | binding `AI` یا دسترسی Workers AI آماده نیست؛ تنظیمات دستی همچنان کار می‌کند |
| `workers.dev` آدرس مورد نظر نیست | نام Worker در `wrangler.toml` و نام پروژهٔ حساب شما باید یکی باشد؛ آدرس صحیح فقط پس از deploy موفق تعیین می‌شود |

**لینک راه‌اندازی Cloudflare:** [داشبورد رسمی Cloudflare](https://dash.cloudflare.com/). دکمهٔ [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/gaming-hub) تنها **بعد از merge این شاخه در شاخهٔ پیش‌فرض** همین نسخه را می‌گیرد. این مخزن از طرف ما در حساب Cloudflare شما به‌صورت خودکار منتشر نشده است.
