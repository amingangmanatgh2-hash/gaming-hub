"""Construct and render every launcher page without network or real game data."""
import tempfile
from pathlib import Path

from PySide6.QtWidgets import QApplication
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
    theme = get_theme(config.get("theme"))
    app.setStyleSheet(theme.qss())
    window = MainWindow(service, theme)
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
