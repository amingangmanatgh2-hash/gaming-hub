# مدار | Madar Connect

فروشگاه فارسی مدیریت کانفیگ با **Cloudflare Workers + Durable Objects**، پنل `/panel`، راه‌اندازی امن `/setup`، ربات تلگرام اختیاری و وب‌اپ `/app`. سورس اپ‌های همراه Android و Windows هم در `clients/` است. سرویس گفت‌وگوی تصویری قبلی این مخزن در **`/meet`** و کد API اتاق در `/api/room` حفظ شده است ([راهنمای قبلی](docs/LEGACY-HAMKALAM.md)).

> **صداقت فنی:** این نسخه یک تونل **VLESS over TLS/WebSocket → TCP** روی Worker می‌دهد، نه موتور VPN بومی. فقط اتصال‌های TCP به *دامنهٔ عمومی* روی پورت ۸۰ یا ۴۴۳ مجازند؛ UDP، تونل بسته‌ای سیستم‌عامل، «۲۰۰۰ سرور اختصاصی»، تشخیص قطعی اینترنت ملی، دور زدن تضمینی DPI یا اتصال در قطع کامل اینترنت بین‌الملل وجود ندارد. برای استفاده از کانفیگ، کلاینت VLESS سازگار جداگانه لازم است. خرید پولی بدون درگاه، **ثبت سفارش + تأیید دستی مدیر** است؛ سایت وجهی دریافت نمی‌کند.

## آنچه واقعاً پیاده شده

| بخش | وضعیت |
|---|---|
| وب‌سایت RTL و PWA | صفحهٔ اصلی، تعرفه‌ها، راهنما، اپ قابل نصب، وضعیت لبه و تأخیر |
| راه‌اندازی `/setup` | کلید نصب از Secret، رمز مدیریت حداقل ۸ نویسه، توکن BotFather اختیاری در **گام اول** |
| پنل `/panel` | ورود امن، تنظیم متن/رنگ/طرح‌ها/نرخ دلار/فعال‌بودن رایگان و پولی، سفارش‌ها، لغو دسترسی، تغییر رمز، ربات و AI |
| قیمت | قیمت پایهٔ USD × نرخ مرجع **تومان برای هر دلار**؛ با تغییر نرخ، قیمت نمایشی فوراً تغییر می‌کند؛ سفارش قبلی مبلغ ثابت دارد. منبع HTTPS ساعتی اختیاری است |
| ربات تلگرام | `/start`، `/plans`، `/help`؛ webhook با secret header؛ توکن با AES-GCM و کلید مستقل Worker ذخیره می‌شود |
| Worker تونل | VLESS-over-WS با اعتبار UUID، تاریخ انقضا، محدودیت TCP 80/443 و دامنه؛ خروجی اشتراک Base64/متن/JSON |
| دستیار Workers AI | کد واقعی با حافظهٔ **سه پیام آخر**، پیشنهاد محدودشده و تأیید قبل از اعمال؛ فقط پس از افزودن binding و دسترسی Workers AI فعال می‌شود |
| اپ Android / Windows | سورس WebView و Electron با ورودی دامنهٔ HTTPS؛ بستهٔ نصب‌پذیر از GitHub Actions ساخته می‌شود. **لانچر/مدیر کانفیگ است، نه VPN بومی** |
| پرداخت خودکار، UDP، تضمین «نت ملی» | **پیاده نشده**؛ نیازمند سرویس/امکانات اضافه و آزمون واقعی است |

### ساختار

```
public/            سایت، /panel، /setup، /app، PWA و سرویس قبلی /meet
worker/            Worker HTTP + TCP bridge + MarketState Durable Object (+ Room قدیمی)
shared/market.js   اعتبارسنجی، محاسبهٔ نرخ، پارسر VLESS و پروفایل‌ها
functions/         پروکسی Pages Functions → Worker از طریق service binding
clients/android/   سورس اپ همراه، خروجی debug APK در Actions
clients/desktop/   سورس اپ همراه Electron، خروجی NSIS setup.exe در Actions
tests/             تست‌های واحد، بازار end-to-end با DO محلی، و تست‌های سرویس قبلی
```

## اجرای محلی (بدون حساب Cloudflare)

```bash
# Node.js 22 یا جدیدتر لازم است.
npm ci
cp .dev.vars.example .dev.vars
# در .dev.vars کلیدهای محلی SETUP_KEY و APP_SECRET را با رشته‌های منحصر‌به‌فرد عوض کنید.
npm run dev
# http://localhost:8787  |  /setup  |  /panel  |  /app
npm test
```

`SETUP_KEY` باید حداقل ۲۴ نویسه و `APP_SECRET` حداقل ۳۲ نویسه باشد. کلید نصب را در گام اول `/setup` وارد کنید و رمز مدیر (حداقل ۸ نویسه) را **خودتان** انتخاب کنید. اگر توکن ربات ندارید، فیلد را خالی بگذارید و بعداً در پنل ثبت کنید. `.dev.vars` و فایل‌های محلی استقرار در Git نادیده گرفته می‌شوند؛ نمونه‌کلیدها فقط برای توسعه‌اند. اگر برای اجرای قدیمی چت به‌تنهایی سرور Node می‌خواهید: `npm run dev:legacy` (این mock API بازار را اجرا نمی‌کند).

## انتشار واقعی (Cloudflare)

**راهنمای کامل فارسی:** [docs/DEPLOY-fa.md](docs/DEPLOY-fa.md)

1. کد **این شاخه** را روی GitHub داشته باشید: [مشاهدهٔ شاخهٔ مدار](https://github.com/amingangmanatgh2-hash/gaming-hub/tree/arena/9ca26ff9-gaming-hub).
2. از [داشبورد Cloudflare](https://dash.cloudflare.com/) وارد حساب خود شوید؛ یا روی دستگاه خود `npx wrangler login` اجرا کنید.
3. در همین ریشه: `npm ci && npm run deploy`؛ آدرس واقعی `https://gaming-hub.<account>.workers.dev` فقط پس از انتشار موفق توسط Wrangler نمایش داده می‌شود. نام Worker با سرویس ازقبل‌متصل به این مخزن یکی است؛ برای حساب تازه می‌توانید نام را در `wrangler.toml` تغییر دهید.
4. در همان حساب، دو **Secret** با مقدارهای تصادفیِ خودتان ثبت کنید: `npx wrangler secret put SETUP_KEY` و `npx wrangler secret put APP_SECRET`. کلید نصب را نزد خود نگه دارید. سپس `https://<آدرس-واقعی>/setup` را باز کنید. سایت قبل از نصب اولیه سفارش/دسترسی صادر نمی‌کند.
5. برای ربات، توکن را فقط در گام اول setup یا بخش ربات پنل وارد کنید؛ ثبت webhook نیازمند دامنهٔ عمومی HTTPS و دسترسی Worker به Telegram API است.

**Cloudflare Pages (اختیاری):** ابتدا **Worker بالا** باید منتشر شود. Pages خروجی `public` را با build command `npm run build` سرو می‌کند؛ Pages Functions نیاز به **Service binding `CORE` به Worker `gaming-hub`** دارند. برای لینک‌های کانفیگ Pages، `EDGE_HOST` را به hostname واقعی Worker تنظیم کنید. صفحات تنها و بدون Worker هیچ API یا تونل فعالی ندارند. جزئیات در راهنمای انتشار.

**لینک سریع استقرار پس از انتقال این شاخه به شاخهٔ پیش‌فرض مخزن:** [Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/gaming-hub). تا وقتی تغییرات این شاخه به `Main` نرسیده‌اند، این دکمه نسخهٔ قدیمی `Main` را منتشر می‌کند؛ برای نسخهٔ حاضر از دستور بالا و همین شاخه استفاده کنید. در این محیط حساب Cloudflare متصل نیست، بنابراین **آدرس زندهٔ ساختگی ارائه نمی‌شود**.

## APK و setup.exe

گردش‌کار [Build companion apps](https://github.com/amingangmanatgh2-hash/gaming-hub/actions/workflows/clients.yml) با push روی همین شاخه یا `workflow_dispatch` دو **artifact** تولید می‌کند:

- `Madar-Android-debug-APK` → `app-debug.apk` (امضای debug برای آزمایش؛ برای انتشار رسمی نیاز به keystore و امضای release دارید)
- `Madar-Windows-Setup` → `Madar-Setup-0.1.0-x64.exe` (NSIS، بدون امضای کد؛ Windows SmartScreen ممکن است هشدار دهد)

از صفحهٔ اجرای موفق Actions، بخش **Artifacts** را باز و فایل‌ها را دانلود کنید (artifactها ۱۴ روز پس از ساخت منقضی می‌شوند). هر دو برنامه در اولین اجرا آدرس HTTPS Worker شما را می‌پرسند. وب‌اپ `/app` بدون فایل بومی هم نصب‌پذیر است. نصب این برنامه‌ها، خودبه‌خود VPN سراسری ایجاد نمی‌کند. برای توسعهٔ Android: JDK 17، Android SDK 35 و Gradle 8.9؛ در `clients/android` دستور `gradle :app:assembleDebug`. برای ویندوز: در `clients/desktop` دستور `npm ci && npm run dist` روی Windows.

## نکات امنیت و عملیات

- `SETUP_KEY` مانع تصاحب پنل قبل از نصب می‌شود. رمز مدیر PBKDF2-SHA256 با نمک تصادفی است؛ نشست ۷روزهٔ `Secure/HttpOnly/SameSite=Strict` و CSRF/Ori­gin برای تغییرات پنل استفاده می‌شود. توکن ربات فقط با `APP_SECRET` در Worker قابل رمزگشایی است؛ **در Git ثبتش نکنید و APP_SECRET را برای بازیابی پشتیبان بگیرید**.
- کد پیگیری سفارش را خصوصی نگه دارید. اشتراک و کانفیگ هم نوعی کلید دسترسی‌اند. اطلاعات تماس مشتری فقط برای بررسی دستی است؛ برای فروش واقعی، سیاست حریم خصوصی و روش پرداخت/استرداد مناسب اضافه کنید.
- منبع FX اختیاری باید خودتان تعریف و اعتبارسنجی کنید: پاسخ `{"usdToToman": 93000}` روی HTTPS. بدون منبع، نرخ دستی است. مقدار **تومان** است، نه ریال.
- این طراحی یک DO برای فروشگاه دارد و برای حجم کم آزمایشی ساخته شده است (سقف ۱۲ طرح و ۲۰۰۰ سفارش). ۲۰۰۰ **سفارش** را با ۲۰۰۰ **سرور** اشتباه نگیرید. محدودیت ترافیک مصرفی/سهمیهٔ حجمی هنوز پیاده نشده است. لغو اشتراک اتصال‌های *جدید* را می‌بندد؛ اتصال WebSocket از قبل باز تا قطع‌شدنش ممکن است ادامه یابد.
- سیاست استفاده و سهمیه/هزینه‌های Cloudflare (از جمله Workers AI و outgoing TCP) را برای حساب و ترافیک خود بررسی کنید. دستورهای AI قبل از اعمال روی سرور با allowlist اعتبارسنجی می‌شوند.
- توضیح امنیتی بیشتر: [SECURITY.md](SECURITY.md). مستندات سرویس قبلی: [docs/LEGACY-HAMKALAM.md](docs/LEGACY-HAMKALAM.md).

**لایسنس:** MIT · دادهٔ نمونه و رمز/توکن واقعی در مخزن قرار نگرفته‌اند.
