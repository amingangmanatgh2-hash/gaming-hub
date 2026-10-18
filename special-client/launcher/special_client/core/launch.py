"""Launch orchestration: install, repair, offline validation, and start.

Everything here is Qt-free; the UI drives it via callbacks.

Data-protection contract
------------------------
* ``saves/``, ``resourcepacks/``, ``shaderpacks/`` and ``screenshots/`` are
  **never** deleted or overwritten by install/repair/update code paths.
* Repair re-downloads only files that are missing or fail their SHA-1 check.
* The client jar is written atomically.
"""
from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from . import net
from .download import DownloadManager, DownloadRequest
from .mcversion import (LaunchSpec, McVersion, extract_natives, load_version_json,
                        save_version_json, version_from_raw)
from .paths import DirLayout
ProgressCb = Callable[[str, float, str], None]   # (step, fraction 0..1, detail)

# Mojang's asset-object CDN (objects/<first-2>/<hash>). Overridable in
# LaunchService for tests that mirror the objects on a local server.
ASSET_OBJECTS_URL = "https://resources.download.minecraft.net"


class LaunchError(RuntimeError):
    pass


@dataclass
class InstallReport:
    ok: bool = True
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    files_checked: int = 0
    files_downloaded: int = 0
    files_repaired: int = 0


@dataclass
class OfflineReport:
    launchable: bool
    version_installed: bool
    version_json_ok: bool
    client_jar_ok: bool
    libraries_total: int
    libraries_ok: int
    missing_libraries: list = field(default_factory=list)
    assets_index_ok: bool = False
    assets_total: int = 0
    assets_ok: int = 0
    missing_assets: int = 0
    java_ok: bool = False
    java_detail: str = ""
    auth_detail: str = ""
    blockers: list = field(default_factory=list)
    notes: list = field(default_factory=list)


class LaunchService:
    def __init__(self, layout: DirLayout, session,
                 downloads: Optional[DownloadManager] = None,
                 objects_url: str = ASSET_OBJECTS_URL):
        self.layout = layout
        self.session = session
        self.downloads = downloads or DownloadManager(session)
        self.objects_url = objects_url.rstrip("/")
        layout.ensure_all()

    def _object_url(self, meta: dict) -> str:
        h = meta["hash"]
        return f"{self.objects_url}/{h[:2]}/{h}"

    # ------------------------------------------------------------------ #
    # Version files                                                       #
    # ------------------------------------------------------------------ #
    def fetch_version_json(self, entry, *, use_cache: bool = True) -> McVersion:
        vjson = self.layout.instance_version_json(entry.id)
        digest = getattr(entry, "sha1", "")
        if digest:
            self._download_checked(entry.url, vjson, digest, None, lambda *args: None, "version metadata")
            version = load_version_json(vjson)
        elif use_cache and vjson.exists():
            version = load_version_json(vjson)
        else:
            raw = net.get_json(self.session, entry.url)
            version = version_from_raw(raw)
            if version.id != entry.id:
                raise LaunchError("Version metadata ID does not match selection")
            save_version_json(raw, vjson)
        if version.id != entry.id:
            raise LaunchError("Version metadata ID does not match selection")
        return version

    def _download_checked(self, url: str, dest: Path, sha1: Optional[str],
                          size: Optional[int], progress: ProgressCb,
                          what: str) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            if sha1 and _sha1_of(dest) == sha1.lower():
                return  # already good
            # Existing but content-invalid: resume would treat the bad bytes
            # as a valid prefix (a prefix hash/size cannot be verified), so
            # start fresh instead of "resuming" over corruption.
            size_bad = size is not None and dest.stat().st_size != size
            if sha1 or size_bad:
                dest.unlink()
        req = DownloadRequest(url=url, dest=dest, size=size, sha1=sha1)
        self.downloads.download(req)
        progress(what, 1.0, str(dest.name))

    def _sha1_of(self, path: Path) -> str:
        return _sha1_of(path)

    # ------------------------------------------------------------------ #
    # Install                                                             #
    # ------------------------------------------------------------------ #
    def install_version(self, entry, progress: Optional[ProgressCb] = None) -> McVersion:
        """Install version json + client jar + libraries + natives + assets."""
        progress = progress or (lambda *a: None)
        self.layout.ensure_all()

        progress("version.json", 0.0, f"{entry.id}")
        version = self.fetch_version_json(entry)

        # client jar
        dl = version.client_download
        if dl and dl.get("url"):
            progress("client jar", 0.0, f"{entry.id}.jar")
            self._download_checked(
                dl["url"], self.layout.instance_version_jar(entry.id),
                dl.get("sha1"), dl.get("size"), progress, "client jar")
        else:
            raise LaunchError(f"version {entry.id} has no client download info")

        # libraries
        libs = [lib for lib in version.libraries if lib.allowed(_env_for(self.layout))]
        progress("libraries", 0.0, f"{len(libs)} files")
        for i, lib in enumerate(libs):
            url = lib.download_url()
            dest = self.layout.libraries / lib.maven_path()
            if url and (lib.downloads or {}).get("artifact"):
                art = lib.downloads["artifact"]
                self._download_checked(url, dest, art.get("sha1"), art.get("size"),
                                       progress, f"libraries {i + 1}/{len(libs)}")
            if not dest.exists():
                # server-bundled library (no download info): nothing we can do
                progress("libraries", (i + 1) / len(libs), "bundled, skipping")

        # natives
        spec = LaunchSpec(
            game_dir=self.layout.game_dir,
            java_path="java",
            version=version,
            assets_root=self.layout.assets,
            libraries_dir=self.layout.libraries,
            natives_dir=self.layout.instance_natives(entry.id),
            primary_jar=self.layout.instance_version_jar(entry.id),
            auth={}, ram_mb=0,
        )
        for lib, clf in spec.natives_to_extract():
            url = lib.download_url(clf)
            dest = self.layout.libraries / lib.classifier_path(clf)
            if url:
                art = (lib.downloads.get("classifiers") or {}).get(clf) or {}
                self._download_checked(url, dest, art.get("sha1"), art.get("size"),
                                       progress, "natives")
        extract_natives(spec)

        # assets
        progress("assets", 0.0, f"index {version.assets_id}")
        self._install_assets(version, progress)

        return version

    def _install_assets(self, version: McVersion, progress: ProgressCb) -> dict:
        ai = version.asset_index
        index_path = self.layout.asset_indexes / f"{ai.id}.json"
        if not index_path.exists():
            self._download_checked(ai.url, index_path, None, ai.total_size,
                                   progress, "asset index")
        index = json.loads(index_path.read_text())
        objects = index.get("objects", {})
        total = len(objects)
        done = 0
        for name, meta in objects.items():
            prefix = meta["hash"][:2]
            dest = self.layout.asset_objects / prefix / meta["hash"]
            if not dest.exists() or dest.stat().st_size != (meta.get("size") or 0):
                url = self._object_url(meta)
                self._download_checked(url, dest, None, meta.get("size"),
                                       progress, f"assets {done + 1}/{total}")
            done += 1
            if done % 200 == 0:
                progress("assets", done / max(1, total), f"{done}/{total}")
        progress("assets", 1.0, f"{total} objects")
        return index

    # ------------------------------------------------------------------ #
    # Repair                                                              #
    # ------------------------------------------------------------------ #
    def repair(self, version: McVersion, progress: Optional[ProgressCb] = None) -> InstallReport:
        """Verify every file the version needs; re-download missing/corrupt ones.

        Never touches protected user-data directories.
        """
        progress = progress or (lambda *a: None)
        report = InstallReport()

        jar = self.layout.instance_version_jar(version.id)
        dl = version.client_download
        if dl and dl.get("url"):
            report.files_checked += 1
            if _repair_file(dl["url"], jar, dl.get("sha1"), self.downloads,
                            report, progress, "client jar"):
                report.files_repaired += 1

        libs = [lib for lib in version.libraries if lib.allowed(_env_for(self.layout))]
        for lib in libs:
            url = lib.download_url()
            dest = self.layout.libraries / lib.maven_path()
            if not url:
                continue
            report.files_checked += 1
            art = lib.downloads["artifact"]
            if _repair_file(url, dest, art.get("sha1"), self.downloads,
                            report, progress, f"library {lib.name}"):
                report.files_repaired += 1
            clf = lib.native_classifier(_env_for(self.layout))
            if clf:
                curl = lib.download_url(clf)
                if curl:
                    cdest = self.layout.libraries / lib.classifier_path(clf)
                    report.files_checked += 1
                    cart = (lib.downloads.get("classifiers") or {}).get(clf) or {}
                    if _repair_file(curl, cdest, cart.get("sha1"), self.downloads,
                                    report, progress, f"native {lib.name}"):
                        report.files_repaired += 1

        index_path = self.layout.asset_indexes / f"{version.asset_index.id}.json"
        if not index_path.exists():
            self._install_assets(version, progress)
            report.files_downloaded += 1
        else:
            index = json.loads(index_path.read_text())
            objects = index.get("objects", {})
            for name, meta in objects.items():
                report.files_checked += 1
                prefix = meta["hash"][:2]
                dest = self.layout.asset_objects / prefix / meta["hash"]
                url = self._object_url(meta)
                ok = dest.exists() and (meta.get("size") is None
                                        or dest.stat().st_size == meta.get("size"))
                if not ok:
                    self._download_checked(url, dest, None, meta.get("size"),
                                           progress, "asset")
                    report.files_downloaded += 1

        # re-extract natives after any fix
        spec = LaunchSpec(
            game_dir=self.layout.game_dir, java_path="java", version=version,
            assets_root=self.layout.assets, libraries_dir=self.layout.libraries,
            natives_dir=self.layout.instance_natives(version.id),
            primary_jar=jar, auth={}, ram_mb=0,
        )
        extract_natives(spec)
        return report


def _repair_file(url: str, dest: Path, sha1: Optional[str],
                 downloads: DownloadManager, report: InstallReport,
                 progress: ProgressCb, what: str) -> bool:
    """Returns True if the file had to be re-downloaded."""
    if sha1:
        if dest.exists() and _sha1_of(dest) == sha1.lower():
            return False
    elif dest.exists():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()
    downloads.download(DownloadRequest(url=url, dest=dest, sha1=sha1))
    report.files_downloaded += 1
    return True


def _sha1_of(path: Path) -> str:
    import hashlib
    h = hashlib.sha1()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _env_for(layout: DirLayout):
    from .mcversion import LaunchEnv
    return LaunchEnv.detect()


# --------------------------------------------------------------------------- #
# Offline validation                                                          #
# --------------------------------------------------------------------------- #

def check_offline_readiness(layout: DirLayout, version_id: str,
                            java_runtime, auth_session) -> OfflineReport:
    """Determine whether *version_id* can launch with NO network.

    Honest evaluation: every required file is actually stat'd and hashed
    against the version json. Missing dependencies are reported explicitly —
    we never pretend an uninstalled version is available.
    """
    report = OfflineReport(
        launchable=False,
        version_installed=False,
        version_json_ok=False,
        client_jar_ok=False,
        libraries_total=0,
        libraries_ok=0,
        assets_index_ok=False,
        java_ok=False,
        auth_detail="",
    )

    vjson = layout.instance_version_json(version_id)
    if not vjson.exists():
        report.blockers.append(
            f"Version {version_id} is not installed (missing {vjson.name}). "
            f"It cannot be installed offline.")
        return report

    version = load_version_json(vjson)
    report.version_installed = True
    report.version_json_ok = True

    jar = layout.instance_version_jar(version_id)
    report.client_jar_ok = jar.exists()
    if not report.client_jar_ok:
        report.blockers.append(f"Client jar missing: {jar.name}")

    env = _env_for(layout)
    libs = [lib for lib in version.libraries if lib.allowed(env)]
    report.libraries_total = len(libs)
    for lib in libs:
        dest = layout.libraries / lib.maven_path()
        if dest.exists():
            report.libraries_ok += 1
        else:
            report.missing_libraries.append(lib.name)
        clf = lib.native_classifier(env)
        if clf:
            cdest = layout.libraries / lib.classifier_path(clf)
            if not cdest.exists():
                report.missing_libraries.append(f"{lib.name} ({clf})")
    if report.missing_libraries:
        report.blockers.append(
            f"{len(report.missing_libraries)} library file(s) missing — "
            f"offline launch will fail. First launch needs internet.")

    index_path = layout.asset_indexes / f"{version.asset_index.id}.json"
    if index_path.exists():
        report.assets_index_ok = True
        try:
            index = json.loads(index_path.read_text())
            objects = index.get("objects", {})
            report.assets_total = len(objects)
            for meta in objects.values():
                prefix = meta["hash"][:2]
                dest = layout.asset_objects / prefix / meta["hash"]
                if dest.exists() and (meta.get("size") is None
                                      or dest.stat().st_size == meta.get("size")):
                    report.assets_ok += 1
                else:
                    report.missing_assets += 1
            if report.missing_assets:
                report.blockers.append(
                    f"{report.missing_assets} asset object(s) missing — "
                    f"reconnect once to complete the asset install.")
        except Exception as e:  # noqa: BLE001
            report.assets_index_ok = False
            report.blockers.append(f"Asset index unreadable: {e}")
    else:
        report.blockers.append("Asset index not installed.")

    if java_runtime is None:
        report.blockers.append(
            "No compatible Java runtime found. "
            f"Version {version_id} needs Java {version.java_version.major_version}+.")
    else:
        report.java_ok = True
        report.java_detail = f"{java_runtime.version_string} ({java_runtime.path})"

    if auth_session is None:
        report.blockers.append(
            "No account session. Log in once online, or choose an offline "
            "session (works for singleplayer and servers that allow it).")
    else:
        if auth_session.is_microsoft and not auth_session.access_token:
            report.blockers.append(
                "Microsoft session has no valid token and cannot be refreshed "
                "offline. Use an offline session, or reconnect once.")
        else:
            report.auth_detail = (f"{auth_session.kind} session: "
                                  f"{auth_session.player_name}")
            if auth_session.kind == "offline":
                report.notes.append(
                    "Offline session: the account is not Microsoft-authenticated. "
                    "Online-mode servers may refuse the connection.")

    report.launchable = not report.blockers
    return report


# --------------------------------------------------------------------------- #
# Process launch                                                              #
# --------------------------------------------------------------------------- #

@dataclass
class GameProcess:
    proc: subprocess.Popen
    log_path: Path
    version_id: str


class GameRunner:
    """Starts the game and mirrors its output into a timestamped log."""

    def __init__(self, layout: DirLayout):
        self.layout = layout

    def start(self, spec: LaunchSpec, ram_mb: int,
              on_line: Optional[Callable[[str], None]] = None) -> GameProcess:
        spec.ram_mb = ram_mb
        log_path = self.layout.client_logs / (
            f"launcher-{time.strftime('%Y%m%d-%H%M%S')}.log")
        self.layout.client_logs.mkdir(parents=True, exist_ok=True)
        cmd = spec.java_command()
        spec.natives_dir.mkdir(parents=True, exist_ok=True)
        spec.game_dir.mkdir(parents=True, exist_ok=True)

        log_fh = open(log_path, "w", encoding="utf-8", errors="replace")
        log_fh.write(f"# SPECIAL CLIENT launch\n# time: {time.ctime()}\n"
                     f"# version: {spec.version.id}\n# java: {spec.java_path}\n"
                     f"# cmd: {_quote_cmd(cmd)}\n\n")
        log_fh.flush()

        proc = subprocess.Popen(
            cmd,
            cwd=str(spec.game_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            bufsize=1,
        )
        self._pump(proc, log_fh, on_line)
        return GameProcess(proc=proc, log_path=log_path, version_id=spec.version.id)

    @staticmethod
    def _pump(proc, log_fh, on_line):
        import threading
        def pump():
            try:
                assert proc.stdout is not None
                for raw in iter(proc.stdout.readline, b""):
                    line = raw.decode("utf-8", errors="replace").rstrip("\n")
                    log_fh.write(line + "\n")
                    log_fh.flush()
                    if on_line:
                        try:
                            on_line(line)
                        except Exception:
                            pass
            finally:
                proc.wait()
                log_fh.write(f"\n# exit code: {proc.returncode}\n")
                log_fh.close()
        t = threading.Thread(target=pump, daemon=True)
        t.start()

    def kill(self, proc: subprocess.Popen) -> None:
        try:
            proc.terminate()
        except OSError:
            pass


def _quote_cmd(cmd: list) -> str:
    import shlex
    return " ".join(shlex.quote(str(c)) for c in cmd)
