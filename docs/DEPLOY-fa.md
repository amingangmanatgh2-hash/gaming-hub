# راهنمای گام‌به‌گام انتشار «هم‌کلام» (فارسی)

سه مسیر دارید. هر سه رایگان‌اند. اگر تازه‌کار هستید، **مسیر ۱** را بروید (۵ دقیقه).

---

## مسیر ۱ — دکمهٔ یک‌کلیکی Cloudflare (ساده‌ترین)

1. این لینک را باز کنید:
   **https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/gaming-hub**
2. «Connect GitHub» را بزنید و اجازه دهید (اگر اکانت کلودفلر ندارید، همان‌جا رایگان بسازید).
3. کلودفلر:
   * یک فورک از مخزن در اکانت گیت‌هاب شما می‌سازد،
   * وابستگی‌ها را نصب و بسته را می‌سازد،
   * Worker را منتشر می‌کند و همهٔ منابع لازم (Durable Object، Assets) را خودش می‌سازد.
4. در پایان آدرسی مثل `https://hamkalam.<username>.workers.dev` می‌گیرید — همین آدرس اپ شماست.
   هر `push` روی شاخهٔ اصلی، خودکار دوباره منتشر می‌شود (CI/CD آماده است).

> اگر دکمه کار نکرد: مخزن باید **عمومی** باشد و فایل `.github/workflows/deploy.yml` وجود داشته باشد (هست ✅).

---

## مسیر ۲ — با ترمینال (توصیه‌شده برای توسعه)

```bash
# ۱. گرفتن کد
git clone https://github.com/amingangmanatgh2-hash/gaming-hub hamkalam
cd hamkalam

# ۲. نصب
npm install

# ۳. ورود به کلودفلر (یک‌بار؛ مرورگر باز می‌شود)
npx wrangler login

# ۴. آزمایش محلی (لوکال، بدون هیچ اکانتی)
npm run dev:worker        # http://localhost:8787

# ۵. انتشار
npm run deploy
```

خروجی `npm run deploy` چیزی شبیه این است:

```
Total Upload: 35.29 KiB / gzip: 9.65 KiB
Uploaded hamkalam (3.4 sec)
Deployed hamkalam triggers (0.5 sec)
  https://hamkalam.<username>.workers.dev
```

### چه چیزهایی ساخته می‌شود؟
* **Assets** → همان پوشهٔ `public` (سایت، CSS، آیکون‌ها، Service Worker)
* **Worker** → `worker/index.js` (API + مسیر `/r/CODE` + سیگنالینگ)
* **Durable Object** با نام کلاس `Room` و بایندینگ `ROOMS` (با migration `v1`، SQLite-backed)

### تنظیم پیش‌فرض‌ها (اختیاری)
در `wrangler.toml` → بخش `[vars]`:

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `ROOM_TTL_HOURS` | `8` | عمر پیش‌فرض هر اتاق (ساعت) — کاربر می‌تواند کمتر/بیشتر کند (تا ۲۴) |
| `EMPTY_GRACE_SECONDS` | `90` | چند ثانیه بعد از خالی‌شدن، اتاق پاک شود |
| `MAX_PARTICIPANTS` | `12` | سقف نفرات هر اتاق (سخت‌گیرانه‌ترین حالت ۱۶) |

---

## مسیر ۳ — Cloudflare Pages (اگر حتماً Pages می‌خواهید)

1. داشبورد کلودفلر → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → مخزن را انتخاب کنید.
2. تنظیمات ساخت:
   * **Build command**: `npm run build`
   * **Build output directory**: `public`
3. بعد از اولین دیپلوی → **Settings → Functions → Durable Object bindings → Add binding**
   * **Variable name**: `ROOMS`
   * **Durable Object class**: `Room`
   * (نام فضای‌نام/Namespace را همان پیش‌فرض رها کنید یا مطابق `wrangler.toml` تنظیم کنید)
4. دوباره Deploy کنید.

> اگر این بایندینگ را اضافه نکنید، سایت باز می‌شود ولی سرور اتاق (چت/سیگنالینگ) کار نمی‌کند.

---

## افزودن TURN رایگان (برای کاربران پشت NAT سخت / اینترنت موبایل)

بدون TURN، تماس‌ها مستقیم (P2P) است و در بیشتر موارد کار می‌کند. اگر کاربری از اپراتور
موبایل با CGNAT وصل می‌شود و صدایی ردوبدل نمی‌شود، این را انجام دهید:

1. داشبورد کلودفلر → **Realtime** → **TURN Server** → **Create TURN key**.
   (نام ناحیهٔ کاربری‌ای که ساختی را یادداشت کن، مثلاً `Realtime > TURN` — نه Calls/SFU)
2. مقادیر را ست کنید:
   ```bash
   npx wrangler secret put TURN_KEY_ID
   npx wrangler secret put TURN_KEY_API_TOKEN
   npx wrangler deploy
   ```
   در Pages: **Settings → Environment variables → Add** (به‌صورت Secret).
3. تمام. اپ خودش `/api/ice` را با اعتبار کوتاه‌عمر TURN پر می‌کند و
   کلید اصلی هرگز به مرورگر نمی‌رود. سهمیهٔ رایگان: **۱ ترابایت در ماه**.

پس از فعال‌سازی، در صفحهٔ اصلی «TURN رایگان فعال است» را می‌بینید.

---

## دامنهٔ اختصاصی خودتان

1. دامنه را به کلودفلر اضافه کنید (Nameserverها یا CNAME).
2. Workers/Pages → پروژهٔ خود → **Settings → Domains & Routes → Add → Custom Domain**.
3. آدرس دلخواه (مثلاً `meet.example.com`) را وارد کنید — گواهی HTTPS خودکار ساخته می‌شود.

---

## به‌روزرسانی نسخه

```bash
git pull
npm install
npm run deploy
```
اگر با دکمهٔ یک‌کلیکی نصب کرده‌اید، فقط در مخزن فورک‌شده `git pull` + push کنید؛
Cloudflare Builds خودش منتشر می‌کند.

---

## چک‌لیست بعد از انتشار ✅

- [ ] `https://<آدرس-شما>/api/health` مقدار `"ok": true` می‌دهد
- [ ] در صفحهٔ اصلی دکمهٔ «اندازه‌گیری» یک تأخیر منطقی نشان می‌دهد
- [ ] یک اتاق می‌سازید و لینک را در گوشی دوم باز می‌کنید → دو نفر هم‌دیگر را می‌بینند
- [ ] چت و ارسال عکس کار می‌کند
- [ ] تخته سفید و اشتراک صفحه کار می‌کنند
- [ ] اگر لازم بود، TURN را فعال کردید (بالا) و دوباره تست کردید
