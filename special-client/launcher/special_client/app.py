"""SPECIAL CLIENT launcher entry point (PySide6).

Startup sequence (all steps reported on the splash):
  1. config + directories
  2. java detection (async)
  3. version manifest (cache-first — offline safe)
  4. update check (async, skipped offline; uses cached info)
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import QApplication

from . import APP_NAME, __version__
from .ui.main_window import MainWindow
from .ui.service import AppService
from .ui.splash import SplashScreen
from .ui.theme import get_theme


def app_dir() -> Path:
    """Where the launcher itself lives (configs for the *launcher*).

    Always use a user-owned data directory, independent of packaging.
    This keeps settings outside installed program files and preserves upgrades.
    """
    return Path(os.environ.get("SPECIAL_CLIENT_HOME",
                               str(Path.home() / ".special-client")))


def main() -> int:
    # keep the console quiet & prevent accidental double instances
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(__version__)
    app.setOrganizationName("SpecialClient")
    app.setQuitOnLastWindowClosed(True)

    home = app_dir()
    home.mkdir(parents=True, exist_ok=True)

    service = AppService(home)
    theme = get_theme(service.config.get("theme"))
    app.setStyleSheet(theme.qss())

    from . import asset_path
    icon_p = asset_path("icon-256.png")
    if icon_p.exists():
        from PySide6.QtGui import QIcon
        icon = QIcon(str(icon_p))
        app.setWindowIcon(icon)

    splash = SplashScreen(theme)
    splash.show()
    app.processEvents()

    t0 = time.time()
    splash.set_progress(0.15, "Loading configuration…")
    app.processEvents()

    splash.set_progress(0.4, "Loading versions…")
    # The version catalogue is refreshed on a worker, never during splash rendering.
    app.processEvents()

    if service.config.get("check_updates_on_start") and \
            service.config.get("update_channel") != "off":
        splash.set_progress(0.6, "Checking for updates…")

        def on_update_state(state):
            if state and state.update_available and state.major:
                from .ui import update_dialog
                QTimer.singleShot(4000,
                                  lambda: update_dialog.check_updates(
                                      service, window, automatic=True))

        def on_update_err(_e):
            pass

        service.run_async(
            lambda progress: service.updater.check(use_cache=True),
            on_ok=on_update_state, on_err=on_update_err)
        # give it a short head start, but never block startup on it
        splash.set_progress(0.75, "Preparing interface…")
    else:
        splash.set_progress(0.75, "Preparing interface…")
    app.processEvents()

    splash.set_progress(0.9, "Ready")
    window = MainWindow(service, theme)
    QTimer.singleShot(0, service.request_manifest)
    # keep the splash alive a minimum of 2.2s for brand presence
    remaining = max(0.0, 2.2 - (time.time() - t0))

    def offer_companion():
        if not service.config.get("companion_prompt_seen"):
            service.config.set("companion_prompt_seen", True)
            service.config.save()
            from PySide6.QtWidgets import QMessageBox
            if QMessageBox.question(window, "Optional AI companion",
                    "Set up optional API chat now? You can skip and configure it later in Settings. "
                    "No API key is required to launch Minecraft or use local practice commands.") == QMessageBox.Yes:
                window.show_page("companion")

    def finish_splash():
        window.show()
        splash.close()
        splash.deleteLater()
        QTimer.singleShot(500, offer_companion)

    if remaining > 0:
        QTimer.singleShot(int(remaining * 1000), finish_splash)
    else:
        finish_splash()

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
