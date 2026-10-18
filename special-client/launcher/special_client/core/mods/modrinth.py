"""Modrinth API client.

Documented public API (https://docs.modrinth.com):
  GET /v2/project/{slug}                        project metadata
  GET /v2/project/{slug}/version                project versions
  GET /v2/version/{id}                          one version
  GET /v2/version/files/{id}                    downloadable files
  GET /v2/search?query=...&facets=[["project_types:mod"]]

Filters used here: ``loaders`` and ``game_versions`` query params — the API
returns only versions compatible with the requested loader + Minecraft
version, which is the core of automatic dependency-safe resolution.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Optional

from .. import net

API_BASE = "https://api.modrinth.com/v2"


class ModrinthError(RuntimeError):
    pass


@dataclass
class ModFile:
    filename: str
    url: str
    size: int = 0
    sha1: str = ""
    sha512: str = ""


@dataclass
class ModVersion:
    id: str
    project_slug: str
    version_number: str
    game_versions: list = field(default_factory=list)
    loaders: list = field(default_factory=list)
    files: list = field(default_factory=list)       # list[ModFile]
    primary_file: Optional[ModFile] = None
    dependencies: list = field(default_factory=list)
    changelog: str = ""

    @classmethod
    def from_api(cls, d: dict, slug: str = "") -> "ModVersion":
        files = []
        primary = None
        for f in d.get("files", []):
            mf = ModFile(
                filename=f.get("filename", ""),
                url=f.get("url", ""),
                size=int(f.get("size", 0)),
                sha1=(f.get("hashes") or {}).get("sha1", ""),
                sha512=(f.get("hashes") or {}).get("sha512", ""),
            )
            files.append(mf)
            if f.get("primary"):
                primary = mf
        deps = [
            {
                "project_id": dep.get("project_id"),
                "version": dep.get("version"),
                "loader": dep.get("loader"),
                "mandatory": dep.get("mandatory", True),
            }
            for dep in (d.get("dependencies") or [])
            if dep.get("type") in ("required", "requiredmod")
        ]
        return cls(
            id=d.get("id", ""),
            project_slug=d.get("slug") or slug,
            version_number=d.get("version_number", ""),
            game_versions=d.get("game_versions", []),
            loaders=d.get("loaders", []),
            files=files,
            primary_file=primary or (files[0] if files else None),
            dependencies=deps,
            changelog=d.get("changelog", "") or "",
        )


class ModrinthClient:
    def __init__(self, session):
        self.session = session

    def project(self, slug: str) -> dict:
        return net.get_json(self.session, f"{API_BASE}/project/{slug}")

    def versions(self, slug: str, *, loader: str, mc: str) -> list:
        """All published versions of *slug* for *loader* + *mc*, newest first."""
        params = {"loaders": json.dumps([loader]), "game_versions": json.dumps([mc])}
        d = net.get_json(self.session, f"{API_BASE}/project/{slug}/version",
                         params=params)
        if not isinstance(d, list):
            raise ModrinthError(f"unexpected version list for {slug}")
        return [ModVersion.from_api(v, slug) for v in d]

    def latest(self, slug: str, *, loader: str, mc: str) -> Optional[ModVersion]:
        try:
            vs = self.versions(slug, loader=loader, mc=mc)
        except net.NetworkError:
            return None
        for v in vs:
            if not v.files:
                continue
            # prefer release channel
            return v
        return None

    def search(self, query: str, *, limit: int = 10) -> list:
        params = {
            "query": query,
            "limit": limit,
            "facets": json.dumps([["project_types:mod"]]),
        }
        d = net.get_json(self.session, f"{API_BASE}/search", params=params)
        return d.get("hits", [])
