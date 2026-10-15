import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultMods, sanitizeMods, resolveAimProfile, selectTarget, stepAim,
  anglesTo, bonePoint, predictPoint, computeWeaponStats, stepMovement, normAngle,
} from '../app/js/mods.js';
import { weaponById } from '../app/js/catalog.js';

const cand = (id, over = {}) => ({
  id, pos: { x: 0, y: 0, z: -10 }, vel: { x: 0, y: 0, z: 0 },
  hp: 100, alive: true, visible: true, angle: 0.05, dist: 10, height: 1.8, ...over,
});

test('sanitize clamps hostile config values into safe ranges', () => {
  const m = sanitizeMods({
    aim: { enabled: true, fovDeg: 9999, strength: -3, smoothing: 42, lockMode: 'bogus' },
    movement: { speedMult: 500, gravityMult: -1 },
    weapons: { fireRateMult: 1e9, recoilMult: 'x' },
    visuals: { crosshair: { size: 999, color: 'red;evil' } },
  });
  assert.equal(m.aim.fovDeg, 120);
  assert.equal(m.aim.strength, 0);
  assert.equal(m.aim.smoothing, 1);
  assert.equal(m.aim.lockMode, 'crosshair');
  assert.equal(m.movement.speedMult, 6);
  assert.equal(m.movement.gravityMult, 0.05);
  assert.equal(m.weapons.fireRateMult, 5);
  assert.equal(m.weapons.recoilMult, 1);
  assert.equal(m.visuals.crosshair.size, 40);
  assert.equal(m.visuals.crosshair.color, '#39ff88');
});

test('target selection respects the FOV cone', () => {
  const mods = createDefaultMods();
  mods.aim.enabled = true; mods.aim.fovDeg = 20; // half = 10deg = .1745 rad
  const inside = cand('a', { angle: 0.1 });
  const outside = cand('b', { angle: 0.3, dist: 2 });
  assert.equal(selectTarget([outside], mods, null).target, null, 'outside FOV never locked');
  assert.equal(selectTarget([outside, inside], mods, null).target.id, 'a');
});

test('target selection modes: nearest / weakest / crosshair', () => {
  const mods = createDefaultMods();
  mods.aim.enabled = true; mods.aim.fovDeg = 90;
  const near = cand('near', { dist: 5, hp: 100, angle: 0.3 });
  const weak = cand('weak', { dist: 20, hp: 10, angle: 0.25 });
  const centered = cand('ctr', { dist: 15, hp: 80, angle: 0.01 });
  mods.aim.lockMode = 'nearest';
  assert.equal(selectTarget([weak, near, centered], mods, null).target.id, 'near');
  mods.aim.lockMode = 'weakest';
  assert.equal(selectTarget([near, weak, centered], mods, null).target.id, 'weak');
  mods.aim.lockMode = 'crosshair';
  assert.equal(selectTarget([near, weak, centered], mods, null).target.id, 'ctr');
});

test('dead/invisible targets are never selected; auto-switch replaces dead target', () => {
  const mods = createDefaultMods();
  mods.aim.enabled = true; mods.aim.fovDeg = 90;
  const dead = cand('dead', { alive: false, angle: 0.001 });
  const hidden = cand('hidden', { visible: false, angle: 0.001 });
  const live = cand('live', { angle: 0.2 });
  const r = selectTarget([dead, hidden, live], mods, null, 'dead');
  assert.equal(r.target.id, 'live');
  assert.equal(r.switched, true);
});

test('head vs body bone points differ and sit on the target', () => {
  const t = cand('x', { pos: { x: 3, y: 0, z: -8 } });
  const head = bonePoint(t, 'head');
  const body = bonePoint(t, 'body');
  assert.ok(head.y > body.y);
  assert.equal(head.x, 3); assert.equal(head.z, -8);
  assert.ok(Math.abs(head.y - 1.8 * 0.93) < 1e-9);
});

test('aim smoothing converges gradually (not a teleport), strength speeds it up', () => {
  const cfg = { smoothing: 0.5, strength: 0.7, flickAssist: false, flickThresholdDeg: 6, prediction: 0 };
  const want = { yaw: 0.6, pitch: 0.2 };
  let cur = { yaw: 0, pitch: 0 };
  let prevErr = Math.hypot(want.yaw, want.pitch);
  for (let i = 0; i < 120; i++) {
    const r = stepAim(cur, want, cfg, 1 / 60);
    cur = { yaw: r.yaw, pitch: r.pitch };
    assert.ok(r.errorRad <= prevErr + 1e-9, 'error monotonically shrinks');
    prevErr = r.errorRad;
  }
  assert.ok(prevErr < 0.01, `converged, err=${prevErr}`);
  // zero smoothing + full strength snaps almost immediately
  const fast = stepAim({ yaw: 0, pitch: 0 }, want, { ...cfg, smoothing: 0, strength: 1 }, 1 / 60);
  assert.ok(fast.errorRad < Math.hypot(want.yaw, want.pitch) * 0.55);
});

test('flick-shot assistance snaps only when firing and within threshold', () => {
  const cfg = { smoothing: 0.9, strength: 0.5, flickAssist: true, flickThresholdDeg: 6, prediction: 0 };
  const near = stepAim({ yaw: 0, pitch: 0 }, { yaw: 0.05, pitch: 0 }, cfg, 1 / 60, true);
  assert.equal(near.snapped, true);
  const noFire = stepAim({ yaw: 0, pitch: 0 }, { yaw: 0.05, pitch: 0 }, cfg, 1 / 60, false);
  assert.equal(noFire.snapped, false);
  const tooFar = stepAim({ yaw: 0, pitch: 0 }, { yaw: 0.5, pitch: 0 }, cfg, 1 / 60, true);
  assert.equal(tooFar.snapped, false);
});

test('target prediction leads a moving target; factor 0 disables it', () => {
  const p0 = { x: 0, y: 1, z: -20 };
  const vel = { x: 4, y: 0, z: 0 };
  const off = predictPoint(p0, vel, 20, { prediction: 0 });
  assert.deepEqual(off, p0);
  const led = predictPoint(p0, vel, 20, { prediction: 1 });
  assert.ok(led.x > 0.3, `lead applied: ${led.x}`);
  const half = predictPoint(p0, vel, 20, { prediction: 0.5 });
  assert.ok(Math.abs(half.x - led.x / 2) < 1e-9);
});

test('per-weapon aim profiles override globals independently', () => {
  const mods = createDefaultMods();
  mods.aim.bone = 'body'; mods.aim.strength = 0.4;
  mods.aim.perWeapon = { sr_eclipse: { bone: 'head', strength: 1 } };
  const sniper = resolveAimProfile(mods, 'sr_eclipse');
  const rifle = resolveAimProfile(mods, 'ar_phantom');
  assert.equal(sniper.bone, 'head'); assert.equal(sniper.strength, 1);
  assert.equal(rifle.bone, 'body'); assert.equal(rifle.strength, 0.4);
});

test('anglesTo + normAngle math', () => {
  const a = anglesTo({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 1.6, z: -10 });
  assert.ok(Math.abs(a.yaw) < 1e-9 && Math.abs(a.pitch) < 1e-9 && Math.abs(a.dist - 10) < 1e-9);
  assert.ok(Math.abs(normAngle(Math.PI * 3) - Math.PI) < 1e-9 || Math.abs(normAngle(Math.PI * 3) + Math.PI) < 1e-9);
});

test('weapon stats: mods really change fire rate, recoil, ADS, reload, spread, damage', () => {
  const w = weaponById('ar_phantom');
  const base = computeWeaponStats(w, createDefaultMods(), 1);
  assert.ok(Math.abs(base.fireIntervalMs - 60000 / w.fireRate) < 1e-6);
  const mods = createDefaultMods();
  mods.weapons.fireRateMult = 2; mods.weapons.recoilMult = 0; mods.weapons.adsMult = 0.1;
  mods.weapons.reloadMult = 0.5; mods.weapons.spreadMult = 0; mods.weapons.damageMult = 2;
  mods.weapons.infiniteAmmo = true;
  const boosted = computeWeaponStats(w, mods, 1);
  assert.ok(Math.abs(boosted.fireRateRpm - w.fireRate * 2) < 1e-6);
  assert.equal(boosted.recoilDeg, 0);
  assert.ok(boosted.adsTimeMs < w.adsTime * 0.2);
  assert.ok(Math.abs(boosted.reloadMs - w.reload * 0.5) < 1e-6);
  assert.equal(boosted.spreadDeg, 0);
  assert.equal(boosted.damage, w.damage * 2);
  assert.equal(boosted.infiniteAmmo, true);
});

test('weapon level and attachments change effective stats', () => {
  const w = weaponById('ar_phantom');
  const lv1 = computeWeaponStats(w, createDefaultMods(), 1);
  const lv10 = computeWeaponStats(w, createDefaultMods(), 10);
  assert.ok(lv10.damage > lv1.damage * 1.4);
  const mods = createDefaultMods();
  mods.weapons.attachments = { ar_phantom: { mag: 'att_mag_drum', grip: 'att_grip_vertical' } };
  const withAtt = computeWeaponStats(w, mods, 1);
  assert.equal(withAtt.magSize, w.mag * 2);
  assert.ok(withAtt.recoilDeg < lv1.recoilDeg);
});

test('movement physics: gravity, jump, speed multipliers', () => {
  const mods = createDefaultMods(); // default movement
  let s = { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 0, z: 0 }, grounded: false };
  for (let i = 0; i < 240; i++) s = stepMovement(s, { wish: { x: 0, z: 0 } }, mods.movement, 1 / 60);
  assert.equal(s.pos.y, 0); assert.equal(s.grounded, true);
  const before = s.pos.x;
  for (let i = 0; i < 60; i++) s = stepMovement(s, { wish: { x: 1, z: 0 } }, mods.movement, 1 / 60);
  const walkDist = s.pos.x - before;
  assert.ok(walkDist > 3.5 && walkDist < 4.6, `walk ~4.3m/s got ${walkDist}`);
  // 3x speed multiplier roughly triples distance
  const fast = { ...mods.movement, speedMult: 3 };
  let s2 = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, grounded: true };
  for (let i = 0; i < 60; i++) s2 = stepMovement(s2, { wish: { x: 1, z: 0 } }, fast, 1 / 60);
  assert.ok(s2.pos.x > walkDist * 2.4, `speed mult works: ${s2.pos.x} vs ${walkDist}`);
  // jump leaves the ground
  const j = stepMovement({ pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, grounded: true }, { wish: { x: 0, z: 0 }, jump: true }, mods.movement, 1 / 60);
  assert.ok(j.vel.y > 7);
});

test('flight mode ignores gravity and climbs on input', () => {
  const mods = createDefaultMods();
  mods.movement.fly = true;
  let s = { pos: { x: 0, y: 2, z: 0 }, vel: { x: 0, y: 0, z: 0 }, grounded: false };
  for (let i = 0; i < 60; i++) s = stepMovement(s, { wish: { x: 0, z: 0 }, flyUp: true }, mods.movement, 1 / 60);
  assert.ok(s.pos.y > 8, `flew up to ${s.pos.y}`);
  const yHover = s.pos.y;
  for (let i = 0; i < 60; i++) s = stepMovement(s, { wish: { x: 0, z: 0 } }, mods.movement, 1 / 60);
  assert.equal(s.pos.y, yHover, 'hover: no gravity while flying');
});

test('low gravity falls slower; air control steers mid-air', () => {
  const fall = (gravityMult) => {
    const mv = { ...createDefaultMods().movement, gravityMult };
    let s = { pos: { x: 0, y: 10, z: 0 }, vel: { x: 0, y: 0, z: 0 }, grounded: false };
    for (let i = 0; i < 30; i++) s = stepMovement(s, { wish: { x: 0, z: 0 } }, mv, 1 / 60);
    return s.pos.y;
  };
  assert.ok(fall(0.2) > fall(1), 'moon gravity falls slower');
  const mvNoAir = { ...createDefaultMods().movement, airControl: 0 };
  const mvAir = { ...createDefaultMods().movement, airControl: 1 };
  const drift = (mv) => {
    let s = { pos: { x: 0, y: 10, z: 0 }, vel: { x: 0, y: 0, z: 0 }, grounded: false };
    for (let i = 0; i < 30; i++) s = stepMovement(s, { wish: { x: 1, z: 0 } }, mv, 1 / 60);
    return s.pos.x;
  };
  assert.ok(drift(mvAir) > drift(mvNoAir) + 0.5, 'air control moves you mid-air');
});
