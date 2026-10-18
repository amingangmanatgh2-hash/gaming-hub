"""Logs & diagnostics page: live launcher log + crash analysis."""
from __future__ import annotations


from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QHBoxLayout, QPlainTextEdit, QPushButton,
                               QComboBox, QVBoxLayout, QWidget)

from ..core.diagnostics import diagnose, tail_log
from .widgets import card, dim_label, section_title


class LogsPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.win = window
        self.svc = window.service
        self._buf: list[str] = []
        self._build()

    def _build(self) -> None:
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 18, 24, 18)
        outer.setSpacing(12)

        row = QHBoxLayout()
        self.log_sel = QComboBox()
        self.log_sel.setMinimumWidth(320)
        self.log_sel.currentIndexChanged.connect(self._load_selected)
        btn_refresh = QPushButton("Refresh list")
        btn_refresh.setObjectName("GhostButton")
        btn_refresh.clicked.connect(self._populate)
        row.addWidget(self.log_sel, 1)
        row.addWidget(btn_refresh)
        outer.addLayout(row)

        self.view = QPlainTextEdit()
        self.view.setReadOnly(True)
        self.view.setStyleSheet(
            "font-family: Consolas, 'Cascadia Mono', 'Courier New', monospace; "
            "font-size: 12px;")
        outer.addWidget(self.view, 1)

        diag = card()
        dv = QVBoxLayout(diag)
        dv.setSpacing(6)
        dv.addWidget(section_title("DIAGNOSIS (latest visible content)"))
        self.diag = dim_label("")
        self.diag.setWordWrap(True)
        btn = QPushButton("Diagnose now")
        btn.setObjectName("GhostButton")
        btn.clicked.connect(self._diagnose)
        dv.addWidget(btn, 0, Qt.AlignLeft)
        dv.addWidget(self.diag)
        outer.addWidget(diag)

    def on_shown(self) -> None:
        self._populate()

    def append_line(self, line: str) -> None:
        self._buf.append(line)
        if len(self._buf) > 2000:
            self._buf = self._buf[-1000:]
        if self.view.toPlainText() and self.log_sel.currentData() == "__live__":
            self.view.appendPlainText(line)
            if self.view.document().blockCount() > 3000:
                self.view.setPlainText(self.view.toPlainText()[-40000:])

    def _populate(self) -> None:
        cur = self.log_sel.currentData()
        self.log_sel.blockSignals(True)
        self.log_sel.clear()
        self.log_sel.addItem("— live launcher output —", "__live__")
        logs = self.svc.layout.client_logs
        if logs.exists():
            files = sorted(logs.glob("launcher-*.log"), reverse=True)[:20]
            for f in files:
                self.log_sel.addItem(f.name, str(f))
        # crash reports
        crashes = self.svc.layout.game_dir / "crash-reports"
        if crashes.exists():
            for f in sorted(crashes.glob("crash-*.txt"),
                            key=lambda x: x.stat().st_mtime, reverse=True)[:10]:
                self.log_sel.addItem(f"crash: {f.name}", str(f))
        self.log_sel.blockSignals(False)
        if cur:
            i = self.log_sel.findData(cur)
            self.log_sel.setCurrentIndex(max(0, i))
        else:
            self._load_selected()

    def _load_selected(self) -> None:
        d = self.log_sel.currentData()
        if d is None:
            return
        if d == "__live__":
            self.view.setPlainText("\n".join(self._buf[-800:]))
            return
        from pathlib import Path
        p = Path(d)
        if p.exists():
            self.view.setPlainText(tail_log(p))
        self._diagnose()

    def _diagnose(self) -> None:
        text = self.view.toPlainText()[-20000:]
        d = diagnose(text)
        self.diag.setText(f"{d.summary}\n→ {d.suggestion}\n\n{d.detail[:300]}")
