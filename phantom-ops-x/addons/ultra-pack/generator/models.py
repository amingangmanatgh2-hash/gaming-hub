"""Ultra-pack 3D models: hero assault rifle, armoured operator, props.

Everything is built from analytic primitives (rounded-box SDF ray marching,
swept tubes, tori, capsules) and merged per material, so each GLB is a real
indexed mesh with exact normals and box-projected UVs. Material names are
prefixed `u:` and are the contract used by app/js/ultra.js to attach the PBR
texture sets at runtime.
"""
from __future__ import annotations

import math

from mesh import (PartMesh, T, round_box, cylinder, capsule, torus, plate,
                  tube_path, loft, mat_rot_x, mat_rot_y, mat_rot_z, mat_mul)

PI = math.pi

MAT = {
    'body': 'u:carbon',
    'metal': 'u:steel',
    'neon': 'u:neon',
    'trim': 'u:gold',
    'glass': 'u:glass',
    'fabric': 'u:camo',
    'hull': 'u:panel',
}


def _rbox(size, radius=None, u=18, v=10):
    return round_box(size, radius, seg_u=u, seg_v=v)


# --------------------------------------------------------------------------- rifle
def rifle():
    """Hero carbine, ~1.05 m long, barrel towards -Z."""
    m = PartMesh()
    body, metal, neon, trim, glass = MAT['body'], MAT['metal'], MAT['neon'], MAT['trim'], MAT['glass']

    # lower receiver / chassis
    m.add(_rbox((0.074, 0.112, 0.40), 0.018, 22, 12), body, T(0, 0, -0.02))
    m.add(_rbox((0.078, 0.030, 0.36), 0.012, 18, 10), metal, T(0, 0.062, -0.04))
    # upper rail with picatinny teeth
    for i in range(13):
        m.add(_rbox((0.030, 0.012, 0.011), 0.003, 8, 5), metal, T(0, 0.080, 0.10 - i * 0.028))
    # handguard
    m.add(_rbox((0.070, 0.086, 0.30), 0.020, 20, 12), body, T(0, 0.004, -0.40))
    for i in range(7):                                  # vent slots
        m.add(_rbox((0.076, 0.024, 0.014), 0.006, 8, 5), metal, T(0, 0.004, -0.30 - i * 0.032))
    m.add(torus(0.041, 0.006, 26, 8, arc=PI * 2), metal, T(0, 0.004, -0.548, rx=PI / 2))
    # barrel + gas block + muzzle brake
    m.add(cylinder(0.0135, 0.34, 20), metal, T(0, 0.012, -0.70, rx=PI / 2))
    m.add(_rbox((0.040, 0.034, 0.05), 0.008, 10, 6), metal, T(0, 0.030, -0.70))
    m.add(cylinder(0.024, 0.10, 22), metal, T(0, 0.012, -0.90, rx=PI / 2))
    for i in range(3):
        m.add(torus(0.025, 0.0035, 22, 8), metal, T(0, 0.012, -0.865 - i * 0.026, rx=PI / 2))
    m.add(cylinder(0.016, 0.03, 18, radius_top=0.021), metal, T(0, 0.012, -0.955, rx=PI / 2))
    # optics: scope body, mounts, lenses, reticle ring
    m.add(cylinder(0.027, 0.235, 24), body, T(0, 0.108, -0.10, rx=PI / 2))
    m.add(cylinder(0.031, 0.05, 24), metal, T(0, 0.108, -0.212, rx=PI / 2))
    m.add(cylinder(0.031, 0.05, 24), metal, T(0, 0.108, 0.012, rx=PI / 2))
    m.add(cylinder(0.028, 0.006, 24), glass, T(0, 0.108, -0.238, rx=PI / 2))
    m.add(cylinder(0.026, 0.006, 24), glass, T(0, 0.108, 0.038, rx=PI / 2))
    m.add(torus(0.019, 0.0025, 22, 6), neon, T(0, 0.108, -0.240, rx=PI / 2))
    m.add(_rbox((0.026, 0.040, 0.030), 0.006, 8, 5), metal, T(0, 0.085, -0.16))
    m.add(_rbox((0.026, 0.040, 0.030), 0.006, 8, 5), metal, T(0, 0.085, -0.02))
    # charging handle + ejection port
    m.add(_rbox((0.030, 0.020, 0.030), 0.006, 8, 5), metal, T(0.042, 0.046, 0.10))
    m.add(tube_path([(0.044, 0.046, 0.10), (0.070, 0.046, 0.06)], 0.006, 8), metal)
    m.add(_rbox((0.006, 0.045, 0.11), 0.002, 8, 5), metal, T(0.038, 0.016, -0.02))
    # stock: buffer tube, cheek rest, butt pad
    m.add(cylinder(0.021, 0.20, 18), metal, T(0, 0.040, 0.22, rx=PI / 2))
    m.add(_rbox((0.056, 0.086, 0.19), 0.018, 18, 10), body, T(0, 0.022, 0.30))
    m.add(_rbox((0.050, 0.030, 0.16), 0.010, 14, 8), metal, T(0, 0.070, 0.30))
    m.add(_rbox((0.058, 0.115, 0.026), 0.010, 14, 8), body, T(0, 0.008, 0.402))
    m.add(torus(0.010, 0.0035, 16, 6), metal, T(0, -0.030, 0.372))
    # pistol grip (raked back)
    m.add(_rbox((0.046, 0.135, 0.062), 0.018, 16, 10), body, T(0, -0.088, 0.098, rx=-0.34))
    for i in range(5):
        m.add(_rbox((0.050, 0.008, 0.050), 0.004, 8, 5), metal, T(0, -0.052 - i * 0.020, 0.086 + i * 0.007, rx=-0.34))
    # trigger guard + trigger
    m.add(torus(0.030, 0.0055, 22, 8, arc=PI * 1.05), metal, T(0, -0.072, 0.012, rx=PI / 2, rz=PI * 0.02))
    m.add(_rbox((0.010, 0.036, 0.012), 0.004, 8, 5), metal, T(0, -0.058, 0.006, rx=0.25))
    # curved magazine with witness holes
    for i in range(5):
        t = i / 4
        m.add(_rbox((0.052, 0.058, 0.090), 0.007, 14, 8), body,
              T(0, -0.080 - i * 0.044, -0.070 + 0.020 * t * t, rx=0.10 + t * 0.16))
        m.add(_rbox((0.058, 0.010, 0.010), 0.003, 8, 5), metal,
              T(0, -0.058 - i * 0.048, -0.108 + 0.020 * t * t, rx=0.10 + t * 0.16))
    m.add(_rbox((0.056, 0.014, 0.090), 0.006, 12, 8), trim, T(0, -0.300, -0.030, rx=0.74))
    # energy strips + accents
    m.add(_rbox((0.080, 0.010, 0.20), 0.004, 12, 6), neon, T(0, 0.030, -0.36))
    m.add(_rbox((0.080, 0.007, 0.10), 0.003, 12, 6), neon, T(0, 0.048, 0.02))
    for sx in (-1, 1):
        m.add(_rbox((0.006, 0.020, 0.13), 0.003, 10, 6), neon, T(sx * 0.038, -0.012, -0.20))
    m.add(_rbox((0.030, 0.010, 0.014), 0.004, 8, 5), neon, T(0, 0.108, 0.052))
    # bolts / fasteners
    for i in range(6):
        sx = -1 if i % 2 else 1
        m.add(cylinder(0.0055, 0.006, 10), trim, T(sx * 0.037, -0.028 + (i // 2) * 0.036, -0.10, rz=PI / 2))
    # sling loop
    m.add(torus(0.014, 0.0035, 18, 6, arc=PI), metal, T(0, -0.052, -0.50))
    return m


# --------------------------------------------------------------------------- sidearm
def sidearm():
    m = PartMesh()
    body, metal, neon, glass = MAT['body'], MAT['metal'], MAT['neon'], MAT['glass']
    m.add(_rbox((0.036, 0.058, 0.20), 0.010, 18, 10), body, T(0, 0.012, -0.02))
    m.add(_rbox((0.030, 0.026, 0.17), 0.008, 14, 8), metal, T(0, 0.048, -0.02))
    m.add(cylinder(0.0105, 0.13, 16), metal, T(0, 0.020, -0.135, rx=PI / 2))
    m.add(cylinder(0.0135, 0.030, 16), metal, T(0, 0.020, -0.205, rx=PI / 2))
    m.add(_rbox((0.034, 0.115, 0.050), 0.014, 14, 9), body, T(0, -0.070, 0.048, rx=-0.22))
    for i in range(4):
        m.add(_rbox((0.038, 0.007, 0.040), 0.003, 8, 5), metal, T(0, -0.040 - i * 0.019, 0.040 + i * 0.005, rx=-0.22))
    m.add(torus(0.022, 0.0045, 20, 8, arc=PI), metal, T(0, -0.050, -0.012, rx=PI / 2))
    m.add(_rbox((0.008, 0.026, 0.010), 0.003, 8, 5), metal, T(0, -0.040, -0.010, rx=0.2))
    m.add(_rbox((0.040, 0.006, 0.10), 0.003, 10, 6), neon, T(0, 0.034, -0.05))
    m.add(cylinder(0.015, 0.008, 18), glass, T(0, 0.062, 0.032, rx=PI / 2))
    m.add(torus(0.009, 0.0018, 16, 6), neon, T(0, 0.062, 0.035, rx=PI / 2))
    m.add(_rbox((0.020, 0.014, 0.014), 0.004, 8, 5), neon, T(0, 0.062, -0.078))
    return m


def carbine_simple():
    """Low-cost carbine the operator holds (keeps the bot GLB game-friendly)."""
    m = PartMesh()
    body, metal, neon = MAT['body'], MAT['metal'], MAT['neon']
    m.add(_rbox((0.070, 0.105, 0.38), 0.018, 14, 8), body, T(0, 0, -0.06))
    m.add(_rbox((0.062, 0.070, 0.26), 0.016, 12, 7), body, T(0, 0.006, -0.36))
    m.add(cylinder(0.013, 0.30, 14), metal, T(0, 0.014, -0.62, rx=PI / 2))
    m.add(cylinder(0.023, 0.075, 16), metal, T(0, 0.014, -0.79, rx=PI / 2))
    m.add(_rbox((0.050, 0.130, 0.075), 0.016, 12, 7), body, T(0, -0.085, -0.10, rx=0.16))
    m.add(_rbox((0.046, 0.115, 0.055), 0.016, 12, 7), body, T(0, -0.075, 0.10, rx=-0.32))
    m.add(_rbox((0.050, 0.080, 0.17), 0.016, 12, 7), body, T(0, 0.018, 0.26))
    m.add(_rbox((0.028, 0.040, 0.075), 0.008, 10, 6), metal, T(0, 0.082, -0.18))
    m.add(_rbox((0.072, 0.010, 0.24), 0.004, 10, 6), neon, T(0, 0.036, -0.30))
    m.add(torus(0.028, 0.005, 18, 7, arc=PI), metal, T(0, -0.062, -0.02, rx=PI / 2))
    return m


# --------------------------------------------------------------------------- operator bot
def operator():
    """Armoured humanoid ~1.86 m. Origin at the feet."""
    m = PartMesh()
    # armour plating reads far better than fabric at gameplay distance; the
    # camo weave is kept for the under-suit only.
    hull, metal, neon, glass, trim = (MAT['hull'], MAT['metal'], MAT['neon'],
                                      MAT['glass'], MAT['trim'])
    fab = MAT['fabric']
    Y = 1.0  # parts are authored around the hip, then lifted

    # pelvis + belt
    m.add(_rbox((0.30, 0.18, 0.22), 0.05, 16, 9), hull, T(0, 0.98, 0))
    m.add(_rbox((0.31, 0.05, 0.23), 0.02, 14, 8), metal, T(0, 1.06, 0))
    for i, x in enumerate((-0.12, -0.04, 0.04, 0.12)):
        m.add(_rbox((0.07, 0.09, 0.07), 0.02, 12, 7), hull, T(x, 0.96, 0.13))
    # abdomen + chest
    m.add(_rbox((0.26, 0.16, 0.19), 0.05, 16, 9), fab, T(0, 1.14, 0))
    m.add(_rbox((0.36, 0.30, 0.23), 0.06, 20, 11), hull, T(0, 1.34, 0))
    m.add(_rbox((0.30, 0.22, 0.10), 0.05, 18, 10), hull, T(0, 1.36, -0.10))
    m.add(_rbox((0.055, 0.16, 0.03), 0.012, 12, 7), neon, T(0, 1.36, -0.152))
    m.add(_rbox((0.20, 0.05, 0.03), 0.012, 12, 7), neon, T(0, 1.25, -0.148))
    # collar / neck / helmet
    m.add(_rbox((0.20, 0.07, 0.18), 0.03, 14, 8), metal, T(0, 1.51, 0))
    m.add(cylinder(0.055, 0.08, 16), fab, T(0, 1.55, 0))
    m.add(_rbox((0.21, 0.22, 0.24), 0.07, 20, 12), hull, T(0, 1.68, 0))
    m.add(_rbox((0.17, 0.09, 0.07), 0.03, 16, 9), glass, T(0, 1.68, -0.115))
    m.add(_rbox((0.15, 0.016, 0.02), 0.006, 12, 6), neon, T(0, 1.685, -0.142))
    m.add(_rbox((0.075, 0.06, 0.09), 0.02, 12, 7), hull, T(0.0, 1.79, 0.02))
    m.add(tube_path([(0.05, 1.80, 0.06), (0.16, 1.92, 0.10), (0.19, 2.02, 0.07)], 0.006, 8), metal)
    m.add(_rbox((0.03, 0.03, 0.03), 0.006, 8, 5), neon, T(0.195, 2.03, 0.07))
    # shoulders, arms
    for sx in (-1, 1):
        m.add(_rbox((0.16, 0.14, 0.20), 0.06, 16, 9), hull, T(sx * 0.225, 1.43, 0))
        m.add(_rbox((0.02, 0.06, 0.10), 0.008, 10, 6), neon, T(sx * 0.30, 1.43, 0))
        m.add(capsule(0.064, 0.15, 14, 5), fab, T(sx * 0.222, 1.28, 0.01))
        m.add(_rbox((0.11, 0.16, 0.14), 0.04, 14, 8), hull, T(sx * 0.228, 1.10, 0.02))
        m.add(_rbox((0.075, 0.10, 0.10), 0.025, 12, 7), hull, T(sx * 0.235, 1.09, -0.045))
        m.add(capsule(0.050, 0.15, 14, 5), hull, T(sx * 0.218, 0.94, -0.01))
        m.add(_rbox((0.085, 0.11, 0.10), 0.03, 12, 7), hull, T(sx * 0.215, 0.86, -0.02))
        m.add(_rbox((0.03, 0.02, 0.06), 0.008, 10, 6), neon, T(sx * 0.215, 0.855, -0.075))
    # gloved hands + held carbine
    m.add(_rbox((0.078, 0.088, 0.105), 0.028, 12, 7), metal, T(-0.185, 0.82, -0.20, ry=0.18))
    m.add(_rbox((0.078, 0.088, 0.105), 0.028, 12, 7), metal, T(0.150, 0.79, -0.10, ry=-0.22))
    m.merge(carbine_simple(), T(-0.02, 0.86, -0.34, ry=-0.16, rz=0.05, s=0.86))
    # legs (hip -> thigh -> knee -> shin -> ankle -> boot, with overlap so the
    # chain reads as one solid limb instead of floating segments)
    for sx in (-1, 1):
        m.add(_rbox((0.17, 0.17, 0.19), 0.06, 14, 8), fab, T(sx * 0.105, 0.90, 0))
        m.add(capsule(0.075, 0.24, 16, 6), hull, T(sx * 0.105, 0.79, 0))
        m.add(_rbox((0.135, 0.13, 0.16), 0.04, 14, 8), hull, T(sx * 0.105, 0.66, -0.015))
        m.add(capsule(0.062, 0.26, 16, 6), fab, T(sx * 0.104, 0.50, 0.004))
        m.add(_rbox((0.105, 0.15, 0.115), 0.035, 12, 7), hull, T(sx * 0.104, 0.44, -0.03))
        m.add(cylinder(0.048, 0.14, 14), metal, T(sx * 0.104, 0.30, 0.0))
        m.add(_rbox((0.10, 0.10, 0.13), 0.03, 12, 7), metal, T(sx * 0.104, 0.19, 0.0))
        m.add(_rbox((0.118, 0.085, 0.29), 0.032, 14, 8), metal, T(sx * 0.104, 0.085, -0.05))
        m.add(_rbox((0.124, 0.045, 0.31), 0.02, 12, 7), hull, T(sx * 0.104, 0.035, -0.05))
        m.add(_rbox((0.02, 0.05, 0.09), 0.006, 8, 5), neon, T(sx * 0.13, 0.14, -0.02))
    # backpack + life support
    m.add(_rbox((0.28, 0.30, 0.14), 0.05, 16, 9), hull, T(0, 1.36, 0.19))
    for i in range(3):
        m.add(_rbox((0.20, 0.014, 0.02), 0.006, 10, 6), neon, T(0, 1.28 + i * 0.05, 0.265))
    m.add(cylinder(0.035, 0.22, 14), metal, T(-0.10, 1.30, 0.28))
    m.add(cylinder(0.035, 0.22, 14), metal, T(0.10, 1.30, 0.28))
    m.add(tube_path([(-0.10, 1.41, 0.28), (-0.10, 1.50, 0.20), (0.0, 1.52, 0.12)], 0.011, 8), metal)
    # sidearm holster + trim
    m.add(_rbox((0.08, 0.14, 0.06), 0.02, 12, 7), hull, T(0.19, 0.92, 0.07))
    m.add(_rbox((0.10, 0.012, 0.03), 0.005, 10, 6), trim, T(0, 1.44, -0.14))
    return m


# --------------------------------------------------------------------------- props
def crate():
    m = PartMesh()
    hull, metal, neon, trim = MAT['hull'], MAT['metal'], MAT['neon'], MAT['trim']
    m.add(_rbox((0.92, 0.86, 0.92), 0.05, 18, 10), hull, T(0, 0.43, 0))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(_rbox((0.07, 0.90, 0.07), 0.02, 12, 7), metal, T(sx * 0.44, 0.44, sz * 0.44))
    for sy in (0.08, 0.80):
        m.add(_rbox((0.96, 0.06, 0.96), 0.02, 14, 8), metal, T(0, sy, 0))
    m.add(_rbox((0.50, 0.10, 0.03), 0.02, 12, 7), neon, T(0, 0.52, -0.465))
    m.add(_rbox((0.16, 0.16, 0.05), 0.02, 12, 7), trim, T(0, 0.30, -0.465))
    m.add(torus(0.10, 0.02, 20, 8, arc=PI), metal, T(0, 0.86, 0))
    for i in range(3):
        m.add(_rbox((0.60, 0.02, 0.02), 0.006, 10, 6), neon, T(0, 0.20 + i * 0.06, 0.465))
    return m


def tower():
    """Neon pylon: one lofted tapered mast + rings + masts (no box stacking)."""
    m = PartMesh()
    hull, metal, neon, trim = MAT['hull'], MAT['metal'], MAT['neon'], MAT['trim']
    m.add(_rbox((2.6, 0.26, 2.6), 0.06, 18, 9), metal, T(0, 0.13, 0))
    m.add(_rbox((1.9, 0.18, 1.9), 0.05, 16, 8), hull, T(0, 0.32, 0))
    sections = [(0.38, 1.30, 1.30, 0.22), (2.2, 1.16, 1.16, 0.20), (4.6, 0.96, 0.96, 0.18),
                (6.8, 0.74, 0.74, 0.15), (8.4, 0.52, 0.52, 0.12), (8.9, 0.40, 0.40, 0.10)]
    m.add(loft(sections, seg=40, uv_scale=2.2), hull)
    for i, (y, w) in enumerate(((1.2, 1.26), (2.6, 1.14), (4.0, 1.03), (5.4, 0.90),
                                (6.6, 0.78), (7.7, 0.64), (8.5, 0.53))):
        m.add(_rbox((w * 2 + 0.03, 0.09, w * 2 + 0.03), 0.02, 20, 8), metal, T(0, y, 0))
        for sx in (-1, 1):
            for sz in (-1, 1):
                m.add(_rbox((0.055, 0.45, 0.055), 0.018, 10, 6), neon,
                      T(sx * (w - 0.03), y + 0.26, sz * (w - 0.03)))
    # vertical light ribs on two faces
    for sx in (-1, 1):
        m.add(_rbox((0.07, 7.4, 0.07), 0.02, 10, 6), neon, T(sx * 0.62, 4.6, 1.02, rz=sx * 0.03))
        m.add(_rbox((0.07, 7.4, 0.07), 0.02, 10, 6), neon, T(1.02, 4.6, sx * 0.62, rx=sx * 0.03))
    m.add(_rbox((0.62, 0.18, 0.62), 0.04, 14, 8), trim, T(0, 8.95, 0))
    m.add(loft([(8.98, 0.10, 0.10, 0.05), (9.6, 0.32, 0.32, 0.16), (10.0, 0.16, 0.16, 0.08)], seg=24, uv_scale=1.0), hull)
    m.add(tube_path([(0, 10.0, 0), (0, 11.1, 0)], 0.03, 8), metal)
    m.add(_rbox((0.14, 0.14, 0.14), 0.035, 12, 7), neon, T(0, 11.2, 0))
    return m


def drone():
    m = PartMesh()
    hull, metal, neon, glass = MAT['hull'], MAT['metal'], MAT['neon'], MAT['glass']
    m.add(_rbox((0.40, 0.14, 0.46), 0.07, 18, 10), hull, T(0, 0, 0))
    m.add(_rbox((0.24, 0.05, 0.26), 0.03, 12, 7), glass, T(0, -0.09, -0.04))
    m.add(cylinder(0.05, 0.05, 16), neon, T(0, -0.10, 0.14, rx=PI / 2))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(_rbox((0.42, 0.035, 0.035), 0.012, 10, 6), metal,
                  T(sx * 0.26, 0.03, sz * 0.26, ry=sx * sz * 0.72))
            m.add(cylinder(0.11, 0.012, 24), glass, T(sx * 0.44, 0.05, sz * 0.44))
            m.add(cylinder(0.02, 0.05, 12), metal, T(sx * 0.44, 0.02, sz * 0.44))
            m.add(_rbox((0.02, 0.02, 0.10), 0.005, 8, 5), neon, T(sx * 0.44, 0.045, sz * 0.30))
    m.add(_rbox((0.28, 0.02, 0.02), 0.006, 10, 6), neon, T(0, 0.06, -0.23))
    return m


MODELS = {
    'rifle_ultra': rifle,
    'sidearm_ultra': sidearm,
    'operator_ultra': operator,
    'crate_ultra': crate,
    'tower_ultra': tower,
    'drone_ultra': drone,
}


def build_all(log=print):
    out = {}
    for name, fn in MODELS.items():
        parts = fn()
        lo, hi = parts.bounds()
        out[name] = parts
        log(f'  · {name}: {len(parts.groups)} materials, {parts.tri_count()} triangles, '
            f'bbox {tuple(round(v, 2) for v in lo)}..{tuple(round(v, 2) for v in hi)}')
    return out
