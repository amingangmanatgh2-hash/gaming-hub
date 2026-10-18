#!/usr/bin/env python3
"""Generate SPECIAL CLIENT's image assets (logo, icons, cape artwork).

Everything is drawn programmatically so the build is fully reproducible —
no external artwork files are required. Output goes to
``special_client/assets/`` (bundled with the package) and a few showcase
PNGs to ``docs/assets/``.

Usage:  python tools/make_assets.py
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "launcher"
PKG_ASSETS = LAUNCHER / "special_client" / "assets"
DOCS_ASSETS = ROOT / "docs" / "assets"

# palette -----------------------------------------------------------------
BG_DARK = (8, 10, 22)
BG_MID = (14, 17, 38)
CYAN = (0, 240, 255)
VIOLET = (124, 77, 255)
MAGENTA = (255, 64, 200)
WHITE = (235, 245, 255)


def _hexagon(cx, cy, r, rot=0.0):
    pts = []
    for i in range(6):
        a = math.radians(60 * i - 30 + rot)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def _glow(base: Image.Image, mask: Image.Image, radius=28, strength=200):
    """Additive neon glow: blurred mask tinted, composited under the art."""
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    blurred = mask.filter(ImageFilter.GaussianBlur(radius))
    # tint the blurred mask with the accent color
    tint = Image.new("RGBA", base.size, (*CYAN, strength))
    tint.putalpha(blurred)
    glow = Image.alpha_composite(base, tint)
    return glow


def draw_logo(size=1024) -> Image.Image:
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # rounded dark tile
    tile = int(s * 0.96)
    r = int(s * 0.20)
    draw.rounded_rectangle([s // 2 - tile // 2, s // 2 - tile // 2,
                            s // 2 + tile // 2, s // 2 + tile // 2],
                           radius=r, fill=(*BG_DARK, 255))
    # subtle radial-ish inner shading via concentric rounded rects
    for i in range(6):
        k = 1 - i * 0.13
        t2 = int(tile * k)
        a = int(20 + i * 8)
        draw.rounded_rectangle(
            [s // 2 - t2 // 2, s // 2 - t2 // 2,
             s // 2 + t2 // 2, s // 2 + t2 // 2],
            radius=int(r * k), outline=(*BG_MID, a), width=max(1, s // 256))

    # neon hexagon ring
    ring = _hexagon(s // 2, s // 2, int(s * 0.34))
    glow_mask = Image.new("L", (s, s), 0)
    gd = ImageDraw.Draw(glow_mask)
    gd.polygon(ring, outline="white")
    # thicken the ring for the glow
    for i in range(5):
        gd.polygon(_hexagon(s // 2, s // 2, int(s * (0.34 - i * 0.012))),
                   outline="white")
    img = _glow(img, glow_mask, radius=int(s * 0.035), strength=170)
    draw = ImageDraw.Draw(img)
    w = max(2, int(s * 0.016))
    draw.polygon(ring, outline=None)
    # stroke as segments for a crisp neon line
    pts = ring + [ring[0]]
    for i in range(len(pts) - 1):
        draw.line([pts[i], pts[i + 1]], fill=(*CYAN, 255), width=w)
    for p in ring:
        draw.ellipse([p[0] - w, p[1] - w, p[0] + w, p[1] + w],
                     fill=(*CYAN, 255))

    # the "S" bolt: two cubic béziers sampled into a smooth thick tube.
    # unit space (0..1), y down; the S spans most of the hexagon.
    cx, cy = s // 2, s // 2
    def cubic(p0, p1, p2, p3, n=160):
        pts = []
        for i in range(n + 1):
            t = i / n
            u = 1 - t
            x = (u ** 3) * p0[0] + 3 * (u ** 2) * t * p1[0] \
                + 3 * u * (t ** 2) * p2[0] + (t ** 3) * p3[0]
            y = (u ** 3) * p0[1] + 3 * (u ** 2) * t * p1[1] \
                + 3 * u * (t ** 2) * p2[1] + (t ** 3) * p3[1]
            pts.append((x, y))
        return pts

    box = (cx - int(s * 0.19), cy - int(s * 0.235),
           cx + int(s * 0.19), cy + int(s * 0.235))

    def to_px(pts):
        out = []
        for x, y in pts:
            out.append((box[0] + x * (box[2] - box[0]),
                        box[1] + y * (box[3] - box[1])))
        return out

    # classic S: top hook opens left, bottom hook opens right
    top_pts = to_px(cubic((0.80, 0.16), (0.30, -0.02), (0.04, 0.42),
                          (0.50, 0.50)))
    bot_pts = to_px(cubic((0.50, 0.50), (0.96, 0.58), (0.70, 1.02),
                          (0.20, 0.84)))
    thickness = int(s * 0.055)
    r = thickness // 2
    # glow mask for the S
    smask = Image.new("L", (s, s), 0)
    sd = ImageDraw.Draw(smask)
    for p in top_pts + bot_pts:
        sd.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill="white")
    img = _glow(img, smask, radius=int(s * 0.030), strength=150)
    draw = ImageDraw.Draw(img)
    for p in top_pts:
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r],
                     fill=(*CYAN, 255))
    for p in bot_pts:
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r],
                     fill=(*VIOLET, 255))
    # hot core along the middle of the S
    core = to_px(cubic((0.55, 0.47), (0.72, 0.50), (0.66, 0.60),
                       (0.45, 0.63), n=60))
    for p in core:
        draw.ellipse([p[0] - r // 2, p[1] - r // 2,
                      p[0] + r // 2, p[1] + r // 2],
                     fill=(*WHITE, 140))

    # energy sparks on the ring
    for ang in (20, 90, 160, 200, 270, 340):
        a = math.radians(ang)
        px = s // 2 + int(s * 0.34) * math.cos(a)
        py = s // 2 + int(s * 0.34) * math.sin(a)
        rr = int(s * 0.012)
        draw.ellipse([px - rr, py - rr, px + rr, py + rr],
                     fill=(*WHITE, 230))

    return img


def make_cape_showcase(texture_path: Path, out_path: Path, u=12,
                       bg=(10, 12, 26)) -> None:
    """Lay out the 64x32 cape UV regions as a proper cape character view
    (head above body, arms at the sides) with a neon glow card."""
    cape = Image.open(texture_path).convert("RGBA")
    head = cape.crop((0, 0, 8, 8))
    body = cape.crop((16, 16, 24, 28))
    arm_l = cape.crop((32, 16, 36, 28))
    arm_r = cape.crop((48, 16, 52, 28))

    # grid in 1/8-cape units: total 20 wide x 21 tall
    W, H = 20 * u, 21 * u
    fig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fig.alpha_composite(head.resize((8 * u, 8 * u), Image.NEAREST),
                        (6 * u, 0))
    fig.alpha_composite(body.resize((8 * u, 12 * u), Image.NEAREST),
                        (6 * u, 9 * u))
    fig.alpha_composite(arm_l.resize((4 * u, 12 * u), Image.NEAREST),
                        (1 * u, 9 * u))
    fig.alpha_composite(arm_r.resize((4 * u, 12 * u), Image.NEAREST),
                        (15 * u, 9 * u))

    pad = int(W * 0.30)
    card = Image.new("RGBA", (W + pad * 2, H + pad * 2), (*bg, 255))
    pos = (pad, pad)
    blurred = fig.getchannel("A").filter(ImageFilter.GaussianBlur(22))
    glow_layer = Image.new("RGBA", card.size, (0, 0, 0, 0))
    glow_layer.paste((*CYAN, 120), pos, blurred)
    card = Image.alpha_composite(card, glow_layer)
    card.alpha_composite(fig, pos)
    card.convert("RGB").save(out_path)


def main() -> int:
    PKG_ASSETS.mkdir(parents=True, exist_ok=True)
    DOCS_ASSETS.mkdir(parents=True, exist_ok=True)

    logo = draw_logo(1024)
    logo.save(PKG_ASSETS / "logo-1024.png")
    logo.save(DOCS_ASSETS / "logo-1024.png")
    sizes = (256, 128, 64, 48, 32, 16)
    for px in sizes:
        logo.resize((px, px), Image.LANCZOS).save(PKG_ASSETS / f"icon-{px}.png")
    # multi-size .ico for the Windows exe + installer
    ico = logo.resize((256, 256), Image.LANCZOS)
    ico.save(PKG_ASSETS / "icon.ico",
             sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
                    (64, 64), (128, 128), (256, 256)])
    print(f"logo + {len(sizes)} icons + icon.ico -> {PKG_ASSETS}")

    # capes (generated by the same code path the app uses at runtime)
    sys.path.insert(0, str(LAUNCHER))
    from special_client.core.capes import texture  # noqa: E402
    for pid in texture.PALETTES:
        img = texture.generate_cape(pid)
        img.save(PKG_ASSETS / f"cape-{pid}.png")
        img.save(DOCS_ASSETS / f"cape-{pid}.png")
        make_cape_showcase(PKG_ASSETS / f"cape-{pid}.png",
                           DOCS_ASSETS / f"cape-{pid}-showcase.png")
    print(f"cape palettes {list(texture.PALETTES)} -> assets + docs/assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
