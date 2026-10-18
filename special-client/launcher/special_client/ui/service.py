"""AppService: owns configuration, accounts, and the core services.

The UI never talks to network/java/disk directly; it calls AppService
methods which run heavy work on worker threads and report back through
Qt signals. This keeps the interface responsive even while a version is
installing (hundreds of files) and keeps all core code Qt-free.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PySide6.QtCore import QObject, Signal, Qt

from .. import __version__
from ..core import net
from ..core.auth import (AccountStore, AuthSession, MicrosoftAuth,
                         make_offline_session)
from ..core.config import Config, Profile, ProfileStore
from ..core.download import DownloadManager
from ..core.java import JavaRuntime, detect_java_runtimes, pick_java
from ..core.launch import GameRunner, LaunchError, LaunchService, \
    check_offline_readiness
from ..core.manifest import Manifest, load_manifest, cached_manifest
from ..core.mcversion import LaunchSpec
from ..core.mods.loaders import LoaderService
from ..core.mods.manager import ModManager
from ..core.paths import DirLayout
from ..core.storage import default_game_dir, is_vanilla
from ..core.perf.monitor import GameProcessMonitor
from ..core.perf.statsbridge import StatsBridge
from ..core.updater.updater import Updater
from ..core.capes.registry import CapeRegistry


@dataclass
class LaunchPlan:
    profile: Profile
    version_id: str
    java: JavaRuntime
    ram_mb: int
    auth: AuthSession


class Worker(QObject):
    """Generic background task carrier with result/error signals."""
    finished_ok = Signal(object)
    failed = Signal(str)
    progress = Signal(str, float, str)


class AppService(QObject):
    # UI-facing signals
    manifest_ready = Signal(object)
    manifest_failed = Signal(str)
    status = Signal(str)                 # global status bar text
    progress = Signal(str, object)       # (url, DownloadProgress)
    log_line = Signal(str)

    def __init__(self, app_dir: Path, parent=None):
        super().__init__(parent)
        self.app_dir = Path(app_dir)
        self.session = net.make_session()

        # --- config & profiles (game dir chosen in settings) -------------
        self.config = Config(self.app_dir / "launcher-config.json")
        if not self.config.get("game_dir") or is_vanilla(Path(self.config.get("game_dir"))):
            self.config.set("game_dir", str(default_game_dir()))
            self.config.save()
        self._set_game_dir(Path(self.config.get("game_dir")), save=False)

        self.downloads = DownloadManager(self.session)
        self.downloads.add_listener(self._on_download)
        self.runner = GameRunner(self.layout)
        self.mod_manager = ModManager(self.layout, self.session, self.downloads)
        self.loader_service = LoaderService(self.layout, self.session, self.downloads)
        self.monitor = GameProcessMonitor(self.layout.game_dir)
        self.stats_bridge = StatsBridge(self.layout.game_dir)
        self.capes = CapeRegistry.load(self.layout.client_config,
                                       self.layout.client_capes)

        # --- accounts ------------------------------------------------------
        self.accounts = AccountStore(self.layout.client_auth)
        self.active_session: Optional[AuthSession] = None
        self.account_names: list = self.accounts.list_names()

        # --- updater ---------------------------------------------------------
        self.updater = Updater(self.app_dir, self.session, self.downloads,
                               current_version=__version__)

        self._manifest = cached_manifest(self.layout.client_cache)
        self._manifest_busy = False
        self._manifest_attempt = 0.0

        # --- java ------------------------------------------------------------
        self.java_runtimes: list = []
        self.detect_java = threading.Thread(target=self._detect_java, daemon=True)
        self.detect_java.start()

    # ------------------------------------------------------------------ #
    # properties ---------------------------------------------------------
    # ------------------------------------------------------------------ #
    @property
    def layout(self) -> DirLayout:
        return self._layout

    def _set_game_dir(self, game_dir: Path, save: bool = True) -> None:
        self._layout = DirLayout(Path(game_dir))
        self._layout.ensure_all()
        if save:
            self.config.set("game_dir", str(game_dir))
            self.config.save()
        self.profiles = ProfileStore(self._layout.client_config / "profiles.json")

    def set_game_dir(self, game_dir: Path) -> None:
        if is_vanilla(Path(game_dir)):
            raise ValueError("Choose a dedicated SPECIAL CLIENT folder, not the vanilla .minecraft directory.")
        self._set_game_dir(game_dir)
        self._manifest = cached_manifest(self.layout.client_cache)
        self.runner = GameRunner(self.layout)
        self.mod_manager = ModManager(self.layout, self.session, self.downloads)
        self.loader_service = LoaderService(self.layout, self.session, self.downloads)
        self.monitor = GameProcessMonitor(self.layout.game_dir)
        self.stats_bridge = StatsBridge(self.layout.game_dir)
        self.capes = CapeRegistry.load(self.layout.client_config,
                                       self.layout.client_capes)
        self.accounts = AccountStore(self.layout.client_auth)
        self.account_names = self.accounts.list_names()

    # ------------------------------------------------------------------ #
    # java detection ------------------------------------------------------
    # ------------------------------------------------------------------ #
    def _detect_java(self) -> None:
        try:
            self.java_runtimes = detect_java_runtimes(
                self.config.get("java_path"))
        except Exception as e:  # noqa: BLE001
            self.status.emit(f"Java detection failed: {e}")

    # ------------------------------------------------------------------ #
    # manifest ------------------------------------------------------------
    # ------------------------------------------------------------------ #
    def load_manifest(self) -> Optional[Manifest]:
        """Memory/cache-only access for UI callers; never blocks the GUI on HTTP."""
        return self._manifest

    def request_manifest(self, force=False) -> None:
        if self._manifest_busy:
            return
        if not force and time.time() - self._manifest_attempt < 30:
            return
        self._manifest_attempt = time.time()
        self._manifest_busy = True
        game_dir = self.layout.game_dir
        cache_dir = self.layout.client_cache
        def done(manifest):
            self._manifest_busy = False
            if self.layout.game_dir == game_dir:
                self._manifest = manifest
                self.manifest_ready.emit(manifest)
        def failed(error):
            self._manifest_busy = False
            self.manifest_failed.emit(error)
        self.run_async(lambda progress: load_manifest(cache_dir, self.session, force=bool(force)),
                       on_ok=done, on_err=failed)

    # ------------------------------------------------------------------ #
    # accounts --------------------------------------------------------------
    # ------------------------------------------------------------------ #
    def msa_client_id(self) -> str:
        return (self.config.get("msa_client_id")
                or self.config.get("msa_device_id")
                or "00000000402b5328")

    def login_offline(self, name: str) -> AuthSession:
        s = make_offline_session(name)
        self.active_session = s
        return s

    def login_microsoft_blocking(self, on_device_code, on_wait, should_abort,
                                 timeout: float = 900.0) -> AuthSession:
        """Full device-code login; *blocks* (call from a Worker thread)."""
        auth = MicrosoftAuth(self.session, self.msa_client_id())
        info = auth.request_device_code()
        on_device_code(info)
        tokens = auth.poll_device_code(info, on_wait=on_wait,
                                       should_abort=should_abort)
        session = auth.login_from_tokens(tokens)
        self.accounts.add(session, session.xuid)
        self.account_names = self.accounts.list_names()
        self.active_session = session
        return session

    def restore_microsoft(self, name: str) -> Optional[AuthSession]:
        """Re-login a stored account using its refresh token (online)."""
        rec = self.accounts.get(name)
        if not rec or not rec.get("refresh_token"):
            return None
        auth = MicrosoftAuth(self.session, self.msa_client_id())
        tokens = auth.refresh(rec["refresh_token"])
        session = auth.login_from_tokens(tokens)
        self.active_session = session
        return session

    # ------------------------------------------------------------------ #
    # launch pipeline ---------------------------------------------------------
    # ------------------------------------------------------------------ #
    def build_launch_plan(self, version_id: str, loader_profile: Optional[str],
                          ram_mb: int) -> LaunchPlan:
        prof = self.profiles.active_profile or Profile(name="Active")
        launch_id = loader_profile or version_id
        launch_version = self.launch_service.fetch_version_json(
            _Entry(launch_id, ""), use_cache=True)
        java = pick_java(self.java_runtimes, launch_version.id,
                         (prof.java_path if prof else "")
                         or self.config.get("java_path"))
        need = launch_version.java_version.major_version
        if java is None or java.major < need:
            java = next((rt for rt in self.java_runtimes if rt.major >= need), None)
        if java is None:
            raise RuntimeError(
                f"No suitable Java runtime found for {launch_version.id}. "
                f"Install the Java version the Play page recommends "
                f"(Java {launch_version.java_version.major_version}+).")
        auth = self.active_session
        if auth is None:
            raise RuntimeError("No account selected. Log in, or choose an "
                               "offline session first.")
        return LaunchPlan(profile=prof, version_id=launch_version.id,
                          java=java, ram_mb=ram_mb, auth=auth)

    @property
    def launch_service(self) -> LaunchService:
        return LaunchService(self.layout, self.session, self.downloads)

    def launch_command(self, plan: LaunchPlan) -> list:
        spec = self._launch_spec(plan)
        return spec.java_command()

    def _launch_spec(self, plan: LaunchPlan) -> LaunchSpec:
        service = self.launch_service
        version = service.fetch_version_json(_Entry(plan.version_id, ""),
                                             use_cache=True)
        jar = self.layout.instance_version_jar(plan.version_id)
        if not jar.exists():
            raise LaunchError(
                f"Version {plan.version_id} is not installed yet — use "
                f"Install first (or Launch, which installs automatically).")
        spec = LaunchSpec(
            game_dir=self.layout.game_dir,
            java_path=plan.java.path,
            version=version,
            assets_root=self.layout.assets,
            libraries_dir=self.layout.libraries,
            natives_dir=self.layout.instance_natives(plan.version_id),
            primary_jar=jar,
            auth=plan.auth.to_launch_vars(),
            ram_mb=plan.ram_mb,
            extra_jvm_args=list(plan.profile.extra_jvm_args),
            extra_game_args=list(plan.profile.extra_game_args),
        )
        return spec

    def offline_report(self, version_id: str) -> "object":
        prof = self.profiles.active_profile
        java = pick_java(self.java_runtimes, version_id,
                         (prof.java_path if prof else "")
                         or self.config.get("java_path"))
        return check_offline_readiness(self.layout, version_id, java,
                                       self.active_session)

    # ------------------------------------------------------------------ #
    # worker helper -------------------------------------------------------------
    # ------------------------------------------------------------------ #
    def run_async(self, fn,
                  on_ok=None,
                  on_err=None,
                  on_progress=None) -> Worker:
        w = Worker(self)
        if on_ok:
            w.finished_ok.connect(on_ok, Qt.QueuedConnection)
        if on_err:
            w.failed.connect(on_err, Qt.QueuedConnection)
        if on_progress:
            w.progress.connect(on_progress, Qt.QueuedConnection)

        def target():
            def progress(stage, frac, detail):
                w.progress.emit(str(stage), float(frac), str(detail))

            try:
                result = fn(progress)
            except Exception as e:  # noqa: BLE001
                w.failed.emit(f"{type(e).__name__}: {e}")
                return
            w.finished_ok.emit(result)

        t = threading.Thread(target=target, daemon=True)
        t.start()
        w.thread = t  # type: ignore[attr-defined]
        return w

    def _on_download(self, p) -> None:
        self.progress.emit(p.url, p)
        self.log_line.emit(f"[dl] {p.state} {p.url} {p.received}/{p.total}")


class _Entry:
    """Minimal manifest-entry stand-in for locally known versions."""
    def __init__(self, id: str, url: str):
        self.id = id
        self.url = url
        self.type = "release"
        self.time = ""
        self.sha1 = ""
