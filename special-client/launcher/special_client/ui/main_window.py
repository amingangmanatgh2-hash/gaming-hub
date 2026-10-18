"""Main window: sidebar navigation, stacked pages, animated transitions."""
from __future__ import annotations

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (QGraphicsOpacityEffect, QHBoxLayout, QLabel,
                               QPushButton, QStackedWidget, QStatusBar,
                               QVBoxLayout, QWidget)
from .. import APP_NAME, __version__
from .theme import Theme

NAV = [
    ("play", "Play", "▶"),
    ("mods", "Mods", "⬢"),
    ("performance", "Performance", "⚡"),
    ("capes", "Capes", "✦"),
    ("profiles", "Profiles", "◆"),
    ("settings", "Settings", "⚙"),
    ("companion", "Companion", "✧"),
    ("logs", "Logs", "≡"),
]


class MainWindow(QWidget):
    def __init__(self, service, theme: Theme):
        super().__init__()
        self.service = service
        self.t = theme
        self.setWindowTitle(f"{APP_NAME} {__version__}")
        self.setMinimumSize(1080, 680)
        self.resize(1240, 760)
        self.setObjectName("RootWidget")

        self._nav_buttons: dict[str, QPushButton] = {}
        self._pages: dict[str, QWidget] = {}
        self._current_page = ""
        self._fading = False
        self._build()
        self._wire_service()
        self.service.status.connect(self.statusBar().showMessage)

    # ------------------------------------------------------------------ #
    def _build(self) -> None:
        root = QHBoxLayout()
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        root.addWidget(self._build_side(), 0)

        right = QVBoxLayout()
        right.setContentsMargins(0, 0, 0, 0)
        right.setSpacing(0)
        right.addWidget(self._build_topbar(), 0)

        self.stack = QStackedWidget()
        self.stack.setObjectName("PageStack")
        right.addWidget(self.stack, 1)
        root.addLayout(right, 1)

        sb = QStatusBar()
        sb.setObjectName("StatusBar")
        self._sb = sb
        root2 = QVBoxLayout(self)
        root2.addLayout(root, 1)
        root2.addWidget(sb, 0)

        # pages
        from .play_page import PlayPage
        from .mods_page import ModsPage
        from .perf_page import PerfPage
        from .capes_page import CapesPage
        from .profiles_page import ProfilesPage
        from .settings_page import SettingsPage
        from .logs_page import LogsPage
        from .companion_page import CompanionPage

        self._pages["play"] = PlayPage(self)
        self._pages["mods"] = ModsPage(self)
        self._pages["performance"] = PerfPage(self)
        self._pages["capes"] = CapesPage(self)
        self._pages["profiles"] = ProfilesPage(self)
        self._pages["settings"] = SettingsPage(self)
        self._pages["logs"] = LogsPage(self)
        self._pages["companion"] = CompanionPage(self)
        for i, (key, _l, _i) in enumerate(NAV):
            self.stack.addWidget(self._pages[key])

        self.show_page("play", animate=False)

    def _build_side(self) -> QWidget:
        side = QWidget()
        side.setObjectName("SidePanel")
        side.setFixedWidth(212)
        lay = QVBoxLayout(side)
        lay.setContentsMargins(14, 18, 14, 14)
        lay.setSpacing(6)

        logo = QLabel()
        # use the bundled logo when available; fall back to styled text
        from .. import asset_path
        logo_p = asset_path("icon-64.png")
        if logo_p.exists():
            from PySide6.QtGui import QPixmap
            from PySide6.QtCore import Qt as _Qt
            pm = QPixmap(str(logo_p))
            logo.setPixmap(pm.scaled(40, 40, _Qt.KeepAspectRatio,
                                     _Qt.SmoothTransformation))
        else:
            logo.setText("◆ SPECIAL")
            lf = logo.font()
            lf.setPointSize(15)
            lf.setBold(True)
            logo.setFont(lf)
        logo.setStyleSheet(f"color: {self.t.accent}; letter-spacing: 2px;")
        lay.addWidget(logo)
        sub = QLabel("C L I E N T")
        sub.setStyleSheet(f"color: {self.t.text_dim}; font-size: 10px; letter-spacing: 6px;")
        lay.addWidget(sub)
        lay.addSpacing(16)

        for key, label, icon in NAV:
            b = QPushButton(f"{icon}  {label}")
            b.setObjectName("NavButton")
            b.setCheckable(True)
            b.setCursor(Qt.PointingHandCursor)
            b.setMinimumHeight(38)
            b.clicked.connect(lambda _=False, k=key: self.show_page(k))
            self._nav_buttons[key] = b
            lay.addWidget(b)

        lay.addStretch(1)

        # account chip
        self.account_label = QLabel("No account")
        self.account_label.setObjectName("DimText")
        self.account_label.setToolTip("Play page → sign in or offline session")
        self.account_label.setWordWrap(True)
        lay.addWidget(self.account_label)

        self.online_label = QLabel("• offline")
        self.online_label.setObjectName("DimText")
        lay.addWidget(self.online_label)
        lay.addWidget(self._build_update_badge())
        return side

    def _build_update_badge(self) -> QWidget:
        w = QWidget()
        lay = QVBoxLayout(w)
        lay.setContentsMargins(0, 6, 0, 0)
        lay.setSpacing(2)
        self.update_label = QLabel("")
        self.update_label.setObjectName("DimText")
        self.update_label.setWordWrap(True)
        b = QPushButton("Check for updates")
        b.setObjectName("GhostButton")
        b.setMinimumHeight(28)
        b.clicked.connect(self.service_ui_check_updates)
        lay.addWidget(self.update_label)
        lay.addWidget(b)
        return w

    def _build_topbar(self) -> QWidget:
        bar = QWidget()
        bar.setObjectName("TopBar")
        bar.setFixedHeight(56)
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(24, 8, 24, 8)
        lay.setSpacing(16)
        self.page_title = QLabel("Play")
        self.page_title.setObjectName("PageTitle")
        lay.addWidget(self.page_title)
        lay.addStretch(1)
        self.clock = QLabel("")
        self.clock.setObjectName("DimText")
        lay.addWidget(self.clock)
        QTimer.singleShot(0, lambda: None)
        return bar

    # ------------------------------------------------------------------ #
    def show_page(self, key: str, animate: bool = True) -> None:
        if key not in self._pages:
            return
        if key == self._current_page and self._pages[key].isVisible():
            return
        self._nav_buttons[key].setChecked(True)
        for k, b in self._nav_buttons.items():
            if k != key:
                b.setChecked(False)
        self.page_title.setText(
            {"play": "Play", "mods": "Mod Manager", "performance": "Performance",
             "capes": "SPECIAL CAPES", "profiles": "Profiles",
             "settings": "Settings", "companion": "AI Companion", "logs": "Logs & Diagnostics"}[key])

        old_idx = self.stack.currentIndex()
        new_idx = self.stack.indexOf(self._pages[key])
        page = self._pages[key]

        def _switch():
            self.stack.setCurrentIndex(new_idx)
            if hasattr(page, "on_shown"):
                try:
                    page.on_shown()
                except Exception:
                    pass

        if animate and old_idx != new_idx and not self._fading:
            self._animate_switch(page, _switch)
        else:
            _switch()
            self._fading = False
        self._current_page = key

    def _animate_switch(self, page, switch_fn) -> None:
        """Fade current page out, swap, fade in (smooth UI transitions)."""
        self._fading = True
        eff = page.graphicsEffect()
        if not isinstance(eff, QGraphicsOpacityEffect):
            eff = QGraphicsOpacityEffect()
            page.setGraphicsEffect(eff)

        from PySide6.QtCore import QPropertyAnimation

        def start_fade_in():
            switch_fn()
            anim2 = QPropertyAnimation(eff, b"opacity")
            anim2.setDuration(160)
            anim2.setStartValue(0.0)
            anim2.setEndValue(1.0)

            def done():
                page.setGraphicsEffect(None)
                self._fading = False

            anim2.finished.connect(done)
            anim2.start()

        anim = QPropertyAnimation(eff, b"opacity")
        anim.setDuration(140)
        anim.setStartValue(1.0)
        anim.setEndValue(0.0)
        anim.finished.connect(start_fade_in)
        anim.start()

    # ------------------------------------------------------------------ #
    def _wire_service(self) -> None:
        self.service.progress.connect(self._on_download_progress)
        self.service.log_line.connect(self._on_log_line)

    def _on_download_progress(self, url: str, p) -> None:
        page = self._pages.get(self._current_page)
        if page is not None and hasattr(page, "on_download_progress"):
            try:
                page.on_download_progress(p)
            except Exception:
                pass
        self._sb.showMessage(
            f"Downloading {p.received / 1024:.0f}/{max(1, p.total / 1024):.0f} KB "
            f"({p.speed_bps / 1024:.0f} KB/s)", 3000)

    def _on_log_line(self, line: str) -> None:
        page = self._pages.get("logs")
        if page is not None and hasattr(page, "append_line"):
            page.append_line(line)

    # ------------------------------------------------------------------ #
    def service_ui_check_updates(self) -> None:
        """Called from the sidebar; checks updates with a changelog prompt."""
        from . import update_dialog
        update_dialog.check_updates(self.service, self)

    # ------------------------------------------------------------------ #
    def set_account_display(self, text: str) -> None:
        self.account_label.setText(text)

    def set_online_display(self, online: bool, cached: bool = False) -> None:
        if online:
            self.online_label.setText("● online")
            self.online_label.setStyleSheet(f"color: {self.t.ok};")
        else:
            self.online_label.setText("● offline" + (" (cached)" if cached else ""))
            self.online_label.setStyleSheet(f"color: {self.t.warn};")

    def statusBar(self) -> QStatusBar:
        return self._sb
