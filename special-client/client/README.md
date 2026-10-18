# SPECIAL CLIENT — Fabric client source

Target **Minecraft 1.20.1 + Fabric Loader 0.15.11+ + Fabric API 0.92.2**,
Java 17, Gradle 8.6. This is not compatible with Forge/NeoForge/Quilt or other
Minecraft versions merely because the launcher supports those loaders.

## Build

Install JDK 17 and Gradle 8.6, then in this directory run:

```sh
gradle --no-daemon build
```

No Gradle wrapper binary is checked in. CI provisions the specified Gradle
version explicitly. The remapped distributable is `build/libs/special-client-1.0.0.jar`
(**not** the `-sources.jar` or development jar).
Put this and the matching Fabric API jar in your Fabric 1.20.1 game directory's
`mods` folder, or use the launcher's explicit local install command:

```sh
special-client-cli --game-dir "C:/Games/Special" install-client-mod build/libs/special-client-1.0.0.jar --minecraft 1.20.1 --loader fabric
```

The command checks metadata, rejects duplicate SPECIAL CLIENT copies, and atomically
installs to `mods/special-client.jar`. Metadata validation is NOT a signature or
proof of authenticity; only install jars you built or trust. Fabric/API installation
is separate. There is no automatic download of an unpublished SPECIAL CLIENT jar.

## Controls and modules

Right Shift opens the vanilla-widget menu: category filters, module search,
on/off controls, crosshair-length slider and four-color palette. Save/close writes
`config/specialclient.json` with atomic replacement. Drag the top-left HUD while
in the menu (start on its title outside the center panel). Use Minecraft's GUI
scale if the panel does not fit. Extra keybindings for prediction/warning are
initially unbound and can be set in Options > Controls. Vanilla's Accessibility
Sprint Toggle remains available; this mod does not automate movement.

- FPS, server tab-list latency, coordinates, facing and **reported vanilla range**.
- Physical left/right click counts sampled once per rendered frame over 1 second.
  Very short clicks between frames may be missed; this is not an autoclicker.
- WASD/Space/Shift, armor durability and active effects.
- Optional colored crosshair overlay (does not suppress the vanilla crosshair).
- Optional projectile estimate: bow while drawing, pearl, snowball, egg, and
  non-Riptide trident while charging. Air-drag/block-raycast simulation, up to 160
  ticks in loaded chunks. A bearing square and block coordinates are drawn on the
  HUD; **not a world-space impact decal**, not an entity-hit prediction.
- Optional overhead warning: armed players holding a trident/crossbow/pearl or a
  projectile in an upward 45-degree cone, radius 12 by default. Optional local
  sound with cooldown. **Not a prediction of intent**, and can produce false alarms.
- Once per second, frame-time/FPS/latency telemetry is written to
  `special/config/game-stats.json` for the launcher.

Projectile estimates ignore water, spread, entity collisions, crossbow shots,
Riptide/enchantments and server plugins. Off-hand projectiles are not modeled.
No camera adjustment, clicks, attacks, movement or item use is injected. No custom
packet hooks, reach changes or server-hit registration modifications exist.
Follow server rules: some servers prohibit even informational overlays.

## Verification status

Java compilation, JUnit execution and Minecraft runtime testing were **not available
in the development sandbox** (no JDK / Fabric dependency access). The GitHub workflow
builds/tests the mod, but its result must be checked before treating the jar as
release-ready. Planned richer features (animations, arbitrary color picker,
per-module hotkeys/HUD anchors, cape rendering) are not implemented here.
