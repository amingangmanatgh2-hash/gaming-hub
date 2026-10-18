# SPECIAL CLIENT 1.1 — Fabric module studio

Target **Minecraft 1.20.1 + Fabric Loader 0.15.11+ + Fabric API 0.92.2**,
Java 17, Gradle 8.6. This jar does not support other game versions or loaders.

## Build / install

```sh
gradle --no-daemon build
```

No wrapper binary is checked in; CI provisions Gradle 8.6. Install the remapped
`build/libs/special-client-1.1.0-alpha.2.jar`, not a sources/dev jar. Remove the
previous SPECIAL CLIENT jar first (one copy only). Put it and matching Fabric API
in your selected Fabric 1.20.1 game directory's `mods` folder. The Windows launcher
installer does not automatically install this jar or Fabric API.

```sh
special-client-cli --game-dir "C:/Games/Special" install-client-mod build/libs/special-client-1.1.0-alpha.2.jar --minecraft 1.20.1 --loader fabric
```

## Module studio

Right Shift opens a responsive dark sidebar/card menu with accent animation,
search, categories (HUD, Visuals, Alerts, Input, Practice), toggles and separate
left/right multiplier controls. Category changes keep the menu compact rather
than putting every module in one overflowing list. Crosshair length is adjustable
and accent color cycles through four palettes. Settings persist atomically in
`config/specialclient.json`. Use Minecraft GUI scale to expose the full XYZ editor
and lesson card on small displays. At smaller scales the coach HUD shows lesson
steps. This is a redesign of the **in-game mod UI**, not a new launcher theme.

## Physical-click bursts (off by default)

Input > Physical-click bursts; left/right separately cycle **1 / 2 / 4 / 8**.
A physical GLFW PRESS starts one burst of `multiplier - 1` extra vanilla-bound
key press requests; the original physical click stays unchanged. Holding a button
never starts another burst. A new press replaces the old burst for that button,
not an unbounded backlog. Extra requests are spaced 4 game ticks apart. This is
**not continuous idle autoclicking**, but it DOES automate extra input and may be
prohibited on multiplayer servers. It is not guaranteed to register 8 attacks,
placements or hits: vanilla cooldowns and server rules still apply.

- Works only for normal mouse-left attack / mouse-right use bindings.
- Both buttons have independent pending counts and cooldowns.
- Clears on menus, focus loss, pause, disconnect, death, disable and bridge practice.
- **F8** disables bursts and stops bridge practice; re-enable deliberately in Input.
- The physical CPS HUD still counts sampled physical presses, not synthetic requests.
- No custom packet hooks or damage/reach/cooldown modifications.

## Bridge lessons and singleplayer trainer

Practice has **10 lessons x 5 steps**: Sneak, Diagonal Sneak, Ninja/Speed,
Breezily, Witchly, Godbridge, Moonwalk, Telly, Jump/Staircase, Hold-use/“0 CPS”.
Select a lesson and step with the menu buttons. Enable Lesson coach overlay to
show instructions while practicing. These are instruction pages, **not ten
implemented automatic bridge styles**. [Persian guide](../docs/BRIDGE_GUIDE_FA.md).

Automatic practice is deliberately limited to **private integrated singleplayer**:
LAN-published worlds and remote servers are rejected. It is a **flat, straight,
sneak bridge only**, not automatic godbridge/telly/diagonal/staircase.

1. Back up worlds; use a safe practice area, ideally creative over a disposable floor.
2. Stand centered on a full cube, on ground (not flying), holding safe full cubes.
3. Optionally set destination support-block XYZ in Practice, or bind Select bridge
   destination in Options > Controls and look at a block within normal reach.
4. Destination must be at the same support Y and on one X/Z axis, 1–32 blocks away.
   Without a destination, an 8-block route is chosen backward from your facing.
   XYZ waypoints may lie in air, but placement still requires actual supporting faces.
5. Click Start straight practice, or bind Start/stop practice in Controls. The
   trainer rotates the view toward block faces, sneaks backward and uses vanilla
   `interactBlock` only after a real, in-reach block raycast; it waits for confirmation.
6. **F8 or physical WASD/Space stops.** Menus, focus loss, pause, flight, missing
   blocks/support, height/lateral drift, damage, dimension changes, world border, obstructions,
   rejection and timeout stop it.

This is experimental: compile/unit tests do not prove movement safety. No fall
prevention guarantee. No arbitrary air placement, teleport, freecam or pathfinding.
A destination is a waypoint, not permission to spawn floating blocks. Placement
uses ordinary vanilla interactions (which naturally produce vanilla traffic), not
packet interception/spoofing. Opening to LAN while active stops practice next tick.

## Existing modules / limits

FPS, latency, coordinates, facing, vanilla range, physical CPS, keystrokes,
armor/effects, crosshair overlay, projectile estimate and overhead warnings remain.
Projectile prediction ignores fluids/entity hits/spread/server plugins and shows a
bearing square, not a world-space decal. Overhead warnings detect equipment/position,
not intent. Cape artwork remains launcher-only. Stats bridge still writes
`special/config/game-stats.json` once per second.

Java/JUnit and Windows Qt packaging are built in CI. Check the **specific run** for
success; Minecraft runtime, mixin injection and movement/input behavior require
manual testing in-game before calling this stable. None of the automated-input
features are represented as universally server-legal or “ban safe”.
