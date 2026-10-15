import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore, validateUsername, awardXp, xpForNextLevel, STORE_KEY } from '../app/js/profiles.js';
import { setCredits } from '../app/js/economy.js';

const memStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
};

test('username validation', () => {
  assert.equal(validateUsername('Phantom_1').ok, true);
  assert.equal(validateUsername('x').ok, false);
  assert.equal(validateUsername('bad$name!').ok, false);
  assert.equal(validateUsername('a'.repeat(21)).ok, false);
});

test('create, switch, and per-profile isolation', () => {
  const s = new ProfileStore(memStorage());
  const a = s.create('Alpha');
  setCredits(a.inventory, 111);
  const b = s.create('Bravo');
  setCredits(b.inventory, 222);
  assert.equal(s.active().username, 'Bravo');
  s.switchTo(a.id);
  assert.equal(s.active().inventory.credits, 111, 'Alpha credits isolated');
  s.switchTo(b.id);
  assert.equal(s.active().inventory.credits, 222, 'Bravo credits isolated');
});

test('duplicate usernames rejected (case-insensitive)', () => {
  const s = new ProfileStore(memStorage());
  s.create('Ghost');
  assert.throws(() => s.create('ghost'), /already used/);
});

test('guest mode creates switchable guest profile', () => {
  const s = new ProfileStore(memStorage());
  const g = s.createGuest();
  assert.equal(g.guest, true);
  assert.match(g.username, /^Guest-\d{4}$/);
  assert.equal(s.active().id, g.id);
});

test('persistence round-trip through storage adapter', () => {
  const storage = memStorage();
  const s1 = new ProfileStore(storage);
  const p = s1.create('Persistent');
  p.progression.kills = 42;
  s1.save();
  assert.ok(storage._map.has(STORE_KEY));
  const s2 = new ProfileStore(storage);
  assert.equal(s2.load(), true);
  assert.equal(s2.active().username, 'Persistent');
  assert.equal(s2.active().progression.kills, 42);
});

test('profile reset wipes progression/inventory but keeps username', () => {
  const s = new ProfileStore(memStorage());
  const p = s.create('Resettable');
  p.progression.kills = 99;
  setCredits(p.inventory, 777);
  s.reset(p.id);
  assert.equal(s.active().username, 'Resettable');
  assert.equal(s.active().progression.kills, 0);
  assert.equal(s.active().inventory.credits, 5000);
});

test('delete profile and active fallback', () => {
  const s = new ProfileStore(memStorage());
  const a = s.create('One');
  const b = s.create('Two');
  s.switchTo(a.id);
  s.delete(a.id);
  assert.equal(s.active().id, b.id);
  assert.equal(s.list().length, 1);
});

test('backup export/import with checksum integrity', () => {
  const s1 = new ProfileStore(memStorage());
  s1.create('BackupBob');
  const backup = s1.exportBackup();
  const s2 = new ProfileStore(memStorage());
  assert.equal(s2.importBackup(backup), 1);
  assert.equal(s2.active().username, 'BackupBob');
  const tampered = backup.replace('BackupBob', 'HaxxedName');
  assert.throws(() => new ProfileStore(memStorage()).importBackup(tampered), /checksum|payload/);
  assert.throws(() => new ProfileStore(memStorage()).importBackup('{"format":"nope"}'), /Not a PHANTOM/);
});

test('xp awards level up correctly', () => {
  const prog = { level: 1, xp: 0 };
  const gained = awardXp(prog, xpForNextLevel(1) + 10);
  assert.equal(gained, 1);
  assert.equal(prog.level, 2);
  assert.equal(prog.xp, 10);
});
