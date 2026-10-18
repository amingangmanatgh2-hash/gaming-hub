"""Shared UI widgets: cards, neon progress, labeled sliders, stat tiles."""
from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QFrame, QHBoxLayout, QLabel, QProgressBar,
                               QSlider, QVBoxLayout, QWidget)



def card() -> QFrame:
    f = QFrame()
    f.setObjectName("Card")
    return f


def accent_card() -> QFrame:
    f = QFrame()
    f.setObjectName("AccentCard")
    return f


def section_title(text: str) -> QLabel:
    l = QLabel(text)
    l.setObjectName("SectionTitle")
    return l


def dim_label(text: str = "") -> QLabel:
    l = QLabel(text)
    l.setObjectName("DimText")
    return l


def hrule() -> QFrame:
    f = QFrame()
    f.setFixedHeight(1)
    f.setStyleSheet("background: transparent; border-top: 1px solid #232a3d;")
    return f


class NeonProgress(QProgressBar):
    """Progress bar with speed + ETA suffix line."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setRange(0, 1000)
        self.setValue(0)
        self.setFixedHeight(20)
        self._detail = ""

    def set_detail(self, detail: str, speed_bps: float = 0.0,
                   eta_s: float | None = None) -> None:
        self._detail = detail
        suffix = detail
        if speed_bps > 1:
            suffix += f"   ·   {speed_bps / 1024:.0f} KB/s"
        if eta_s and eta_s > 0:
            suffix += f"   ·   {eta_s:.0f}s left"
        self.setFormat(suffix[:90] if suffix else "…")

    def set_fraction(self, frac: float) -> None:
        self.setValue(int(max(0.0, min(1.0, frac)) * 1000))


class LabeledSlider(QWidget):
    """Slider with a live value label and optional unit."""

    valueChanged = Signal(int)

    def __init__(self, minimum: int, maximum: int, step: int = 1,
                 unit: str = "", parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(minimum, maximum)
        self.slider.setSingleStep(step)
        self.slider.setPageStep(step * 4)
        self.slider.valueChanged.connect(self._changed)
        self.label = QLabel("")
        self._unit = unit
        self._step = step
        lay.addWidget(self.slider, 1)
        lay.addWidget(self.label, 0, Qt.AlignVCenter)
        self._update_label(self.slider.value())

    def _changed(self, v: int) -> None:
        self._update_label(v)
        self.valueChanged.emit(v)

    def _update_label(self, v: int) -> None:
        if self._unit == "MB":
            self.label.setText(f"{v / 1024:.1f} GB" if v >= 1024 else f"{v} MB")
        else:
            self.label.setText(f"{v}{self._unit}")

    def value(self) -> int:
        return self.slider.value()

    def setValue(self, v: int) -> None:  # noqa: N802 (Qt naming)
        self.slider.setValue(v)

    def setRange(self, lo: int, hi: int) -> None:  # noqa: N802
        self.slider.setRange(lo, hi)


class StatTile(QFrame):
    """Big number + caption tile for the performance dashboard."""

    def __init__(self, caption: str, initial: str = "—", parent=None):
        super().__init__(parent)
        self.setObjectName("Card")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(14, 10, 14, 10)
        lay.setSpacing(2)
        self.big = QLabel(initial)
        self.big.setObjectName("BigNumber")
        self.cap = QLabel(caption)
        self.cap.setObjectName("DimText")
        lay.addWidget(self.big)
        lay.addWidget(self.cap)

    def set_value(self, text: str) -> None:
        self.big.setText(text)


class SparkGraph(QWidget):
    """Minimal scrolling line graph (FPS / frame time) drawn with QPainter."""

    def __init__(self, title: str, max_value: float, color: QColor,
                 parent=None):
        super().__init__(parent)
        self.title = title
        self.max_value = max_value
        self.color = color
        self.values: list[float] = []
        self.max_len = 240
        self.setMinimumHeight(120)

    def push(self, v: float) -> None:
        self.values.append(max(0.0, min(float(v), self.max_value)))
        if len(self.values) > self.max_len:
            self.values.pop(0)
        self.update()

    def clear(self) -> None:
        self.values = []
        self.update()

    def paintEvent(self, _ev) -> None:  # noqa: N802
        from PySide6.QtGui import QPainter, QPen
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        w, h = self.width(), self.height()
        p.fillRect(0, 0, w, h, QColor("#12151f"))
        p.setPen(QPen(QColor("#232a3d"), 1))
        # grid
        for i in range(1, 4):
            y = int(h * i / 4)
            p.drawLine(0, y, w, y)
        p.drawText(8, 14, f"{self.title}   max {self.max_value:g}")
        if len(self.values) >= 2:
            pen = QPen(self.color, 1.8)
            p.setPen(pen)
            n = len(self.values)
            for i in range(1, n):
                x0 = w - (n - i) * (w / self.max_len)
                x1 = w - (n - i - 1) * (w / self.max_len)
                y0 = h - 4 - (self.values[i - 1] / self.max_value) * (h - 24)
                y1 = h - 4 - (self.values[i] / self.max_value) * (h - 24)
                p.drawLine(int(x0), int(y0), int(x1), int(y1))
        p.end()
