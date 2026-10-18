"""Mod manager: install, enable/disable, conflicts, backup, import/export.

Mod identity detection
----------------------
Mod ids are read from the JAR itself, so duplicate and conflict detection
works for real files, not just file names:

* Fabric:  ``fabric.mod.json`` → ``id``
* Forge:   ``mcmod.info`` → ``modid``
* NeoForge:``META-INF/neoforge.mods.toml`` / ``META-INF/mods.toml`` → mod id

Enable/disable works by moving JARs between ``mods/`` and ``mods/disabled/``
(the technically supported mechanism for any loader — loaders only scan the
top level). Backup/restore is a timestamped zip so any operation is reversible.
"""
from __future__ import annotations

import json
import re
import shutil
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from ..download import DownloadManager, DownloadRequest
from ..paths import DirLayout
from .catalog import entry_by_slug, for_mc
from .modrinth import ModrinthClient, ModVersion


class ModError(RuntimeError):
    pass


@dataclass
class ModStatus:
    slug: str
    name: str
    category: str
    file: Optional[str]        # file name in mods dir
    version: Optional[str]
    mod_id: Optional[str]
    state: str                 # absent|installed|disabled
    compatible: bool = True
    notes: list = field(default_factory=list)


def read_mod_id(jar: Path) -> Optional[str]:
    """Extract the mod id from a jar (fabric.mod.json / mcmod.info / toml)."""
    try:
        with zipfile.ZipFile(jar) as zf:
            names = set(zf.namelist())
            if "fabric.mod.json" in names:
                data = json.loads(zf.read("fabric.mod.json").decode("utf-8", "replace"))
                return data.get("id")
            if "mcmod.info" in names:
                raw = zf.read("mcmod.info").decode("utf-8", "replace")
                # mcmod.info is JSON (or a JSON array)
                try:
                    arr = json.loads(raw)
                    if isinstance(arr, list) and arr:
                        return arr[0].get("modid")
                    return arr.get("modid")
                except json.JSONDecodeError:
                    m = re.search(r'"modid"\s*:\s*"([^"]+)"', raw)
                    return m.group(1) if m else None
            for toml_name in ("META-INF/neoforge.mods.toml", "META-INF/mods.toml"):
                if toml_name in names:
                    raw = zf.read(toml_name).decode("utf-8", "replace")
                    m = re.search(r'^\s*id\s*=\s*"([^"]+)"', raw, re.MULTILINE)
                    if m:
                        return m.group(1)
    except (zipfile.BadZipFile, OSError, json.JSONDecodeError):
        return None
    return None


def version_from_filename(filename: str) -> Optional[str]:
    m = re.search(r"[-_](\d+\.\d+(?:\.\d+)?)[-_]?\w*\.(?:jar|zip)$", filename)
    return m.group(1) if m else None


class ModManager:
    def __init__(self, layout: DirLayout, session,
                 downloads: Optional[DownloadManager] = None):
        self.layout = layout
        self.session = session
        self.downloads = downloads or DownloadManager(session)
        self.modrinth = ModrinthClient(session)

    # -- paths ---------------------------------------------------------------
    def mods_dir(self, mods_subdir: Optional[str] = None) -> Path:
        d = self.layout.instance_mods(mods_subdir)
        d.mkdir(parents=True, exist_ok=True)
        (d / "disabled").mkdir(exist_ok=True)
        return d

    def _files(self, d: Path) -> list:
        return [f for f in d.iterdir()
                if f.is_file() and f.suffix.lower() in (".jar", ".zip")]

    # -- inventory -------------------------------------------------------------
    def _match_file(self, files: list, slug: str) -> Optional[Path]:
        """Find a file for a catalog slug: by mod id first, then file name."""
        for f in files:
            if read_mod_id(f) == slug:
                return f
        for f in files:
            stem = f.stem
            if stem == slug or stem.startswith(slug + "-") or stem.startswith(slug + "."):
                return f
        return None

    def inventory(self, mc: str, loader: str,
                  mods_subdir: Optional[str] = None) -> list:
        d = self.mods_dir(mods_subdir)
        enabled = self._files(d)
        disabled = self._files(d / "disabled")
        out: list = []
        for entry in for_mc(mc, loader):
            # also consider custom (non-catalog) jars via their mod id later
            f = self._match_file(enabled, entry.slug)
            if f is not None:
                state = "installed"
            else:
                f = self._match_file(disabled, entry.slug)
                state = "disabled" if f is not None else "absent"
            out.append(ModStatus(
                slug=entry.slug, name=entry.name, category=entry.category,
                file=f.name if f else None,
                version=version_from_filename(f.name) if f else None,
                mod_id=read_mod_id(f) if f else None,
                state=state, compatible=True,
                notes=[f"deps: {', '.join(entry.dependencies)}"] if entry.dependencies else [],
            ))
        # unknown jars present on disk (imported/custom mods)
        known = {s.file for s in out if s.file}
        for f in {**{x.name: x for x in enabled},
                  **{x.name: x for x in disabled}}.values():
            if f.name not in known:
                out.append(ModStatus(
                    slug=f.name, name=f.name, category="custom", file=f.name,
                    version=version_from_filename(f.name), mod_id=read_mod_id(f),
                    state="installed" if f in enabled else "disabled",
                    notes=["not in the curated catalog — verify compatibility yourself"],
                ))
        return out

    # -- install / remove -------------------------------------------------------
    def resolve_version(self, entry, mc: str, loader: str) -> Optional[ModVersion]:
        """Latest version from Modrinth; falls back to the catalog pin offline."""
        try:
            v = self.modrinth.latest({"ferritecore": "ferrite-core"}.get(entry.slug, entry.slug), loader=loader, mc=mc)
            if v and v.primary_file:
                return v
        except Exception:
            pass
        pin = entry.known_good_for(mc)
        if pin:
            return _pinned_version(entry, mc, pin)
        return None

    def install(self, slug: str, mc: str, loader: str,
                mods_subdir: Optional[str] = None,
                progress=None) -> ModVersion:
        entry = entry_by_slug(slug)
        if entry is None:
            raise ModError(f"{slug!r} is not in the curated catalog")
        if not entry.supports(mc, loader):
            raise ModError(
                f"{entry.name} does not support {mc} on {loader}. "
                f"Choose a different Minecraft version or loader.")
        # dependency order: install deps first
        for dep in entry.dependencies:
            de = entry_by_slug(dep)
            if de and de.supports(mc, loader):
                have = self._find_installed(mods_dir(self.layout, mods_subdir), dep)
                if not have:
                    self.install(dep, mc, loader, mods_subdir, progress)

        mv = self.resolve_version(entry, mc, loader)
        if mv is None or not mv.primary_file:
            raise ModError(
                f"Could not find a compatible {entry.name} version for {mc} "
                f"({loader}) online, and no cached pin exists. Connect to the "
                f"internet once to install it.")
        if not mv.primary_file.url:
            raise ModError(
                f"{entry.name} {mv.version_number} needs a download URL — "
                f"this copy was created offline from a pin without a cached "
                f"file. Reconnect once to download it, or import the JAR "
                f"manually (Mods → Import).")

        dest = self.mods_dir(mods_subdir) / mv.primary_file.filename
        if dest.exists():
            self.downloads.abort(mv.primary_file.url)
        else:
            self.downloads.download(DownloadRequest(
                url=mv.primary_file.url, dest=dest,
                size=mv.primary_file.size or None,
                sha1=mv.primary_file.sha1 or None,
            ))
        return mv

    def _find_installed(self, d: Path, slug: str) -> Optional[Path]:
        if not d.exists():
            return None
        for f in d.iterdir():
            if f.is_file() and f.name.startswith(slug + "-"):
                return f
        return None

    def remove(self, slug: str, mods_subdir: Optional[str] = None) -> None:
        d = self.mods_dir(mods_subdir)
        for sub in (d, d / "disabled"):
            for f in self._files(sub):
                if f.name.startswith(slug + "-"):
                    f.unlink()

    def set_enabled(self, slug: str, enabled: bool,
                    mods_subdir: Optional[str] = None) -> None:
        d = self.mods_dir(mods_subdir)
        src = self._find_in(d, slug) or self._find_in(d / "disabled", slug)
        if src is None:
            raise ModError(f"{slug} is not installed")
        target_dir = d if enabled else (d / "disabled")
        target_dir.mkdir(exist_ok=True)
        shutil.move(str(src), str(target_dir / src.name))

    def _find_in(self, d: Path, slug: str) -> Optional[Path]:
        if not d.exists():
            return None
        for f in self._files(d):
            if f.name.startswith(slug + "-"):
                return f
        return None

    # -- conflicts ---------------------------------------------------------------
    def detect_conflicts(self, mods_subdir: Optional[str] = None) -> dict:
        """Duplicate mod ids + known incompatibility notes.

        Returns {"duplicates": {mod_id: [files]}, "warnings": [str]}
        """
        d = self.mods_dir(mods_subdir)
        ids: dict = {}
        warnings = []
        for f in self._files(d):
            mid = read_mod_id(f)
            if mid:
                ids.setdefault(mid, []).append(f.name)
        duplicates = {k: v for k, v in ids.items() if len(v) > 1}
        # same-mod-id with different versions is the classic duplicate
        for mid, files in duplicates.items():
            versions = {version_from_filename(f) for f in files}
            if len(versions) > 1:
                warnings.append(
                    f"Multiple versions of mod {mid!r}: {', '.join(files)} — "
                    f"remove all but one.")
            else:
                warnings.append(f"Duplicate mod {mid!r}: {', '.join(files)}")
        return {"duplicates": duplicates, "warnings": warnings}

    # -- import / export -----------------------------------------------------------
    def import_jar(self, src: Path, mods_subdir: Optional[str] = None) -> str:
        src = Path(src)
        if not src.exists() or src.suffix.lower() not in (".jar", ".zip"):
            raise ModError(f"Not a mod file: {src}")
        d = self.mods_dir(mods_subdir)
        dest = d / src.name
        if dest.exists():
            stem, suffix = src.stem, src.suffix
            n = 1
            while dest.exists():
                dest = d / f"{stem}({n}){suffix}"
                n += 1
        shutil.copy2(src, dest)
        return dest.name

    def export_profile(self, out_path: Path, mods_subdir: Optional[str] = None,
                       include_files: bool = True) -> Path:
        """Export a mod profile as a zip: manifest json + (optionally) jars."""
        d = self.mods_dir(mods_subdir)
        out = Path(out_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        manifest = {
            "exported": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "mods_subdir": mods_subdir or "",
            "files": sorted(f.name for f in self._files(d)),
            "disabled": sorted(f.name for f in self._files(d / "disabled")),
        }
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("special-mod-profile.json", json.dumps(manifest, indent=2))
            if include_files:
                for f in self._files(d):
                    zf.write(f, f"files/{f.name}")
        return out

    def import_profile(self, zip_path: Path, mods_subdir: Optional[str] = None) -> list:
        src = Path(zip_path)
        d = self.mods_dir(mods_subdir)
        installed = []
        with zipfile.ZipFile(src) as zf:
            names = zf.namelist()
            if "special-mod-profile.json" in names:
                manifest = json.loads(zf.read("special-mod-profile.json"))
                for fn in manifest.get("files", []):
                    member = f"files/{fn}"
                    if member in names:
                        dest = d / fn
                        with zf.open(member) as fsrc, open(dest, "wb") as fdst:
                            shutil.copyfileobj(fsrc, fdst)
                        installed.append(fn)
            else:
                # bare zip of jars
                for n in names:
                    if n.endswith((".jar", ".zip")) and "/" not in n.strip("/"):
                        dest = d / Path(n).name
                        with zf.open(n) as fsrc, open(dest, "wb") as fdst:
                            shutil.copyfileobj(fsrc, fdst)
                        installed.append(Path(n).name)
        return installed

    # -- backup / restore ------------------------------------------------------------
    def backup(self, tag: str, mods_subdir: Optional[str] = None) -> Path:
        d = self.mods_dir(mods_subdir)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        out = self.layout.client_mod_backups / f"mods-{tag or 'default'}-{stamp}.zip"
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in self._files(d):
                zf.write(f, f"enabled/{f.name}")
            for f in self._files(d / "disabled"):
                zf.write(f, f"disabled/{f.name}")
        return out

    def restore(self, zip_path: Path, mods_subdir: Optional[str] = None) -> None:
        """Restore a backup over the current mods dir (reversible: current
        state is backed up automatically first)."""
        src = Path(zip_path)
        d = self.mods_dir(mods_subdir)
        current = self.backup("pre-restore", mods_subdir)
        for f in self._files(d):
            f.unlink()
        for f in self._files(d / "disabled"):
            f.unlink()
        with zipfile.ZipFile(src) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                parts = info.filename.split("/", 1)
                if len(parts) != 2:
                    continue
                kind, name = parts
                target_dir = d if kind == "enabled" else (d / "disabled")
                target_dir.mkdir(exist_ok=True)
                with zf.open(info) as fsrc, open(target_dir / name, "wb") as fdst:
                    shutil.copyfileobj(fsrc, fdst)
        self.last_restore_backup = current

    def list_backups(self) -> list:
        if not self.layout.client_mod_backups.exists():
            return []
        return sorted(
            (f for f in self.layout.client_mod_backups.iterdir() if f.suffix == ".zip"),
            key=lambda f: f.name, reverse=True)


def mods_dir(layout: DirLayout, mods_subdir: Optional[str]) -> Path:
    d = layout.instance_mods(mods_subdir)
    d.mkdir(parents=True, exist_ok=True)
    (d / "disabled").mkdir(exist_ok=True)
    return d


def _pinned_version(entry, mc: str, pin: str):
    """Offline fallback: pin without a URL (catalog pin)."""
    from .modrinth import ModVersion, ModFile
    return ModVersion(
        id=f"pin:{entry.slug}:{pin}",
        project_slug=entry.slug,
        version_number=pin,
        primary_file=ModFile(filename=f"{entry.slug}-{pin}.jar", url=""),
        game_versions=[mc],
    )
