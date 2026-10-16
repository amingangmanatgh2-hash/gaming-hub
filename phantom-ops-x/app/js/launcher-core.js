// PHANTOM OPS X — launcher logic shared by the in-browser launcher screen and
// mirrored by the Android launcher (MainActivity.java). Pure & testable:
// update planning, SHA-256 bundle verification, repair planning.

export const GAME_STORAGE_KEYS = {
  profiles: 'phantomopsx.profiles.v1',
  launcher: 'phantomopsx.launcher.v1',
};

export function parseVersion(v) {
  return String(v || '0.0.0').split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// manifest: { app: 'phantom-ops-x', version, files: { 'path': 'sha256hex' } }
export function planUpdate(installedVersion, manifest) {
  if (!manifest || typeof manifest !== 'object' || !manifest.version || typeof manifest.files !== 'object') {
    return { updateAvailable: false, ok: false, reason: 'invalid-manifest' };
  }
  const cmp = compareVersions(manifest.version, installedVersion);
  if (cmp > 0) return { updateAvailable: true, ok: true, reason: 'newer-version', from: installedVersion, to: manifest.version };
  if (cmp === 0) return { updateAvailable: false, ok: true, reason: 'up-to-date' };
  return { updateAvailable: false, ok: true, reason: 'installed-newer' };
}

// Verify downloaded file hashes against the manifest.
// results: { 'path': 'actualSha256hex' }  -> { ok, missing[], mismatched[] }
export function verifyBundle(manifest, results) {
  const missing = [], mismatched = [];
  for (const [path, expected] of Object.entries(manifest.files || {})) {
    const actual = results[path];
    if (!actual) missing.push(path);
    else if (String(actual).toLowerCase() !== String(expected).toLowerCase()) mismatched.push(path);
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

// Repair restores bundle files & clears transient cache, but NEVER touches
// user profile storage (accounts, inventories, settings survive repair).
export function repairPlan(storageKeysPresent) {
  const keys = Array.isArray(storageKeysPresent) ? storageKeysPresent : [];
  return {
    actions: ['clear-transient-cache', 'reextract-bundle', 'verify-bundle'],
    preservedKeys: keys.filter((k) => k === GAME_STORAGE_KEYS.profiles),
    removedKeys: keys.filter((k) => k === GAME_STORAGE_KEYS.launcher),
  };
}

export const LAUNCHER_STATES = ['idle', 'checking', 'downloading', 'verifying', 'installing', 'ready', 'error', 'offline-ready'];

export function nextLauncherState(current, event) {
  const table = {
    idle:           { CHECK: 'checking', PLAY: 'ready', REPAIR: 'installing' },
    checking:       { FOUND: 'downloading', NONE: 'ready', FAIL: 'offline-ready' },
    downloading:    { DONE: 'verifying', FAIL: 'error' },
    verifying:      { OK: 'installing', BAD: 'error' },
    installing:     { DONE: 'ready', FAIL: 'error' },
    ready:          { CHECK: 'checking', PLAY: 'ready', REPAIR: 'installing' },
    error:          { CHECK: 'checking', REPAIR: 'installing', PLAY: 'offline-ready' },
    'offline-ready': { CHECK: 'checking', PLAY: 'ready', REPAIR: 'installing' },
  };
  return (table[current] && table[current][event]) || current;
}
