# Troubleshooting

- **GUI won't start:** install `[gui]` dependencies; update GPU drivers. Linux Qt
  needs GL/X11/Wayland system libraries. The headless CLI does not need Qt.
- **Unsupported Java/class version:** use a runtime matching the Minecraft and
  loader release; 1.20.5/1.20.6 need Java 21.
- **Offline unavailable:** run the readiness command for the exact version/game
  directory. Missing assets, libraries, natives, client jar or Java must be installed
  before going offline. Online-mode servers still require real authentication.
- **Login fails:** verify the device-login URL/code, time, internet and Microsoft
  account entitlement. Public app registration/consent policy can change. Do not
  share tokens, auth files or passwords; offline mode is not an entitlement bypass.
- **Corrupt download:** close the game, back up saves, then run
  `special-client-cli --game-dir "..." repair 1.20.1` for your actual version.
- **Mod crashes:** ensure exact Minecraft, loader, API and Java compatibility.
  Remove duplicate jars; disable the latest addition. Do not delete worlds.
- **Menu missing:** custom Java source must first be compiled and its remapped jar
  plus Fabric API installed in the selected Fabric 1.20.1 game directory.
- **Prediction wrong:** estimate excludes fluids, entity collisions, random spread,
  server plugins and enchantments. The bearing square is not a world-space decal.
- **Overhead false alarm:** warning detects position and equipment, not intent.
  Disable it on servers where overlays are disallowed.
- **No in-game capes:** this build contains launcher artwork/preview, not a cape
  renderer or shared cosmetic backend.
- **SmartScreen warning:** generated packages are unsigned. Verify provenance and
  checksums rather than blindly disabling protection.
- **High memory/poor FPS:** lower render distance and resource-pack size. Allocate
  less RAM if the OS is paging. No preset guarantees a specific FPS increase.

Before reporting bugs: include OS, game/loader/Java versions, steps and redacted
logs. Never send Microsoft tokens or session-bearing launch command lines.
