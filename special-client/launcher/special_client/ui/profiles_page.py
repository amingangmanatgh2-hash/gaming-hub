"""Profiles page: saved launch configurations."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QComboBox, QFileDialog, QHBoxLayout, QLineEdit,
                               QListWidget, QListWidgetItem, QMessageBox,
                               QPushButton, QSpinBox, QVBoxLayout, QWidget)

from .widgets import card, dim_label, section_title


class ProfilesPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.win = window
        self.svc = window.service
        self._build()

    def _build(self) -> None:
        outer = QHBoxLayout(self)
        outer.setContentsMargins(24, 18, 24, 18)
        outer.setSpacing(14)

        left = card()
        lv = QVBoxLayout(left)
        lv.setSpacing(8)
        lv.addWidget(section_title("SAVED PROFILES"))
        self.list = QListWidget()
        self.list.setMinimumHeight(280)
        lv.addWidget(self.list)
        brow = QHBoxLayout()
        self.btn_new = QPushButton("New profile")
        self.btn_new.clicked.connect(self._new)
        self.btn_dup = QPushButton("Duplicate")
        self.btn_dup.clicked.connect(self._dup)
        self.btn_del = QPushButton("Delete")
        self.btn_del.setObjectName("DangerButton")
        self.btn_del.clicked.connect(self._del)
        for b in (self.btn_new, self.btn_dup, self.btn_del):
            brow.addWidget(b)
        lv.addLayout(brow)
        outer.addWidget(left, 3)

        right = card()
        rv = QVBoxLayout(right)
        rv.setSpacing(10)
        rv.addWidget(section_title("PROFILE SETTINGS"))
        rv.addWidget(dim_label("Name"))
        self.name = QLineEdit()
        rv.addWidget(self.name)
        rv.addWidget(dim_label("Minecraft version"))
        self.version = QComboBox()
        rv.addWidget(self.version)
        rv.addWidget(dim_label("Loader"))
        self.loader = QComboBox()
        rv.addWidget(self.loader)
        rv.addWidget(dim_label("RAM (MB)"))
        self.ram = QSpinBox()
        self.ram.setRange(1024, 32768)
        self.ram.setSingleStep(512)
        self.ram.setValue(4096)
        rv.addWidget(self.ram)
        rv.addWidget(dim_label("Java path (blank = auto-detect)"))
        self.java = QLineEdit()
        rv.addWidget(self.java)
        rv.addWidget(dim_label("Auth mode"))
        self.auth = QComboBox()
        self.auth.addItem("Microsoft", "microsoft")
        self.auth.addItem("Offline (no Microsoft session)", "offline")
        rv.addWidget(self.auth)
        rv.addStretch(1)
        ab = QHBoxLayout()
        self.btn_apply = QPushButton("Save & make active")
        self.btn_apply.setObjectName("PrimaryButton")
        self.btn_apply.clicked.connect(self._save)
        self.btn_export = QPushButton("Export…")
        self.btn_export.clicked.connect(self._export)
        ab.addWidget(self.btn_apply, 1)
        ab.addWidget(self.btn_export, 1)
        rv.addLayout(ab)
        outer.addWidget(right, 4)

    # ------------------------------------------------------------------ #
    def on_shown(self) -> None:
        self._populate()

    def _populate(self) -> None:
        self.list.blockSignals(True)
        self.list.clear()
        for p in self.svc.profiles.profiles:
            it = QListWidgetItem(p.name + ("  ★" if p.name == self.svc.profiles.active else ""))
            it.setData(Qt.UserRole, p.name)
            self.list.addItem(it)
        self.list.blockSignals(False)
        if self.list.count() and self.list.currentRow() < 0:
            self.list.setCurrentRow(0)
        # version / loader combos mirror the Play page sources
        self.version.blockSignals(True)
        self.version.clear()
        manifest = self.svc.load_manifest()
        if manifest:
            for e in manifest.releases()[:30]:
                self.version.addItem(e.id)
        else:
            self.version.addItem(self.svc.config.get("version_id", "1.20.1"))
        self.version.blockSignals(False)
        self.loader.blockSignals(True)
        self.loader.clear()
        self.loader.addItem("Vanilla", "vanilla")
        for p in self.svc.loader_service.installed_profiles():
            self.loader.addItem(p.name, p.name)
        self.loader.blockSignals(False)
        self._fill_from_active()

    def _fill_from_active(self) -> None:
        it = self.list.currentItem()
        if it is None:
            return
        p = self.svc.profiles.get(it.data(Qt.UserRole))
        self.name.setText(p.name)
        i = self.version.findText(p.version_id)
        self.version.setCurrentIndex(max(0, i))
        i = self.loader.findData(p.loader)
        self.loader.setCurrentIndex(max(0, i))
        self.ram.setValue(p.ram_mb)
        self.java.setText(p.java_path)
        i = self.auth.findData(p.auth_mode)
        self.auth.setCurrentIndex(max(0, i))

    def _current_name(self) -> str | None:
        it = self.list.currentItem()
        return it.data(Qt.UserRole) if it else None

    def _new(self) -> None:
        name = f"Profile {self.svc.profiles.profiles.__len__() + 1}"
        try:
            self.svc.profiles.create(name)
        except ValueError as e:
            QMessageBox.warning(self, "SPECIAL CLIENT", str(e))
            return
        self._populate()
        for i in range(self.list.count()):
            if self.list.item(i).text().startswith(name):
                self.list.setCurrentRow(i)
                break

    def _dup(self) -> None:
        cur = self._current_name()
        if not cur:
            return
        self.svc.profiles.duplicate(cur, cur + " (copy)")
        self._populate()

    def _del(self) -> None:
        cur = self._current_name()
        if not cur:
            return
        if QMessageBox.question(self, "SPECIAL CLIENT",
                                f"Delete profile {cur!r}?"
                                ) != QMessageBox.Yes:
            return
        self.svc.profiles.delete(cur)
        self._populate()

    def _save(self) -> None:
        cur = self._current_name()
        name = self.name.text().strip() or "Profile"
        try:
            if cur is None:
                p = self.svc.profiles.create(name)
            elif cur != name:
                p = self.svc.profiles.rename(cur, name)
            else:
                p = self.svc.profiles.get(name)
        except (ValueError, KeyError) as e:
            QMessageBox.warning(self, "SPECIAL CLIENT", str(e))
            return
        p.version_id = self.version.currentText()
        p.loader = self.loader.currentData()
        p.ram_mb = self.ram.value()
        p.java_path = self.java.text().strip()
        p.auth_mode = self.auth.currentData()
        self.svc.profiles.save()
        self.svc.profiles.set_active(name)
        # push settings into the global config so Play reflects them
        self.svc.config.set("version_id", p.version_id)
        self.svc.config.set("ram_mb", p.ram_mb)
        self.svc.config.save()
        self._populate()

    def _export(self) -> None:
        import json
        cur = self._current_name()
        if not cur:
            return
        p = self.svc.profiles.get(cur)
        f, _ = QFileDialog.getSaveFileName(
            self, "Export profile", f"{cur}.json", "JSON (*.json)")
        if not f:
            return
        with open(f, "w") as fh:
            json.dump(p.to_dict(), fh, indent=2)
