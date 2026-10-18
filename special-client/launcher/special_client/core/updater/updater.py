"""Automatic launcher updates with verification and rollback.

Security model
--------------
* Updates come from a fixed HTTPS manifest URL (no user-supplied URLs at
  runtime; the URL is a build-time constant).
* The manifest is a JSON document listing every file with its SHA-256 and
  size. Files are only written after their digest is verified.
* Nothing downloaded is ever *executed* directly: on Windows the staged
  files replace the installed tree and the normal installer/update-script
  path restarts the launcher.
* Before applying, the current tree is snapshotted (hardlinks when
  possible, zip fallback) so a failed update can be rolled back.
* User data (the game directory) is never touched by the updater — it only
  replaces the launcher's own files.

Manifest format
---------------
{
  "version": "1.1.0",
  "channel": "stable",
  "min_launcher": "1.0.0",
  "changelog": "...",
  "files": [
     {"path": "launcher/special_client/core/launch.py",
      "size": 12345, "sha256": "…", "url": "https://…/launch.py"}
  ]
}
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from .. import net
from ..download import DownloadManager, DownloadRequest
from ..versions import compare

MANIFEST_URL = ("https://github.com/special-client/releases/"
                "latest/download/launcher-manifest.json")


class UpdateError(RuntimeError):
    pass


@dataclass
class ManifestFile:
    path: str
    url: str
    size: int = 0
    sha256: str = ""


@dataclass
class UpdateManifest:
    version: str
    channel: str
    min_launcher: str
    changelog: str
    files: list = field(default_factory=list)
    fetched_at: float = 0.0

    @classmethod
    def from_dict(cls, d: dict) -> "UpdateManifest":
        files = [
            ManifestFile(
                path=f["path"], url=f["url"],
                size=int(f.get("size", 0)),
                sha256=f.get("sha256", "").lower(),
            )
            for f in d.get("files", [])
        ]
        return cls(
            version=str(d["version"]),
            channel=str(d.get("channel", "stable")),
            min_launcher=str(d.get("min_launcher", "0.0.0")),
            changelog=str(d.get("changelog", "")),
            files=files,
            fetched_at=time.time(),
        )

    def validate(self, allow_http: bool = False) -> None:
        """``allow_http`` is the same test-only seam as DownloadManager;
        production callers never pass it."""
        if not self.version:
            raise UpdateError("manifest has no version")
        for f in self.files:
            if allow_http:
                if not f.url.lower().startswith(("https://", "http://")):
                    raise UpdateError(f"file {f.path} has an invalid url")
            elif not f.url.lower().startswith("https://"):
                raise UpdateError(f"file {f.path} has a non-HTTPS url")
            if not f.sha256 or len(f.sha256) != 64:
                raise UpdateError(f"file {f.path} has no valid sha256")
            if "/" in f.path and (".." in Path(f.path).parts):
                raise UpdateError(f"file path escapes install dir: {f.path}")


@dataclass
class UpdateState:
    current_version: str
    latest_version: str
    update_available: bool = False
    major: bool = False
    changelog: str = ""
    from_cache: bool = False


class Updater:
    def __init__(self, app_dir: Path, session,
                 downloads: Optional[DownloadManager] = None,
                 manifest_url: str = MANIFEST_URL,
                 current_version: str = "1.0.0"):
        self.app_dir = Path(app_dir)
        self.session = session
        self.downloads = downloads or DownloadManager(session)
        self.manifest_url = manifest_url
        self.current_version = current_version
        self.staging = self.app_dir / ".special-updater-staging"
        self.backup_dir = self.app_dir / ".special-updater-backup"
        self.manifest_cache = self.app_dir / "cache" / "update-manifest.json"

    # ------------------------------------------------------------------ #
    # Check                                                               #
    # ------------------------------------------------------------------ #
    def fetch_manifest(self, *, use_cache: bool = True,
                       timeout: float = 15.0) -> Optional[UpdateManifest]:
        self.manifest_cache.parent.mkdir(parents=True, exist_ok=True)
        cached: Optional[UpdateManifest] = None
        if use_cache and self.manifest_cache.exists():
            try:
                raw = json.loads(self.manifest_cache.read_text())
                cached = UpdateManifest.from_dict(raw)
                cached.from_cache = True  # type: ignore[attr-defined]
            except Exception:
                cached = None
        try:
            raw = net.get_json(self.session, self.manifest_url)
            m = UpdateManifest.from_dict(raw)
            self.manifest_cache.write_text(json.dumps(raw, indent=2))
            return m
        except net.NetworkError:
            if cached is not None:
                cached.from_cache = True  # type: ignore[attr-defined]
                return cached
            return None

    def check(self, *, use_cache: bool = True) -> Optional[UpdateState]:
        m = self.fetch_manifest(use_cache=use_cache)
        if m is None:
            return None
        m.validate(allow_http=self.downloads.allow_http)
        new = compare(m.version, self.current_version) > 0
        state = UpdateState(
            current_version=self.current_version,
            latest_version=m.version,
            update_available=new,
            major=_is_major(m.version, self.current_version),
            changelog=m.changelog,
            from_cache=getattr(m, "from_cache", False),
        )
        state.manifest = m  # type: ignore[attr-defined]
        return state

    # ------------------------------------------------------------------ #
    # Apply with rollback                                                 #
    # ------------------------------------------------------------------ #
    def apply(self, manifest: UpdateManifest,
              progress: Optional[Callable[[str, float], None]] = None) -> Path:
        """Staged, verified update. Returns the applied version marker.

        Raises UpdateError on any verification failure; the app tree is
        restored from the snapshot in that case.
        """
        progress = progress or (lambda s, f: None)
        manifest.validate(allow_http=self.downloads.allow_http)

        progress("snapshotting current install", 0.0)
        snapshot = self._snapshot()

        self.staging.mkdir(parents=True, exist_ok=True)
        try:
            for i, f in enumerate(manifest.files):
                progress(f"downloading {f.path}", i / max(1, len(manifest.files)))
                dest = self.staging / f.path
                dest.parent.mkdir(parents=True, exist_ok=True)
                # The manifest digest is verified *here* (after download) so
                # failures surface as UpdateError with rollback semantics;
                # the transport layer stays digest-agnostic.
                req = DownloadRequest(url=f.url, dest=dest,
                                      size=f.size or None)
                self.downloads.download(req)
                digest = _sha256_of(dest)
                if digest != f.sha256:
                    raise UpdateError(
                        f"SHA-256 mismatch for {f.path}: expected {f.sha256}, "
                        f"got {digest}. Update aborted, nothing was applied.")
                if f.size and dest.stat().st_size != f.size:
                    raise UpdateError(f"size mismatch for {f.path}")
            progress("applying update", 0.95)
            self._apply_staging()
            progress("done", 1.0)
        except Exception:
            self._restore(snapshot)
            raise

        # success: keep the snapshot as the rollback point
        marker = self.app_dir / "current-version.json"
        marker.write_text(json.dumps({
            "version": manifest.version,
            "applied": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "rollback_from": str(snapshot),
        }, indent=2))
        return marker

    def rollback(self) -> Path | None:
        marker = self.app_dir / "current-version.json"
        if not marker.exists():
            return None
        info = json.loads(marker.read_text())
        snap = Path(info.get("rollback_from", ""))
        if not snap.exists():
            return None
        self._restore(snap)
        return snap

    # ------------------------------------------------------------------ #
    # internals                                                           #
    # ------------------------------------------------------------------ #
    SKIP_DIRS = {".git", "__pycache__", "node_modules", ".pytest_cache",
                 ".special-updater-staging", ".special-updater-backup",
                 ".venv", "venv", "build", "dist"}

    def _snapshot(self) -> Path:
        snap = self.backup_dir / f"backup-{int(time.time())}"
        if snap.exists():
            shutil.rmtree(snap)
        snap.mkdir(parents=True)
        n = 0
        for root, dirs, files in os.walk(self.app_dir):
            dirs[:] = [d for d in dirs if d not in self.SKIP_DIRS
                       and not d.startswith(".special-updater")]
            for fn in files:
                src = Path(root) / fn
                rel = src.relative_to(self.app_dir)
                dst = snap / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                try:
                    os.link(src, dst)          # hardlink: cheap snapshot
                except OSError:
                    shutil.copy2(src, dst)
                n += 1
        (snap / ".snapshot-meta.json").write_text(json.dumps(
            {"files": n, "created": int(time.time())}))
        return snap

    def _apply_staging(self) -> None:
        for root, dirs, files in os.walk(self.staging):
            for fn in files:
                src = Path(root) / fn
                rel = src.relative_to(self.staging)
                dst = self.app_dir / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                if dst.exists():
                    dst.unlink()
                shutil.move(str(src), str(dst))
        # remove staging leftovers
        shutil.rmtree(self.staging, ignore_errors=True)

    def _restore(self, snapshot: Path) -> None:
        # The restore MOVES entries out of the snapshot, so the set of
        # snapshot files must be captured first; the final stale-file
        # cleanup compares against this set, not the (shrinking) snapshot.
        snap_files = {
            p.relative_to(snapshot)
            for p in snapshot.rglob("*")
            if p.is_file() and p.name != ".snapshot-meta.json"
        }
        shutil.rmtree(self.staging, ignore_errors=True)
        for root, dirs, files in os.walk(snapshot):
            for fn in files:
                if fn == ".snapshot-meta.json":
                    continue
                src = Path(root) / fn
                rel = src.relative_to(snapshot)
                dst = self.app_dir / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                if dst.exists():
                    dst.unlink()
                shutil.move(str(src), str(dst))
        # files created by the failed/applied update (not in the snapshot)
        # are removed so the tree matches the snapshot exactly:
        for root, dirs, files in os.walk(self.app_dir):
            dirs[:] = [d for d in dirs if d not in self.SKIP_DIRS
                       and not d.startswith(".special-updater")]
            for fn in files:
                p = Path(root) / fn
                rel = p.relative_to(self.app_dir)
                if rel not in snap_files:
                    p.unlink()
        shutil.rmtree(snapshot, ignore_errors=True)


def _is_major(new: str, current: str) -> bool:
    """Major = leading version number increased (1.0 → 2.0)."""
    try:
        a = new.split(".")[0]
        b = current.split(".")[0]
        return int(a) > int(b)
    except (ValueError, IndexError):
        return False


def _sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()
