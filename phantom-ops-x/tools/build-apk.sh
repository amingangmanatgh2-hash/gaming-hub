#!/usr/bin/env bash
# Local APK build helper — mirrors CI (.github/workflows/phantom-apk.yml).
# Requires: JDK 17, Gradle 8.9, Android SDK 35. Honest errors if missing.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== PHANTOM OPS X local build =="
command -v java >/dev/null || { echo "✖ Java 17 not found. Install a JDK 17 (e.g. Temurin) — or use the GitHub Actions build."; exit 1; }
java -version 2>&1 | head -1
command -v gradle >/dev/null || { echo "✖ Gradle not found (need 8.9). Install Gradle or use the GitHub Actions build."; exit 1; }
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
[ -n "$ANDROID_HOME" ] && [ -d "$ANDROID_HOME/platforms/android-35" ] || { echo "✖ Android SDK platform 35 not found (ANDROID_HOME=$ANDROID_HOME). Install via sdkmanager or use CI."; exit 1; }

echo "== Running game tests =="
node --test tests/*.test.js

echo "== Regenerating update manifest =="
node tools/gen-manifest.mjs

echo "== Building debug APK (Gradle bundles ../app into assets) =="
cd launcher-android
gradle :app:assembleDebug --no-daemon
APK=app/build/outputs/apk/debug/app-debug.apk
echo "✔ APK built: launcher-android/$APK"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose "$APK" | head -3
echo "Install it with:  adb install -r $APK"
