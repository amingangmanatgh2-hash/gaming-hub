#!/usr/bin/env bash
# ==========================================================================
# tools/build-android.sh  ::  ساخت APK روی دستگاه خودت (اندروید استودیو/CLI)
# --------------------------------------------------------------------------
# پیش‌نیاز: Android SDK (ANDROID_HOME) + JDK 17 + Gradle (یا از Android Studio
# باز کن و روی Run بزن). این اسکریپت فقط Gradle را صدا می‌زند.
# خروجی:
#   android/app/build/outputs/apk/debug/app-debug.apk        (قابل نصب)
#   android/app/build/outputs/apk/release/app-release-unsigned.apk
# ==========================================================================
set -euo pipefail

cd "$(dirname "$0")/../android"

if ! command -v gradle >/dev/null 2>&1; then
  echo "✗ Gradle پیدا نشد."
  echo "  یا Android Studio را باز کن و پروژه‌ی پوشه‌ی android/ را Import کن،"
  echo "  یا Gradle را نصب کن:  https://gradle.org/install"
  exit 1
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  echo "هشدار: ANDROID_HOME تنظیم نیست. اگر Android Studio داری، معمولاً خودش SDK را پیدا می‌کند."
fi

echo "→ ساخت نسخه‌ی debug (امضاشده، قابل نصب)…"
gradle :app:assembleDebug --no-daemon

echo "→ ساخت نسخه‌ی release (unsigned)…"
gradle :app:assembleRelease --no-daemon || true

echo
echo "✓ خروجی‌ها:"
ls -la app/build/outputs/apk/debug/app-debug.apk 2>/dev/null || true
ls -la app/build/outputs/apk/release/app-release-unsigned.apk 2>/dev/null || true
echo
echo "برای نصب روی گوشی:  adb install -r app/build/outputs/apk/debug/app-debug.apk"
