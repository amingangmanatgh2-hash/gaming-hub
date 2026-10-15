import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareVersions, planUpdate, verifyBundle, repairPlan, nextLauncherState, GAME_STORAGE_KEYS } from '../app/js/launcher-core.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');

test('semver comparison', () => {
  assert.equal(compareVersions('1.2.0', '1.1.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
  assert.equal(compareVersions('2.0', '2.0.1'), -1);
});

test('update planning from manifest', () => {
  const manifest = { app: 'phantom-ops-x', version: '1.3.0', files: {} };
  assert.equal(planUpdate('1.2.0', manifest).updateAvailable, true);
  assert.equal(planUpdate('1.3.0', manifest).reason, 'up-to-date');
  assert.equal(planUpdate('2.0.0', manifest).reason, 'installed-newer');
  assert.equal(planUpdate('1.0.0', null).ok, false);
  assert.equal(planUpdate('1.0.0', { version: 'x' }).ok, false);
});

test('SHA-256 bundle verification catches tampered/missing files', () => {
  const manifest = {
    version: '1.0.0',
    files: { 'index.html': sha('<html>game</html>'), 'js/game.js': sha('code();') },
  };
  const good = { 'index.html': sha('<html>game</html>'), 'js/game.js': sha('code();') };
  assert.equal(verifyBundle(manifest, good).ok, true);
  const tampered = { ...good, 'js/game.js': sha('evil();') };
  const r1 = verifyBundle(manifest, tampered);
  assert.equal(r1.ok, false);
  assert.deepEqual(r1.mismatched, ['js/game.js']);
  const missing = verifyBundle(manifest, { 'index.html': good['index.html'] });
  assert.deepEqual(missing.missing, ['js/game.js']);
});

test('repair preserves profiles, clears only transient launcher state', () => {
  const plan = repairPlan([GAME_STORAGE_KEYS.profiles, GAME_STORAGE_KEYS.launcher, 'other']);
  assert.deepEqual(plan.preservedKeys, [GAME_STORAGE_KEYS.profiles]);
  assert.deepEqual(plan.removedKeys, [GAME_STORAGE_KEYS.launcher]);
  assert.ok(plan.actions.includes('reextract-bundle'));
});

test('launcher state machine: online + offline paths', () => {
  let s = 'idle';
  s = nextLauncherState(s, 'CHECK'); assert.equal(s, 'checking');
  s = nextLauncherState(s, 'FOUND'); assert.equal(s, 'downloading');
  s = nextLauncherState(s, 'DONE'); assert.equal(s, 'verifying');
  s = nextLauncherState(s, 'OK'); assert.equal(s, 'installing');
  s = nextLauncherState(s, 'DONE'); assert.equal(s, 'ready');
  // offline path: check fails -> still playable offline
  let o = nextLauncherState('idle', 'CHECK');
  o = nextLauncherState(o, 'FAIL');
  assert.equal(o, 'offline-ready');
  // corrupt download -> error -> repair -> installing
  let e = nextLauncherState('downloading', 'FAIL');
  assert.equal(e, 'error');
  assert.equal(nextLauncherState(e, 'REPAIR'), 'installing');
});
