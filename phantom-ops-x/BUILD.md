# BUILD — PHANTOM OPS X

## Web bundle (no build step)
The game in `app/` is plain ES modules + a vendored Three.js build. Any static host works:

```bash
python3 -m http.server 8090 --directory phantom-ops-x/app
```

After changing game files, refresh the signed update manifest:

```bash
cd phantom-ops-x && node tools/gen-manifest.mjs
```

This rewrites `app/update-manifest.json` (version from `package.json`, SHA-256 per file).
Commit it together with the game changes — launchers verify downloads against it.

## Android APK — CI (recommended)
1. Push to GitHub (or run the workflow manually).
2. Workflow `Build PHANTOM OPS X` runs Node tests, then builds with
   Gradle 8.9 / JDK 17 / Android SDK 35.
3. The Gradle `bundleGame` task copies `phantom-ops-x/app/**` into
   `app/src/main/assets/game/` automatically — no manual asset step.
4. Download artifact **PhantomOpsX-Android-debug-APK** and install:
   `adb install -r app-debug.apk` (debug-signed; enable USB debugging / "install via USB").

## Android APK — local
Requirements: JDK 17, Gradle 8.9, Android SDK 35 (`ANDROID_HOME` set).

```bash
cd phantom-ops-x
bash tools/build-apk.sh
# → launcher-android/app/build/outputs/apk/debug/app-debug.apk
```

## Custom update channel
The launcher fetches `<base>/update-manifest.json` then `<base>/<file>` for each file,
SHA-256-verifies all of them, and only then swaps the install (previous bundle is
restored automatically if anything fails).

- Host `phantom-ops-x/app/` on any static HTTPS host.
- Build with your base URL: `PHANTOM_UPDATE_BASE=https://your.host/path/to/app bash tools/build-apk.sh`
- Or replace the default in `launcher-android/app/build.gradle.kts`.
- Bump `version` in `phantom-ops-x/package.json`, run `npm run manifest`, deploy the files.

Data preservation: game files live in `files/game-current`; profiles/inventory live in
WebView localStorage under a constant virtual origin — updates and Repair never touch them.

## Project layout
```
phantom-ops-x/
  app/                 the standalone game (index.html, css, js/)
    js/mods.js         modification engine (pure logic — unit tested)
    js/game.js         Three.js FPS (uses mods.js verbatim in the loop)
    js/menu.js         floating Phantom menu / Armory / Inventory Lab
    js/profiles.js     Phantom accounts + backups
    js/economy.js      sandbox economy
    js/launcher-core.js update/repair logic shared with the Android launcher
    js/catalog.js      weapons / cosmetics / maps / modes (original content)
  tests/               node:test suites
  tools/               manifest generator, build-apk.sh, jsdom smoke test
  launcher-android/    native Android launcher (Java, no game code in the APK binary)
```
