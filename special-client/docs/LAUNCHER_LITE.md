# 1.3.0-alpha.4 — catalogue, separate storage and lighter launcher

## Version-list fixes

The old HTTP wrapper called its own patched method recursively: production requests
failed even though tests used plain requests sessions. The wrapper now captures the
original request, with a regression test asserting one call. Other fixed issues:
fixed 1.21 upper filter, initial Releases-header selection, non-persisted cache time,
forced-refresh discarding fallback cache, blocking network on the Qt thread, and
worker callbacks/error handlers not reliably arriving on the GUI thread.

Catalogue order: GitHub `special-client-catalog/versions.json`, then Mojang official,
then cached/installed versions. Cache lasts six hours; explicit Refresh can update
it. No guessed entries are created: **26.3 appears only if officially published**.
Year-numbered numeric IDs are accepted without shipping a new launcher. Catalogue
eligibility is NOT proof of game/loader/runtime compatibility. Runtime selection
uses installed release JSON's `javaVersion` as authority.

GitHub hosts metadata and official mod source links only. Game JARs, libraries,
assets and mod binaries still come from their official upstream URLs, with integrity
checks. A reachable GitHub index does not bypass blocked Mojang/CDN downloads.
A metadata entry's SHA-1 is now checked before caching its version JSON.

`special-client-catalog.yml` refreshes daily at 06:17 UTC and manually. **GitHub
scheduled workflows run only from the default branch**; putting it on a feature
branch alone does not activate the daily schedule. GitHub can delay/disable
schedules (e.g. inactivity) and upstream outages can interrupt refresh. Existing
valid catalogue assets are kept if fetch/validation fails. No promise of zero
future maintenance or availability is made.

## Storage

New Windows configuration prefers an existing writable D: through Z: under
`SpecialClient/game`, otherwise `~/SpecialClient/game`. No new partition, drive
or admin privilege is created. `SPECIAL_CLIENT_GAME_DIR` can select a dedicated
folder. Settings > Change game directory remains available. Old configs pointing
to the user's vanilla `.minecraft` are redirected to a dedicated folder **without
copying/moving/deleting any original worlds/mods**. The original folder and its
children are rejected by the GUI selector. Existing other custom paths are kept.

The program and tiny launcher configuration/API credential files may remain in
the user profile or installer-selected location (often C:). The GAME data folder
is separate; no claim that absolutely every byte on C: disappears. Profiles still
share the selected game root; incompatible active mod suites must not be mixed.

## Reduced background work

- Optional pages created only on first use; no NumPy cape-preview construction at startup.
- Hidden/paused cape preview does no periodic rendering; visible preview is about 6 FPS.
- No full library/asset integrity scan every four seconds.
- Hidden performance panel does not enumerate processes; visible polling is 2 seconds.
- Lite mode defaults ON, disabling opacity page transitions. Flat Studio Graphite
  theme and reordered navigation; existing theme choices are preserved.
- Log tail capped at 200 blocks; unused GUI import removed from CLI packaging.
- API companion remains opt-in; only its small local mailbox listener stays available.

This is a reduction in unnecessary work, NOT a measured RAM/CPU/FPS improvement.
Qt/Python and the optional preview still have overhead. There is no guarantee of
1000 FPS from a 70 FPS machine. Cap FPS to reduce CPU/GPU/power demand; compare
frametimes before/after on the same world. Presets now write real colon-delimited
vanilla options with matching value types and preserve other settings; a backup
is saved before applying. Modern and legacy AO values differ. Avoid running a
second Java server on constrained hardware if performance is the priority.

## Mods and external clients

Sodium/Lithium/FerriteCore/etc. use exact game/loader queries to upstream Modrinth;
array filters are now JSON-encoded as required. External client selector links to
verified official Sodium/LiquidBounce/Meteor/Wurst repositories and offers explicit
local JAR import. **It is not an automatic installer/compatibility resolver for
those external client suites**, and their supported versions differ. Do not stack
client suites or mix Forge and Fabric. Their rules/licenses remain their own.
No third-party source/JAR is secretly mirrored, rebranded or re-licensed here.

## Friends server

Play selects a version; Friends server requires explicit Minecraft EULA acceptance
before downloading the official SHA-1-checked vanilla server JAR into
`<game>/servers/<version>`. Select a matching Java executable and RAM (default 1GB),
Start, and wait for `Done` in the console; a started process is not proof of readiness.
Online-mode stays enabled. Stop sends vanilla `stop` and waits up to 30 seconds;
a hung server is not force-killed. Stop active servers before closing the launcher.

LAN friends need the host's LAN IP and port 25565, matching game version and OS
firewall permission. Outside your LAN requires explicit port forwarding or a
separately installed trusted VPN/tunnel. The app does not open router/firewall ports,
provide a public IP/tunnel, or promise internet connectivity. This is vanilla
hosting, not a Bedwars plugin/server provisioner. Back up server worlds.

## Cosmetics

Twelve original built-in palettes plus an experimental low-poly animated wing
and cape Fabric feature layer (1.20.1 only). Choose on Capes & wings; the game polls
preferences every two seconds. Self appears in third person. Other SPECIAL users
can import your **public UUID + cosmetic preferences** file to render your cosmetics;
both need the compatible mod. No credential is exported. At most 64 peer entries.

No automatic/global cosmetic backend, no vanilla-player visibility, no Microsoft
account cape entitlement modifications. Imported arbitrary artwork is still
launcher-preview-only; built-in capes have bundled runtime textures. Runtime
rendering, animation/armor overlap and peer sharing must be tested in Minecraft;
Java compilation/Qt smoke is not proof of visual quality or performance.
