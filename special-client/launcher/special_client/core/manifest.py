"""Mojang version manifest handling.

Source of truth: ``https://piston-meta.mojang.com/mc/game/version_manifest_v2.json``
(the same endpoint the official launcher uses). The manifest is cached under
``special/cache/`` so the launcher can start fully offline; a stale cache is
explicitly labelled as such.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from . import net
from .versions import is_supported

MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
CACHE_TTL_SECONDS = 3600  # 1 hour


@dataclass
class VersionEntry:
    id: str
    type: str                      # release | snapshot | old
    url: str                       # version json url
    time: str = ""                 # ISO timestamp
    sha1: str = ""

    @property
    def is_supported(self) -> bool:
        return is_supported(self.id)


@dataclass
class Manifest:
    latest_release: str = ""
    latest_snapshot: str = ""
    entries: list = field(default_factory=list)
    fetched_at: float = 0.0
    from_cache: bool = False

    def by_id(self, version_id: str) -> Optional[VersionEntry]:
        for e in self.entries:
            if e.id == version_id:
                return e
        return None

    def sorted(self, *, only_supported: bool = False) -> list:
        es = self.entries
        if only_supported:
            es = [e for e in es if e.is_supported]
        return sorted(es, key=lambda e: (e.time or ""), reverse=True)

    def releases(self, *, only_supported: bool = True) -> list:
        return [e for e in self.sorted(only_supported=only_supported)
                if e.type in ("release", "old")]


def load_manifest(cache_dir: Path, session, *, force: bool = False,
                  timeout: float = 20.0) -> Manifest:
    """Fetch the manifest, falling back to cache when offline.

    Raises ``net.NetworkError`` only when there is no cache at all and the
    network is unavailable — callers translate that into "offline mode".
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / "version_manifest.json"

    cached: Optional[Manifest] = None
    if cache_file.exists() and not force:
        try:
            cached = _parse(json.loads(cache_file.read_text()))
            cached.from_cache = True
        except Exception:
            cached = None

    if not force and cached and time.time() - cached.fetched_at < CACHE_TTL_SECONDS:
        return cached

    try:
        raw = net.get_json(session, MANIFEST_URL)
        m = _parse(raw)
        m.fetched_at = time.time()
        cache_file.write_text(json.dumps(raw, indent=1))
        return m
    except net.NetworkError:
        if cached:
            return cached
        raise
    except Exception as e:  # malformed payload: keep cache if we have one
        if cached:
            return cached
        raise net.NetworkError(f"manifest fetch failed: {e}") from e


def _parse(raw: dict) -> Manifest:
    entries = [
        VersionEntry(
            id=e["id"],
            type=e.get("type", "release"),
            url=e["url"],
            time=e.get("releaseTime", ""),
            sha1=e.get("sha1", ""),
        )
        for e in raw.get("versions", [])
    ]
    return Manifest(
        latest_release=raw.get("latest", {}).get("release", ""),
        latest_snapshot=raw.get("latest", {}).get("snapshot", ""),
        entries=entries,
    )
