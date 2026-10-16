# TESTING — verified results for PHANTOM OPS X

## Automated (all runnable locally + in CI)
`node --test phantom-ops-x/tests/*.test.js` → **40/40 pass**

| Suite | Covers | Claim verified |
|---|---|---|
| `tests/mods.test.js` | Aim solver (FOV cone, selection modes, auto-switch, smoothing convergence, flick snap, prediction lead, per-weapon profiles), weapon stat solver (fire-rate/recoil/ADS/reload/spread/damage multipliers, levels, attachments, infinite ammo), movement physics (gravity, jump, speed multipliers, moon gravity, **flight hover/climb**, air control), config sanitization | "All experimental modifications must affect the actual standalone game" — the game loop calls these same functions; CI fails if they regress |
| `tests/economy.test.js` | Set credits to any amount (clamped), unlimited credits, buy/upgrade costs, unlock-all == full catalog, set-level lab control, equip-requires-ownership vs free tier preview, inventory reset, match rewards | Unlimited Inventory Lab |
| `tests/profiles.test.js` | Username rules, duplicate rejection, create/switch isolation, guest mode, persistence round-trip, profile reset, delete fallback, backup export/import + tamper detection, XP levelling | Phantom Account System |
| `tests/launcher.test.js` | Semver compare, update planning, **real SHA-256 verification** (node:crypto) incl. tampered/missing files, repair preserving profile keys, launcher state machine (incl. offline path) | Independent launcher logic |
| `tests/catalog.test.js` | Unique ids, valid rarities, sane stats, ≥3 Mythic + ≥3 Legendary, 3 maps / 3 modes / 4 difficulties | Content integrity |

`npm run smoke` (jsdom, tools/smoke.mjs) → **17/17 pass**
Renders every floating-menu tab against the real `index.html`, drives actual toggles and
sliders and asserts live mod state changes + persistence, menu search filtering,
Armory grid == catalog, EN→FA switches the document to RTL and back.

Static: `esbuild` bundles `app/js/main.js` (all imports resolved) with no errors.

Android CI additionally: Gradle `assembleDebug`, `apksigner verify`, `aapt dump badging`,
and a check that `index.html`, `game.js`, Three.js and `update-manifest.json` are really
inside the APK.

## Verified manually in this repo session
- Update manifest regenerated: 13 bundle files hashed (SHA-256).
- Live preview of the web build served from `phantom-ops-x/app` (launcher → accounts → menu).

## Honest limitations
- No physical Android device in this environment: on-device FPS/perf numbers are not
  claimed as measured. The WebGL build targets mid-range devices (capped pixel ratio,
  low-poly procedural scenes, `low` quality option) but should be profiled on hardware.
- Headless CI cannot run WebGL, so bot-vs-player live fire is exercised by logic tests
  around the same solvers rather than a rendered match replay.
- Debug-signed APK (testing installs), not a store release.
