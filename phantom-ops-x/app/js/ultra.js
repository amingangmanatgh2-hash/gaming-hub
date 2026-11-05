// PHANTOM OPS X — ULTRA PACK runtime.
//
// The base game ships light (procedural geometry + vertex colours only). This
// module turns the *optional* add-on into real graphics upgrades at runtime:
//
//   1. read the add-on catalogue (GitHub release asset, bundled fallback)
//   2. download the .zip with live progress (streaming, cancellable)
//   3. verify the archive SHA-256 before a single byte is used
//   4. unpack it with a tiny STORE-only ZIP reader (no third-party deps)
//   5. cache the verified archive in the Cache API for instant reuse
//   6. hand textures + GLB models to the renderer (PBR sets, env, viewmodel)
//
// Everything is denied by default: a mismatched hash, an unsupported
// compression method or a missing pack.json aborts and leaves the game intact.

import { parseGLB, describeGLB } from './ultra-glb.js';

const CACHE_NAME = 'phantom-ultra-v1';

// storage can be unavailable (private mode, sandboxed WebView) — never throw
function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch { return null; }
}
function writeMeta(value) {
  try { localStorage.setItem(META_KEY, JSON.stringify(value)); } catch { /* memory only */ }
}
function clearMeta() {
  try { localStorage.removeItem(META_KEY); } catch { /* ignore */ }
}
const ARCHIVE_KEY = '/__phantom_ultra_archive__';
const META_KEY = 'phantom.ultra.meta';

// ---------------------------------------------------------------- hashing
export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- zip
function u16(view, off) { return view.getUint16(off, true); }
function u32(view, off) { return view.getUint32(off, true); }

/**
 * Minimal ZIP reader: stored (uncompressed) entries only, which is how the
 * add-on is published. Returns a Map<name, Uint8Array>.
 */
export function readZipEntries(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22) throw new Error('archive too small');
  // End Of Central Directory: scan backwards over the (usually empty) comment.
  let eocd = -1;
  const limit = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= limit; i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP archive (no end-of-central-directory record)');
  const count = u16(view, eocd + 10);
  const cdSize = u32(view, eocd + 12);
  const cdOffset = u32(view, eocd + 16);
  if (cdOffset + cdSize > bytes.length) throw new Error('corrupt ZIP: central directory out of range');
  const decoder = new TextDecoder('utf-8');
  const out = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (u32(view, p) !== 0x02014b50) throw new Error('corrupt ZIP: bad central directory entry');
    const method = u16(view, p + 10);
    const csize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localOffset = u32(view, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (u32(view, localOffset) !== 0x04034b50) throw new Error(`corrupt ZIP: bad local header for ${name}`);
    if (method !== 0) throw new Error(`unsupported ZIP compression for ${name} (method ${method}); the add-on must be published uncompressed`);
    const lNameLen = u16(view, localOffset + 26);
    const lExtraLen = u16(view, localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    if (start + csize > bytes.length) throw new Error(`corrupt ZIP: ${name} overruns the archive`);
    out.set(name, bytes.subarray(start, start + csize));
  }
  return out;
}

// ---------------------------------------------------------------- loader
export class UltraLoader {
  /**
   * @param {object} opts
   * @param {string} opts.catalogUrl  remote catalogue (GitHub release asset)
   * @param {string} [opts.bundledUrl] bundled catalogue inside the app
   * @param {(p:{phase:string,loaded:number,total:number,ratio:number})=>void} [opts.onProgress]
   */
  constructor(opts = {}) {
    this.catalogUrl = opts.catalogUrl || '';
    this.bundledUrl = opts.bundledUrl || 'ultra-packs.json';
    this.onProgress = opts.onProgress || (() => {});
    this.cacheAvailable = typeof caches !== 'undefined';
    this.aborted = false;
  }

  abort() { this.aborted = true; }

  static meta() { return readMeta(); }

  static installedVersion() { return UltraLoader.meta()?.version || null; }

  async catalog() {
    const sources = [this.catalogUrl, this.bundledUrl].filter(Boolean);
    const errors = [];
    for (const url of sources) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const pack = (json.packs || [])[0];
        if (!pack || !pack.url || !pack.sha256) throw new Error('catalogue has no usable pack');
        return { ...json, pack, source: url };
      } catch (e) {
        errors.push(`${url}: ${e.message}`);
      }
    }
    throw new Error(`catalogue unavailable (${errors.join(' · ')})`);
  }

  async status() {
    const meta = UltraLoader.meta();
    const cached = this.cacheAvailable ? await caches.has(CACHE_NAME) : false;
    return { installed: !!meta, meta, cached };
  }

  async _fetchArchive(pack) {
    const urls = [pack.url, pack.mirror].filter(Boolean);
    let lastErr;
    for (const url of urls) {
      try {
        return await this._fetchWithProgress(url, pack.bytes);
      } catch (e) {
        lastErr = e;
        this.onProgress({ phase: 'retry', loaded: 0, total: pack.bytes || 0, ratio: 0 });
      }
    }
    throw lastErr || new Error('download failed');
  }

  async _fetchWithProgress(url, expectedBytes) {
    const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const total = Number(res.headers.get('content-length')) || expectedBytes || 0;
    if (!res.body || typeof res.body.getReader !== 'function') {
      const buf = await res.arrayBuffer();
      this.onProgress({ phase: 'download', loaded: buf.byteLength, total: buf.byteLength, ratio: 1 });
      return buf;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      if (this.aborted) { try { await reader.cancel(); } catch {} throw new Error('cancelled'); }
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      this.onProgress({ phase: 'download', loaded, total, ratio: total ? loaded / total : 0 });
    }
    const out = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.byteLength; }
    return out.buffer;
  }

  /**
   * Download → verify → unpack → cache. Returns { manifest, files, verified }.
   */
  async install(pack, { keepArchive = true } = {}) {
    this.aborted = false;
    this.onProgress({ phase: 'verify-start', loaded: 0, total: pack.bytes || 0, ratio: 0 });
    const archive = await this._fetchArchive(pack);
    this.onProgress({ phase: 'hash', loaded: archive.byteLength, total: archive.byteLength, ratio: 1 });
    const digest = await sha256Hex(archive);
    if (digest.toLowerCase() !== String(pack.sha256).toLowerCase()) {
      throw new Error(`SHA-256 mismatch (expected ${pack.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…) — download discarded`);
    }
    this.onProgress({ phase: 'unpack', loaded: 0, total: archive.byteLength, ratio: 1 });
    const files = readZipEntries(archive);
    const manifestBytes = files.get('pack.json');
    if (!manifestBytes) throw new Error('add-on is missing pack.json');
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
    // per-file integrity from the signed manifest
    let checked = 0;
    for (const [name, info] of Object.entries(manifest.files || {})) {
      const data = files.get(name);
      if (!data) throw new Error(`add-on is incomplete: ${name} missing`);
      if (info.sha256) {
        const got = await sha256Hex(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
        if (got !== info.sha256) throw new Error(`file hash mismatch: ${name}`);
      }
      checked += 1;
      this.onProgress({ phase: 'verify-files', loaded: checked, total: Object.keys(manifest.files || {}).length, ratio: checked / Math.max(1, Object.keys(manifest.files || {}).length) });
    }
    if (this.cacheAvailable && keepArchive) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(new Request(ARCHIVE_KEY), new Response(archive));
      } catch { /* cache is best-effort; the in-memory copy still works */ }
    }
    writeMeta({
      version: manifest.version,
      name: manifest.name,
      installedAt: Date.now(),
      bytes: archive.byteLength,
      sha256: digest,
      facts: manifest.facts || {},
    });
    this.onProgress({ phase: 'done', loaded: 1, total: 1, ratio: 1 });
    return { manifest, files, verified: digest };
  }

  /** Restore a previously verified archive from the Cache API. */
  async restore() {
    if (!this.cacheAvailable) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const res = await cache.match(new Request(ARCHIVE_KEY));
      if (!res) return null;
      const archive = await res.arrayBuffer();
      const files = readZipEntries(archive);
      const manifestBytes = files.get('pack.json');
      if (!manifestBytes) return null;
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      const meta = UltraLoader.meta();
      const digest = await sha256Hex(archive);
      if (meta && meta.sha256 && meta.sha256 !== digest) return null;
      return { manifest, files, verified: digest };
    } catch {
      return null;
    }
  }

  async uninstall() {
    clearMeta();
    if (this.cacheAvailable) {
      try { const cache = await caches.open(CACHE_NAME); await cache.delete(new Request(ARCHIVE_KEY)); } catch {}
    }
  }
}

// ---------------------------------------------------------------- asset build
const MIME = 'image/png';

async function bitmapFrom(bytes) {
  const blob = new Blob([bytes], { type: MIME });
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  URL.revokeObjectURL(url);
  return img;
}

/**
 * Turn the unpacked files into GPU-ready assets.
 * @param {object} THREE three.js module
 * @param {object} archive result of install()/restore()
 */
export async function buildAssets(THREE, { manifest, files }) {
  const texCache = new Map();
  const texture = async (name, { srgb = false, repeat = true } = {}) => {
    const key = `${name}:${srgb}`;
    if (texCache.has(key)) return texCache.get(key);
    const bytes = files.get(name);
    if (!bytes) throw new Error(`texture missing from pack: ${name}`);
    const image = await bitmapFrom(bytes);
    const tex = new THREE.Texture(image);
    tex.name = name;
    tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    texCache.set(key, tex);
    return tex;
  };

  const sets = {};
  for (const [setName, maps] of Object.entries(manifest.texture_sets || {})) {
    if (!maps.albedo) continue;
    const entry = {
      albedo: await texture(maps.albedo, { srgb: true }),
      normal: maps.normal ? await texture(maps.normal) : null,
      mr: maps.mr ? await texture(maps.mr) : null,
      emissive: maps.emissive ? await texture(maps.emissive, { srgb: true }) : null,
    };
    sets[setName] = entry;
  }

  // GLB models (parsed in-memory, textures are shared from the sets above)
  const models = {};
  for (const [name, info] of Object.entries(manifest.models || {})) {
    const bytes = files.get(info.file);
    if (!bytes) continue;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const root = parseGLB(THREE, buffer);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = true;
      const src = Array.isArray(o.material) ? o.material : [o.material];
      const upgraded = src.map((m) => upgradeMaterial(THREE, m, sets));
      o.material = Array.isArray(o.material) ? upgraded : upgraded[0];
    });
    models[name] = { root, info, ...describeGLB(buffer), triangles: info.triangles || 0 };
  }

  const skyBytes = manifest.sky && files.get(manifest.sky.file);
  let sky = null;
  if (skyBytes) {
    const image = await bitmapFrom(skyBytes);
    sky = new THREE.Texture(image);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.colorSpace = THREE.SRGBColorSpace;
    sky.needsUpdate = true;
  }
  return { sets, models, sky, manifest };
}

/** Map a GLB material (`u:carbon`, …) onto a packed PBR texture set. */
export function upgradeMaterial(THREE, material, sets) {
  const name = String(material?.name || '');
  if (!name.startsWith('u:')) return material;
  const setKey = name.slice(2);
  const set = sets[setKey];
  if (!set) return material;
  const mat = new THREE.MeshStandardMaterial({
    name: `${name}+ultra`,
    color: 0xffffff,
    roughness: 1,
    metalness: 1,
    map: set.albedo,
    normalMap: set.normal,
    roughnessMap: set.mr,
    metalnessMap: set.mr,
    emissiveMap: set.emissive || null,
    emissive: set.emissive ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
    emissiveIntensity: set.emissive ? 1.0 : 0,
    transparent: material.transparent || setKey === 'glass',
    opacity: material.transparent ? material.opacity : 0.42,
    depthWrite: setKey !== 'glass',
    side: material.transparent ? THREE.DoubleSide : THREE.FrontSide,
    envMapIntensity: 1.15,
  });
  if (setKey === 'glass') {
    mat.transparent = true;
    mat.opacity = 0.34;
    mat.depthWrite = false;
    mat.roughness = 0.1;
    mat.metalness = 0.2;
  }
  mat.needsUpdate = true;
  return mat;
}

/** Convenience: apply the packed sets to an existing three material. */
export function applySet(THREE, material, set, { repeat = 1, emissiveIntensity = 1.1 } = {}) {
  if (!set || !material) return material;
  // textures are shared between materials, so repeat/wrap must live on a copy
  const dup = (tex) => {
    if (!tex) return null;
    const c = tex.clone();
    c.needsUpdate = true;
    c.wrapS = THREE.RepeatWrapping;
    c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeat, repeat);
    return c;
  };
  const clone = material.clone();
  clone.map = dup(set.albedo);
  clone.normalMap = dup(set.normal);
  clone.roughnessMap = dup(set.mr);
  clone.metalnessMap = dup(set.mr);
  if (set.emissive) {
    clone.emissiveMap = dup(set.emissive);
    clone.emissive = new THREE.Color(0xffffff);
    clone.emissiveIntensity = emissiveIntensity;
  } else {
    clone.emissive = new THREE.Color(0x000000);
    clone.emissiveIntensity = 0;
  }
  clone.color = new THREE.Color(0xffffff);
  clone.roughness = 1;
  clone.metalness = 1;
  clone.envMapIntensity = 1.1;
  clone.needsUpdate = true;
  return clone;
}

export const ULTRA_STORAGE_KEY = META_KEY;
export const ULTRA_CACHE_NAME = CACHE_NAME;
