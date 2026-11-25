# راهنمای ساخت APK — AMIN CHESS AI

از **GitHub Actions** استفاده می‌کنیم؛ نیازی به نصب Android Studio روی کامپیوترت نیست.

## مسیر سریع (۵ قدم)

### قدم ۱ — پروژه را در GitHub قرار بده

```bash
# اگر کل این مخزن را push می‌کنی، کافی است:
git add amin-chess-ai .github/workflows/amin-chess.yml
git commit -m "AMIN CHESS AI"
git push origin main
```

اگر فقط پوشه `amin-chess-ai` را به‌صورت مخزن مستقل می‌خواهی، workflow داخلی آن پوشه (`.github/workflows/android-build.yml` داخل پوشه) را به ریشه مخزن منتقل کن و خط `working-directory: amin-chess-ai` و پیشوند مسیر Artifact را حذف کن.

### قدم ۲ — فعال‌سازی Actions

مخزن → تب **Actions** → اگر پیام بود: «I understand my workflows, go ahead and enable them».

### قدم ۳ — اجرای Build

- Actions → **ساخت APK شطرنج امین** → **Run workflow** → **Run workflow**
- یا فقط یک push به main/master بزن (اجرای خودکار).
- مدت: حدود ۵–۸ دقیقه.

مراحل داخل workflow به‌ترتیب:
1. دریافت سورس
2. نصب Node.js 20
3. `npm install` وابستگی‌ها
4. اجرای تست‌ها (`npm test`)
5. ساخت نسخه وب (`node scripts/build-web.mjs` → `www/`)
6. `npx cap sync android` (همگام‌سازی Capacitor)
7. نصب Java 17 (Temurin)
8. راه‌اندازی Android SDK
9. اجرای Gradle Build
10. آپلود APK به Artifacts

### قدم ۴ — دانلود APK

صفحه اجرای Workflow → پایین صفحه بخش **Artifacts**:

| Artifact | محتوا | مصرف |
|---|---|---|
| `amin-chess-debug-apk` | `app-debug.apk` | نصب مستقیم روی گوشی برای تست |
| `amin-chess-release-apk` | `app-release.apk` | نسخه نهایی (امضاشده با Secrets) |

Artifact به‌صورت ZIP دانلود می‌شود؛ داخلش APK است. برای نصب: فایل را به گوشی ببر → بزن → اجازه «نصب از منابع ناشناس» بده.

### قدم ۵ — (اختیاری) نسخه Release امضاشده

روی کامپیوتر خودت Keystore بساز:

```bash
keytool -genkeypair -v \
  -keystore amin-chess.keystore \
  -alias amin-chess \
  -keyalg RSA -keysize 2048 -validity 10000
```

به Base64 تبدیل کن:

```bash
base64 -w0 amin-chess.keystore > ks.b64      # لینوکس
certutil -encode amin-chess.keystore ks.b64  # ویندوز (محتوای بین BEGIN/END را بگیر)
```

در GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | مقدار |
|---|---|
| `AMIN_CHESS_KEYSTORE` | محتوای `ks.b64` |
| `AMIN_CHESS_KEY_PASSWORD` | رمز Keystore |
| `AMIN_CHESS_KEY_ALIAS` | `amin-chess` |

دوباره Workflow را اجرا کن → این‌بار Release APK **امضاشده** می‌سازد.

> ⚠️ فایل `.keystore` و رمزها هرگز در مخزن Commit نشوند؛ workflow فقط از Secrets می‌خواند.

## ساخت محلی (بدون Actions)

```bash
cd amin-chess-ai
npm install
npm run build
npx cap sync android
cd android
gradle assembleDebug          # اگر gradle نصب است، یا با Android Studio باز کن
# خروجی: app/build/outputs/apk/debug/app-debug.apk
```

## عیب‌یابی

| خطا | راه‌حل |
|---|---|
| `SDK location not found` | workflow این را خودش حل می‌کند؛ در محلی فایل `android/local.properties` با `sdk.dir=...` بساز |
| خطای نسخه Gradle | از Gradle 8.5+ استفاده کن (wrapper و CI همین را می‌گیرند) |
| `minSdkVersion` خطا | گوشی باید Android 6+ (API 23) داشته باشد |
| WASM کار نکرد در WebView | WebView اندروید را به آخرین نسخه به‌روزرسانی کن (Play Store) |
| Artifact خالی | لاگ مرحله Gradle Build را ببین؛ معمولاً کمبود حافظه است — workflow با `--no-daemon` و Xmx2048m تنظیم شده |
