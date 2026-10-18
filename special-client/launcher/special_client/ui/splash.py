"""Animated splash screen: logo, cycling tagline, live boot progress."""
from __future__ import annotations

from PySide6.QtCore import QPointF, QRectF, QTimer, Qt
from PySide6.QtGui import (QBrush, QColor, QFont, QLinearGradient, QPainter,
                           QPen, QRadialGradient)
from PySide6.QtWidgets import QWidget

TAGLINES = [
    "Forged for performance.",
    "Dark by design. Neon by intent.",
    "Your client. Your rules. No compromises.",
    "Capes worth wearing.",
    "Offline-ready. Update-safe.",
]


class SplashScreen(QWidget):
    def __init__(self, theme, parent=None):
        super().__init__(parent)
        self.t = theme
        self.setWindowTitle("SPECIAL CLIENT")
        self.setFixedSize(680, 400)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.SplashScreen)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self._angle = 0.0
        self._tagline_i = 0
        self._progress = 0.0
        self._message = "Starting…"
        self._tagline_timer = QTimer(self, timeout=lambda: self._next_tagline())
        self._tagline_timer.start(1400)
        self._anim = QTimer(self, interval=33)
        self._anim.timeout.connect(self._tick)
        self._anim.start()

    # -- api ---------------------------------------------------------------
    def set_progress(self, frac: float, message: str) -> None:
        self._progress = max(self._progress, min(1.0, frac))
        self._message = message
        self.update()

    def _next_tagline(self) -> None:
        self._tagline_i = (self._tagline_i + 1) % len(TAGLINES)
        self.update()

    def _tick(self) -> None:
        self._angle = (self._angle + 4) % 360
        self.update()

    # -- paint ---------------------------------------------------------------
    def paintEvent(self, _ev) -> None:  # noqa: N802
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        w, h = self.width(), self.height()

        # background
        bg = QLinearGradient(0, 0, w, h)
        bg.setColorAt(0.0, QColor(self.t.bg))
        bg.setColorAt(1.0, QColor(self.t.bg_elevated))
        p.fillRect(self.rect(), QBrush(bg))

        # ambient glow
        glow = QRadialGradient(w / 2, h * 0.42, w * 0.55)
        gc = QColor(self.t.accent)
        gc.setAlpha(26)
        glow.setColorAt(0.0, gc)
        glow.setColorAt(1.0, QColor(0, 0, 0, 0))
        p.fillRect(self.rect(), QBrush(glow))

        # hexagon logo with rotating energy ring
        cx, cy = w / 2, h * 0.42
        r = 56
        p.save()
        p.translate(cx, cy)
        p.rotate(self._angle)
        p.setPen(QPen(QColor(self.t.accent), 3, Qt.DashLine))
        p.setBrush(Qt.NoBrush)
        p.drawEllipse(QPointF(0, 0), r + 14, r + 14)
        p.restore()
        import math
        p.save()
        p.translate(cx, cy)
        pts = []
        for i in range(6):
            a = self._angle * 0.4 + i * 60
            pts.append(QPointF(r * 0.82 * math.cos(math.radians(a)),
                               r * 0.82 * math.sin(math.radians(a))))
        from PySide6.QtGui import QPolygonF
        p.setPen(QPen(QColor(self.t.accent2), 2.5))
        grad = QLinearGradient(-r, -r, r, r)
        grad.setColorAt(0.0, QColor(self.t.accent_soft))
        grad.setColorAt(1.0, QColor(self.t.bg_elevated))
        p.setBrush(QBrush(grad))
        p.drawPolygon(QPolygonF(pts))
        p.setFont(QFont("Segoe UI", 30, QFont.Bold))
        p.setPen(QPen(QColor(self.t.accent)))
        p.drawText(self.rect(), Qt.AlignCenter, "S")
        p.restore()

        # title
        p.setFont(QFont("Segoe UI", 24, QFont.Black))
        p.setPen(QPen(QColor(self.t.text)))
        p.drawText(QRectF(0, h * 0.62, w, 36),
                   Qt.AlignHCenter | Qt.AlignVCenter, "SPECIAL CLIENT")
        p.setFont(QFont("Segoe UI", 10))
        f = p.font()
        f.setLetterSpacing(QFont.AbsoluteSpacing, 4)
        p.setFont(f)
        p.setPen(QPen(QColor(self.t.text_dim)))
        p.drawText(QRectF(0, h * 0.62 + 38, w, 20), Qt.AlignHCenter,
                   TAGLINES[self._tagline_i].upper())

        # progress
        bar_w = 320
        x0 = (w - bar_w) / 2
        y0 = h * 0.86
        p.setPen(Qt.NoPen)
        p.setBrush(QColor(self.t.bg_input))
        p.drawRoundedRect(QRectF(x0, y0, bar_w, 8), 4, 4)
        if self._progress > 0:
            p.setBrush(QColor(self.t.accent))
            p.drawRoundedRect(QRectF(x0, y0, bar_w * self._progress, 8), 4, 4)
        p.setFont(QFont("Segoe UI", 10))
        p.setPen(QPen(QColor(self.t.text_dim)))
        p.drawText(QRectF(0, y0 + 14, w, 18), Qt.AlignHCenter, self._message)
        p.end()
