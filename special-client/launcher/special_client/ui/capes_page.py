"""SPECIAL CAPES page: 3D preview, palette schemes, assignment, import."""
from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QCheckBox, QFileDialog, QHBoxLayout, QLabel,
                               QListWidget, QListWidgetItem, QMessageBox,
                               QPushButton, QVBoxLayout, QWidget)

from ..core.capes import texture
from .capes_preview import CapePreview
from .widgets import accent_card, card, dim_label, section_title


class CapesPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.win = window
        self.svc = window.service
        self._build()

    # ------------------------------------------------------------------ #
    def _build(self) -> None:
        outer = QHBoxLayout(self)
        outer.setContentsMargins(24, 18, 24, 18)
        outer.setSpacing(16)

        # ---- left: 3D preview -------------------------------------------
        self.preview = CapePreview()
        outer.addWidget(self.preview, 3)

        right = QVBoxLayout()
        right.setSpacing(12)

        head = accent_card()
        hv = QVBoxLayout(head)
        hv.setSpacing(4)
        title = QLabel("SPECIAL LEGEND CAPE")
        title.setStyleSheet(
            f"font-size: 18px; font-weight: 800; color: {self.win.t.accent};")
        sub = dim_label("Original SPECIAL CLIENT cosmetic — black & purple "
                        "base, glowing cyan geometry, the SPECIAL emblem.")
        sub.setWordWrap(True)
        hv.addWidget(title)
        hv.addWidget(sub)
        right.addWidget(head)

        # ---- capes list ----------------------------------------------------
        c = card()
        cv = QVBoxLayout(c)
        cv.setSpacing(8)
        cv.addWidget(section_title("CAPE COLLECTION"))
        self.list = QListWidget()
        self.list.setMinimumHeight(150)
        self.list.currentItemChanged.connect(self._preview_selected)
        cv.addWidget(self.list)
        brow = QHBoxLayout()
        btn_import = QPushButton("Import artwork…")
        btn_import.setObjectName("GhostButton")
        btn_import.setToolTip("Import your own 64×32 cape artwork (resized "
                              "automatically). Use your own or licensed art.")
        btn_import.clicked.connect(self._import)
        btn_auto = QCheckBox("Auto-rotate")
        btn_auto.setChecked(True)
        btn_auto.toggled.connect(self.preview.set_auto_rotate)
        btn_zoom = dim_label("scroll to zoom")
        brow.addWidget(btn_import)
        brow.addWidget(btn_auto)
        brow.addStretch(1)
        brow.addWidget(btn_zoom)
        cv.addLayout(brow)
        right.addWidget(c)

        # ---- assignment ------------------------------------------------------
        a = card()
        av = QVBoxLayout(a)
        av.setSpacing(8)
        av.addWidget(section_title("ASSIGN"))
        self.assign_row = QHBoxLayout()
        self.btn_assign = QPushButton("Wear on my in-client character")
        self.btn_assign.setObjectName("PrimaryButton")
        self.btn_assign.clicked.connect(self._assign_self)
        self.assign_row.addWidget(self.btn_assign, 1)
        av.addLayout(self.assign_row)
        self.assign_note = dim_label(
            "SPECIAL CLIENT renders your cape on your character in-game. "
            "Friends need the same SPECIAL Fabric mod and your imported public cosmetic profile. Vanilla players do not see these cosmetics. We never "
            "claim universal visibility and never impersonate Mojang/"
            "Microsoft cosmetics.")
        self.assign_note.setWordWrap(True)
        av.addWidget(self.assign_note)
        wings = QCheckBox("Animated wings on my back (SPECIAL Fabric 1.20.1 only)")
        from ..core.cosmetics import CosmeticsStore
        wings.setChecked(CosmeticsStore(self.svc.layout.game_dir).read()["self"].get("wings", False))
        wings.toggled.connect(lambda v: CosmeticsStore(self.svc.layout.game_dir).set_self(wings=v))
        av.addWidget(wings)
        peers = QHBoxLayout()
        export = QPushButton("Export my public cosmetic profile…")
        export.clicked.connect(self._export_peer)
        load = QPushButton("Import friend's profile…")
        load.clicked.connect(self._import_peer)
        peers.addWidget(export)
        peers.addWidget(load)
        av.addLayout(peers)
        right.addWidget(a)

        right.addStretch(1)
        outer.addLayout(right, 2)

        self._populate()

    # ------------------------------------------------------------------ #
    def on_shown(self) -> None:
        self._populate()

    def _populate(self) -> None:
        self.list.blockSignals(True)
        self.list.clear()
        reg = self.svc.capes
        sel = reg.assignments.get(reg.self_uuid)
        for cape in reg.capes:
            it = QListWidgetItem(cape.name)
            it.setData(Qt.UserRole, cape.id)
            if cape.id == sel:
                it.setText(f"{cape.name}  ★ (worn)")
            self.list.addItem(it)
        if self.list.count() and self.list.currentRow() < 0:
            self.list.setCurrentRow(0)
        self.list.blockSignals(False)
        self._preview_selected()

    def _current_cape_id(self) -> str | None:
        it = self.list.currentItem()
        return it.data(Qt.UserRole) if it else None

    def _preview_selected(self, *_) -> None:
        cid = self._current_cape_id()
        if not cid:
            return
        cape = self.svc.capes.cape(cid)
        if cape is None:
            return
        if cape.builtin:
            img = texture.generate_cape(cape.palette)
        else:
            from PIL import Image
            p = self.svc.capes.texture_path(cid, self.svc.layout.client_capes)
            if p is None:
                return
            img = Image.open(p).convert("RGBA")
        self.preview.set_texture(img)

    def _assign_self(self) -> None:
        cid = self._current_cape_id()
        if not cid:
            return
        from ..core.cosmetics import CosmeticsStore
        cape = self.svc.capes.cape(cid)
        if not cape or not cape.builtin:
            QMessageBox.information(self, "Preview only", "Custom imported artwork remains launcher-preview only; select a built-in cape for the Fabric renderer.")
            return
        CosmeticsStore(self.svc.layout.game_dir).set_self(cape=cape.palette)
        if self.svc.active_session:
            self.svc.capes.self_uuid = self.svc.active_session.uuid
        self.svc.capes.assign_self(cid)
        self.svc.capes.save(self.svc.layout.client_config,
                            self.svc.layout.client_capes)
        self._populate()
        self.assign_note.setText(
            "Saved. Your cape is assigned in "
            "special/config/cape-registry.json — the in-game module renders "
            "it for your UUID while you play through SPECIAL CLIENT.")

    def _import(self) -> None:
        f, _ = QFileDialog.getOpenFileName(
            self, "Import cape artwork", "", "Images (*.png *.jpg *.jpeg)")
        if not f:
            return
        name, _ = Path(f).stem, None
        try:
            cape = self.svc.capes.add_custom(f, name[:24] or "Custom")
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "SPECIAL CLIENT", str(e))
            return
        self.svc.capes.save(self.svc.layout.client_config,
                            self.svc.layout.client_capes)
        self._populate()
        for i in range(self.list.count()):
            if self.list.item(i).data(Qt.UserRole) == cape.id:
                self.list.setCurrentRow(i)
                break

    def _export_peer(self):
        if not self.svc.active_session:
            QMessageBox.information(self, "Select account", "Select your actual game account first so the correct UUID is shared.")
            return
        path, _ = QFileDialog.getSaveFileName(self, "Export public cosmetics (no credentials)", "special-cosmetics.json", "JSON (*.json)")
        if path:
            from ..core.cosmetics import CosmeticsStore
            CosmeticsStore(self.svc.layout.game_dir).export_peer(self.svc.active_session.uuid, path)

    def _import_peer(self):
        path, _ = QFileDialog.getOpenFileName(self, "Import public cosmetic profile", "", "JSON (*.json)")
        if path:
            try:
                from ..core.cosmetics import CosmeticsStore
                count = CosmeticsStore(self.svc.layout.game_dir).import_peers(path)
                self.assign_note.setText(f"Imported {count} peer profiles. Visible only in compatible SPECIAL clients; no vanilla/global visibility.")
            except (OSError, ValueError, AttributeError, TypeError) as exc:
                QMessageBox.warning(self, "Invalid cosmetic profile", str(exc))
