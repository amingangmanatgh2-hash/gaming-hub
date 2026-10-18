"""Cached official version catalogue with independently hosted GitHub metadata fallback."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from . import net
from .versions import is_supported

MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
GITHUB_CATALOG_URL = "https://github.com/amingangmanatgh2-hash/gaming-hub/releases/download/special-client-catalog/versions.json"
CACHE_TTL_SECONDS = 6 * 3600


@dataclass
class VersionEntry:
    id: str
    type: str
    url: str
    time: str = ""
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
    source: str = "official"
    stale: bool = False

    def by_id(self, version_id: str) -> Optional[VersionEntry]:
        return next((e for e in self.entries if e.id == version_id), None)

    def sorted(self, *, only_supported: bool = False) -> list:
        es = [e for e in self.entries if e.is_supported] if only_supported else self.entries
        return sorted(es, key=lambda e: e.time or "", reverse=True)

    def releases(self, *, only_supported: bool = True) -> list:
        return [e for e in self.sorted(only_supported=only_supported) if e.type in ("release", "old")]


def cached_manifest(cache_dir: Path) -> Optional[Manifest]:
    try:
        path = cache_dir / "version_manifest.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        result = _parse(raw)
        result.fetched_at = float(raw.get("_fetched_at", path.stat().st_mtime))
        result.source = raw.get("_source", "cache")
        result.from_cache = True
        result.stale = time.time() - result.fetched_at > CACHE_TTL_SECONDS
        return result
    except (OSError, ValueError, KeyError, TypeError):
        return None


def load_manifest(cache_dir: Path, session, *, force: bool = False, timeout: float = 8.0) -> Manifest:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = cached_manifest(cache_dir)  # force refresh must NOT discard offline fallback
    if cached and not force and not cached.stale:
        return cached
    errors = []
    for source, url in (("github", GITHUB_CATALOG_URL), ("official", MANIFEST_URL)):
        try:
            raw = net.get_json(session, url, timeout=timeout)
            result = _parse(raw)
            result.fetched_at = time.time()
            result.source = source
            saved = {**raw, "_fetched_at": result.fetched_at, "_source": source}
            tmp = cache_dir / "version_manifest.json.tmp"
            tmp.write_text(json.dumps(saved), encoding="utf-8")
            tmp.replace(cache_dir / "version_manifest.json")
            return result
        except (net.NetworkError, ValueError, KeyError, TypeError, OSError) as exc:
            errors.append(type(exc).__name__)
    if cached:
        return cached
    raise net.NetworkError("Version catalogue unavailable from GitHub and Mojang; check connectivity/TLS. " + ", ".join(errors))


def _parse(raw: dict) -> Manifest:
    if not isinstance(raw, dict) or not isinstance(raw.get("versions"), list):
        raise ValueError("Invalid catalogue")
    entries = []
    for e in raw["versions"]:
        if not isinstance(e, dict):
            continue
        vid, url = e.get("id"), e.get("url")
        if not isinstance(vid, str) or not isinstance(url, str) or not vid or len(vid) > 100:
            continue
        if any(c in vid for c in '/\\:') or vid in (".", ".."):
            continue
        entries.append(VersionEntry(vid, e.get("type", "release"), url, e.get("releaseTime", ""), e.get("sha1", "")))
    if not entries:
        raise ValueError("Catalogue contains no versions")
    return Manifest(raw.get("latest", {}).get("release", ""), raw.get("latest", {}).get("snapshot", ""), entries)
