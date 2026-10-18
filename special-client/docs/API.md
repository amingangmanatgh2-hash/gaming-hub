# Developer API / trust boundaries

Python entry points: `special-client` (Qt) and `special-client-cli` (headless).
Paths are `pathlib.Path`; `DirLayout(game_dir)` is the authority for game paths.
`DirLayout.is_protected` identifies user-owned locations; do not bypass updater
path validation or alter saves during repairs.

- `core.manifest.load_manifest(cache, session)` loads release metadata.
- `core.launch.LaunchService(layout, session)` installs/repairs and builds launches.
  `check_offline_readiness` reports exact blockers rather than a blanket promise.
- `core.download.DownloadManager` handles downloads/integrity/resume. HTTP is only
  enabled explicitly in tests; production downloads should use HTTPS.
- `core.clientmod.install_client_mod(source, game_dir, minecraft, loader)` validates
  local Fabric metadata and installs a single jar atomically. Does not download
  Fabric API, authenticate a publisher or install a loader.
- Mod manager resolves upstream version/dependency metadata; never equate filename
  matching with a publisher signature.
- Updater manifest: `{version, channel, min_launcher, changelog, files: [{path,
  url, size, sha256}]}`. Paths must pass validation; downloads use HTTPS and payload
  hashes are verified. HTTPS + hashes do NOT protect against a compromised manifest
  publisher. Only trusted distribution channels should provide manifests.
- Stats bridge: `<game_dir>/special/config/game-stats.json` with `fps`, `ping_ms`,
  `frame_ms_avg`, `frame_ms_worst`, `updated` (Unix seconds). Older than 10 seconds
  is stale. Sampling measures render callback intervals, not GPU timings.

Tests: `DownloadManager(allow_http=True)`, `LaunchService(objects_url=...)`, and
updater downloader `allow_http` are explicit local-server seams. Never enable
these as production defaults. Tests are synthetic and do not assert live service
or Windows runtime availability.
