// PHANTOM OPS X — Phantom Account System.
// Multiple isolated local profiles, guest mode, per-profile inventories /
// progression / settings / mod-configs, local backups with integrity check.
// No official game credentials are involved anywhere.

import { createDefaultMods, sanitizeMods } from './mods.js';
import { createInventory } from './economy.js';

const STORE_KEY = 'phantomopsx.profiles.v1';
const BACKUP_FORMAT = 'phantom-ops-x-backup';

let uidCounter = 0;
export function makeId(prefix = 'p') {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// Small deterministic checksum for local backup integrity (not crypto-grade).
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function defaultSettings() {
  return {
    theme: 'phantom',       // phantom | toxic | crimson | arctic
    lang: 'en',             // 'en' (LTR) | 'fa' (RTL)
    sensitivity: 1,
    volume: 0.8,
    quality: 'auto',        // auto | high | low
    fov: 78,                // camera field of view (visual setting)
  };
}

export function defaultProgression() {
  return { level: 1, xp: 0, kills: 0, deaths: 0, wins: 0, losses: 0, matches: 0, playSeconds: 0 };
}

export function xpForNextLevel(level) { return 400 + (level - 1) * 150; }

export function awardXp(prog, amount) {
  prog.xp += Math.max(0, Math.round(amount));
  let levelled = 0;
  while (prog.xp >= xpForNextLevel(prog.level)) {
    prog.xp -= xpForNextLevel(prog.level);
    prog.level += 1;
    levelled += 1;
  }
  return levelled;
}

export function createProfile(username, guest = false) {
  return {
    id: makeId('profile'),
    username,
    guest,
    createdAt: Date.now(),
    settings: defaultSettings(),
    progression: defaultProgression(),
    inventory: createInventory(),
    mods: createDefaultMods(),
    configs: {},            // name -> sanitized mods snapshot
    hudLayout: {},          // elementId -> {x, y} (% based)
    stats: { shots: 0, hits: 0, headshots: 0 },
  };
}

export function validateUsername(name) {
  const n = String(name || '').trim();
  if (n.length < 2) return { ok: false, error: 'Username must be at least 2 characters.' };
  if (n.length > 20) return { ok: false, error: 'Username must be at most 20 characters.' };
  if (!/^[\p{L}\p{N}_ .-]+$/u.test(n)) return { ok: false, error: 'Username contains unsupported characters.' };
  return { ok: true, name: n };
}

// Storage adapter: anything with getItem/setItem/removeItem (localStorage or test double).
export class ProfileStore {
  constructor(storage) {
    this.storage = storage;
    this.data = { version: 1, activeId: null, profiles: {} };
  }

  load() {
    try {
      const raw = this.storage.getItem(STORE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || typeof parsed.profiles !== 'object') return false;
      // Re-sanitize persisted mods so old/corrupt values can never break the sim.
      for (const p of Object.values(parsed.profiles)) {
        p.mods = sanitizeMods(p.mods);
        p.settings = { ...defaultSettings(), ...(p.settings || {}) };
        p.progression = { ...defaultProgression(), ...(p.progression || {}) };
      }
      this.data = parsed;
      if (!this.data.profiles[this.data.activeId]) {
        this.data.activeId = Object.keys(this.data.profiles)[0] || null;
      }
      return true;
    } catch {
      return false;
    }
  }

  save() {
    this.storage.setItem(STORE_KEY, JSON.stringify(this.data));
  }

  list() { return Object.values(this.data.profiles); }
  active() { return this.data.activeId ? this.data.profiles[this.data.activeId] || null : null; }

  create(username) {
    const v = validateUsername(username);
    if (!v.ok) throw new Error(v.error);
    const taken = this.list().some((p) => p.username.toLowerCase() === v.name.toLowerCase());
    if (taken) throw new Error('That username is already used by another local profile.');
    const p = createProfile(v.name, false);
    this.data.profiles[p.id] = p;
    this.data.activeId = p.id;
    this.save();
    return p;
  }

  createGuest() {
    const p = createProfile(`Guest-${Math.floor(1000 + Math.random() * 9000)}`, true);
    this.data.profiles[p.id] = p;
    this.data.activeId = p.id;
    this.save();
    return p;
  }

  switchTo(id) {
    if (!this.data.profiles[id]) throw new Error('Profile not found.');
    this.data.activeId = id;
    this.save();
    return this.data.profiles[id];
  }

  delete(id) {
    if (!this.data.profiles[id]) return false;
    delete this.data.profiles[id];
    if (this.data.activeId === id) this.data.activeId = Object.keys(this.data.profiles)[0] || null;
    this.save();
    return true;
  }

  // Reset progression + inventory + mods, keep the username/account itself.
  reset(id) {
    const p = this.data.profiles[id];
    if (!p) throw new Error('Profile not found.');
    const fresh = createProfile(p.username, p.guest);
    p.progression = fresh.progression;
    p.inventory = fresh.inventory;
    p.mods = fresh.mods;
    p.configs = {};
    p.hudLayout = {};
    p.stats = fresh.stats;
    this.save();
    return p;
  }

  exportBackup() {
    const payload = JSON.stringify(this.data);
    return JSON.stringify({ format: BACKUP_FORMAT, version: 1, checksum: fnv1a(payload), payload });
  }

  importBackup(text) {
    let outer;
    try { outer = JSON.parse(text); } catch { throw new Error('Backup file is not valid JSON.'); }
    if (!outer || outer.format !== BACKUP_FORMAT) throw new Error('Not a PHANTOM OPS X backup.');
    if (fnv1a(String(outer.payload)) !== outer.checksum) throw new Error('Backup checksum mismatch — file is corrupted.');
    const parsed = JSON.parse(outer.payload);
    if (!parsed || typeof parsed.profiles !== 'object') throw new Error('Backup payload is invalid.');
    for (const p of Object.values(parsed.profiles)) p.mods = sanitizeMods(p.mods);
    this.data = { version: 1, activeId: parsed.activeId || null, profiles: parsed.profiles };
    if (!this.data.profiles[this.data.activeId]) this.data.activeId = Object.keys(this.data.profiles)[0] || null;
    this.save();
    return this.list().length;
  }
}

export { STORE_KEY, BACKUP_FORMAT };
