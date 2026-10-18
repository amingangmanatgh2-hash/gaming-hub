"""Construct and render every launcher page without network or real game data."""
import tempfile
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QEventLoop, QTimer
import threading
from special_client.core.manifest import Manifest, VersionEntry
from special_client import asset_path
from special_client.core.config import Config
from special_client.ui.service import AppService
from special_client.ui.theme import get_theme
from special_client.ui.main_window import MainWindow, NAV

app = QApplication([])
with tempfile.TemporaryDirectory(prefix="special-gui-smoke-") as temp:
    home = Path(temp)
    config = Config(home / "launcher-config.json")
    config.set("game_dir", str(home / "game"))
    config.save()
    service = AppService(home)
    def no_network(*args, **kwargs):
        raise AssertionError("GUI smoke must not use network")
    service.session.request = no_network
    service.request_manifest = lambda force=False: None
    service._manifest = Manifest(entries=[VersionEntry("1.8.9", "release", "https://example.com/version.json")])
    loop = QEventLoop()
    calls = []
    main_thread = threading.get_ident()
    def completed(value):
        calls.append((value, threading.get_ident()))
        loop.quit()
    service.run_async(lambda progress: 42, on_ok=completed)
    QTimer.singleShot(3000, loop.quit)
    loop.exec()
    assert calls == [(42, main_thread)], "Worker callback must reach GUI thread"
    theme = get_theme(config.get("theme"))
    app.setStyleSheet(theme.qss())
    window = MainWindow(service, theme)
    assert set(window._pages) == {"play", "companion"}, "Optional pages must be lazy"
    assert window._pages["play"].selected_version().id == "1.8.9", "Never select the Releases header"
    window.show()
    for key, _, _ in NAV:
        window.show_page(key, animate=False)
        app.processEvents()
        assert not window.grab().isNull(), key
        print(f"Rendered page: {key}")
    assert asset_path("icon-64.png").is_file()
    assert window.layout().count() == 2
    window.close()
    app.processEvents()
print("Qt page construction/render smoke passed (not an interactive game test)")
