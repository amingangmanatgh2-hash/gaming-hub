"""Pixel-by-pixel procedural PBR texture generator (numpy + Pillow).

Nothing here is downloaded or sampled from a photo: every albedo / normal /
metallic-roughness / emissive texel is computed, so the pack ships genuine
procedural-authored art that we own outright.

Output per material:
  <name>_albedo.png   sRGB base colour
  <name>_normal.png   tangent-space normals derived from the height field
  <name>_mr.png       glTF metallic-roughness (G = roughness, B = metalness)
  <name>_emissive.png optional glow mask
"""
from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

F32 = np.float32


# --------------------------------------------------------------------- utilities
def _rng(seed):
    return np.random.default_rng(seed)


def value_noise(shape, cells, seed, resample=Image.BICUBIC):
    """Smooth value noise: random lattice upsampled bicubically."""
    h, w = shape
    cy = max(2, int(cells))
    cx = max(2, int(cells * w / h)) if h else 2
    grid = _rng(seed).random((cy + 1, cx + 1)).astype(F32)
    img = Image.fromarray((grid * 255).astype(np.uint8), 'L').resize((w, h), resample)
    return np.asarray(img).astype(F32) / 255.0


def fbm(shape, base_cells=4, octaves=6, seed=0, gain=0.5, lacunarity=2.0):
    out = np.zeros(shape, F32)
    amp, total, cells = 1.0, 0.0, float(base_cells)
    for o in range(octaves):
        out += value_noise(shape, cells, seed + o * 977) * amp
        total += amp
        amp *= gain
        cells *= lacunarity
    return out / max(total, 1e-6)


def ridged(shape, base_cells=3, octaves=5, seed=1):
    n = fbm(shape, base_cells, octaves, seed)
    return 1.0 - np.abs(n * 2.0 - 1.0)


def normalize01(a):
    lo, hi = float(a.min()), float(a.max())
    if hi - lo < 1e-9:
        return np.zeros_like(a)
    return (a - lo) / (hi - lo)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / max(e1 - e0, 1e-9), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def blur(arr, radius):
    """Gaussian blur of an HxW or HxWxC float array."""
    if arr.ndim == 2:
        img = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), 'L').filter(
            ImageFilter.GaussianBlur(radius))
        return np.asarray(img).astype(F32) / 255.0
    out = np.zeros_like(arr)
    for c in range(arr.shape[2]):
        out[..., c] = blur(arr[..., c], radius)
    return out


def draw_layer(size, fn, supersample=2):
    """Draw with Pillow on a supersampled 'L' canvas -> float 0..1 mask."""
    w, h = size
    ss = supersample
    img = Image.new('L', (w * ss, h * ss), 0)
    d = ImageDraw.Draw(img)
    fn(d, w * ss, h * ss)
    img = img.resize((w, h), Image.LANCZOS)
    return np.asarray(img).astype(F32) / 255.0


def normal_from_height(height, strength=2.0, wrap=True):
    # `strength` is authored per 512 texels; scale with resolution so the
    # apparent relief is identical at 256 / 512 / 1024 / 2048.
    strength *= height.shape[0] / 512.0
    h = height.astype(F32)
    if wrap:
        dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * strength
        dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * strength
    else:
        dx = np.gradient(h, axis=1) * strength
        dy = np.gradient(h, axis=0) * strength
    nz = np.ones_like(h)
    ln = np.sqrt(dx * dx + dy * dy + nz * nz)
    nx, ny, nz = -dx / ln, dy / ln, nz / ln
    rgb = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], axis=-1)
    return np.clip(rgb, 0.0, 1.0)


def save_png(arr, path, mode='RGB'):
    a = np.clip(arr, 0.0, 1.0)
    if mode == 'RGB':
        img = Image.fromarray((a[..., :3] * 255.0 + 0.5).astype(np.uint8), 'RGB')
    else:
        img = Image.fromarray((a[..., 0] * 255.0 + 0.5).astype(np.uint8), 'L')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    return os.path.getsize(path)


def to_srgb(linear):
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(np.maximum(linear, 0), 1 / 2.4) - 0.055)


def hex_lin(h):
    h = h.lstrip('#')
    srgb = np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], F32)
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def mix(a, b, t):
    t = np.asarray(t, F32)
    if t.ndim == 2 and (np.ndim(a) == 3 or np.ndim(b) == 3 or np.shape(a) == (3,) or np.shape(b) == (3,)):
        t = t[..., None]
    return a * (1.0 - t) + b * t


# --------------------------------------------------------------------- materials
def tex_carbon(size=1024, seed=11):
    """Carbon-fibre weave with edge wear, micro scratches and dust."""
    h = w = size
    yy, xx = np.mgrid[0:h, 0:w].astype(F32)
    ss = 2                                    # supersample factor for the weave
    yy2, xx2 = np.mgrid[0:h * ss, 0:w * ss].astype(F32) / ss

    # 2x2 twill weave: two crossing thread families, 45° rotated
    period = 18.0
    u = (xx2 + yy2) / period
    v = (xx2 - yy2) / period
    fu = np.mod(u, 1.0)
    fv = np.mod(v, 1.0)
    thread_u = 1.0 - 0.5 * np.sin(np.pi * fu) ** 2
    thread_v = 1.0 - 0.5 * np.sin(np.pi * fv) ** 2
    over = (np.floor(np.mod(u, 2.0)) + np.floor(np.mod(v, 2.0))) % 2.0
    weave2 = np.where(over > 0.5, thread_u, thread_v)
    weave = np.asarray(Image.fromarray((np.clip(weave2, 0, 1) * 255).astype(np.uint8), 'L')
                       .resize((w, h), Image.LANCZOS)).astype(F32) / 255.0

    fuzz = fbm((h, w), 220, 3, seed + 3) * 0.12
    dust = smoothstep(0.55, 0.95, fbm((h, w), 6, 6, seed + 7))
    scratches = draw_layer((h, w), lambda d, W, H: _scratches(d, W, H, seed + 21, count=80),
                           supersample=2)

    rough = 0.42 + fuzz * 0.5 + dust * 0.22 - weave * 0.10
    albedo_lin = mix(hex_lin('#07090b'), hex_lin('#39424d'), np.clip(weave * 0.95 + fuzz * 0.35, 0, 1))
    albedo_lin = mix(albedo_lin, hex_lin('#55606b'), dust * 0.45)
    albedo_lin = albedo_lin * (0.85 + weave[..., None] * 0.35)
    albedo_lin = mix(albedo_lin, hex_lin('#6d7885'), scratches * 0.45)
    height = weave * 0.55 + fuzz * 0.18 + scratches * 0.10
    mr = np.stack([np.zeros_like(rough), np.clip(rough, 0.05, 1.0),
                   np.clip(0.92 - dust * 0.35 - scratches * 0.25, 0.0, 1.0)], axis=-1)
    return {
        'albedo': to_srgb(np.clip(albedo_lin, 0, 1)),
        'normal': normal_from_height(height, 3.4),
        'mr': mr,
        'emissive': None,
    }


def tex_steel(size=1024, seed=23):
    """Brushed gunmetal: directional streaks, scratches, pitting."""
    h = w = size
    yy, xx = np.mgrid[0:h, 0:w].astype(F32)
    streak = fbm((h, w), 3, 5, seed)
    streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8), 'L')
                        .filter(ImageFilter.GaussianBlur(0.6)).resize((w, h), Image.BILINEAR)
                        ).astype(F32) / 255.0
    fine = value_noise((h, w), 900, seed + 5)
    line_noise = _rng(seed + 9).random(w).astype(F32)
    horizontal = np.tile(line_noise, (h, 1)) * 0.55 + np.tile(
        (np.repeat(line_noise, 3)[:w]), (h, 1)) * 0.25
    horizontal = blur(horizontal, 0.4)
    pits = smoothstep(0.74, 0.96, blur(fbm((h, w), 18, 4, seed + 13), 0.6))
    scratches = draw_layer((h, w), lambda d, W, H: _scratches(d, W, H, seed + 31, count=90),
                           supersample=2)
    rough = 0.24 + horizontal * 0.22 + fine * 0.06 + pits * 0.30 + scratches * 0.25
    base = mix(hex_lin('#5d666f'), hex_lin('#9aa7b4'), horizontal * 0.7 + streak * 0.3)
    base = mix(base, hex_lin('#2b3138'), pits * 0.8)
    base = mix(base, hex_lin('#cfd8e2'), scratches * 0.6)
    height = streak * 0.18 + fine * 0.02 + pits * -0.35 + scratches * 0.22 + horizontal * 0.1
    mr = np.stack([np.zeros_like(rough), np.clip(rough, 0.05, 1.0),
                   np.clip(0.98 - pits * 0.55 - scratches * 0.2, 0.0, 1.0)], axis=-1)
    return {'albedo': to_srgb(np.clip(base, 0, 1)), 'normal': normal_from_height(height, 2.2),
            'mr': mr, 'emissive': None}


def tex_neon(size=1024, seed=37, circuit_color='#22d3ee', seam_color='#ff2d75'):
    """Dark armour panel with etched circuitry that glows (emissive)."""
    h = w = size
    circ = hex_lin(circuit_color)
    seamc = hex_lin(seam_color)

    def draw_circuits(d, W, H):
        rng = _rng(seed + 3)
        step = W / 22.0
        for _ in range(46):
            x = float(rng.integers(0, 22)) * step
            y = float(rng.integers(0, 22)) * step
            pts = [(x, y)]
            for _ in range(int(rng.integers(3, 8))):
                if rng.random() < 0.5:
                    x += step * rng.choice([-1, 1])
                else:
                    y += step * rng.choice([-1, 1])
                x = min(max(x, 0.0), W - 1.0)
                y = min(max(y, 0.0), H - 1.0)
                pts.append((x, y))
            d.line(pts, fill=255, width=max(2, int(W / 340)), joint='curve')
        for _ in range(24):
            cx, cy = float(rng.integers(0, W)), float(rng.integers(0, H))
            r = W / 90.0
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=max(2, int(W / 340)))

    def draw_seams(d, W, H):
        rng = _rng(seed + 11)
        for _ in range(7):
            if rng.random() < 0.5:
                x = float(rng.integers(int(W * 0.1), int(W * 0.9)))
                d.line([(x, 0), (x, H)], fill=255, width=max(2, int(W / 380)))
            else:
                y = float(rng.integers(int(H * 0.1), int(H * 0.9)))
                d.line([(0, y), (W, y)], fill=255, width=max(2, int(W / 380)))

    circuits = draw_layer((h, w), draw_circuits, supersample=2)
    seams = draw_layer((h, w), draw_seams, supersample=2)
    glow = np.clip(circuits + seams * 0.85, 0, 1)
    glow_wide = blur(glow, size / 90.0)
    grunge = fbm((h, w), 7, 6, seed + 17)
    micro = fbm((h, w), 180, 3, seed + 19)
    edge = smoothstep(0.5, 0.85, ridged((h, w), 4, 4, seed + 23))

    base = mix(hex_lin('#0d1117'), hex_lin('#1b2430'), grunge * 0.8)
    base = mix(base, hex_lin('#313c4a'), edge * 0.35)
    base = mix(base, circ * 0.55, circuits * 0.85)
    base = mix(base, seamc * 0.5, seams * 0.7)
    glow_rgb = (circ.reshape(1, 1, 3) * circuits[..., None] + seamc.reshape(1, 1, 3) * seams[..., None] * 0.9)
    emissive = np.clip(np.broadcast_to(glow_rgb, (h, w, 3)) * (0.55 + glow_wide * 1.3)[..., None], 0, 1)
    rough = 0.30 + grunge * 0.35 + micro * 0.10 - glow * 0.12
    height = grunge * 0.10 + micro * 0.06 - glow * 0.30
    mr = np.stack([np.zeros_like(rough), np.clip(rough, 0.05, 1.0),
                   np.clip(0.55 + grunge * 0.35 - glow * 0.3, 0.0, 1.0)], axis=-1)
    return {'albedo': to_srgb(np.clip(base, 0, 1)), 'normal': normal_from_height(height, 2.6),
            'mr': mr, 'emissive': emissive}


def tex_concrete(size=1024, seed=53):
    """Asphalt / concrete ground: aggregate, cracks, tyre polish, oil stains."""
    h = w = size
    agg = fbm((h, w), 60, 6, seed)
    grain = blur(value_noise((h, w), 260, seed + 3), 0.7)
    spots = smoothstep(0.62, 0.9, fbm((h, w), 9, 5, seed + 5))
    cracks = draw_layer((h, w), lambda d, W, H: _cracks(d, W, H, seed + 7, 26), supersample=2)
    cracks = np.clip(cracks + 0.55 * blur(cracks, 2.0), 0, 1)
    oil = smoothstep(0.66, 0.94, fbm((h, w), 3, 5, seed + 9)) * 0.9
    polish = smoothstep(0.35, 0.9, fbm((h, w), 2, 4, seed + 13))

    base = mix(hex_lin('#1b1e22'), hex_lin('#4b5158'), agg * 0.85)
    base = mix(base, hex_lin('#6d737a'), spots * 0.5)
    base = mix(base, hex_lin('#0a0c0e'), cracks * 0.9)
    base = mix(base, hex_lin('#0f1113'), oil * 0.8)
    base = mix(base, hex_lin('#3a4046'), polish * 0.35)
    rough = 0.62 + agg * 0.28 + grain * 0.08 - oil * 0.32 - polish * 0.16 + cracks * 0.05
    height = agg * 0.45 + grain * 0.12 - cracks * 0.65 + spots * 0.06
    mr = np.stack([np.zeros_like(rough), np.clip(rough, 0.06, 1.0),
                   np.clip(0.03 + agg * 0.05, 0.0, 0.2)], axis=-1)
    return {'albedo': to_srgb(np.clip(base, 0, 1)), 'normal': normal_from_height(height, 2.0),
            'mr': mr, 'emissive': None}


def tex_panel(size=1024, seed=71, glow='#7c5cff'):
    """Sci-fi wall: bolted plates, grime streaks, glowing seams, rust."""
    h = w = size
    gc = hex_lin(glow)

    def draw_plates(d, W, H):
        rng = _rng(seed + 1)
        rows = 4
        for r in range(rows):
            y0 = H * r / rows
            y1 = H * (r + 1) / rows
            x = 0.0
            while x < W - 1:
                width = W * float(rng.uniform(0.12, 0.34))
                d.rectangle([x + 2, y0 + 2, x + width - 2, y1 - 2], outline=255,
                            width=max(2, int(W / 420)))
                # bolts in the corners
                rad = max(2.0, W / 300.0)
                for bx, by in ((x + rad * 2.4, y0 + rad * 2.4), (x + width - rad * 2.4, y0 + rad * 2.4),
                               (x + rad * 2.4, y1 - rad * 2.4), (x + width - rad * 2.4, y1 - rad * 2.4)):
                    d.ellipse([bx - rad, by - rad, bx + rad, by + rad], fill=170)
                x += width

    plates = draw_layer((h, w), draw_plates, supersample=2)
    seams = np.clip(blur(plates, 1.0) - plates * 0.35, 0, 1) * 0.6 + plates * 0.4
    grime = fbm((h, w), 5, 6, seed + 7)
    streak = fbm((h, w), 3, 5, seed + 11)
    streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8), 'L')
                        .filter(ImageFilter.GaussianBlur(size / 260)).resize((w, h), Image.BILINEAR)
                        ).astype(F32) / 255.0
    rust = smoothstep(0.60, 0.92, fbm((h, w), 14, 5, seed + 17))
    micro = blur(value_noise((h, w), 240, seed + 19), 0.8)

    base = mix(hex_lin('#2b3038'), hex_lin('#4a5360'), grime * 0.9)
    base = mix(base, hex_lin('#14171c'), streak * 0.45)
    base = mix(base, hex_lin('#6b3b21'), rust * 0.7)
    base = mix(base, gc * 1.1, seams * 0.9)
    base = base * (0.86 + micro[..., None] * 0.28)
    emissive = np.clip(gc.reshape(1, 1, 3) * (seams * 1.15)[..., None], 0, 1)
    rough = 0.44 + grime * 0.30 + micro * 0.10 + rust * 0.25 - seams * 0.20
    height = plates * 0.30 + grime * 0.10 + micro * 0.05 - seams * 0.35 + rust * 0.08
    mr = np.stack([np.zeros_like(rough), np.clip(rough, 0.05, 1.0),
                   np.clip(0.42 + grime * 0.3 - rust * 0.25 - seams * 0.2, 0, 1)], axis=-1)
    return {'albedo': to_srgb(np.clip(base, 0, 1)), 'normal': normal_from_height(height, 3.0),
            'mr': mr, 'emissive': emissive}


def tex_camo(size=1024, seed=89):
    """Hex-tile tactical camo fabric for the Ultra bot rig."""
    h = w = size
    yy, xx = np.mgrid[0:h, 0:w].astype(F32)
    a = size / 14.0
    # hexagonal cells via two offset triangular lattices
    def hexid(ox, oy, scale):
        u = (xx + ox) / scale
        v = (yy + oy) / (scale * math.sqrt(3.0) / 2.0)
        row = np.floor(v)
        uu = u + 0.5 * np.mod(row, 2.0)
        col = np.floor(uu)
        return row * 977.0 + col
    cells = hexid(0, 0, a)
    rng = _rng(seed)
    palette = [hex_lin('#1a2226'), hex_lin('#2c3a33'), hex_lin('#3d4a3a'), hex_lin('#5a4433'),
               hex_lin('#0e1416')]
    idx = (np.mod(cells * 2654435761.0, len(palette))).astype(int)
    base = np.zeros((h, w, 3), F32)
    for i, c in enumerate(palette):
        base[idx == i] = c
    # woven-fabric micro structure: two scales of noise (no sine aliasing)
    fibre = fbm((h, w), 96, 4, seed + 41, gain=0.55)
    weave = 0.5 + (fibre - 0.5) * 0.7 + 0.15 * np.sin(xx * 0.12 + np.sin(yy * 0.09) * 2.0)
    noise = fbm((h, w), 40, 4, seed + 3)
    wear = smoothstep(0.7, 0.95, fbm((h, w), 8, 5, seed + 7))
    base = base * (0.86 + weave[..., None] * 0.16 + noise[..., None] * 0.2)
    base = mix(base, hex_lin('#6d7a70'), wear * 0.4)
    rough = 0.78 + noise * 0.15 - weave * 0.08 + wear * 0.05
    height = weave * 0.35 + noise * 0.25
    mr = np.stack([np.zeros_like(rough), np.clip(rough, 0.1, 1.0),
                   np.clip(0.06 + noise * 0.06, 0, 0.2)], axis=-1)
    return {'albedo': to_srgb(np.clip(base, 0, 1)), 'normal': normal_from_height(height, 2.4),
            'mr': mr, 'emissive': None}


def tex_gold(size=1024, seed=97):
    """Brushed gold trim for the Mythic tier."""
    h = w = size
    streak = value_noise((h, w), 4, seed)
    line_noise = _rng(seed + 1).random(h).astype(F32)
    brushed = np.tile(line_noise[:, None], (1, w)) * 0.7 + fbm((h, w), 200, 3, seed + 5) * 0.3
    scratches = draw_layer((h, w), lambda d, W, H: _scratches(d, W, H, seed + 9, count=60),
                           supersample=2)
    grime = smoothstep(0.6, 0.95, fbm((h, w), 10, 5, seed + 13))
    base = mix(hex_lin('#8a6a1f'), hex_lin('#f2cf6b'), 0.45 + brushed * 0.5)
    base = mix(base, hex_lin('#3a2c10'), grime * 0.5)
    base = mix(base, hex_lin('#fff3c4'), scratches * 0.5)
    rough = 0.18 + brushed * 0.22 + grime * 0.35 + scratches * 0.2
    height = brushed * 0.12 + scratches * 0.2 - grime * 0.05
    mr = np.stack([np.zeros_like(rough), np.clip(rough, 0.04, 1.0),
                   np.clip(0.99 - grime * 0.3, 0, 1)], axis=-1)
    return {'albedo': to_srgb(np.clip(base, 0, 1)), 'normal': normal_from_height(height, 1.6),
            'mr': mr, 'emissive': None}


def tex_glass(size=512, seed=101):
    """Smoked armour glass with smudges and micro-scratches."""
    h = w = size
    smudge = fbm((h, w), 12, 5, seed)
    micro = value_noise((h, w), 300, seed + 3)
    scratch = draw_layer((h, w), lambda d, W, H: _scratches(d, W, H, seed + 7, count=40),
                         supersample=2)
    base = mix(hex_lin('#0b1420'), hex_lin('#22394f'), smudge * 0.8)
    base = mix(base, hex_lin('#9fd8ff'), scratch * 0.35)
    rough = 0.06 + smudge * 0.16 + micro * 0.05 + scratch * 0.12
    mr = np.stack([np.zeros_like(rough), np.clip(rough, 0.02, 1), np.full_like(rough, 0.18)], -1)
    return {'albedo': to_srgb(np.clip(base, 0, 1)), 'normal': normal_from_height(micro * 0.4, 1.2),
            'mr': mr, 'emissive': None}


# --------------------------------------------------------------------- detail helpers
def _scratches(d, W, H, seed, count=70):
    rng = _rng(seed)
    for _ in range(count):
        x0, y0 = float(rng.integers(0, W)), float(rng.integers(0, H))
        ang = rng.random() * math.tau
        ln = rng.uniform(0.02, 0.22) * W
        d.line([(x0, y0), (x0 + math.cos(ang) * ln, y0 + math.sin(ang) * ln)],
               fill=int(rng.integers(70, 150)), width=int(rng.integers(1, 3)))


def _cracks(d, W, H, seed, count=20):
    rng = _rng(seed)
    for _ in range(count):
        x, y = float(rng.integers(0, W)), float(rng.integers(0, H))
        ang = rng.random() * math.tau
        pts = [(x, y)]
        for _ in range(int(rng.integers(6, 20))):
            ang += rng.normal(0, 0.4)
            ln = rng.uniform(0.01, 0.05) * W
            x += math.cos(ang) * ln
            y += math.sin(ang) * ln
            pts.append((x, y))
        d.line(pts, fill=255, width=int(rng.integers(1, 3)), joint='curve')


# --------------------------------------------------------------------- sky
def sky_equirect(width=2048, height=1024, seed=5, night=True):
    """Equirectangular environment: nebula, stars, city glow, horizon haze."""
    h, w = height, width
    yy, xx = np.mgrid[0:h, 0:w].astype(F32)
    lat = (yy / h) * math.pi            # 0 top .. pi bottom
    lon = (xx / w) * math.tau

    # base vertical gradient: deep space -> horizon glow -> ground bounce
    t = lat / math.pi
    zenith = np.array([0.012, 0.017, 0.045], F32)
    horizon = np.array([0.075, 0.085, 0.16], F32)
    ground = np.array([0.02, 0.024, 0.032], F32)
    grad = np.where((t < 0.5)[..., None],
                    zenith * (1 - t[..., None] * 2) + horizon * (t[..., None] * 2),
                    horizon * (1 - (t[..., None] - 0.5) * 2) + ground * ((t[..., None] - 0.5) * 2))

    neb_a = fbm((h, w), 3, 6, seed, gain=0.55)
    neb_b = fbm((h, w), 6, 6, seed + 31, gain=0.55)
    band = np.exp(-((t - 0.42) ** 2) / 0.012) + 0.45 * np.exp(-((t - 0.30) ** 2) / 0.05)
    neb = np.clip(neb_a * band * 1.8 + neb_b * band * 0.7, 0, 2)
    neb_col = (np.array([0.35, 0.25, 0.85], F32)[None, None, :] * neb[..., None] * 0.55
               + np.array([0.06, 0.42, 0.55], F32)[None, None, :] * (neb ** 1.7)[..., None] * 0.35)

    # city glow near the horizon (night skyline bounce)
    city = np.exp(-((t - 0.53) ** 2) / 0.0016) * (0.5 + 0.5 * fbm((h, w), 8, 4, seed + 7))
    city_col = np.array([0.95, 0.42, 0.18], F32)[None, None, :] * city[..., None] * 0.35
    rim = np.exp(-((t - 0.5) ** 2) / 0.0004) * 0.5
    city_col += np.array([0.45, 0.75, 1.0], F32)[None, None, :] * rim[..., None]

    # stars: sparse bright points, density falling off near the horizon
    rng = _rng(seed + 101)
    stars = np.zeros((h, w), F32)
    n = int(w * h / 900)
    sx = rng.integers(0, w, n)
    sy = rng.integers(0, h, n)
    mag = rng.random(n) ** 3.2
    for x, y, m in zip(sx, sy, mag):
        stars[y, x] = max(stars[y, x], float(0.55 + m * 3.0))
    stars = blur(stars, 0.7) * (0.25 + 0.75 * (1 - np.clip(t * 2, 0, 1)))
    star_col = np.array([0.85, 0.92, 1.0], F32)[None, None, :] * stars[..., None]

    sky = grad + neb_col + city_col + star_col
    sky = np.clip(sky, 0, 1)
    return to_srgb(sky)


MATERIALS = {
    'carbon': tex_carbon,
    'steel': tex_steel,
    'neon': tex_neon,
    'concrete': tex_concrete,
    'panel': tex_panel,
    'camo': tex_camo,
    'gold': tex_gold,
    'glass': tex_glass,
}


def generate_all(out_dir, size=1024, log=print):
    manifest = {}
    for name, fn in MATERIALS.items():
        maps = fn(size=size if name not in ('glass',) else max(256, size // 2))
        entry = {}
        for key, arr in maps.items():
            if arr is None:
                continue
            path = os.path.join(out_dir, 'textures', f'{name}_{key}.png')
            n = save_png(arr, path, 'RGB')
            entry[key] = f'textures/{os.path.basename(path)}'
            log(f'  · {name}_{key}.png  {n / 1024:.0f} KB')
        manifest[name] = entry
    sky = sky_equirect(2048, 1024)
    path = os.path.join(out_dir, 'sky', 'neon_dusk_equirect.png')
    n = save_png(sky, path, 'RGB')
    manifest['__sky__'] = {'file': 'sky/neon_dusk_equirect.png', 'size': n}
    log(f'  · neon_dusk_equirect.png  {n / 1024:.0f} KB')
    return manifest
