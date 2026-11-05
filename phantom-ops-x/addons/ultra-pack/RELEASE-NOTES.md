# ◆ PHANTOM OPS X — ULTRA PACK v1.0.0

**افزونهٔ گرافیکی اختیاری** برای PHANTOM OPS X — بازی پایه سبک می‌ماند، گرافیک الترا با یک
دانلود ۱۸ مگابایتی می‌آید. همه‌چیز داخل این مخزن پیکسل‌به‌پیکسل ساخته شده است: بافت‌های PBR،
مدل‌های سه‌بعدی و آسمان محیطی. هیچ فایل آماده‌ای از جایی دانلود نشده.

## 📦 Inside the archive (18 MB, SHA-256 verified before use)

| Asset | Details |
|---|---|
| **8 PBR material sets** | 1024² albedo + normal + metallic-roughness + emissive: carbon, steel, neon circuit, brushed gold, smoked glass, hex camo, bolted hull panels, cracked asphalt |
| **6 3D models** (glTF 2.0 binary) | hero carbine (9 444 tris), armoured operator (13 118), neon pylon (6 652), supply crate (2 040), recon drone (1 864), sidearm (1 780) — **34 898 triangles** |
| **Environment** | 2048 × 1024 equirect neon-dusk sky → PMREM image-based lighting |
| **Totals** | 27 262 976 texels · 34 898 triangles · 33 files, every one hashed |

## 🎮 What changes in game

- Weapon viewmodel swaps to the authored carbine/sidearm GLB with full PBR maps.
- Map props become real models: pylons on the skyline, crates for cover, hovering drones.
- Ground, walls and cover get tiled PBR instead of flat colours.
- Enemy rigs keep their silhouette and team colours but wear the packed camo/steel/neon sets.
- ACES tone mapping, PCF soft shadows and an environment map — all only when the pack is on.
- Removal is one click and fully restores the base look.

## ⬇️ Downloads

- `phantom-ultra-v1.0.0.zip` — the add-on (install it from the in-game **◆ ULTRA** panel; it
  verifies SHA-256 itself)
- `ultra-catalog.json` — the catalogue the game reads (URL + size + hash)
- `PhantomOpsX-Ultra-debug.apk` — Android build, **light base install** (add-on is not bundled)
- `PhantomOpsX-ultra-reel.mp4` — 1080 × 1920 vertical reel, rendered offline by
  `tools/reel/render.c` from the same geometry that ships in the pack
- `SHA256SUMS.txt` — hashes for every file above

## 🔐 Integrity

The add-on is a *stored* (uncompressed) ZIP so the in-game reader needs no decompressor
dependency. Installation order: download → SHA-256 of the archive → per-file hashes from
`pack.json` → unpack → cache. A single mismatch aborts and leaves the game untouched.

## 🧪 Verified in CI

`node --test tests/*.test.js` (51 tests incl. the add-on runtime, ZIP reader, GLB reader and
an end-to-end build of the real archive into three.js objects) plus the headless menu smoke
suite, then the APK is built and its contents asserted (the add-on runtime ships, the textures
do not).

Debug-signed APK: Android may warn about an unknown developer — that is expected for a debug
build, and the signing key belongs to the CI runner rather than to a store listing.
