#!/usr/bin/env python3
"""Build the PHANTOM OPS X «ULTRA PACK» add-on archive.

    python3 build_pack.py --out ../dist --size 1024

Produces (all deterministic, no network access):
    dist/phantom-ultra-v1.0.0.zip     the downloadable add-on (ZIP_STORED)
    dist/pack.json                    copy of the manifest inside the zip
    dist/SHA256SUMS.txt               hashes for the release page
    dist/catalog-entry.json           ready-to-paste entry for app/ultra-packs.json

The archive is stored uncompressed on purpose: PNG payloads are already
deflated, and the in-game loader implements a tiny STORE-only ZIP reader, so
the add-on needs zero third-party code at runtime.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import models  # noqa: E402
import textures  # noqa: E402
from gltf import GLB  # noqa: E402

PACK_NAME = 'PHANTOM ULTRA PACK'
PACK_VERSION = '1.0.0'

# material name -> (albedo?, normal?, mr?, emissive?)
MATERIAL_TEXTURES = {
    'u:carbon': 'carbon',
    'u:steel': 'steel',
    'u:neon': 'neon',
    'u:trim': 'gold',
    'u:glass': 'glass',
    'u:fabric': 'camo',
    'u:hull': 'panel',
    'u:concrete': 'concrete',
}

MODEL_META = {
    'rifle_ultra': {'role': 'first-person primary weapon', 'scale': 1.0, 'rotate': 0.0},
    'sidearm_ultra': {'role': 'first-person sidearm', 'scale': 1.0, 'rotate': 0.0},
    'operator_ultra': {'role': 'enemy / friendly operator body', 'scale': 1.0, 'rotate': 0.0},
    'crate_ultra': {'role': 'map prop: supply crate', 'scale': 1.0, 'rotate': 0.0},
    'tower_ultra': {'role': 'map prop: neon pylon', 'scale': 1.0, 'rotate': 0.0},
    'drone_ultra': {'role': 'map prop: recon drone', 'scale': 1.0, 'rotate': 0.0},
}


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def write_model_glb(parts, path):
    glb = GLB()
    for mat_name in parts.groups:
        base = mat_name.replace('u:', '')
        if base == 'glass':
            glb.material(mat_name, base_color_factor=(0.62, 0.78, 0.92, 1.0), roughness=0.08,
                         metalness=0.2, alpha=0.34, double_sided=True)
        elif base == 'neon':
            glb.material(mat_name, emissive_factor=(0.16, 0.85, 1.0), roughness=0.4, metalness=0.6)
        elif base == 'gold':
            glb.material(mat_name, base_color_factor=(1.0, 0.82, 0.42, 1.0), roughness=0.24,
                         metalness=1.0)
        else:
            glb.material(mat_name, roughness=1.0, metalness=1.0)
    glb.mesh('mesh', parts.groups)
    data = glb.to_glb()
    with open(path, 'wb') as fh:
        fh.write(data)
    return glb.stats(), len(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'dist'))
    ap.add_argument('--size', type=int, default=1024)
    ap.add_argument('--tex', action='store_true', help='(re)generate textures')
    ap.add_argument('--keep', action='store_true', help='keep the staging tree')
    args = ap.parse_args()

    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    stage = os.path.join(root, 'build', 'stage')
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    if os.path.isdir(stage):
        shutil.rmtree(stage)
    os.makedirs(stage, exist_ok=True)

    print('▶ textures (procedural, computed texel by texel)')
    tex_manifest = textures.generate_all(stage, size=args.size, log=print)

    print('▶ 3D models (analytic primitives → indexed GLB)')
    parts = models.build_all(log=print)
    total_tris = 0
    model_manifest = {}
    os.makedirs(os.path.join(stage, 'models'), exist_ok=True)
    for name, pm in parts.items():
        path = os.path.join(stage, 'models', f'{name}.glb')
        stats, nbytes = write_model_glb(pm, path)
        total_tris += stats['triangles']
        meta = dict(MODEL_META.get(name, {}))
        meta.update({'file': f'models/{name}.glb', 'bytes': nbytes, **stats})
        model_manifest[name] = meta
        print(f'    {name}.glb  {nbytes / 1024:.0f} KB  {stats["triangles"]} tris')

    files = {}
    for dirpath, _dirs, names in os.walk(stage):
        for n in sorted(names):
            full = os.path.join(dirpath, n)
            rel = os.path.relpath(full, stage).replace(os.sep, '/')
            files[rel] = {'bytes': os.path.getsize(full), 'sha256': sha256_file(full)}

    texels = 0
    for base, entry in tex_manifest.items():
        if base.startswith('__'):
            continue
        for _key in entry:
            texels += args.size * args.size

    manifest = {
        'name': PACK_NAME,
        'version': PACK_VERSION,
        'format': 1,
        'built': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'generator': 'phantom-ultra-pack/build_pack.py',
        'notes': ('Procedurally authored PBR texture sets and 3D models for PHANTOM OPS X. '
                  'No third-party assets; every texel and vertex is generated by the builder.'),
        'materials': MATERIAL_TEXTURES,
        'texture_sets': tex_manifest,
        'models': model_manifest,
        'sky': {'file': 'sky/neon_dusk_equirect.png', 'mapping': 'equirectangular',
                'width': 2048, 'height': 1024},
        'facts': {
            'triangles': total_tris,
            'texels': texels,
            'texture_sets': len(MATERIAL_TEXTURES),
            'models': len(model_manifest),
            'files': len(files),
        },
        'files': files,
    }
    with open(os.path.join(stage, 'pack.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write('\n')

    zip_name = f'phantom-ultra-v{PACK_VERSION}.zip'
    zip_path = os.path.join(out, zip_name)
    print(f'▶ packing {zip_name} (STORE, in-game readable)')
    entries = []
    for dirpath, _dirs, names in os.walk(stage):
        for n in sorted(names):
            full = os.path.join(dirpath, n)
            entries.append((full, os.path.relpath(full, stage).replace(os.sep, '/')))
    entries.sort(key=lambda e: e[1])
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
        for full, rel in entries:
            info = zipfile.ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = 0o644 << 16
            with open(full, 'rb') as src:
                zf.writestr(info, src.read())
    size = os.path.getsize(zip_path)
    digest = sha256_file(zip_path)
    print(f'✔ {zip_path}  {size / (1024 * 1024):.1f} MB  sha256={digest}')

    shutil.copy2(os.path.join(stage, 'pack.json'), os.path.join(out, 'pack.json'))
    with open(os.path.join(out, 'SHA256SUMS.txt'), 'w', encoding='utf-8') as fh:
        fh.write(f'{digest}  {zip_name}\n')
    catalog = {
        'id': 'ultra',
        'name': 'ULTRA GRAPHICS PACK',
        'version': PACK_VERSION,
        'url': f'https://github.com/amingangmanatgh2-hash/gaming-hub/releases/download/phantom-ultra-v{PACK_VERSION}/{zip_name}',
        'bytes': size,
        'sha256': digest,
        'contains': {
            'materialSets': len(MATERIAL_TEXTURES),
            'models': len(model_manifest),
            'triangles': total_tris,
            'texels': texels,
        },
        'notes': 'PBR albedo/normal/metallic-roughness/emissive sets plus six 3D models and an HDR-style equirect sky.',
    }
    with open(os.path.join(out, 'catalog-entry.json'), 'w', encoding='utf-8') as fh:
        json.dump(catalog, fh, indent=2)
        fh.write('\n')

    if not args.keep:
        shutil.rmtree(stage, ignore_errors=True)
    print('✔ done')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
