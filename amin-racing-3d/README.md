<div align="center">

# AMIN RACING 3D

**A Persian 3D endless highway racing game for Android**
**بازی مسابقه‌ای سه‌بعدی بزرگراه بی‌پایان، به زبان فارسی**

[![Build APK](https://github.com/amingangmanatgh2-hash/gaming-hub/actions/workflows/amin-racing-3d.yml/badge.svg?branch=arena%2Fc01e8093-gaming-hub)](https://github.com/amingangmanatgh2-hash/gaming-hub/actions/workflows/amin-racing-3d.yml)
[![Release](https://img.shields.io/badge/release-amin--racing--v2.0.0-ff3fa4)](https://github.com/amingangmanatgh2-hash/gaming-hub/releases/tag/amin-racing-v2.0.0)
![minSdk 26](https://img.shields.io/badge/minSdk-26-3ddc84)
![Kotlin](https://img.shields.io/badge/Kotlin-2.0-7f52ff)
![OpenGL ES 3.0](https://img.shields.io/badge/OpenGL_ES-3.0-5586a4)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

</div>

A native Android racing game written in Kotlin with a custom OpenGL ES 3.0 renderer. It uses no game
engine, no WebView and no third-party libraries. All 3D models, textures, music and sound effects are
generated in code when the game starts, so the release APK is only about 330 KB.

> بازی کاملاً بومی اندروید با Kotlin و OpenGL ES 3.0. همهٔ مدل‌ها، بافت‌ها، صداها و موسیقی به‌صورت
> رویه‌ای (procedural) ساخته می‌شوند. زبان پیش‌فرض فارسی (راست‌به‌چپ) است و از تنظیمات می‌توان آن را به
> انگلیسی تغییر داد.

## Screenshots

These screenshots were captured from the debug APK running on an Android emulator in CI. The emulator
uses software rendering (SwiftShader), so it runs much slower than a real phone.
The yellow digit in some race shots is the start countdown, which runs slowly at the emulator's low frame rate.

| Main menu | Garage | Two-way highway |
|:---:|:---:|:---:|
| <img src="docs/screenshots/01-main-menu-fa.jpg" width="240"> | <img src="docs/screenshots/02-garage-supercar.jpg" width="240"> | <img src="docs/screenshots/06-race-city-two-way.jpg" width="240"> |
| **Desert – sunset** | **Snow – Time Attack** | **Forest – night (crash)** |
| <img src="docs/screenshots/07-race-desert-sunset.jpg" width="240"> | <img src="docs/screenshots/08-race-snow-time-attack.jpg" width="240"> | <img src="docs/screenshots/09-race-forest-night.jpg" width="240"> |
| **Upgrade shop** | **Game over** | **Settings (English)** |
| <img src="docs/screenshots/03-upgrade-shop.jpg" width="240"> | <img src="docs/screenshots/10-game-over.jpg" width="240"> | <img src="docs/screenshots/14-settings-english.jpg" width="240"> |

<img src="docs/screenshots/12-landscape-city-night.jpg" width="740" alt="Landscape – city at night">

## What's new in 2.0

| Redesigned main menu | Taxi job: passenger waiting | Taxi ride in progress |
|:---:|:---:|:---:|
| <img src="docs/screenshots/42-main-menu-v2.jpg" width="240"> | <img src="docs/screenshots/34-taxi-passenger-waiting.jpg" width="240"> | <img src="docs/screenshots/35-taxi-ride-hud.jpg" width="240"> |
| **On foot in Free Roam** | **In-game phone** | **Phone: live map** |
| <img src="docs/screenshots/36-free-roam-on-foot.jpg" width="240"> | <img src="docs/screenshots/37-phone-home.jpg" width="240"> | <img src="docs/screenshots/38-phone-map.jpg" width="240"> |
| **Phone: radio** | **Photo mode** | **New car: Electric GT** |
| <img src="docs/screenshots/40-phone-radio.jpg" width="240"> | <img src="docs/screenshots/41-photo-mode.jpg" width="240"> | <img src="docs/screenshots/31-car-electric-gt.jpg" width="240"> |

- **Four new cars** (14 in total): Rally Hatch (4×4 with roof scoop and light pod), Electric GT (silent
  electric motor sound, panoramic roof, light bars), Taxi (pays 1.5× on taxi fares) and Drift Coupe.
  The new cars also show up as rivals in street races.
- **Taxi jobs in Endless mode.** Stop next to the waiting passenger (yellow marker), drive them to their
  destination (green marker) before the timer runs out, and stop at the kerb. You get a fare plus a tip
  that depends on your star rating, and scrapes or crashes cost stars. Turn the taxi shift on or off
  from the phone.
- **Walking in Free Roam.** Stop the car and press the door button to step out. You can walk or run
  around, look at the scenery, and get back into the car.
- **In-game phone** (phone button in Endless and Free Roam, which pauses the game). Apps: live map with
  tunnels, bridges, landmarks and taxi pins; taxi shift and stats; quick car swap; messages with
  passenger reviews; camera; radio with three generated stations (Neon FM, Lo-fi, Turbo); run stats;
  and quick settings.
- **Photo mode:** orbit, zoom and take a photo. Photos are kept in the in-phone gallery and, on Android
  10 and newer, also saved to `Pictures/Amin Racing`.
- **New main menu:** a car showcase card with stats, a large Quick Race button, icon tiles for Garage,
  Challenges and Settings, and a scrolling strip of game-mode tiles with medals and "NEW" badges.
- New achievements: First Fare and City Cabbie.

## Features

**Gameplay**
- Third-person chase camera on an endless four-lane highway with dense AI traffic. Traffic cars keep
  their distance, brake, signal and change lanes, and the horn makes slower cars move over.
- Three modes:
  - **Endless:** all traffic drives your way.
  - **Two-Way:** oncoming traffic, and your score is doubled (×2) while you drive in the opposite lanes.
  - **Time Attack:** reach each checkpoint before the clock runs out.
- Near-miss bonuses with combo multipliers, nitro boost and coins on the road.
- Four player cars: Sports, Muscle, SUV and Supercar.
- Five traffic vehicles: Sedan, Taxi, Van, Truck and Bus.
- Garage where you buy cars, paint them (10 colours) and upgrade Speed, Handling, Brakes and Nitro
  (5 levels each).

**Graphics (OpenGL ES 3.0, all procedural)**
- Cars with wheels, rims, headlights, tail and brake lights and turn signals, plus suspension, body
  roll and pitch.
- Four environments (City, Desert, Snow, Forest) and four lighting options (Day, Sunset, Night, and a
  cycle that moves through them).
- Street lights, buildings with lit windows at night, trees, cacti, rocks, signs, billboards,
  guardrails and distant mountains.
- Shadow mapping on High, plus blob shadows. Distance fog, a wet-look road and car paint reflections,
  and headlight and street-light pools at night.
- Nitro flames, tyre smoke, snow and sand spray, sparks, crash debris and slow motion on impact.
- Field of view that widens with speed, and camera shake on impacts.
- Instanced rendering, object pools and a floating origin keep the highway endless without
  allocating memory during a race.

**Controls**
- Tilt steering using the gravity sensor (fused with the gyroscope where available). You can
  calibrate it and set its sensitivity.
- Touch buttons for steering, gas, brake, nitro and horn, with multi-touch.
- The game switches to touch controls automatically when the phone has no tilt sensor.
- Optional auto-accelerate.

**Audio** (generated in real time, with no audio files)
- Engine sound whose RPM follows a six-gear model, plus wind, nitro hiss, horn and guardrail scrape.
- Near-miss, crash, coin, checkpoint and countdown sounds.
- A looping synthwave music track.
- Separate switches for sound effects and music, plus a mute option.

**UI**
- Persian right-to-left layout by default, with Persian digits and the Vazirmatn font. Switch to
  English in Settings.
- Main menu, mode, environment and time-of-day selection, garage and car select, upgrade shop,
  settings, pause, game over and a top-10 scoreboard for each mode.
- In-race display for score, speed, distance, coins, nitro, combo, ×2 and the Time Attack clock.
- Dark neon style with animations. Works in portrait and landscape, and handles display cutouts.

**Performance and save data**
- Low, Medium and High graphics presets. The game targets 60 FPS and drops the quality level
  automatically when the frame rate stays low.
- Progress is saved offline in SharedPreferences: coins, owned cars, selected car, upgrades, paint,
  high scores, settings and unlocked environments.

## Install

1. Download **`AminRacing3D-2.0.0-release.apk`** from the release
   [amin-racing-v2.0.0](https://github.com/amingangmanatgh2-hash/gaming-hub/releases/tag/amin-racing-v2.0.0).
   `SHA256SUMS.txt` in the same release lets you check the download.
2. On your phone, allow installs from unknown sources for your browser or file manager.
3. Open the APK and install it. You need Android 8.0 (API 26) or newer with OpenGL ES 3.0.

The release also contains `AminRacing3D-2.0.0-debug.apk`. It is a debuggable build with the package
name `com.amin.racing3d.debug`, so you can install it alongside the release build.

## Build from source

Requirements: JDK 17 and the Android SDK with Platform 35 and Build-Tools 35.0.0. Android Studio
Ladybug or newer includes both.

```bash
git clone https://github.com/amingangmanatgh2-hash/gaming-hub.git
cd gaming-hub/amin-racing-3d
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # app/build/outputs/apk/release/app-release.apk
```

You can also open the `amin-racing-3d` folder (not the repository root) in Android Studio and press **Run**.

### Release signing

The release build looks for its signing key in these places, in order:

1. The environment variables `AMIN_KEYSTORE_BASE64` (the keystore encoded as base64),
   `AMIN_KEYSTORE_PASSWORD`, `AMIN_KEY_ALIAS` and `AMIN_KEY_PASSWORD`. Add these as repository secrets
   so that GitHub Actions signs releases with your key.
2. A local `keystore.properties` file containing `storeFile`, `storePassword`, `keyAlias` and
   `keyPassword`. This file is git-ignored.
3. If neither exists, the shared debug key in `signing/debug.keystore`. This key is not secret, so use
   your own key for public releases.

### CI (GitHub Actions)

The game is built by `.github/workflows/amin-racing-3d.yml` at the root of this repository:

- **Push or pull request** that changes `amin-racing-3d/**`: the workflow builds the debug and release
  APKs, verifies their signatures with `apksigner`, and uploads them as the artifact
  `amin-racing-3d-apks`. It then installs the debug APK on an Android emulator, drives it through the
  menus and races, and commits the screenshots and logcat to `ci-output/amin-racing-3d/`.
- **A published GitHub Release whose tag starts with `amin-racing-v`** (for example `amin-racing-v1.1.0`):
  the workflow builds both APKs and attaches them to the release, together with `SHA256SUMS.txt`.
  Release tags for other projects in this repository are ignored.
- **Manual run** (*Actions → AMIN RACING 3D → Run workflow*): leave `release_tag` empty for a test build,
  or enter a tag to attach the APKs to that release. This also works for draft releases.

To publish a new version:

1. Raise `versionCode` and `versionName` in `app/build.gradle.kts`.
2. Publish a release tagged `amin-racing-v<versionName>`.

## Project structure

```
app/src/main/java/com/amin/racing3d/
├── MainActivity.kt        activity, lifecycle, navigation, immersive mode
├── game/                  World (physics, traffic AI, scoring, scenery recycling), GameData, Particles
├── render/                GL helpers, instancing, mesh builder, procedural models/textures, shaders, renderer
├── audio/AudioEngine.kt   real-time synthesizer (engine, SFX, music) on an AudioTrack thread
├── input/                 touch state + tilt controller
├── ui/                    Canvas HUD + view-based neon menus
└── core/                  save system, language/RTL helpers
```

## License

The code is released under the MIT License (see [LICENSE](LICENSE)). The Vazirmatn font is licensed
under the SIL Open Font License 1.1 (see [licenses/Vazirmatn-OFL.txt](licenses/Vazirmatn-OFL.txt)).
