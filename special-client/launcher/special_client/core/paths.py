"""File-system layout for a SPECIAL CLIENT installation.

The layout mirrors the classic ``.minecraft`` layout (so a user can point the
client at an existing installation and keep playing) while adding a dedicated
``special/`` root for everything the client owns:

- versions/        : per-version directories (``<id>/<id>.jar`` + json)
- libraries/       : shared minecraft + loader + mod loader libraries
- assets/          : ``indexes/`` (asset index json) and ``objects/`` (xx/zzzz)
- saves/           : **user worlds — never touched by updates or repairs**
- resourcepacks/   : user resource packs (never touched)
- shaderpacks/     : shader packs (Iris)
- mods/            : default mod folder (instances may override)
- special/         : everything owned by SPECIAL CLIENT
  - config/        : launcher config, profiles, in-client module config
  - capes/         : cape textures + registry
  - logs/          : launch logs & crash reports
  - backups/       : data + mod backups
  - mod-backups/   : per-operation mod backups
  - cache/         : manifests, update staging
  - auth/          : token store (chmod 0600)
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

CLIENT_ROOT_NAME = "special"

#: Directories that contain user data. The repairer/updater MUST never
#: delete or overwrite contents of these paths.
PROTECTED_DIRS = ("saves", "resourcepacks", "shaderpacks", "serverconfig",
                  "resourcepacks", "worlds", "downloads", "screenshots")


@dataclass(frozen=True)
class DirLayout:
    """All paths for one game directory.

    ``game_dir`` is the root (default: ``~/.minecraft``). All SPECIAL CLIENT
    state lives under ``game_dir/special`` so that moving the game directory
    moves everything with it.
    """

    game_dir: Path

    # -- classic minecraft layout ----------------------------------------
    @property
    def versions(self) -> Path:
        return self.game_dir / "versions"

    @property
    def libraries(self) -> Path:
        return self.game_dir / "libraries"

    @property
    def assets(self) -> Path:
        return self.game_dir / "assets"

    @property
    def asset_indexes(self) -> Path:
        return self.assets / "indexes"

    @property
    def asset_objects(self) -> Path:
        return self.assets / "objects"

    @property
    def mods(self) -> Path:
        return self.game_dir / "mods"

    @property
    def resource_packs(self) -> Path:
        return self.game_dir / "resourcepacks"

    @property
    def shader_packs(self) -> Path:
        return self.game_dir / "shaderpacks"

    @property
    def saves(self) -> Path:
        return self.game_dir / "saves"

    @property
    def screenshots(self) -> Path:
        return self.game_dir / "screenshots"

    # -- special client layout -------------------------------------------
    @property
    def client_root(self) -> Path:
        return self.game_dir / CLIENT_ROOT_NAME

    @property
    def client_config(self) -> Path:
        return self.client_root / "config"

    @property
    def client_capes(self) -> Path:
        return self.client_root / "capes"

    @property
    def client_logs(self) -> Path:
        return self.client_root / "logs"

    @property
    def client_backups(self) -> Path:
        return self.client_root / "backups"

    @property
    def client_mod_backups(self) -> Path:
        return self.client_root / "mod-backups"

    @property
    def client_cache(self) -> Path:
        return self.client_root / "cache"

    @property
    def client_auth(self) -> Path:
        return self.client_root / "auth"

    # -- instance helpers --------------------------------------------------
    def instance_version_dir(self, version_id: str) -> Path:
        return self.versions / version_id

    def instance_version_json(self, version_id: str) -> Path:
        return self.instance_version_dir(version_id) / f"{version_id}.json"

    def instance_version_jar(self, version_id: str) -> Path:
        return self.instance_version_dir(version_id) / f"{version_id}.jar"

    def instance_mods(self, mods_subdir: str | None = None) -> Path:
        """Mods folder for an instance.

        ``mods_subdir`` isolates mods per profile (e.g. profile name slug),
        so profiles can carry different mod sets without touching each other.
        """
        if mods_subdir:
            return self.game_dir / "mods" / mods_subdir
        return self.mods

    def instance_natives(self, version_id: str) -> Path:
        return self.versions / version_id / "natives"

    # -- lifecycle ----------------------------------------------------------
    def all_paths(self) -> list[Path]:
        return [
            self.versions, self.libraries, self.assets, self.asset_indexes,
            self.asset_objects, self.mods, self.resource_packs,
            self.shader_packs, self.client_root, self.client_config,
            self.client_capes, self.client_logs, self.client_backups,
            self.client_mod_backups, self.client_cache, self.client_auth,
        ]

    def ensure_all(self) -> None:
        for p in self.all_paths():
            p.mkdir(parents=True, exist_ok=True)
        # user-data dirs: create empty so they exist, never clean them
        for p in (self.saves, self.screenshots):
            p.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def is_protected(path: Path, game_dir: Path) -> bool:
        """True if *path* is inside a protected user-data directory."""
        try:
            rel = path.resolve().relative_to(game_dir.resolve())
        except ValueError:
            return False
        parts = rel.parts
        return bool(parts) and parts[0] in PROTECTED_DIRS

    @staticmethod
    def default_game_dir() -> Path:
        if os.name == "nt":
            return Path(os.environ.get("APPDATA", "~\\AppData\\Roaming")) / ".minecraft"
        xdg = os.environ.get("XDG_DATA_HOME")
        if xdg:
            return Path(xdg) / "minecraft"
        return Path.home() / ".minecraft"
