"""Small shared dialogs."""
from __future__ import annotations

from PySide6.QtWidgets import (QDialog, QDialogButtonBox, QLabel, QLineEdit,
                               QVBoxLayout)

def ask_offline_name(parent) -> str | None:
    d = QDialog(parent)
    d.setWindowTitle("Offline session")
    d.setMinimumWidth(440)
    lay = QVBoxLayout(d)
    lay.addWidget(QLabel(
        "Enter a name for an offline session.\n\n"
        "Offline sessions use the standard vanilla OfflinePlayer UUID. "
        "They let you play singleplayer and join servers that allow "
        "offline accounts. Online-mode servers (e.g. most public servers "
        "with auth-required) will not accept them — that is a Minecraft "
        "licensing rule, not a SPECIAL CLIENT limitation."))
    line = QLineEdit()
    line.setPlaceholderText("e.g. Steve_42")
    line.setMaxLength(16)
    lay.addWidget(line)
    box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
    box.accepted.connect(d.accept)
    box.rejected.connect(d.reject)
    lay.addWidget(box)
    if d.exec() == QDialog.Accepted:
        return line.text().strip()
    return None
