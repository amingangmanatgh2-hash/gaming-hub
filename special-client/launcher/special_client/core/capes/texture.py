"""Programmatic generation of the SPECIAL LEGEND CAPE texture.

Format: 64×32 PNG — the exact layout the vanilla client uses for capes
(same UVs ``LayerCape`` consumes), so the texture renders correctly on the
standard cape model when our in-client renders it:

    head        (0,0)  8×8
    body/back   (16,16) 8×12   <- main artwork area
    left arm    (32,16) 4×12
    right arm   (48,16) 4×12

Design: black→purple base, glowing cyan geometric lattice, a SPECIAL
hexagon emblem on the chest, animated-looking energy streaks (static in a
PNG; the in-client can add shimmer between frames by cycling palettes).
"""
from __future__ import annotations

import random
from dataclasses import dataclass

from PIL import Image, ImageFilter

CAPE_W, CAPE_H = 64, 32


@dataclass(frozen=True)
class Palette:
    id: str
    name: str
    base_top: tuple          # rgb
    base_bottom: tuple
    pattern: tuple           # glowing accent
    pattern_bright: tuple
    emblem: tuple
    energy: tuple


PALETTES = {
    "legend": Palette(
        id="legend", name="SPECIAL LEGEND",
        base_top=(10, 8, 20), base_bottom=(48, 18, 84),
        pattern=(0, 220, 235), pattern_bright=(190, 255, 255),
        emblem=(0, 240, 255), energy=(120, 250, 255),
    ),
    "ember": Palette(
        id="ember", name="Ember Legend",
        base_top=(16, 6, 8), base_bottom=(84, 22, 18),
        pattern=(255, 120, 40), pattern_bright=(255, 210, 150),
        emblem=(255, 160, 60), energy=(255, 190, 90),
    ),
    "frost": Palette(
        id="frost", name="Frost Legend",
        base_top=(8, 10, 18), base_bottom=(30, 48, 90),
        pattern=(150, 210, 255), pattern_bright=(235, 250, 255),
        emblem=(200, 235, 255), energy=(190, 230, 255),
    ),
}

# Original palette variants, not copied third-party artwork.
for _id, _name, _accent in [
    ("aurora", "Aurora", (60,255,170)), ("solar", "Solar", (255,210,50)),
    ("rose", "Rose Quartz", (255,90,175)), ("ocean", "Deep Ocean", (40,150,255)),
    ("toxic", "Toxic Lime", (180,255,30)), ("royal", "Royal Violet", (175,90,255)),
    ("crimson", "Crimson", (255,45,65)), ("pearl", "Pearl", (230,240,255)),
    ("copper", "Copper", (230,145,90)),
]:
    PALETTES[_id] = Palette(_id, _name, (7,10,18), tuple(c//4 for c in _accent),
                            _accent, tuple(min(255,c+70) for c in _accent), _accent, _accent)


def generate_cape(palette_id: str = "legend", seed: int = 7) -> Image.Image:
    """Render the 64×32 cape texture for *palette_id*."""
    p = PALETTES[palette_id]
    rnd = random.Random(seed)
    img = Image.new("RGBA", (CAPE_W, CAPE_H), (0, 0, 0, 0))
    px = img.load()

    # ---- base gradient across every cape region -------------------------
    regions = [(0, 0, 8, 8), (16, 16, 24, 28), (32, 16, 36, 28),
               (48, 16, 52, 28)]
    for x0, y0, x1, y1 in regions:
        h = y1 - y0
        for y in range(y0, y1):
            t = (y - y0) / max(1, h - 1)
            r = int(p.base_top[0] + (p.base_bottom[0] - p.base_top[0]) * t)
            g = int(p.base_top[1] + (p.base_bottom[1] - p.base_top[1]) * t)
            b = int(p.base_top[2] + (p.base_bottom[2] - p.base_top[2]) * t)
            for x in range(x0, x1):
                # subtle dither so the base is not a flat fill
                n = rnd.randint(-6, 6)
                px[x, y] = (max(0, min(255, r + n)),
                            max(0, min(255, g + n)),
                            max(0, min(255, b + n)), 255)

    # ---- dark 1px outline around each region -----------------------------
    for x0, y0, x1, y1 in regions:
        for x in range(x0, x1):
            for y in (y0, y1 - 1):
                px[x, y] = (5, 4, 10, 255)
        for y in range(y0, y1):
            for x in (x0, x1 - 1):
                px[x, y] = (5, 4, 10, 255)

    # ---- glowing geometric lattice on the body (16,16)-(24,28) -----------
    body_x0, body_y0, body_x1, body_y1 = 16, 16, 24, 28
    cy = (body_y0 + body_y1) // 2
    for y in range(body_y0 + 1, body_y1 - 1):
        for x in range(body_x0 + 1, body_x1 - 1):
            # diamond lattice: |dx|+|dy| from the body centre
            dx = abs(x - (body_x0 + body_x1) / 2)
            dy = abs(y - cy)
            if abs(dx + dy - 4.5) < 0.75:          # diagonal band
                px[x, y] = (*p.pattern, 255)
            elif abs(dx - dy - 2.5) < 0.75:        # secondary diagonals
                px[x, y] = (*_dim(p.pattern, 0.45), 255)
            if abs(x - (body_x0 + body_x1) / 2) < 0.75 and y != cy:
                px[x, y] = (*_dim(p.pattern, 0.45), 255)
    # horizontal energy bands (top & bottom of the body)
    for y in (body_y0 + 2, body_y1 - 3):
        for x in range(body_x0 + 2, body_x1 - 2):
            px[x, y] = (*p.pattern, 255)
        px[body_x0 + 2, y] = (*p.pattern_bright, 255)
        px[body_x1 - 3, y] = (*p.pattern_bright, 255)

    # ---- head: subtle matching trim --------------------------------------
    for x in range(1, 7):
        px[x, 1] = (*_dim(p.pattern, 0.5), 255)
        px[x, 6] = (*_dim(p.pattern, 0.5), 255)

    # ---- arms: energy chevrons -------------------------------------------
    for (ax0, ax1) in ((32, 36), (48, 52)):
        for i in range(3):
            y = 18 + i * 3
            for x in range(ax0 + 1, ax1 - 1):
                t = (x - ax0) / (ax1 - ax0)
                if abs(t - 0.5) < 0.18:
                    px[x, y] = (*p.pattern, 255)
                elif abs(t - 0.5) < 0.30:
                    px[x, y] = (*_dim(p.pattern, 0.4), 255)

    # ---- SPECIAL hexagon emblem on the chest ------------------------------
    _draw_emblem(px, (body_x0 + body_x1) // 2 - 1, cy - 1, p.emblem,
                 p.pattern_bright)

    # ---- energy sparkles (seeded) ------------------------------------------
    for _ in range(14):
        x = rnd.randint(body_x0 + 1, body_x1 - 2)
        y = rnd.randint(body_y0 + 1, body_y1 - 2)
        if px[x, y][:3] == _dim(p.pattern, 0.45) or px[x, y][:3] == p.pattern:
            px[x, y] = (*p.energy, 255)

    # ---- glow pass: bloom the accent pixels -------------------------------
    glow = Image.new("RGBA", (CAPE_W, CAPE_H), (0, 0, 0, 0))
    gpx = glow.load()
    for y in range(CAPE_H):
        for x in range(CAPE_W):
            r, g, b, a = px[x, y]
            if a and (g > 150 and b > 150 and r < 120 or
                      g > 120 and r > 150 and b < 120):
                gpx[x, y] = (r, g, b, 90)
    glow = glow.filter(ImageFilter.GaussianBlur(0.8))
    img = Image.alpha_composite(img, glow)
    # re-apply crisp pixels on top of the bloom
    img.paste(img, (0, 0))
    return img


def _dim(rgb, f):
    return tuple(int(c * f) for c in rgb)


# 5×5 "S" glyph in a hexagon (1 = on). Centred by caller.
_EMBLEM = [
    "01110",
    "11110",
    "10111",
    "01111",
    "11110",
]
_HEXAGON = [
    "011110",
    "111111",
    "111111",
    "111111",
    "111111",
    "011110",
]


def _draw_emblem(px, cx: int, cy: int, color, bright):
    """Draw hexagon outline + S glyph centred at (cx, cy) on the 8-wide body.

    The body is only 8 px wide, so the emblem is a compact 6×6 hex with a
    4×4 S inside.
    """
    ox, oy = cx - 2, cy - 2
    for j, row in enumerate(_HEXAGON):
        for i, ch in enumerate(row):
            x, y = ox + i, oy + j
            if 0 <= x < CAPE_W and 0 <= y < CAPE_H and ch == "1":
                px[x, y] = (*color, 255)
    for j, row in enumerate(_EMBLEM):
        for i, ch in enumerate(row):
            if ch == "1":
                x, y = ox + i, oy + j
                if 0 <= x < CAPE_W and 0 <= y < CAPE_H:
                    px[x, y] = (*bright, 255)


def save_cape(img: Image.Image, path) -> None:
    from pathlib import Path
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    if img.size != (CAPE_W, CAPE_H):
        raise ValueError(f"cape must be {CAPE_W}x{CAPE_H}, got {img.size}")


def import_cape_artwork(src) -> Image.Image:
    """Accept user-supplied cape art; force it into the 64×32 cape format."""
    from pathlib import Path
    img = Image.open(Path(src)).convert("RGBA")
    if img.size != (CAPE_W, CAPE_H):
        img = img.resize((CAPE_W, CAPE_H), Image.NEAREST)
    return img


def showcase(palette_id: str = "legend", scale: int = 16,
             seed: int = 7) -> Image.Image:
    """Large nearest-neighbour upscale of the cape for preview/showcase."""
    return generate_cape(palette_id, seed).resize(
        (CAPE_W * scale, CAPE_H * scale), Image.NEAREST)
