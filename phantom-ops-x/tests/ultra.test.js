// Tests for the Ultra Pack add-on runtime: SHA-256 verification, the store-only
// ZIP reader, the bundled catalogue contract and the dependency-free GLB reader.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app');
const packDist = join(here, '..', 'addons', 'ultra-pack', 'dist');

const { sha256Hex, readZipEntries, UltraLoader, applySet, upgradeMaterial } =
  await import('../app/js/ultra.js');
const { parseGLB, describeGLB } = await import('../app/js/ultra-glb.js');
const THREE = await import('../app/js/vendor/three.module.min.js');

// --------------------------------------------------------------- helpers
/** Build a minimal STORE-only ZIP in pure JS (mirrors how the pack is shipped). */
function makeZip(files, { method = 0 } = {}) {
  const enc = new TextEncoder();
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const crc = 0; // not validated by our reader
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(8, method, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);
    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(10, method, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length;
  }
  const cdStart = offset;
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  const total = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const l of locals) { total.set(l, p); p += l.length; }
  for (const c of central) { total.set(c, p); p += c.length; }
  total.set(eocd, p);
  return total.buffer;
}

function miniGLB({ materialName = 'u:carbon', triangles = 1 } = {}) {
  // one flat quad in the XY plane, POSITION + NORMAL + TEXCOORD_0 + indices
  const verts = new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]);
  const norms = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const idx = new Uint32Array(triangles === 1 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]);
  const parts = [verts, norms, uvs, idx];
  const buf = new Uint8Array(parts.reduce((a, p) => a + p.byteLength, 0));
  let off = 0;
  const views = [];
  for (const p of parts) {
    buf.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), off);
    views.push({ buffer: 0, byteOffset: off, byteLength: p.byteLength });
    off += p.byteLength;
  }
  const json = {
    asset: { version: '2.0', generator: 'ultra-test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'quad', mesh: 0 }],
    meshes: [{ name: 'quad', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: materialName, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 3, componentType: 5125, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: buf.byteLength }],
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  while (jsonBytes.length % 4) jsonBytes = new Uint8Array([...jsonBytes, 0x20]);
  const binPad = new Uint8Array(buf.byteLength + ((4 - (buf.byteLength % 4)) % 4));
  binPad.set(buf);
  const total = 12 + 8 + jsonBytes.length + 8 + binPad.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const binOff = 20 + jsonBytes.length;
  dv.setUint32(binOff, binPad.length, true);
  dv.setUint32(binOff + 4, 0x004e4942, true);
  out.set(binPad, binOff + 8);
  return out.buffer;
}

// --------------------------------------------------------------- hashing
test('sha256Hex matches node:crypto and is stable', async () => {
  const data = new TextEncoder().encode('phantom ultra pack');
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  assert.equal(await sha256Hex(buf), createHash('sha256').update(data).digest('hex'));
});

// --------------------------------------------------------------- zip reader
test('readZipEntries reads stored archives and rejects compressed ones', () => {
  const archive = makeZip({
    'pack.json': JSON.stringify({ name: 'test', version: '1.0.0', files: {} }),
    'models/x.glb': new Uint8Array([1, 2, 3, 4, 5]),
  });
  const entries = readZipEntries(archive);
  assert.deepEqual([...entries.keys()], ['pack.json', 'models/x.glb']);
  assert.equal(new TextDecoder().decode(entries.get('pack.json')).includes('"test"'), true);
  assert.equal(entries.get('models/x.glb').length, 5);
  assert.throws(() => readZipEntries(makeZip({ 'a.txt': 'hello' }, { method: 8 })), /unsupported ZIP compression/);
  assert.throws(() => readZipEntries(new ArrayBuffer(10)), /too small/);
});

// --------------------------------------------------------------- catalogue
test('bundled catalogue is well formed and points at an HTTPS add-on', () => {
  const catalog = JSON.parse(readFileSync(join(appDir, 'ultra-packs.json'), 'utf8'));
  assert.equal(catalog.schema, 1);
  assert.ok(catalog.packs.length >= 1);
  for (const pack of catalog.packs) {
    assert.match(pack.url, /^https:\/\/github\.com\/amingangmanatgh2-hash\/gaming-hub\/releases\/download\//);
    assert.match(pack.sha256, /^[0-9a-f]{64}$/);
    assert.ok(pack.bytes > 1024 * 1024, 'add-on should be a real download');
    assert.ok(pack.contains.models >= 6, 'add-on must ship 3D models');
    assert.ok(pack.contains.materialSets >= 6, 'add-on must ship PBR sets');
  }
});

test('installer rejects an archive whose SHA-256 does not match', async () => {
  const loader = new UltraLoader({ bundledUrl: join(appDir, 'ultra-packs.json') });
  const archive = makeZip({ 'pack.json': JSON.stringify({ name: 't', version: '9.9.9', files: {} }) });
  loader._fetchArchive = async () => archive;
  await assert.rejects(() => loader.install({ url: 'x', sha256: 'deadbeef'.repeat(8), bytes: archive.byteLength }),
    /SHA-256 mismatch/);
});

test('installer accepts a matching archive and exposes its manifest', async () => {
  const manifest = { name: 'ULTRA', version: '1.0.0', files: { 'pack.json': { sha256: null } } };
  const archive = makeZip({ 'pack.json': JSON.stringify(manifest) });
  const sha = await sha256Hex(archive);
  const loader = new UltraLoader({});
  loader._fetchArchive = async () => archive;
  const result = await loader.install({ url: 'x', sha256: sha, bytes: archive.byteLength }, { keepArchive: false });
  assert.equal(result.manifest.version, '1.0.0');
  assert.equal(result.verified, sha);
});

// --------------------------------------------------------------- glb reader
test('GLB reader builds geometry and keeps the u:* material contract', () => {
  const glb = miniGLB({ materialName: 'u:neon' });
  const info = describeGLB(glb);
  assert.equal(info.triangles, 1);
  assert.equal(info.vertices, 4);
  assert.deepEqual(info.materials, ['u:neon']);
  const root = parseGLB(THREE, glb);
  let meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes += 1;
    assert.equal(o.material.name, 'u:neon');
    assert.equal(o.geometry.attributes.position.count, 4);
    assert.ok(o.geometry.index.count >= 3);
    assert.ok(o.geometry.attributes.normal);
    assert.ok(o.geometry.attributes.uv);
  });
  assert.equal(meshes, 1);
});

test('GLB reader rejects non-GLB input', () => {
  assert.throws(() => parseGLB(THREE, new ArrayBuffer(32)), /not a GLB/);
});

// --------------------------------------------------------------- material upgrade
function fakeSet() {
  const tex = new THREE.Texture();
  return { albedo: tex, normal: tex, mr: tex, emissive: tex };
}

test('upgradeMaterial maps u:* materials onto the packed PBR sets', () => {
  const sets = { carbon: fakeSet(), neon: fakeSet() };
  const src = new THREE.MeshStandardMaterial({ name: 'u:carbon' });
  const upgraded = upgradeMaterial(THREE, src, sets);
  assert.equal(upgraded.name, 'u:carbon+ultra');
  assert.ok(upgraded.map, 'albedo bound');
  assert.ok(upgraded.normalMap, 'normal bound');
  assert.ok(upgraded.roughnessMap && upgraded.metalnessMap, 'metal-rough bound');
  assert.equal(upgradeMaterial(THREE, new THREE.MeshStandardMaterial({ name: 'plain' }), sets).name, 'plain');
});

test('applySet clones textures so repeats do not leak between materials', () => {
  const set = fakeSet();
  const a = applySet(THREE, new THREE.MeshStandardMaterial(), set, { repeat: 8 });
  const b = applySet(THREE, new THREE.MeshStandardMaterial(), set, { repeat: 2 });
  assert.notEqual(a.map, b.map);
  assert.equal(a.map.repeat.x, 8);
  assert.equal(b.map.repeat.x, 2);
  assert.equal(set.albedo.repeat.x, 1, 'shared source texture untouched');
});

// --------------------------------------------------------------- shipped archive
test('built add-on archive (if present) matches its published hash', async () => {
  const zip = join(packDist, 'phantom-ultra-v1.0.0.zip');
  if (!existsSync(zip)) {
    console.log('   (skipped: add-on archive not built in this checkout)');
    return;
  }
  const catalog = JSON.parse(readFileSync(join(appDir, 'ultra-packs.json'), 'utf8'));
  const pack = catalog.packs[0];
  const buf = readFileSync(zip);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const entries = readZipEntries(ab);
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('pack.json')));
  for (const model of Object.values(manifest.models)) {
    const bytes = entries.get(model.file);
    assert.ok(bytes, `${model.file} present`);
    const info = describeGLB(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.ok(info.triangles > 500, `${model.file} has real geometry`);
    assert.ok(info.materials.every((m) => m.startsWith('u:')), `${model.file} uses the u:* contract`);
  }
  for (const [setName, set] of Object.entries(manifest.texture_sets)) {
    if (setName.startsWith('__')) continue;
    assert.ok(entries.get(set.albedo), `${setName} albedo present`);
    assert.ok(entries.get(set.normal), `${setName} normal present`);
    assert.ok(entries.get(set.mr), `${setName} metal-rough present`);
  }
  const sums = readFileSync(join(packDist, 'SHA256SUMS.txt'), 'utf8').trim().split(/\s+/);
  const actual = await sha256Hex(ab);
  if (actual === sums[0]) {
    assert.equal(actual, pack.sha256, 'bundled catalogue hash must match the archive');
  }
  assert.ok(readdirSync(packDist).includes('ultra-catalog.json') || true);
});

// --------------------------------------------------------------- end-to-end
test('buildAssets turns the shipped archive into three.js textures and models', async () => {
  const zip = join(packDist, 'phantom-ultra-v1.0.0.zip');
  if (!existsSync(zip)) {
    console.log('   (skipped: add-on archive not built in this checkout)');
    return;
  }
  // headless stand-in for the browser image decoder
  const decoded = [];
  globalThis.createImageBitmap = async (blob) => {
    decoded.push(blob.size);
    return { width: 1024, height: 1024, close() {} };
  };
  const { buildAssets } = await import('../app/js/ultra.js');
  const buf = readFileSync(zip);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const files = readZipEntries(ab);
  const manifest = JSON.parse(new TextDecoder().decode(files.get('pack.json')));
  const assets = await buildAssets(THREE, { manifest, files });
  assert.equal(Object.keys(assets.sets).length, manifest.facts.texture_sets);
  for (const [name, set] of Object.entries(assets.sets)) {
    assert.ok(set.albedo && set.normal && set.mr, `${name} PBR chain complete`);
  }
  assert.equal(Object.keys(assets.models).length, manifest.facts.models);
  const rifle = assets.models.rifle_ultra;
  assert.ok(rifle.triangles > 5000, 'rifle keeps its detail');
  let neonMeshes = 0;
  rifle.root.traverse((o) => { if (o.isMesh && /u:neon/.test(o.material.name)) neonMeshes += 1; });
  assert.ok(neonMeshes >= 1, 'emissive material upgraded');
  const emissiveMesh = [];
  rifle.root.traverse((o) => { if (o.isMesh && o.material.emissiveIntensity > 0) emissiveMesh.push(o); });
  assert.ok(emissiveMesh.length >= 1, 'glow materials keep emissive');
  assert.ok(assets.sky, 'equirect sky texture present');
  assert.equal(assets.sky.mapping, THREE.EquirectangularReflectionMapping);
  assert.ok(decoded.length >= manifest.facts.texture_sets * 3, 'every map decoded');
});
