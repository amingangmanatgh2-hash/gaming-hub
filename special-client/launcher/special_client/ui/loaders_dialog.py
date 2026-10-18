"""Loader install dialog: pick Fabric / Quilt / NeoForge / Forge for a version."""
from __future__ import annotations

from PySide6.QtWidgets import (QDialog, QDialogButtonBox, QRadioButton,
                               QVBoxLayout, QLabel, QButtonGroup)

CHOICES = [
    ("fabric", "Fabric — recommended (full SPECIAL performance stack support)"),
    ("quilt", "Quilt — community supported (Fabric-compatible mods)"),
    ("neoforge", "NeoForge — 1.20.1+ (official client profiles)"),
    ("forge", "Forge — up to 1.20.1 (official client profiles)"),
]


def install_loader_for(svc, parent, mc: str) -> None:
    d = QDialog(parent)
    d.setWindowTitle(f"Install mod loader — {mc}")
    d.setMinimumWidth(460)
    lay = QVBoxLayout(d)
    lay.addWidget(QLabel(
        f"Choose a mod loader for Minecraft {mc}.\n\n"
        "SPECIAL CLIENT composes a separate instance profile "
        f"(e.g. {mc}-fabric-…) so your vanilla install stays untouched. "
        "Fabric gets first-class support; Quilt is community-supported; "
        "NeoForge/Forge use the official client profiles from their mavens."))
    group = QButtonGroup(d)
    for i, (key, label) in enumerate(CHOICES):
        rb = QRadioButton(label)
        rb.setProperty("kind", key)
        if key == "fabric":
            rb.setChecked(True)
        group.addButton(rb, i)
        lay.addWidget(rb)
    box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
    box.accepted.connect(d.accept)
    box.rejected.connect(d.reject)
    lay.addWidget(box)
    if d.exec() != QDialog.Accepted:
        return
    kind = group.checkedButton().property("kind")

    from PySide6.QtCore import QTimer

    def work(progress):
        entry = _manifest_entry(svc, mc)
        base = svc.launch_service.fetch_version_json(entry)
        ls = svc.loader_service
        if kind == "fabric":
            profile = ls.install_fabric(mc, base.raw)
        elif kind == "quilt":
            profile = ls.install_quilt(mc, base.raw)
        elif kind == "neoforge":
            profile = ls.install_neoforge(mc, base.raw)
        else:
            profile = ls.install_forge(mc, base.raw)
        ls.save_profile(profile)
        return profile

    def done(profile):
        def _ui():
            play = parent.win._pages["play"] if hasattr(parent, "win") else \
                parent.window()._pages["play"]
            play.add_loader_profile(profile)
            play.loader_box.setCurrentIndex(play.loader_box.count() - 1)
            play._update_loader_note()
        QTimer.singleShot(0, _ui)

    def err(e):
        from PySide6.QtWidgets import QMessageBox
        QMessageBox.critical(parent, "SPECIAL CLIENT",
                             f"Loader install failed:\n\n{e}")

    svc.run_async(work, on_ok=done, on_err=err)


def _manifest_entry(svc, mc: str):
    m = svc.load_manifest()
    if m:
        e = m.by_id(mc)
        if e:
            return e
    from .service import _Entry
    return _Entry(mc, "")
