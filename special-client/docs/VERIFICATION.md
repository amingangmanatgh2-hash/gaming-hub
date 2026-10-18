# Verification record — 2026-10-18

## Previous released baseline

[Alpha.1 CI run](https://github.com/amingangmanatgh2-hash/gaming-hub/actions/runs/39126578537)
succeeded: Windows Python tests/lint, Qt page construction/render smoke, PyInstaller
GUI+CLI packaging, CLI `--help`, Inno installer, Fabric compilation and JUnit.
Its prerelease assets were published and their uploaded presence checked via GitHub.

## 1.1.0-alpha.2 input/practice update

[Prepublication code checks](https://github.com/amingangmanatgh2-hash/gaming-hub/actions/runs/39129648132)
passed for commit `b3e38df`: both Windows and Linux jobs, including Fabric build and
JUnit, Python tests/lint, Windows offscreen Qt page rendering, packaging and installer.
Publication runs the same checks again for its own exact commit before release.

The Java suite includes 10 tests across ballistics, click bursts and practice rules:
- No requests without a physical-press enqueue; exact finite 1/2/4/8 burst sizes.
- Independent buttons, replacement instead of backlog, bounded spacing and clearing.
- Private-singleplayer gates, rejection of LAN/server/menu/unfocused/paused states.
- Flat cardinal route bounds, integer-overflow edge cases, 10 lessons x 5 steps.

Python suite has 132 test cases: Windows runs the DPAPI integration test and skips
two POSIX-mode-only checks; Linux runs POSIX checks and skips DPAPI integration.
No mode-bit test is treated as proof of Windows ACL isolation. Windows refresh-token
writes use per-user DPAPI, with no silent plaintext write fallback.

## Not manually verified in Minecraft

Mixin runtime injection; physical click dispatch/attack or use registration;
menu appearance at all GUI scales; bridge movement, edge alignment, placement,
fall safety, all stop conditions, LAN transition and dimension changes. Unit tests
cover queue/rule logic, NOT real game physics. The new in-game UI is not exercised
by the Python Qt smoke (that covers the separate launcher UI).

Also not manually verified: Microsoft live login, game downloads/launch, offline
gameplay, installer upgrade/uninstall user-data retention. Packages are unsigned.

Before calling this stable, use a separate private creative world with safe floor:
verify each multiplier on both buttons, idle/held-input behavior, F8 cancellation,
menu/focus/disconnect cleanup, one-block and 8-block routes, rejection of diagonal/
height-changing routes, missing blocks, obstacles, damage, world border, LAN and
server rejection. Never test experimental movement over valuable worlds/void.
