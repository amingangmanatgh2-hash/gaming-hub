"""Pure-python procedural 3D mesh toolkit (no numpy needed for geometry).

Every primitive is generated from an analytic signed-distance function or a
parametric surface, so normals are exact and the topology is watertight. Parts
are baked into a single indexed mesh per material with box-projected UVs.

Units: 1.0 = 1 metre. Axes: +Y up, -Z forward (glTF convention).
"""
from __future__ import annotations

import math


# --------------------------------------------------------------------------- vec/mat
def v_add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def v_sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def v_mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def v_dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def v_cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def v_len(a): return math.sqrt(v_dot(a, a))


def v_norm(a):
    l = v_len(a)
    return (a[0] / l, a[1] / l, a[2] / l) if l > 1e-12 else (0.0, 1.0, 0.0)


def mat_identity():
    return [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]


def mat_mul(a, b):
    """Row-major 4x4 multiply (a then b applied as a*b)."""
    out = [0.0] * 16
    for r in range(4):
        for c in range(4):
            out[r * 4 + c] = sum(a[r * 4 + k] * b[k * 4 + c] for k in range(4))
    return out


def mat_translate(x, y, z):
    m = mat_identity(); m[3] = x; m[7] = y; m[11] = z; return m


def mat_scale(x, y=None, z=None):
    y = x if y is None else y
    z = x if z is None else z
    m = mat_identity(); m[0] = x; m[5] = y; m[10] = z; return m


def mat_rot_x(a):
    c, s = math.cos(a), math.sin(a)
    m = mat_identity(); m[5] = c; m[6] = -s; m[9] = s; m[10] = c; return m


def mat_rot_y(a):
    c, s = math.cos(a), math.sin(a)
    m = mat_identity(); m[0] = c; m[2] = s; m[5] = 1.0; m[8] = -s; m[10] = c; return m


def mat_rot_z(a):
    c, s = math.cos(a), math.sin(a)
    m = mat_identity(); m[0] = c; m[1] = -s; m[4] = s; m[5] = c; return m


def apply_point(m, p):
    x, y, z = p
    return (m[0] * x + m[1] * y + m[2] * z + m[3],
            m[4] * x + m[5] * y + m[6] * z + m[7],
            m[8] * x + m[9] * y + m[10] * z + m[11])


def apply_dir(m, d):
    x, y, z = d
    out = (m[0] * x + m[1] * y + m[2] * z,
           m[4] * x + m[5] * y + m[6] * z,
           m[8] * x + m[9] * y + m[10] * z)
    return v_norm(out)


# --------------------------------------------------------------------------- SDFs
def sdf_round_box(p, half, r):
    qx = abs(p[0]) - (half[0] - r)
    qy = abs(p[1]) - (half[1] - r)
    qz = abs(p[2]) - (half[2] - r)
    ox, oy, oz = max(qx, 0.0), max(qy, 0.0), max(qz, 0.0)
    outside = math.sqrt(ox * ox + oy * oy + oz * oz)
    inside = min(max(qx, max(qy, qz)), 0.0)
    return outside + inside - r


def sdf_round_box_grad(p, half, r, eps=1e-4):
    dx = sdf_round_box((p[0] + eps, p[1], p[2]), half, r) - sdf_round_box((p[0] - eps, p[1], p[2]), half, r)
    dy = sdf_round_box((p[0], p[1] + eps, p[2]), half, r) - sdf_round_box((p[0], p[1] - eps, p[2]), half, r)
    dz = sdf_round_box((p[0], p[1], p[2] + eps), half, r) - sdf_round_box((p[0], p[1], p[2] - eps), half, r)
    return v_norm((dx, dy, dz))


# --------------------------------------------------------------------------- primitives
class Prim:
    """positions (list of xyz), normals, uvs (list of uv), indices."""

    __slots__ = ('pos', 'nrm', 'uv', 'idx')

    def __init__(self):
        self.pos = []
        self.nrm = []
        self.uv = []
        self.idx = []

    def add_vert(self, p, n, uv):
        self.pos.append(p)
        self.nrm.append(n)
        self.uv.append(uv)
        return len(self.pos) - 1


def round_box(size, radius=None, seg_u=20, seg_v=12, uv_scale=1.0):
    """Rounded box via star-shaped ray marching of the SDF on a UV sphere.

    size = full extents (x, y, z). radius = corner radius (default 18% of min).
    """
    hx, hy, hz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
    half = (hx, hy, hz)
    if radius is None:
        radius = min(hx, hy, hz) * 0.45
    radius = max(1e-4, min(radius, min(hx, hy, hz) * 0.98))
    prim = Prim()
    grid = []
    for iv in range(seg_v + 1):
        theta = math.pi * iv / seg_v           # 0..pi  (from +Y)
        row = []
        st, ct = math.sin(theta), math.cos(theta)
        for iu in range(seg_u):
            phi = 2.0 * math.pi * iu / seg_u
            d = v_norm((st * math.cos(phi), ct, st * math.sin(phi)))
            # ray march from origin until the surface is hit
            t, step = 0.0, min(hx, hy, hz) * 0.6
            for _ in range(96):
                p = v_mul(d, t)
                dist = sdf_round_box(p, half, radius)
                if dist > 0.0:
                    break
                t += max(abs(dist) * 0.85, 1e-4)
                if t > max(hx, hy, hz) * 3.0:
                    break
            p = v_mul(d, t)
            n = sdf_round_box_grad(p, half, radius)
            row.append(prim.add_vert(p, n, box_uv(p, n, uv_scale)))
        grid.append(row)
    for iv in range(seg_v):
        for iu in range(seg_u):
            a = grid[iv][iu]
            b = grid[iv][(iu + 1) % seg_u]
            c = grid[iv + 1][iu]
            d = grid[iv + 1][(iu + 1) % seg_u]
            if iv > 0:
                prim.idx.extend((a, b, c))
            if iv < seg_v - 1:
                prim.idx.extend((b, d, c))
    return prim


def box_uv(p, n, scale=1.0):
    """Box (triplanar) projection in object space -> stable tiling UVs."""
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if ay >= ax and ay >= az:
        u, v = p[0], p[2]
    elif ax >= az:
        u, v = p[2], p[1]
    else:
        u, v = p[0], p[1]
    return (u / scale, v / scale)


def cylinder(radius, height, seg=20, radius_top=None, caps=True, uv_scale=1.0):
    rt = radius if radius_top is None else radius_top
    prim = Prim()
    hh = height / 2.0
    rings = []
    for iy, (y, r) in enumerate(((-hh, radius), (hh, rt))):
        row = []
        for i in range(seg):
            a = 2.0 * math.pi * i / seg
            p = (math.cos(a) * r, y, math.sin(a) * r)
            n = v_norm((math.cos(a), (radius - rt) / max(height, 1e-6) * 0.0, math.sin(a)))
            row.append(prim.add_vert(p, n, (i / seg * 2 * math.pi * r / uv_scale, (y + hh) / uv_scale)))
        rings.append(row)
    for i in range(seg):
        a, b = rings[0][i], rings[0][(i + 1) % seg]
        c, d = rings[1][i], rings[1][(i + 1) % seg]
        prim.idx.extend((a, c, b, b, c, d))
    if caps:
        for y, r, ny in ((-hh, radius, -1.0), (hh, rt, 1.0)):
            centre = prim.add_vert((0.0, y, 0.0), (0.0, ny, 0.0), (0.0, 0.0))
            ring = []
            for i in range(seg):
                a = 2.0 * math.pi * i / seg
                p = (math.cos(a) * r, y, math.sin(a) * r)
                ring.append(prim.add_vert(p, (0.0, ny, 0.0), (p[0] / uv_scale, p[2] / uv_scale)))
            for i in range(seg):
                v0, v1 = ring[i], ring[(i + 1) % seg]
                prim.idx.extend((centre, v0, v1) if ny < 0 else (centre, v1, v0))
    return prim


def capsule(radius, height, seg=16, rings=6, uv_scale=1.0):
    """Capsule: cylinder section of `height` + two hemispheres."""
    prim = Prim()
    pts = []
    hh = height / 2.0
    for iv in range(rings + 1):                      # top hemisphere
        t = iv / rings
        theta = t * math.pi / 2.0
        y = hh + math.cos(theta) * radius
        r = math.sin(theta) * radius
        pts.append((y, r))
    for iv in range(rings + 1):                      # bottom hemisphere
        t = iv / rings
        theta = t * math.pi / 2.0
        y = -hh - math.sin(theta) * radius
        r = math.cos(theta) * radius
        pts.append((y, r))
    grid = []
    for (y, r) in pts:
        row = []
        for i in range(seg):
            a = 2.0 * math.pi * i / seg
            p = (math.cos(a) * r, y, math.sin(a) * r)
            n = v_norm(v_sub(p, (0.0, max(-hh, min(hh, y)), 0.0)))
            row.append(prim.add_vert(p, n, box_uv(p, n, uv_scale)))
        grid.append(row)
    for iv in range(len(grid) - 1):
        for i in range(seg):
            a = grid[iv][i]; b = grid[iv][(i + 1) % seg]
            c = grid[iv + 1][i]; d = grid[iv + 1][(i + 1) % seg]
            prim.idx.extend((a, b, c, b, d, c))
    return prim


def torus(major, minor, seg=28, ring_seg=12, uv_scale=1.0, arc=math.tau):
    prim = Prim()
    grid = []
    n_major = max(3, int(seg * arc / math.tau))
    for i in range(n_major + 1):
        a = arc * i / n_major
        ca, sa = math.cos(a), math.sin(a)
        row = []
        for j in range(ring_seg):
            b = math.tau * j / ring_seg
            cb, sb = math.cos(b), math.sin(b)
            p = ((major + minor * cb) * ca, minor * sb, (major + minor * cb) * sa)
            n = (cb * ca, sb, cb * sa)
            row.append(prim.add_vert(p, n, (a * major / uv_scale, b * minor / uv_scale)))
        grid.append(row)
    for i in range(n_major):
        for j in range(ring_seg):
            a = grid[i][j]; b = grid[i][(j + 1) % ring_seg]
            c = grid[i + 1][j]; d = grid[i + 1][(j + 1) % ring_seg]
            prim.idx.extend((a, b, c, b, d, c))
    return prim


def plate(size, radius=0.01, seg=14, uv_scale=1.0, thickness=None):
    """Chamfered flat plate (rounded box with tiny depth)."""
    h = thickness if thickness is not None else max(size[2], 0.008)
    return round_box((size[0], size[1], h), radius, seg, max(6, seg // 2), uv_scale)


def tube_path(points, radius, seg=10, uv_scale=1.0):
    """Swept circle along a polyline (cables, rails, stocks)."""
    prim = Prim()
    grid = []
    n = len(points)
    for i, p in enumerate(points):
        nxt = points[min(i + 1, n - 1)]
        prv = points[max(i - 1, 0)]
        tangent = v_norm(v_sub(nxt, prv))
        up = (0.0, 1.0, 0.0) if abs(tangent[1]) < 0.95 else (1.0, 0.0, 0.0)
        side = v_norm(v_cross(tangent, up))
        up2 = v_norm(v_cross(side, tangent))
        row = []
        for j in range(seg):
            a = math.tau * j / seg
            off = v_add(v_mul(side, math.cos(a) * radius), v_mul(up2, math.sin(a) * radius))
            pp = v_add(p, off)
            row.append(prim.add_vert(pp, v_norm(off), (j / seg * math.tau * radius / uv_scale, i * 0.25 / uv_scale)))
        grid.append(row)
    for i in range(n - 1):
        for j in range(seg):
            a = grid[i][j]; b = grid[i][(j + 1) % seg]
            c = grid[i + 1][j]; d = grid[i + 1][(j + 1) % seg]
            prim.idx.extend((a, c, b, b, c, d))
    return prim


# Texel-density contract: how many texture repeats fit in one metre. Small
# weapon parts need high density, big map props need low density, otherwise the
# same 1 m UV mapping stretches on one and tiles 40x on the other.
UVD = {
    'u:carbon': 1.5,
    'u:steel': 1.3,
    'u:neon': 1.1,
    'u:trim': 1.8,
    'u:glass': 1.2,
    'u:fabric': 1.1,
    'u:hull': 0.55,
    'u:concrete': 0.22,
}


def _sdf_rrect_2d(x, z, hw, hd, r):
    qx = abs(x) - (hw - r)
    qz = abs(z) - (hd - r)
    ox, oz = max(qx, 0.0), max(qz, 0.0)
    return math.sqrt(ox * ox + oz * oz) + min(max(qx, qz), 0.0) - r


def loft(sections, seg=32, uv_scale=1.0, cap_top=True, cap_bottom=True):
    """Loft a rounded-rectangle cross-section along Y.

    sections: list of (y, half_width, half_depth, corner_radius).
    Perfect for tapered pylons and masts: one continuous smooth surface with
    normals averaged from the faces (no visible seams between stacked boxes).
    """
    prim = Prim()
    rings = []
    for (y, hw, hd, r) in sections:
        r = min(r, hw * 0.98, hd * 0.98)
        ring = []
        for i in range(seg):
            a = math.tau * i / seg
            dx, dz = math.cos(a), math.sin(a)
            t = 0.0
            for _ in range(60):
                x, z = dx * t, dz * t
                d = _sdf_rrect_2d(x, z, hw, hd, r)
                if d > 0:
                    break
                t += max(abs(d) * 0.85, 1e-5)
            x, z = dx * t, dz * t
            ring.append(prim.add_vert((x, y, z), (0.0, 1.0, 0.0),
                                      (x / uv_scale, (y + z) / uv_scale)))
        rings.append(ring)
    for iy in range(len(rings) - 1):
        for i in range(seg):
            a = rings[iy][i]; b = rings[iy][(i + 1) % seg]
            c = rings[iy + 1][i]; d = rings[iy + 1][(i + 1) % seg]
            prim.idx.extend((a, c, b, b, c, d))
    for do_cap, ring, y, up in ((cap_bottom, rings[0], sections[0][0], -1.0),
                                (cap_top, rings[-1], sections[-1][0], 1.0)):
        if not do_cap:
            continue
        centre = prim.add_vert((0.0, y, 0.0), (0.0, up, 0.0), (0.0, 0.0))
        for i in range(seg):
            v0 = ring[i]; v1 = ring[(i + 1) % seg]
            prim.idx.extend((centre, v1, v0) if up > 0 else (centre, v0, v1))
    # recompute smooth normals from faces
    accum = [[0.0, 0.0, 0.0] for _ in prim.pos]
    for i in range(0, len(prim.idx), 3):
        ia, ib, ic = prim.idx[i], prim.idx[i + 1], prim.idx[i + 2]
        A, B, C = prim.pos[ia], prim.pos[ib], prim.pos[ic]
        n = v_cross(v_sub(B, A), v_sub(C, A))
        for ii in (ia, ib, ic):
            accum[ii][0] += n[0]; accum[ii][1] += n[1]; accum[ii][2] += n[2]
    for i in range(len(prim.nrm)):
        prim.nrm[i] = v_norm(tuple(accum[i]))
    return prim


# --------------------------------------------------------------------------- builder
class PartMesh:
    """Accumulates transformed primitives, grouped by material name."""

    def __init__(self):
        self.groups = {}   # material -> {'pos': [], 'nrm': [], 'uv': [], 'idx': []}

    def add(self, prim, material, matrix=None, uv_scale=None):
        g = self.groups.setdefault(material, {'pos': [], 'nrm': [], 'uv': [], 'idx': []})
        base = len(g['pos'])
        density = UVD.get(material, 1.0)
        inv_scale = (uv_scale if uv_scale is not None else 1.0) * density
        for i in range(len(prim.pos)):
            p = prim.pos[i]
            n = prim.nrm[i]
            if matrix is not None:
                p = apply_point(matrix, p)
                n = apply_dir(matrix, n)
            g['pos'].append(p)
            g['nrm'].append(n)
            uv = prim.uv[i] if i < len(prim.uv) else (0.0, 0.0)
            uv = (uv[0] * inv_scale, uv[1] * inv_scale)
            g['uv'].append(uv)
        for i in prim.idx:
            g['idx'].append(base + i)
        return self

    def merge(self, other, matrix=None):
        """Merge another PartMesh (e.g. a weapon into a character rig)."""
        for mat_name, g in other.groups.items():
            dst = self.groups.setdefault(mat_name, {'pos': [], 'nrm': [], 'uv': [], 'idx': []})
            base = len(dst['pos'])
            for i in range(len(g['pos'])):
                p = g['pos'][i]
                n = g['nrm'][i]
                if matrix is not None:
                    p = apply_point(matrix, p)
                    n = apply_dir(matrix, n)
                dst['pos'].append(p)
                dst['nrm'].append(n)
                dst['uv'].append(g['uv'][i])
            for i in g['idx']:
                dst['idx'].append(base + i)
        return self

    def tri_count(self):
        return sum(len(g['idx']) // 3 for g in self.groups.values())

    def bounds(self):
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for g in self.groups.values():
            for p in g['pos']:
                for k in range(3):
                    lo[k] = min(lo[k], p[k]); hi[k] = max(hi[k], p[k])
        return lo, hi


def T(x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0, s=1.0):
    """Convenience transform: scale * rotZ * rotY * rotX * translate."""
    m = mat_translate(x, y, z)
    if rx:
        m = mat_mul(m, mat_rot_x(rx))
    if ry:
        m = mat_mul(m, mat_rot_y(ry))
    if rz:
        m = mat_mul(m, mat_rot_z(rz))
    if s != 1.0:
        m = mat_mul(m, mat_scale(s))
    return m
