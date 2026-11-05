"""Read a .glb back into flat arrays (validates the pack's models end-to-end).

Returns models as lists of parts: {material, pos, nrm, uv, idx}. We deliberately
parse the *shipped* GLB files (not the in-memory meshes) so the promo reel is
rendered from exactly the bytes users download.
"""
from __future__ import annotations

import json
import struct

COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, 'not a GLB'
    assert version == 2, f'glTF version {version}'
    assert length == len(data), f'length mismatch {length} != {len(data)}'
    off = 12
    gltf = None
    bin_chunk = b''
    while off < len(data):
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        off += 8 + clen
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            bin_chunk = chunk
    assert gltf is not None, 'missing JSON chunk'

    def accessor(idx):
        acc = gltf['accessors'][idx]
        view = gltf['bufferViews'][acc['bufferView']]
        fmt, size = COMP[acc['componentType']]
        n = NCOMP[acc['type']]
        stride = view.get('byteStride') or size * n
        base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        out = []
        for i in range(acc['count']):
            o = base + i * stride
            out.append(struct.unpack_from('<' + fmt * n, bin_chunk, o))
        return out

    materials = [m.get('name', f'mat{i}') for i, m in enumerate(gltf.get('materials', []))]
    models = []
    for mesh in gltf['meshes']:
        parts = []
        for prim in mesh['primitives']:
            attrs = prim['attributes']
            idx = [v[0] for v in accessor(prim['indices'])]
            parts.append({
                'material': materials[prim['material']],
                'pos': accessor(attrs['POSITION']),
                'nrm': accessor(attrs['NORMAL']),
                'uv': accessor(attrs['TEXCOORD_0']),
                'idx': idx,
            })
        models.append({'name': mesh.get('name', ''), 'parts': parts})
    meta = {
        'nodes': len(gltf.get('nodes', [])),
        'materials': materials,
        'images': len(gltf.get('images', [])),
        'asset': gltf.get('asset', {}),
    }
    return models, meta
