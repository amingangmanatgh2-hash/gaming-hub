"""Update check flow: check → changelog → (ask on major) → verified apply."""
from __future__ import annotations

from PySide6.QtCore import QTimer
from PySide6.QtWidgets import (QDialog, QDialogButtonBox, QLabel, QMessageBox,
                               QTextEdit, QVBoxLayout)

from .. import __version__


def check_updates(svc, window, *, automatic: bool = False) -> None:
    """Kick off an update check (network) and show results."""
    holder = {"state": None}

    def work(progress):
        return svc.updater.check(use_cache=True)

    def done(state):
        holder["state"] = state
        from PySide6.QtCore import QTimer
        QTimer.singleShot(0, lambda: _show_result(window, state, automatic))

    def err(e):
        def _ui():
            msg = QMessageBox(window)
            msg.setWindowTitle("SPECIAL CLIENT — updates")
            msg.setText(
                "Could not reach the update service.\n\n"
                f"{str(e).splitlines()[0]}\n\n"
                "The launcher keeps working with the local installation. "
                "No further network retries are made while offline.")
            msg.exec()
        QTimer.singleShot(0, _ui)

    svc.run_async(work, on_ok=done, on_err=err)


def _show_result(window, state, automatic: bool) -> None:
    if state is None:
        QMessageBox.information(
            window, "SPECIAL CLIENT — updates",
            "Offline: using the locally cached update info / current "
            "installation. No network retries.")
        return
    if not state.update_available:
        QMessageBox.information(
            window, "SPECIAL CLIENT — updates",
            f"You are up to date (v{__version__}).")
        return

    dlg = QDialog(window)
    dlg.setWindowTitle("SPECIAL CLIENT — update available")
    dlg.setMinimumWidth(520)
    lay = QVBoxLayout(dlg)
    head = QLabel(
        f"Update available: {state.current_version} → {state.latest_version}"
        + ("   (major)" if state.major else "")
        + ("   (cached info)" if state.from_cache else ""))
    head.setStyleSheet("font-size: 15px; font-weight: 800;")
    lay.addWidget(head)
    if state.major and not automatic:
        warn = QLabel("This is a MAJOR version update. It will be applied "
                      "after verification and a rollback point is created "
                      "first. Continue?")
        warn.setWordWrap(True)
        lay.addWidget(warn)
    body = QTextEdit()
    body.setReadOnly(True)
    body.setPlainText(state.changelog or "(no changelog provided)")
    lay.addWidget(body, 1)
    box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
    box.accepted.connect(dlg.accept)
    box.rejected.connect(dlg.reject)
    lay.addWidget(box)
    if dlg.exec() != QDialog.Accepted:
        return

    manifest = state.manifest  # type: ignore[attr-defined]
    prog = QLabel("Verifying & installing…")
    dlg2 = QDialog(window)
    dlg2.setWindowTitle("Installing update")
    d2 = QVBoxLayout(dlg2)
    d2.addWidget(prog)
    pbar = __import__("PySide6.QtWidgets", fromlist=["QProgressBar"]).QProgressBar()
    pbar.setRange(0, 100)
    d2.addWidget(pbar)
    holder = {"done": False}

    def apply(progress):
        svc = window.service
        svc.updater.apply(manifest, progress=lambda s, f: None)
        return True

    def finished(_r):
        def _ui():
            holder["done"] = True
            dlg2.accept()
            QMessageBox.information(
                window, "SPECIAL CLIENT — updated",
                f"Update to {manifest.version} verified and applied.\n\n"
                "A rollback point was kept. Restart the launcher to finish "
                "the update (your settings, worlds and mods are untouched).")
        QTimer.singleShot(0, _ui)

    def failed(e):
        def _ui():
            holder["done"] = True
            dlg2.accept()
            QMessageBox.critical(
                window, "SPECIAL CLIENT — update failed",
                f"{e}\n\nThe previous installation was restored "
                f"automatically (rollback).")
        QTimer.singleShot(0, _ui)

    dlg2.show()
    window.service.run_async(apply, on_ok=finished, on_err=failed)
    dlg2.exec()
