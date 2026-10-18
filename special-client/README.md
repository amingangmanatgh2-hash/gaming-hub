# SPECIAL CLIENT

Current experimental update: **1.1.0-alpha.2** — see [release notes](docs/RELEASE_NOTES.md).

Minecraft Java Edition launcher source and an experimental Fabric client mod.
**Not an official Minecraft product; not affiliated with Mojang or Microsoft.**

## Status — read before installing

- Python launcher core and regression tests are implemented. Qt GUI sources,
  mod manager, profiles, launcher-side cape generation/preview, performance
  dashboard, offline readiness and repair are included.
- Fabric mod source targets **1.20.1 only**: module studio, physical-click bursts, ten bridge lessons, private-singleplayer
  flat bridge practice, projectile estimate and overhead warning. See [client documentation](client/README.md) for exact limits.
- Windows PyInstaller/Inno Setup and Fabric builds run in GitHub Actions. Alpha.1
  successfully built Windows packages and the Fabric jar, and rendered all launcher
  pages in an offscreen Qt smoke test. Each new update still requires its own green
  CI run. **Minecraft runtime/mixin/input/bridge behavior is not manually validated.**
- Cape images/registry/preview do **not** currently render capes inside Minecraft.
  They are not official cosmetics and vanilla players will not see custom capes.
- This is not yet a fully release-validated launcher/client. Do not interpret
  checked-in source or build automation as successful end-to-end game testing.

## Run from source (Windows 10/11)

Install Python 3.11, then PowerShell from this directory:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".\launcher[gui,dev]"
python tools/make_assets.py
special-client
```

Install the appropriate Java runtime yourself (see compatibility notes). First
launch/download requires internet. The authentication flow uses Microsoft's device
login, not a password collected by this app. Actual Microsoft application consent,
Xbox/Minecraft entitlement and network availability must be tested for distribution;
there is no promise that the configured public client ID will work for every tenant.
Offline mode requires local game files, assets/libraries and Java; it cannot bypass
server authentication, ownership requirements or create missing downloads.

Headless diagnostics:

```powershell
special-client-cli --game-dir "C:\Games\Special" offline 1.20.1 --name Player
special-client-cli --game-dir "C:\Games\Special" repair 1.20.1
special-client-cli --game-dir "C:\Games\Special" dryrun 1.20.1 --ram 4096
```

Do not post dry-run output containing credentials. Downloads and repairs require
network access; stop Minecraft before modifying mods. Back up existing worlds.

## Build Windows packages

On Windows with the environment above and Inno Setup 6 installed:

```powershell
python -m pip install pyinstaller
python tools/make_assets.py
pyinstaller packaging/special_client.spec --noconfirm
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" packaging/innosetup/SPECIAL_CLIENT.iss
```

Outputs: `dist/SPECIAL_CLIENT/` (portable directory, keep all files together),
`dist/SPECIAL_CLIENT_Setup.exe`. Two entry points separate GUI and CLI. Installer
supports custom destination, optional desktop shortcut, upgrades and uninstall;
uninstall **preserves all user/game data**. Repair is explicit and version-specific,
not an automatic installer task. Packages are not code-signed; SmartScreen may warn.
The root `.github/workflows/special-client.yml` builds Windows packages and the
Fabric jar as separate artifacts; it does not publish a release automatically.

## Tests

```sh
cd launcher
python -m pip install -e '.[dev]' pyflakes
python -m pytest tests -v
python -m pyflakes special_client tests
python -m compileall -q special_client tests
```

Tests use synthetic manifests and a local HTTP server; they do not prove that
Mojang login, live downloads, loaders, Qt rendering or a Minecraft game launch
work against today's public services. Client JUnit tests are separate (Gradle).

## Layout / docs

- `launcher/special_client/core`: downloads, authentication, Minecraft metadata,
  launch, Java selection, protected paths, mod dependencies, updater, performance.
- `launcher/special_client/ui`: PySide6 launcher.
- `client`: Java/Fabric module sources and JUnit tests.
- `packaging`: Windows packaging sources (kept outside ignored `build/` output).
- `tools/make_assets.py`: reproducible bundled images.
- [Compatibility](docs/COMPATIBILITY.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
  · [Developer API](docs/API.md) · [User data](docs/USER_DATA.txt)

Updater payloads use hashes over HTTPS, **not publisher signatures**. Use only
trusted update manifests/endpoints. No public release/update hosting is provisioned.
Third-party mods retain their own licenses; review them before redistributing.
No FPS gains are guaranteed; backups, server rules and compatibility remain important.
