#!/usr/bin/env python3
"""Pack the Ultra Pack (GLB models + PNG PBR sets + sky) into a .psc bundle for
tools/reel/render.c.

    python3 export_scene.py --pack <dir-with-pack.json> --out /tmp/reel/bundle.psc
"""
from __future__ import annotations

import argparse
import io
import json
import os
import struct
import sys
import zipfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb_read import read_glb  # noqa: E402

MODEL_ORDER = ['rifle_ultra', 'sidearm_ultra', 'operator_ultra',
               'crate_ultra', 'tower_ultra', 'drone_ultra']

# material name in GLB -> texture set name in pack.json
MAT_SET = {
    'u:carbon': 'carbon', 'u:steel': 'steel', 'u:neon': 'neon', 'u:trim': 'gold',
    'u:glass': 'glass', 'u:fabric': 'camo', 'u:hull': 'panel', 'u:concrete': 'concrete',
}
ROLE = {'u:carbon': (1.0, 1.0, 1.0), 'u:steel': (1.0, 1.0, 1.0), 'u:neon': (1.0, 1.0, 1.0),
        'u:trim': (1.0, 1.0, 1.0), 'u:glass': (1.0, 1.0, 1.0), 'u:fabric': (1.0, 1.0, 1.0),
        'u:hull': (1.0, 1.0, 1.0)}
EMIS_SCALE = {'u:neon': 1.0, 'u:hull': 0.55}


def load_rgba(data, size=None):
    im = Image.open(io.BytesIO(data) if isinstance(data, (bytes, bytearray)) else data).convert('RGBA')
    if size and im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    arr = np.asarray(im, dtype=np.uint8)
    return arr.shape[1], arr.shape[0], arr.tobytes()


def main():
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--pack', help='extracted pack directory')
    src.add_argument('--zip', help='pack archive (.zip)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--tex-size', type=int, default=1024)
    args = ap.parse_args()

    if args.zip:
        zf = zipfile.ZipFile(args.zip)
        reader = lambda rel: zf.read(rel)  # noqa: E731
        manifest = json.loads(reader('pack.json'))
        print(f'pack: {args.zip}')
    else:
        reader = lambda rel: open(os.path.join(args.pack, rel), 'rb').read()  # noqa: E731
        with open(os.path.join(args.pack, 'pack.json'), encoding='utf-8') as fh:
            manifest = json.load(fh)

    keys = ['albedo', 'normal', 'mr', 'emissive']
    tex_bytes = []
    tex_index = {}          # (set, key) -> texture index
    for set_name in MAT_SET.values():
        entry = manifest['texture_sets'][set_name]
        for key in keys:
            if key not in entry:
                continue
            w, h, raw = load_rgba(reader(entry[key]), args.tex_size)
            tex_index[(set_name, key)] = len(tex_bytes)
            tex_bytes.append((w, h, 1 if key == 'albedo' else 0, raw))
            print(f'  tex {set_name}_{key} {w}x{h} {len(raw) / 1024:.0f} KB')

    w, h, raw = load_rgba(reader(manifest['sky']['file']), args.tex_size * 2)
    sky_index = len(tex_bytes)
    tex_bytes.append((w, h, 1, raw))
    print(f'  tex sky {w}x{h}')

    # materials, in first-seen order across the models
    mat_index = {}
    mat_defs = []
    models_raw = {}
    for name in MODEL_ORDER:
        models, meta = read_glb(manifest['models'][name]['file'], data=reader(manifest['models'][name]['file']))
        tris = sum(len(p['idx']) // 3 for m in models for p in m['parts'])
        print(f'  model {name}: {tris} tris, materials={meta["materials"]}')
        merged = {'name': name, 'parts': []}
        for m in models:
            for part in m['parts']:
                mname = part['material']
                if mname not in mat_index:
                    set_name = MAT_SET.get(mname, 'carbon')
                    mat_index[mname] = len(mat_defs)
                    mat_defs.append({
                        'set': set_name,
                        'albedo': tex_index.get((set_name, 'albedo'), -1),
                        'normal': tex_index.get((set_name, 'normal'), -1),
                        'mr': tex_index.get((set_name, 'mr'), -1),
                        'emissive': tex_index.get((set_name, 'emissive'), -1),
                        'emis_scale': EMIS_SCALE.get(mname, 0.0),
                        'base': ROLE.get(mname, (1.0, 1.0, 1.0)),
                        'normal_strength': 0.55 if mname == 'u:fabric' else 1.0,
                        'blend': 1 if mname == 'u:glass' else 0,
                    })
                merged['parts'].append({
                    'mat': mat_index[mname],
                    'pos': part['pos'], 'nrm': part['nrm'],
                    'uv': part['uv'], 'idx': part['idx'],
                })
        models_raw[name] = merged

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    total_tris = 0
    with open(args.out, 'wb') as fh:
        fh.write(b'PSC2')
        fh.write(struct.pack('<i', len(tex_bytes)))
        for (tw, th, srgb, raw) in tex_bytes:
            fh.write(struct.pack('<iii', tw, th, srgb))
            fh.write(raw)
        fh.write(struct.pack('<i', len(mat_defs)))
        for m in mat_defs:
            fh.write(struct.pack('<iiiif', m['albedo'], m['normal'], m['mr'], m['emissive'], m['emis_scale']))
            fh.write(struct.pack('<4f', *m['base'], 1.0))
            fh.write(struct.pack('<fi', m['normal_strength'], m['blend']))
        fh.write(struct.pack('<i', len(MODEL_ORDER)))
        for name in MODEL_ORDER:
            m = models_raw[name]
            fh.write(struct.pack('<i', len(m['parts'])))
            for part in m['parts']:
                nv = len(part['pos'])
                ni = len(part['idx'])
                total_tris += ni // 3
                fh.write(struct.pack('<iii', part['mat'], nv, ni))
                fh.write(struct.pack('<%df' % (nv * 3), *[c for p in part['pos'] for c in p]))
                fh.write(struct.pack('<%df' % (nv * 3), *[c for p in part['nrm'] for c in p]))
                fh.write(struct.pack('<%df' % (nv * 2), *[c for p in part['uv'] for c in p]))
                fh.write(struct.pack('<%dI' % ni, *part['idx']))
    print(f'✔ {args.out}  {os.path.getsize(args.out) / (1024 * 1024):.1f} MB  '
          f'{len(mat_defs)} materials  {total_tris} triangles  sky_tex={sky_index}')


if __name__ == '__main__':
    main()
