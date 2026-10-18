"""Settings page: game dir, Java, themes, updates, data protection, about."""
from __future__ import annotations

import shutil
import time
import zipfile
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QCheckBox, QComboBox, QFileDialog, QHBoxLayout,
                               QLabel, QLineEdit, QMessageBox, QPushButton,
                               QVBoxLayout, QWidget)
from .. import APP_NAME, __version__
from ..core.paths import DirLayout
from .theme import THEMES
from .widgets import card, dim_label, section_title


class SettingsPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.win = window
        self.svc = window.service
        self._build()

    def _build(self) -> None:
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 18, 24, 18)
        outer.setSpacing(12)

        # -- storage ---------------------------------------------------------
        c = card()
        v = QVBoxLayout(c)
        v.setSpacing(8)
        v.addWidget(section_title("INSTALLATION & DATA"))
        row = QHBoxLayout()
        self.dir_label = QLabel(str(self.svc.layout.game_dir))
        self.dir_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        btn = QPushButton("Change game directory…")
        btn.clicked.connect(self._change_dir)
        row.addWidget(self.dir_label, 1)
        row.addWidget(btn)
        v.addLayout(row)
        note = dim_label(
            "SPECIAL CLIENT uses separate folders inside the game directory: "
            "versions/, libraries/, assets/, mods/, resourcepacks/, "
            "shaderpacks/, and special/ (configs, capes, logs, backups). "
            "Updates and repairs NEVER delete worlds (saves/), resource "
            "packs, shader packs, or screenshots.")
        note.setWordWrap(True)
        v.addWidget(note)
        b2 = QHBoxLayout()
        self.btn_backup = QPushButton("Backup client data now")
        self.btn_backup.clicked.connect(self._backup_data)
        self.btn_restore = QPushButton("Restore from backup…")
        self.btn_restore.clicked.connect(self._restore_data)
        self.btn_clear = QPushButton("Clear caches")
        self.btn_clear.setObjectName("GhostButton")
        self.btn_clear.clicked.connect(self._clear_caches)
        for b in (self.btn_backup, self.btn_restore, self.btn_clear):
            b2.addWidget(b)
        b2.addStretch(1)
        v.addLayout(b2)
        self.data_note = dim_label("")
        v.addWidget(self.data_note)
        outer.addWidget(c)

        # -- java ------------------------------------------------------------
        c2 = card()
        v2 = QVBoxLayout(c2)
        v2.setSpacing(8)
        v2.addWidget(section_title("JAVA"))
        self.java_label = dim_label("detected runtimes:")
        self.java_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        v2.addWidget(self.java_label)
        self.java_path = QLineEdit(self.svc.config.get("java_path"))
        self.java_path.setPlaceholderText("blank = auto-detect (JAVA_HOME, PATH, registry)")
        v2.addWidget(self.java_path)
        v2.addWidget(dim_label(
            "1.8–1.16 need Java 8 · 1.17–1.20 need Java 17 · 1.21+ needs "
            "Java 21. The Play page warns when the selected Java is too old."))
        outer.addWidget(c2)

        # -- appearance ----------------------------------------------------------
        c3 = card()
        v3 = QVBoxLayout(c3)
        v3.setSpacing(8)
        v3.addWidget(section_title("APPEARANCE"))
        row3 = QHBoxLayout()
        self.theme_box = QComboBox()
        for tid, t in THEMES.items():
            self.theme_box.addItem(t.name, tid)
        i = self.theme_box.findData(self.svc.config.get("theme"))
        self.theme_box.setCurrentIndex(max(0, i))
        self.theme_box.currentIndexChanged.connect(self._theme_changed)
        row3.addWidget(self.theme_box, 1)
        v3.addLayout(row3)
        self.chk_min = QCheckBox("Minimize launcher when the game starts")
        self.chk_min.setChecked(bool(self.svc.config.get("minimize_at_launch")))
        self.chk_min.toggled.connect(
            lambda v: self.svc.config.__setattr__("minimize_at_launch", v)
            or self.svc.config.set("minimize_at_launch", v))
        v3.addWidget(self.chk_min)
        outer.addWidget(c3)

        # -- updates --------------------------------------------------------------
        c4 = card()
        v4 = QVBoxLayout(c4)
        v4.setSpacing(8)
        v4.addWidget(section_title("UPDATES"))
        self.chk_updates = QCheckBox("Check for updates on start")
        self.chk_updates.setChecked(
            bool(self.svc.config.get("check_updates_on_start")))
        v4.addWidget(self.chk_updates)
        self.channel = QComboBox()
        self.channel.addItem("Stable", "stable")
        self.channel.addItem("Beta", "beta")
        self.channel.addItem("Off", "off")
        i = self.channel.findData(self.svc.config.get("update_channel"))
        self.channel.setCurrentIndex(max(0, i))
        v4.addWidget(self.channel)
        v4.addWidget(dim_label(
            "Updates download from a trusted HTTPS manifest, verify every "
            "file's SHA-256 before applying, snapshot the current install "
            "first, and roll back automatically on failure. Major version "
            "upgrades always ask before applying. Offline, the launcher "
            "uses the local installation without retry loops."))
        outer.addWidget(c4)

        # -- auth -------------------------------------------------------------------
        c5 = card()
        v5 = QVBoxLayout(c5)
        v5.setSpacing(8)
        v5.addWidget(section_title("MICROSOFT SIGN-IN"))
        self.msa_id = QLineEdit(self.svc.config.get("msa_client_id"))
        self.msa_id.setPlaceholderText(
            "optional: your own Azure public-client id (default = the well-known "
            "public client id 00000000402b5328 used by open-source launchers)")
        v5.addWidget(self.msa_id)
        v5.addWidget(dim_label(
            "Device-code flow: no password is entered in this app, tokens are "
            "stored locally (file mode 0600) and only ever sent to "
            "Microsoft/Xbox/Mojang endpoints. Offline sessions never touch "
            "Microsoft services."))
        outer.addWidget(c5)

        companion = QPushButton("AI companion — optional API key, model and provider settings…")
        companion.clicked.connect(lambda: self.win.show_page("companion"))
        outer.addWidget(companion)

        # -- save / about -------------------------------------------------------------
        ab = QHBoxLayout()
        btn_save = QPushButton("Save settings")
        btn_save.setObjectName("PrimaryButton")
        btn_save.clicked.connect(self._save)
        ab.addStretch(1)
        about = dim_label(f"{APP_NAME} v{__version__} · independent project — "
                          "not affiliated with Mojang Studios or Microsoft.")
        ab.addWidget(about)
        ab.addStretch(1)
        ab.addWidget(btn_save)
        outer.addLayout(ab)
        outer.addStretch(1)

    # ------------------------------------------------------------------ #
    def on_shown(self) -> None:
        self._refresh_java()
        self.dir_label.setText(str(self.svc.layout.game_dir))
        self.java_path.setText(self.svc.config.get("java_path"))

    def _refresh_java(self) -> None:
        rts = self.svc.java_runtimes
        if not rts:
            self.java_label.setText(
                "No Java runtimes detected yet. Install a JDK (8, 17 or 21) "
                "or set an explicit path below.")
            return
        lines = [f"• Java {r.major} ({r.source}): {r.path}" for r in rts[:6]]
        self.java_label.setText("Detected runtimes:\n" + "\n".join(lines))

    def _change_dir(self) -> None:
        d = QFileDialog.getExistingDirectory(
            self, "Choose the Minecraft game directory",
            str(self.svc.layout.game_dir))
        if not d:
            return
        QMessageBox.information(
            self, "SPECIAL CLIENT",
            f"Game directory will change to:\n{d}\n\nExisting versions, "
            f"libraries, assets and mods there are kept. Profiles and "
            f"client settings move with the directory (special/).")
        self.svc.set_game_dir(Path(d))
        self.dir_label.setText(str(self.svc.layout.game_dir))
        self.win._pages["play"].on_shown()
        self.win._pages["mods"].on_shown()

    def _theme_changed(self, _i) -> None:
        from .theme import get_theme
        self.svc.config.set("theme", self.theme_box.currentData())
        self.svc.config.save()
        self.win.setStyleSheet(get_theme(self.theme_box.currentData()).qss()
                               if hasattr(get_theme, "qss") else
                               __import__("special_client.ui.theme",
                                         fromlist=["qss"]).qss(
                                   get_theme(self.theme_box.currentData())))

    def _save(self) -> None:
        self.svc.config.set("java_path", self.java_path.text().strip())
        self.svc.config.set("msa_client_id", self.msa_id.text().strip())
        self.svc.config.set("check_updates_on_start",
                            self.chk_updates.isChecked())
        self.svc.config.set("update_channel", self.channel.currentData())
        self.svc.config.set("theme", self.theme_box.currentData())
        self.svc.config.save()
        self._refresh_java()
        self.data_note.setText("Settings saved.")

    # -- data protection ------------------------------------------------------
    def _backup_data(self) -> None:
        """Back up client-owned data (configs, capes, mods, profiles) —
        never user worlds — into a timestamped zip."""
        layout = self.svc.layout
        out = layout.client_backups / f"special-backup-{time.strftime('%Y%m%d-%H%M%S')}.zip"
        out.parent.mkdir(parents=True, exist_ok=True)
        included = []
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
            for sub in ("config", "capes", "mod-backups"):
                src = layout.client_root / sub
                if src.exists():
                    for f in src.rglob("*"):
                        if f.is_file():
                            zf.write(f, f"special/{sub}/{f.relative_to(src)}")
                            included.append(f.name)
            for f in layout.mods.rglob("*.jar"):
                if f.is_file():
                    zf.write(f, f"mods/{f.relative_to(layout.mods)}")
                    included.append(f.name)
        self.data_note.setText(
            f"Backup created: {out.name} ({len(included)} files). "
            f"Worlds (saves/) are excluded by design — back those up "
            f"separately if you want a full save.")

    def _restore_data(self) -> None:
        f, _ = QFileDialog.getOpenFileName(
            self, "Restore backup", str(self.svc.layout.client_backups),
            "Zip (*.zip)")
        if not f:
            return
        layout = self.svc.layout
        try:
            with zipfile.ZipFile(f) as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    name = info.filename
                    if name.startswith("special/"):
                        dest = layout.client_root / name[len("special/"):]
                    elif name.startswith("mods/"):
                        dest = layout.mods / name[len("mods/"):]
                    else:
                        continue
                    if DirLayout.is_protected(dest, layout.game_dir):
                        continue  # never overwrite user data
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(info) as src, open(dest, "wb") as dst:
                        shutil.copyfileobj(src, dst)
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "SPECIAL CLIENT",
                                 f"Restore failed: {e}")
            return
        self.data_note.setText(f"Restored from {Path(f).name}.")

    def _clear_caches(self) -> None:
        cache = self.svc.layout.client_cache
        n = 0
        if cache.exists():
            for f in cache.iterdir():
                if f.is_file():
                    f.unlink()
                    n += 1
        self.data_note.setText(f"Cleared {n} cached file(s).")
