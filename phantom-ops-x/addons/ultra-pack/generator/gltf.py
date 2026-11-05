"""Minimal, spec-correct glTF 2.0 / GLB writer (binary, embedded PNG textures).

Only what we need: one buffer, float32 positions/normals/UVs, uint32 indices,
PBR metallic-roughness materials with baseColor / metallicRoughness / normal /
emissive textures, embedded images, repeat samplers. Validated by
`gltf-transform inspect` in CI.
"""
from __future__ import annotations

import json
import struct

REPEAT = 10497
LINEAR = 9729
LINEAR_MIPMAP_LINEAR = 9987


class GLB:
    def __init__(self, generator='phantom-ultra-pack'):
        self.generator = generator
        self.bin = bytearray()
        self.meshes = []
        self.nodes = []
        self.materials = []
        self.textures = []
        self.images = []
        self.samplers = [{"wrapS": REPEAT, "wrapT": REPEAT,
                          "magFilter": LINEAR, "minFilter": LINEAR_MIPMAP_LINEAR}]
        self.accessors = []
        self.buffer_views = []
        self._mat_index = {}
        self._image_index = {}
        self._texture_index = {}

    # ------------------------------------------------------------------ low level
    def _align(self, n=4):
        while len(self.bin) % n:
            self.bin.append(0)

    def _view(self, data: bytes, target: int | None = None):
        self._align(4)
        offset = len(self.bin)
        self.bin.extend(data)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self.buffer_views.append(view)
        return len(self.buffer_views) - 1

    def _accessor(self, view, component_type, count, type_, minmax=None):
        acc = {"bufferView": view, "componentType": component_type, "count": count, "type": type_}
        if minmax:
            acc["min"] = minmax[0]
            acc["max"] = minmax[1]
        self.accessors.append(acc)
        return len(self.accessors) - 1

    # ------------------------------------------------------------------ textures
    def image(self, name, png_bytes):
        if name in self._image_index:
            return self._image_index[name]
        view = self._view(png_bytes)
        self.images.append({"name": name, "bufferView": view, "mimeType": "image/png"})
        idx = len(self.images) - 1
        self._image_index[name] = idx
        self.textures.append({"sampler": 0, "source": idx})
        self._texture_index[name] = len(self.textures) - 1
        return idx

    def material(self, name, *, base_color=None, mr=None, normal=None, emissive=None,
                 emissive_factor=(1.0, 1.0, 1.0), roughness=1.0, metalness=1.0,
                 base_color_factor=(1.0, 1.0, 1.0, 1.0), double_sided=False,
                 alpha=1.0, normal_scale=1.0):
        if name in self._mat_index:
            return self._mat_index[name]
        pbr = {
            "baseColorFactor": list(base_color_factor),
            "metallicFactor": metalness,
            "roughnessFactor": roughness,
        }
        if base_color:
            pbr["baseColorTexture"] = {"index": self._texture_index[base_color]}
        if mr:
            pbr["metallicRoughnessTexture"] = {"index": self._texture_index[mr]}
        mat = {"name": name, "pbrMetallicRoughness": pbr, "doubleSided": double_sided}
        if normal:
            mat["normalTexture"] = {"index": self._texture_index[normal], "scale": normal_scale}
        if emissive:
            mat["emissiveTexture"] = {"index": self._texture_index[emissive]}
            mat["emissiveFactor"] = list(emissive_factor)
        if alpha < 1.0:
            mat["alphaMode"] = "BLEND"
            pbr["baseColorFactor"] = list(base_color_factor[:3]) + [alpha]
        self.materials.append(mat)
        self._mat_index[name] = len(self.materials) - 1
        return self._mat_index[name]

    # ------------------------------------------------------------------ geometry
    def mesh(self, name, groups):
        """groups: {material_name: {'pos': [...], 'nrm': [...], 'uv': [...], 'idx': [...]}}"""
        prims = []
        for mat_name, g in groups.items():
            if not g['idx']:
                continue
            pos = b''.join(struct.pack('<3f', *p) for p in g['pos'])
            nrm = b''.join(struct.pack('<3f', *p) for p in g['nrm'])
            uv = b''.join(struct.pack('<2f', *p) for p in g['uv'])
            idx = struct.pack('<%dI' % len(g['idx']), *g['idx'])
            lo = [min(p[k] for p in g['pos']) for k in range(3)]
            hi = [max(p[k] for p in g['pos']) for k in range(3)]
            a_pos = self._accessor(self._view(pos, 34962), 5126, len(g['pos']), 'VEC3', (lo, hi))
            a_nrm = self._accessor(self._view(nrm, 34962), 5126, len(g['nrm']), 'VEC3')
            a_uv = self._accessor(self._view(uv, 34962), 5126, len(g['uv']), 'VEC2')
            a_idx = self._accessor(self._view(idx, 34963), 5125, len(g['idx']), 'SCALAR')
            prims.append({
                "attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": a_uv},
                "indices": a_idx,
                "material": self._mat_index[mat_name],
                "mode": 4,
            })
        self.meshes.append({"name": name, "primitives": prims})
        mesh_index = len(self.meshes) - 1
        self.nodes.append({"name": name, "mesh": mesh_index})
        return mesh_index

    # ------------------------------------------------------------------ output
    def to_glb(self):
        self._align(4)
        gltf = {
            "asset": {"version": "2.0", "generator": self.generator},
            "scene": 0,
            "scenes": [{"name": "PhantomUltra", "nodes": list(range(len(self.nodes)))}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "textures": self.textures,
            "images": self.images,
            "samplers": self.samplers,
            "accessors": self.accessors,
            "bufferViews": self.buffer_views,
            "buffers": [{"byteLength": len(self.bin)}],
        }
        json_bytes = json.dumps(gltf, separators=(',', ':'), allow_nan=False).encode('utf-8')
        while len(json_bytes) % 4:
            json_bytes += b' '
        bin_bytes = bytes(self.bin)
        while len(bin_bytes) % 4:
            bin_bytes += b'\0'
        total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
        out = bytearray()
        out += struct.pack('<III', 0x46546C67, 2, total)
        out += struct.pack('<II', len(json_bytes), 0x4E4F534A) + json_bytes
        out += struct.pack('<II', len(bin_bytes), 0x004E4942) + bin_bytes
        return bytes(out)

    def stats(self):
        tris = 0
        verts = 0
        for m in self.meshes:
            for p in m["primitives"]:
                verts += self.accessors[p["attributes"]["POSITION"]]["count"]
                tris += self.accessors[p["indices"]]["count"] // 3
        return {"meshes": len(self.meshes), "materials": len(self.materials),
                "images": len(self.images), "triangles": tris, "vertices": verts}
