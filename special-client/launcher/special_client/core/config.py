"""Configuration storage: launcher settings + saved profiles.

* JSON on disk, written atomically (tmp + rename) so a crash can never
  corrupt the config.
* Corrupt files are quarantined (``.corrupt-<ts>``) instead of raised, so the
  launcher always starts.
* Profiles capture version + loader + java + RAM + game dir + account mode.
"""
from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any, Optional

DEFAULTS: dict[str, Any] = {
    "game_dir": str(Path.home() / ".minecraft"),
    "java_path": "",            # empty = auto-detect
    "ram_mb": 4096,
    "version_id": "1.20.1",
    "loader": "vanilla",        # vanilla | fabric | quilt | neoforge | forge
    "theme": "midnight-neon",
    "language": "en",
    "close_to_tray": False,
    "update_channel": "stable", # stable | beta | off
    "check_updates_on_start": True,
    "perf_preset": "balanced",
    "minimize_at_launch": True,
    "first_run_done": False,
    "msa_client_id": "",        # optional Azure public-client override
    "msa_device_id": "00000000402b5328",  # well-known public id (see docs)
}

PROFILE_FIELDS = ("version_id", "loader", "java_path", "ram_mb", "game_dir",
                  "mods_subdir", "extra_jvm_args", "extra_game_args", "auth_mode")


@dataclass
class Profile:
    name: str
    version_id: str = "1.20.1"
    loader: str = "vanilla"
    java_path: str = ""
    ram_mb: int = 4096
    game_dir: str = ""
    mods_subdir: str = ""
    extra_jvm_args: list = field(default_factory=list)
    extra_game_args: list = field(default_factory=list)
    auth_mode: str = "microsoft"   # microsoft | offline
    created: str = ""
    updated: str = ""

    def to_dict(self) -> dict:
        return {f.name: getattr(self, f.name)
                for f in fields(self) if not f.name.startswith("_")}

    @classmethod
    def from_dict(cls, d: dict) -> "Profile":
        valid = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in valid})

    def slug(self) -> str:
        return re.sub(r"[^a-z0-9_-]+", "-", self.name.lower()).strip("-") or "profile"


class Config:
    """Dot-accessible JSON settings store."""

    def __init__(self, path: Path, defaults: Optional[dict] = None):
        self.path = path
        self._defaults = dict(DEFAULTS if defaults is None else defaults)
        self.data: dict = {}
        self.load()

    # -- persistence ----------------------------------------------------------
    def load(self) -> None:
        self.data = {}
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text())
                if not isinstance(self.data, dict):
                    self.data = {}
            except (json.JSONDecodeError, OSError):
                self._quarantine()
                self.data = {}
        self.data = {**self._defaults, **self.data}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2, sort_keys=True))
        os.replace(tmp, self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def _quarantine(self) -> None:
        try:
            bad = self.path.with_name(f"{self.path.name}.corrupt-{int(time.time())}")
            os.replace(self.path, bad)
        except OSError:
            pass

    # -- accessors --------------------------------------------------------------
    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, self._defaults.get(key, default))

    def set(self, key: str, value: Any) -> None:
        self.data[key] = value

    def update(self, mapping: dict) -> None:
        self.data.update(mapping)

    def as_dict(self) -> dict:
        return dict(self.data)


class ProfileStore:
    """CRUD for saved profiles, persisted under ``config/profiles.json``."""

    def __init__(self, path: Path):
        self.path = path
        self.profiles: list = []
        self.active: str = ""
        self._load()

    def _load(self) -> None:
        state = {"profiles": [], "active": ""}
        if self.path.exists():
            try:
                loaded = json.loads(self.path.read_text())
                if isinstance(loaded, dict):
                    state.update(loaded)
            except (json.JSONDecodeError, OSError):
                state = {"profiles": [], "active": ""}
        self.profiles = [Profile.from_dict(p) for p in state.get("profiles", [])]
        self.active = state.get("active", "")
        if not self.profiles:
            self.create("Default")

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "profiles": [p.to_dict() for p in self.profiles],
            "active": self.active,
        }
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2))
        os.replace(tmp, self.path)

    def create(self, name: str, **kwargs) -> Profile:
        if any(p.name.lower() == name.lower() for p in self.profiles):
            raise ValueError(f"profile {name!r} already exists")
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        p = Profile(name=name, created=now, updated=now, **kwargs)
        self.profiles.append(p)
        if not self.active:
            self.active = p.name
        self.save()
        return p

    def rename(self, old: str, new: str) -> Profile:
        p = self.get(old)
        if any(q.name.lower() == new.lower() for q in self.profiles if q is not p):
            raise ValueError(f"profile {new!r} already exists")
        p.name = new
        if self.active == old:
            self.active = new
        p.updated = time.strftime("%Y-%m-%dT%H:%M:%S")
        self.save()
        return p

    def delete(self, name: str) -> None:
        self.profiles = [p for p in self.profiles if p.name != name]
        if self.active == name:
            self.active = self.profiles[0].name if self.profiles else ""
        if not self.profiles:
            self.create("Default")
        self.save()

    def duplicate(self, name: str, new_name: str) -> Profile:
        src = self.get(name)
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        p = Profile.from_dict(src.to_dict())
        p.name = new_name
        p.created = now
        p.updated = now
        self.profiles.append(p)
        self.save()
        return p

    def set_active(self, name: str) -> None:
        if not any(p.name == name for p in self.profiles):
            raise KeyError(name)
        self.active = name
        self.save()

    def get(self, name: str) -> Profile:
        for p in self.profiles:
            if p.name == name:
                return p
        raise KeyError(name)

    @property
    def active_profile(self) -> Optional[Profile]:
        return self.get(self.active) if self.active else None
