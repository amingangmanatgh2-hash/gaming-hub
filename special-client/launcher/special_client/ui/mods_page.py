"""Mod manager page: catalog table, install/enable/disable, conflicts,
backup/restore, import/export, loader installation."""
from __future__ import annotations


from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QFileDialog, QHBoxLayout, QHeaderView, QLabel, QComboBox,
                               QMessageBox, QTableWidget, QTableWidgetItem,
                               QAbstractItemView, QPushButton, QVBoxLayout,
                               QWidget)
from ..core.mods.catalog import entry_by_slug
from .widgets import card, dim_label


def _item(text: str, color: str | None = None, bold: bool = False) -> QTableWidgetItem:
    it = QTableWidgetItem(text)
    if color:
        it.setForeground(QColor(color))
    if bold:
        f = it.font()
        f.setBold(True)
        it.setFont(f)
    return it


class ModsPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.win = window
        self.svc = window.service
        self._busy = False
        self._build()

    # ------------------------------------------------------------------ #
    def _build(self) -> None:
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 18, 24, 18)
        outer.setSpacing(12)

        # top row: context + actions
        top = QHBoxLayout()
        info = card()
        il = QVBoxLayout(info)
        il.setSpacing(4)
        self.ctx_label = QLabel("Select a version & loader on the Play page.")
        self.ctx_label.setStyleSheet("font-weight: 600;")
        self.ctx_note = dim_label()
        self.ctx_note.setWordWrap(True)
        il.addWidget(self.ctx_label)
        il.addWidget(self.ctx_note)
        top.addWidget(info, 3)

        acts = QHBoxLayout()
        self.btn_loader = QPushButton("Install loader…")
        self.btn_loader.clicked.connect(self._install_loader)
        self.btn_import = QPushButton("Import JAR…")
        self.btn_import.clicked.connect(self._import_jar)
        self.btn_export = QPushButton("Export profile")
        self.btn_export.clicked.connect(self._export_profile)
        self.btn_backup = QPushButton("Backup mods")
        self.btn_backup.clicked.connect(self._backup)
        for b in (self.btn_loader, self.btn_import, self.btn_export,
                  self.btn_backup):
            acts.addWidget(b)
        top.addLayout(acts)
        outer.addLayout(top)

        source_row = QHBoxLayout()
        self.external = QComboBox()
        for name, url in [("Sodium (performance)", "https://github.com/CaffeineMC/sodium"),
                          ("LiquidBounce", "https://github.com/CCBlueX/LiquidBounce"),
                          ("Meteor Client", "https://github.com/MeteorDevelopment/meteor-client"),
                          ("Wurst Client", "https://github.com/Wurst-Imperium/Wurst7")]:
            self.external.addItem(name, url)
        source_row.addWidget(self.external, 1)
        official = QPushButton("Official source / builds ↗")
        def open_source():
            from PySide6.QtGui import QDesktopServices
            from PySide6.QtCore import QUrl
            QDesktopServices.openUrl(QUrl(self.external.currentData()))
        official.clicked.connect(open_source)
        source_row.addWidget(official)
        outer.addLayout(source_row)
        source_note = dim_label("External clients: download from upstream, then Import JAR. Check exact game/loader and licenses; do not stack client suites blindly.")
        source_note.setWordWrap(True)
        outer.addWidget(source_note)

        # table
        self.table = QTableWidget(0, 6)
        self.table.setHorizontalHeaderLabels(
            ["Mod", "Category", "Version", "State", "Mod ID", "Notes"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setAlternatingRowColors(True)
        self.table.setMinimumHeight(300)
        outer.addWidget(self.table, 1)

        # conflict panel
        self.conflict_label = dim_label("")
        self.conflict_label.setWordWrap(True)
        outer.addWidget(self.conflict_label)

        # bottom actions
        bottom = QHBoxLayout()
        self.btn_install = QPushButton("Install selected")
        self.btn_install.setObjectName("PrimaryButton")
        self.btn_install.clicked.connect(self._install_selected)
        self.btn_disable = QPushButton("Disable")
        self.btn_disable.clicked.connect(self._set_enabled(False))
        self.btn_enable = QPushButton("Enable")
        self.btn_enable.clicked.connect(self._set_enabled(True))
        self.btn_remove = QPushButton("Remove")
        self.btn_remove.setObjectName("DangerButton")
        self.btn_remove.clicked.connect(self._remove_selected)
        self.btn_restore = QPushButton("Restore from backup…")
        self.btn_restore.clicked.connect(self._restore)
        self.btn_refresh = QPushButton("Refresh")
        self.btn_refresh.setObjectName("GhostButton")
        self.btn_refresh.clicked.connect(self.refresh)
        for b in (self.btn_install, self.btn_disable, self.btn_enable,
                  self.btn_remove, self.btn_restore, self.btn_refresh):
            bottom.addWidget(b)
        bottom.addStretch(1)
        outer.addLayout(bottom)

        self._busy_timer = QTimer(self, timeout=self.refresh, interval=2000)

    # ------------------------------------------------------------------ #
    def on_shown(self) -> None:
        self.refresh()

    def _context(self):
        """(mc_version, loader) from the Play page selection."""
        play = self.win._pages["play"]
        entry = play.selected_version()
        mc = entry.id if entry is not None else (self.svc.config.get("version_id") or "1.20.1")
        d = play.loader_box.currentData()
        loader = "vanilla"
        if d and d[0] == "loader":
            loader = _loader_kind(d[1])
        elif d is None:
            loader = "vanilla"
        return mc, loader

    def refresh(self) -> None:
        if self._busy:
            return
        mc, loader = self._context()
        self.ctx_label.setText(f"Target: Minecraft {mc}  ·  loader: {loader}")
        if loader in ("vanilla", "neoforge", "forge"):
            self.ctx_note.setText(
                {"vanilla": "Vanilla has no mod loader — install Fabric "
                            "(recommended for the SPECIAL performance stack) "
                            "via 'Install loader…'.",
                 "neoforge": "NeoForge: the curated performance catalog is "
                             "Fabric-first; import NeoForge-compatible JARs "
                             "manually via 'Import JAR…'.",
                 "forge": "Forge (legacy): the curated performance catalog "
                          "is Fabric-first; import Forge-compatible JARs "
                          "manually via 'Import JAR…'."}[loader])
            self.table.setRowCount(0)
            self.conflict_label.setText("")
            return
        self._reload(mc, loader)

    def _reload(self, mc: str, loader: str) -> None:
        mm = self.svc.mod_manager
        try:
            mods = mm.inventory(mc, loader)
        except Exception as e:  # noqa: BLE001
            self.ctx_note.setText(f"inventory error: {e}")
            return
        self.table.setRowCount(0)
        color = {
            "installed": self.win.t.ok,
            "disabled": self.win.t.warn,
            "absent": self.win.t.text_dim,
        }
        for m in mods:
            r = self.table.rowCount()
            self.table.insertRow(r)
            name_item = _item(m.name, bold=True)
            entry = entry_by_slug(m.slug)
            if entry is not None:
                name_item.setData(Qt.UserRole, m.slug)
                name_item.setData(Qt.UserRole + 1, entry)
            self.table.setItem(r, 0, name_item)
            self.table.setItem(r, 1, _item(m.category))
            self.table.setItem(r, 2, _item(m.version or "—"))
            state_item = _item(m.state.upper(), color[m.state])
            self.table.setItem(r, 3, state_item)
            self.table.setItem(r, 4, _item(m.mod_id or "—"))
            self.table.setItem(r, 5, _item("; ".join(m.notes) or "—"))
        # conflicts
        try:
            conflicts = mm.detect_conflicts()
            if conflicts["warnings"]:
                self.conflict_label.setText(
                    "⚠ " + "  |  ".join(conflicts["warnings"]))
                self.conflict_label.setStyleSheet(f"color: {self.win.t.warn};")
            else:
                self.conflict_label.setText("No duplicate or conflicting mods detected.")
                self.conflict_label.setStyleSheet("")
        except Exception as e:  # noqa: BLE001
            self.conflict_label.setText(f"conflict scan failed: {e}")

    def _selected_slug(self) -> str | None:
        r = self.table.currentRow()
        if r < 0:
            return None
        it = self.table.item(r, 0)
        return it.data(Qt.UserRole) if it.data(Qt.UserRole) else None

    def _selected_entry(self):
        r = self.table.currentRow()
        if r < 0:
            return None
        return self.table.item(r, 0).data(Qt.UserRole + 1)

    # ------------------------------------------------------------------ #
    def _install_loader(self) -> None:
        from . import loaders_dialog
        mc, _ = self._context()
        loaders_dialog.install_loader_for(self.svc, self, mc)

    def _install_selected(self) -> None:
        entry = self._selected_entry()
        if entry is None:
            QMessageBox.information(self, "SPECIAL CLIENT", "Select a mod.")
            return
        mc, loader = self._context()
        self._busy = True
        self.btn_install.setEnabled(False)

        def work(progress):
            return self.svc.mod_manager.install(entry.slug, mc, loader)

        def done(mv):
            QTimer.singleShot(0, lambda: (
                self._busy_set(False),
                self.ctx_note.setText(
                    f"Installed {entry.name} {mv.version_number}"),
                self.refresh()))

        def err(e):
            QTimer.singleShot(0, lambda: (
                self._busy_set(False),
                QMessageBox.critical(self, "SPECIAL CLIENT", e)))

        self.svc.run_async(work, on_ok=done, on_err=err)

    def _busy_set(self, v: bool) -> None:
        self._busy = v
        self.btn_install.setEnabled(not v)

    def _set_enabled(self, enabled: bool):
        def go():
            entry = self._selected_entry()
            if entry is None:
                QMessageBox.information(self, "SPECIAL CLIENT", "Select a mod.")
                return
            try:
                self.svc.mod_manager.set_enabled(entry.slug, enabled)
            except Exception as e:  # noqa: BLE001
                QMessageBox.critical(self, "SPECIAL CLIENT", str(e))
                return
            self.refresh()
        return go

    def _remove_selected(self) -> None:
        entry = self._selected_entry()
        if entry is None:
            QMessageBox.information(self, "SPECIAL CLIENT", "Select a mod.")
            return
        if QMessageBox.question(self, "SPECIAL CLIENT",
                                f"Remove {entry.name}?") != QMessageBox.Yes:
            return
        try:
            self.svc.mod_manager.remove(entry.slug)
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "SPECIAL CLIENT", str(e))
            return
        self.refresh()

    # -- import / export -------------------------------------------------
    def _import_jar(self) -> None:
        f, _ = QFileDialog.getOpenFileName(
            self, "Import mod", "", "Mod files (*.jar *.zip)")
        if not f:
            return
        try:
            name = self.svc.mod_manager.import_jar(f)
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "SPECIAL CLIENT", str(e))
            return
        self.ctx_note.setText(f"Imported: {name}")
        self.refresh()

    def _export_profile(self) -> None:
        f, _ = QFileDialog.getSaveFileName(
            self, "Export mod profile", "special-mod-profile.zip",
            "Zip (*.zip)")
        if not f:
            return
        try:
            self.svc.mod_manager.export_profile(f)
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "SPECIAL CLIENT", str(e))
            return
        self.ctx_note.setText(f"Exported to {f}")

    def _restore(self) -> None:
        f, _ = QFileDialog.getOpenFileName(
            self, "Restore mod backup", str(self.svc.layout.client_mod_backups),
            "Zip (*.zip)")
        if not f:
            return
        try:
            self.svc.mod_manager.restore(f)
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "SPECIAL CLIENT", str(e))
            return
        self.ctx_note.setText(f"Restored from {f} (previous state auto-backed-up)")
        self.refresh()

    def _backup(self) -> None:
        try:
            p = self.svc.mod_manager.backup("manual")
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "SPECIAL CLIENT", str(e))
            return
        self.ctx_note.setText(f"Backup created: {p.name}")

    # -- rows carry slug in UserRole, entry in UserRole+1 -------------------
    def _row_setup(self, entry, m) -> None:
        pass


def _loader_kind(profile_id: str) -> str:
    for kind in ("fabric", "quilt", "neoforge", "forge"):
        if f"-{kind}-" in profile_id:
            return kind
    return "vanilla"
