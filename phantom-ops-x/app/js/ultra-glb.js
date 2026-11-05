// PHANTOM OPS X — minimal, dependency-free glTF 2.0 / GLB reader.
//
// The Ultra Pack ships static, indexed triangle meshes with PBR metallic-
// roughness materials and no animations, so a focused parser is both smaller
// and safer than pulling in a general-purpose loader (the base app stays light:
// this file is ~4 KB instead of a 160 KB loader bundle).
//
// Supported: GLB container, JSON+BIN chunks, accessors (float32 / uint16 /
// uint32 / uint8), POSITION / NORMAL / TEXCOORD_0, node matrices + TRS,
// material names (the `u:*` contract), baseColorFactor, emissiveFactor,
// doubleSided, alphaMode BLEND. Unsupported features are reported, not guessed.

const COMPONENTS = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function parseContainer(buffer) {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error('not a GLB file');
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`unsupported glTF container version ${version}`);
  const length = view.getUint32(8, true);
  if (length > buffer.byteLength) throw new Error('truncated GLB');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(buffer, start, chunkLength)));
    } else if (chunkType === 0x004e4942) {
      bin = new Uint8Array(buffer, start, chunkLength);
    }
    offset = start + chunkLength;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const TypedArray = COMPONENTS[accessor.componentType];
  if (!TypedArray) throw new Error(`unsupported accessor componentType ${accessor.componentType}`);
  const components = TYPE_SIZE[accessor.type];
  const count = accessor.count;
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const byteStride = bufferView.byteStride;
  const elSize = TypedArray.BYTES_PER_ELEMENT;
  if (!byteStride || byteStride === elSize * components) {
    const start = bin.byteOffset + byteOffset;
    return new TypedArray(bin.buffer, start, count * components);
  }
  // strided accessor: copy element by element
  const out = new TypedArray(count * components);
  const src = new DataView(bin.buffer, bin.byteOffset + byteOffset);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < components; c++) {
      const o = i * byteStride + c * elSize;
      out[i * components + c] = TypedArray === Float32Array ? src.getFloat32(o, true)
        : TypedArray === Uint16Array ? src.getUint16(o, true) : src.getUint32(o, true);
    }
  }
  return out;
}

function materialDescription(gltf, index) {
  const src = (gltf.materials || [])[index];
  if (!src) return { name: 'u:carbon', color: 0xffffff };
  const pbr = src.pbrMetallicRoughness || {};
  const bcf = pbr.baseColorFactor || [1, 1, 1, 1];
  const emf = src.emissiveFactor || [0, 0, 0];
  return {
    name: src.name || `material_${index}`,
    color: { r: bcf[0], g: bcf[1], b: bcf[2] },
    opacity: bcf[3] === undefined ? 1 : bcf[3],
    transparent: src.alphaMode === 'BLEND',
    doubleSided: !!src.doubleSided,
    emissive: { r: emf[0], g: emf[1], b: emf[2] },
    roughness: pbr.roughnessFactor === undefined ? 1 : pbr.roughnessFactor,
    metalness: pbr.metallicFactor === undefined ? 1 : pbr.metallicFactor,
  };
}

/**
 * Parse a GLB ArrayBuffer into a THREE.Group.
 * @param {object} THREE three.js module namespace
 * @param {ArrayBuffer} arrayBuffer
 */
export function parseGLB(THREE, arrayBuffer) {
  const { json, bin } = parseContainer(arrayBuffer);
  if ((json.animations || []).length) throw new Error('animated GLB is not supported by the ultra reader');
  const materials = (json.materials || []).map((_, i) => materialDescription(json, i));
  const cache = new Map();

  function buildMesh(meshIndex) {
    const mesh = json.meshes[meshIndex];
    const group = new THREE.Group();
    group.name = mesh.name || `mesh_${meshIndex}`;
    for (const prim of mesh.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) continue; // triangles only
      const geo = new THREE.BufferGeometry();
      const position = readAccessor(json, bin, prim.attributes.POSITION);
      geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
      if (prim.attributes.NORMAL !== undefined) {
        geo.setAttribute('normal', new THREE.BufferAttribute(readAccessor(json, bin, prim.attributes.NORMAL), 3));
      } else {
        geo.computeVertexNormals();
      }
      if (prim.attributes.TEXCOORD_0 !== undefined) {
        geo.setAttribute('uv', new THREE.BufferAttribute(readAccessor(json, bin, prim.attributes.TEXCOORD_0), 2));
      }
      if (prim.indices !== undefined) {
        const idx = readAccessor(json, bin, prim.indices);
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      geo.computeBoundingSphere();
      const desc = materials[prim.material] || { name: 'u:carbon' };
      const mat = new THREE.MeshStandardMaterial({
        name: desc.name,
        color: new THREE.Color(desc.color.r, desc.color.g, desc.color.b),
        roughness: desc.roughness,
        metalness: desc.metalness,
        emissive: new THREE.Color(desc.emissive.r, desc.emissive.g, desc.emissive.b),
        transparent: desc.transparent,
        opacity: desc.opacity,
        side: desc.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        depthWrite: !desc.transparent,
      });
      const m = new THREE.Mesh(geo, mat);
      m.name = desc.name;
      group.add(m);
    }
    return group;
  }

  function applyNodeTransform(obj, node) {
    if (node.matrix) {
      const m = new THREE.Matrix4().fromArray(node.matrix);
      m.decompose(obj.position, obj.quaternion, obj.scale);
    }
    if (node.translation) obj.position.fromArray(node.translation);
    if (node.rotation) obj.quaternion.fromArray(node.rotation);
    if (node.scale) obj.scale.fromArray(node.scale);
  }

  const root = new THREE.Group();
  root.name = 'ultra_glb';
  const nodes = json.nodes || [];
  const sceneNodes = (json.scenes && json.scenes[json.scene || 0]?.nodes) || nodes.map((_, i) => i);
  for (const nodeIndex of sceneNodes) {
    const node = nodes[nodeIndex];
    if (!node) continue;
    if (node.mesh === undefined) continue;
    let obj = cache.get(node.mesh);
    if (!obj) { obj = buildMesh(node.mesh); cache.set(node.mesh, obj); }
    const wrapper = new THREE.Group();
    wrapper.name = node.name || `node_${nodeIndex}`;
    wrapper.add(obj.clone(true));
    applyNodeTransform(wrapper, node);
    root.add(wrapper);
  }
  return root;
}

/** Count triangles + report material names, used by the UI and by tests. */
export function describeGLB(arrayBuffer) {
  const { json } = parseContainer(arrayBuffer);
  let triangles = 0;
  let vertices = 0;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives) {
      triangles += json.accessors[prim.indices].count / 3;
      vertices += json.accessors[prim.attributes.POSITION].count;
    }
  }
  return {
    triangles,
    vertices,
    materials: (json.materials || []).map((m) => m.name),
    meshes: (json.meshes || []).length,
    generator: json.asset?.generator,
    version: json.asset?.version,
  };
}
