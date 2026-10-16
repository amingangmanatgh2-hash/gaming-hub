# PHANTOM OPS X — Maximum Freedom FPS Lab

A **complete, standalone, offline first-person shooter platform**: a playable FPS, a real
modification engine whose settings change live gameplay, an unlimited sandbox economy,
a mythic armory, multi-profile local accounts, a draggable floating menu (EN/FA), and an
independent Android launcher with SHA-256-verified updates.

> **Scope & honesty.** This is an *independent* experimental game. It does **not** inject
> into, modify, or interact with Call of Duty or any other game, does not bypass
> anti-cheat, and never touches official accounts, servers, or purchases. Every
> "experimental" mechanic (aim assist, flight, stat mods…) exists **inside this
> standalone simulation only**. PHANTOM CREDITS are fictional. See [TESTING.md](TESTING.md)
> for what is verified, and the limitations section below.

## Play it

### Browser (any modern desktop/mobile browser)
Serve the folder and open the app — no build step, works offline after first load:

```bash
cd phantom-ops-x
python3 -m http.server 8090 --directory app
# open http://localhost:8090
```

Flow: **Launcher → Create profile (or Guest) → DEPLOY**.

### Android
Install the debug APK built by CI (artifact `PhantomOpsX-Android-debug-APK`) or build
locally — see [BUILD.md](BUILD.md). The launcher provisions the game on-device,
plays fully offline, checks a public update channel, verifies every downloaded
file with SHA-256 before install, and can repair itself without touching profiles.

## What's inside

| System | Where | What it really does |
|---|---|---|
| **Ultra Modification Engine** | `app/js/mods.js` | Pure, unit-tested logic: aim target selection (crosshair/nearest/weakest), head/body bones, smoothing + strength tracking, flick-shot snap, target prediction/lead, per-weapon aim profiles; flight/speed/sprint/jump/air-control/gravity physics; weapon stat solver (fire rate, ADS, recoil, reload, spread, damage, scope, infinite ammo, attachments, levels). The game loop calls these exact functions every frame. |
| **Standalone FPS** | `app/js/game.js` | Three.js WebGL shooter: 3 maps, Team Deathmatch / Free-for-All / Training, 4 bot difficulties, ADS + sniper scope, hitscan + projectile weapons, recoil/bloom, radar, kill effects, damage numbers, HUD editor, mobile touch controls. |
| **Phantom Accounts** | `app/js/profiles.js` | Unlimited isolated local profiles + guest mode; per-profile inventory/progression/settings/configs/HUD layout; local backups with integrity checksum; profile reset. No official credentials anywhere. |
| **Unlimited Inventory Lab** | `app/js/economy.js` | Set PHANTOM CREDITS to any amount or unlimited, unlock all weapons/cosmetics, set upgrade levels, equip outfits/camos/charms/kill & muzzle effects, reset inventory. |
| **Mythic Armory X** | menu Armory tab + `app/js/model.js` | 16 original weapons (incl. 4 Mythic, 4 Legendary) procedurally modelled in 3D, live stat bars from the real solver, upgrade paths, attachments, orbit + first-person inspection, animated emissive materials. |
| **Floating menu** | `app/js/menu.js` | Draggable/resizable, searchable modules, 9 categories, sliders/toggles, 4 themes, saved per-profile configurations, HUD layout editor, crosshair designer, **Persian RTL / English LTR**. |
| **Android launcher** | `launcher-android/` | Native launcher: first-run provisioning, offline play, online update check, SHA-256 bundle verification before swap (with rollback), repair that preserves profiles, progress + error log. |

## Controls
WASD move · Mouse look · LMB fire · RMB ADS · R reload · 1/2/Q switch weapon ·
Shift sprint · Space jump / fly-up · C fly-down · P or ⚡ button = Phantom menu.
Touch devices get a virtual joystick + FIRE/ADS/JUMP/RLD/SWAP buttons.

## Development

```bash
cd phantom-ops-x
npm test          # 40 unit tests (mod engine, economy, profiles, launcher logic, catalog)
npm run smoke     # 17 headless-DOM checks driving the real floating menu
npm run manifest  # regenerate app/update-manifest.json (SHA-256 of the bundle)
bash tools/build-apk.sh   # local APK (needs JDK17 + Gradle 8.9 + SDK 35)
```

CI (`.github/workflows/phantom-apk.yml`) runs the tests, builds the APK with Gradle,
verifies it with `apksigner`, checks the game bundle is actually inside the APK, and
uploads `PhantomOpsX-Android-debug-APK` + `PhantomOpsX-web-bundle` artifacts.

## Limitations (honest)
- The "engine" is **Three.js (WebGL) in a WebView/browser**, not Unity/Godot — chosen so
  the entire product is reproducible and testable in CI without proprietary SDKs.
- The APK is a **debug-signed** build (installable for testing), not a Play Store release build.
- The update channel defaults to this repo's public raw files; point
  `PHANTOM_UPDATE_BASE` at your own static host to run your own channel.
- WebGL gameplay is verified by unit/smoke tests + module bundling; final on-device
  play-testing on a mid-range Android phone is recommended before calling any
  performance number "proven".
- Graphics are procedural low-poly (original designs), not AAA assets.
