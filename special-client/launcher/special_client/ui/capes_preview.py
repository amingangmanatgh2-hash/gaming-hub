"""Software-3D cape preview (numpy).

Renders the 64×32 cape texture on a gently curved plane behind a stylised
blocky torso, with perspective projection, per-quad Lambert lighting, a
slow yaw rotation and a subtle energy sway. Runs comfortably on low-end
CPUs at half resolution.
"""
from __future__ import annotations

import numpy as np
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor, QImage, QPainter
from PySide6.QtWidgets import QWidget


class CapePreview(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(300, 420)
        self._texture: np.ndarray | None = None     # RGBA uint8, HxWx4
        self._angle = 0.0
        self._time = 0.0
        self._zoom = 1.0
        self._canvas: np.ndarray | None = None
        self._auto = True
        self._timer = QTimer(self, interval=160)     # ~15 fps is plenty
        self._timer.timeout.connect(self._tick)
        self._timer.start()
        self._render()

    # ------------------------------------------------------------------ #
    def set_texture(self, img_pil) -> None:
        """Accept a PIL image (64×32) as the cape texture."""
        a = np.asarray(img_pil.convert("RGBA"), dtype=np.uint8)
        self._texture = a
        self._render()

    def set_auto_rotate(self, v: bool) -> None:
        self._auto = v

    def wheelEvent(self, ev) -> None:  # noqa: N802
        delta = ev.angleDelta().y()
        self._zoom = max(0.5, min(2.5, self._zoom + delta / 1200.0))
        self._render()

    # ------------------------------------------------------------------ #
    def _tick(self) -> None:
        if not self.isVisible() or not self._auto:
            return
        if self._auto:
            self._angle += 0.05
            self._time += 0.06
        self._render()

    # ------------------------------------------------------------------ #
    def _mesh(self) -> tuple:
        """Cape plane: grid of quads bent around a vertical cylinder.

        UVs map the *body* region of the 64×32 cape (16,16)-(24,28) across
        the whole plane, so the emblem and lattice are what you see.
        """
        nx, ny = 12, 18
        w, h = 10.0, 15.0            # world size
        r = 7.5                      # curvature radius (bigger = flatter)
        xs = np.linspace(-w / 2, w / 2, nx + 1)
        ys = np.linspace(-h / 2, h / 2, ny + 1)
        uvs = (np.linspace(0, 1, nx + 1), np.linspace(0, 1, ny + 1))
        quads = []
        for j in range(ny):
            for i in range(nx):
                corners = []
                for (x, y) in ((xs[i], ys[j]), (xs[i + 1], ys[j]),
                               (xs[i + 1], ys[j + 1]), (xs[i], ys[j + 1])):
                    a = x / r                        # bend angle on cylinder
                    sway = 0.35 * np.sin(0.9 * (y + 3.0) + self._time * 2.2)
                    if y < 0:
                        sway *= -y / (h / 2)         # top pinned, bottom sways
                    corners.append((r * np.sin(a), y + h / 2,
                                    r * np.cos(a) - r + sway))
                uv = (uvs[0][i], uvs[1][j], uvs[0][i + 1], uvs[1][j + 1])
                quads.append((corners, uv))
        return quads

    # ------------------------------------------------------------------ #
    def _render(self) -> None:
        tex = self._texture
        if tex is None:
            tex = np.zeros((32, 64, 4), np.uint8)
        W, H = self.width() // 2, self.height() // 2
        if W < 10 or H < 10:
            return
        canvas = np.zeros((H, W, 4), np.uint8)

        # camera
        fov = 460.0 * self._zoom
        cy = H / 2
        cx = W / 2
        cam_z = -34.0
        rot = np.deg2rad(self._angle)
        cos_r, sin_r = np.cos(rot), np.sin(rot)

        quads = self._mesh()
        projected = []
        for corners, uv in quads:
            pts = np.array(corners, dtype=float)
            # yaw rotation
            xr = pts[:, 0] * cos_r - pts[:, 2] * sin_r
            zr = pts[:, 0] * sin_r + pts[:, 2] * cos_r
            pts = np.stack([xr, pts[:, 1], zr], axis=1)
            pts[:, 1] -= 7.5                        # centre vertically
            z = pts[:, 2] - cam_z
            if np.any(z <= 1.0):
                continue
            sx = cx + pts[:, 0] * fov / z
            sy = cy - pts[:, 1] * fov / z
            # normal for lighting (approx from first two edges)
            e1 = pts[1] - pts[0]
            e2 = pts[3] - pts[0]
            n = np.cross(e1, e2)
            nl = np.linalg.norm(n)
            if nl > 1e-6:
                n = n / nl
                light = np.array([0.35, 0.45, -0.82])
                light = light / np.linalg.norm(light)
                shade = max(0.25, float(np.dot(n, light)))
            else:
                shade = 0.5
            projected.append((sx, sy, float(np.mean(pts[:, 2])), shade, uv))

        # painter's algorithm: far → near
        projected.sort(key=lambda q: -q[2])

        # body region of the cape texture: (16,16)-(24,28)
        body = tex[16:28, 16:24]

        for (sx, sy, z, shade, uv) in projected:
            x0, y0, x1, y1 = uv
            # texture sub-rect (body region)
            tx0 = int(x0 * body.shape[1])
            tx1 = int(x1 * body.shape[1])
            ty0 = int(y0 * body.shape[0])
            ty1 = int(y1 * body.shape[0])
            if tx1 <= tx0 or ty1 <= ty0:
                continue
            sub = body[ty0:ty1, tx0:tx1]
            if sub.size == 0:
                continue
            # screen bbox
            px0 = max(0, int(sx.min()) - 1)
            px1 = min(W, int(sx.max()) + 2)
            py0 = max(0, int(sy.min()) - 1)
            py1 = min(H, int(sy.max()) + 2)
            if px1 <= px0 or py1 <= py0:
                continue
            # per-pixel barycentric test on the (near-)convex quad via edge fn
            p = np.stack(np.meshgrid(
                np.arange(px0, px1), np.arange(py0, py1)), axis=-1).reshape(-1, 2).astype(float)
            corners = np.stack([sx, sy], axis=1)
            inside = self._inside_quad(p, corners)
            if not inside.any():
                continue
            # texture coords per pixel (affine per quad)
            qx = (p[:, 0] - sx.min()) / max(1e-6, sx.max() - sx.min())
            qy = (p[:, 1] - sy.min()) / max(1e-6, sy.max() - sy.min())
            tt = (qy * (ty1 - ty0) + ty0).astype(int)
            ts = (qx * (tx1 - tx0) + tx0).astype(int)
            tt = np.clip(tt, 0, body.shape[0] - 1)
            ts = np.clip(ts, 0, body.shape[1] - 1)
            cols = body[tt, ts].copy()
            cols[:, :3] = (cols[:, :3] * shade).astype(np.uint8)
            cols = cols[inside].astype(float)
            yy, xx = p[inside, 1].astype(int), p[inside, 0].astype(int)
            base = canvas[yy, xx].astype(float)
            src_a, dst_a = cols[:, 3:4] / 255.0, base[:, 3:4] / 255.0
            out_a = src_a + dst_a * (1 - src_a)
            rgb = (cols[:, :3] * src_a + base[:, :3] * dst_a * (1 - src_a))
            rgb /= np.maximum(out_a, 1e-9)
            canvas[yy, xx, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
            canvas[yy, xx, 3] = (out_a[:, 0] * 255).astype(np.uint8)

        # simple background: vertical gradient
        grad = np.linspace(0.0, 1.0, H)[:, None]
        top = np.array([18, 21, 31])
        bot = np.array([10, 12, 18])
        bg = (top * (1 - grad) + bot * grad).astype(np.uint8)
        bg = np.repeat(bg[:, None, :], W, axis=1)
        bg4 = np.dstack([bg, np.full((H, W), 255, np.uint8)])
        alpha = canvas[:, :, 3:4].astype(float) / 255.0
        final = (canvas[:, :, :3].astype(float) * alpha
                 + bg4[:, :, :3].astype(float) * (1 - alpha)).astype(np.uint8)
        final = np.dstack([final, np.full((H, W), 255, np.uint8)])

        qimg = QImage(final.data, W, H, W * 4, QImage.Format_RGBA8888)
        self._canvas = final.copy()
        self._paint_qimage(qimg)

    @staticmethod
    def _inside_quad(p: np.ndarray, corners: np.ndarray) -> np.ndarray:
        """Point-in-quad via the four edge functions. Our mesh quads are
        near-planar and stay convex on screen, so this is exact enough."""
        def ef(c1, c2, pts):
            return ((pts[:, 0] - c1[0]) * (c2[1] - c1[1])
                    - (pts[:, 1] - c1[1]) * (c2[0] - c1[0]))
        f1 = ef(corners[0], corners[1], p)
        f2 = ef(corners[1], corners[2], p)
        f3 = ef(corners[2], corners[3], p)
        f4 = ef(corners[3], corners[0], p)
        return ((f1 >= 0) & (f2 >= 0) & (f3 >= 0) & (f4 >= 0)) | \
               ((f1 <= 0) & (f2 <= 0) & (f3 <= 0) & (f4 <= 0))

    def _paint_qimage(self, qimg: QImage) -> None:
        self.update()
        self._last = qimg.scaled(self.size(), Qt.IgnoreAspectRatio, Qt.SmoothTransformation)

    def paintEvent(self, ev) -> None:  # noqa: N802
        p = QPainter(self)
        if getattr(self, "_last", None) is not None:
            p.drawImage(0, 0, self._last)
        else:
            p.fillRect(self.rect(), QColor("#0b0d14"))
        p.end()
