// PHANTOM OPS X — Ultra Modification Engine (pure logic core).
// Every function here is exercised by the standalone game at runtime AND by
// the automated test-suite, so menu settings provably change real behaviour.

import { weaponById, attachmentById } from './catalog.js';

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function createDefaultMods() {
  return {
    aim: {
      enabled: false,
      lockMode: 'crosshair',       // 'crosshair' | 'nearest' | 'weakest'
      bone: 'body',                // 'head' | 'body'
      smoothing: 0.45,             // 0 = instant, 1 = glass-smooth
      strength: 0.7,               // 0..1 assist authority
      fovDeg: 35,                  // target-acquisition cone (full angle)
      autoSwitch: true,
      flickAssist: false,
      flickThresholdDeg: 6,
      prediction: 0.5,             // 0..1 target-leading factor
      perWeapon: {},               // weaponId -> partial aim overrides
    },
    movement: {
      fly: false,
      speedMult: 1,
      sprintMult: 1.45,
      jumpMult: 1,
      airControl: 0.35,
      gravityMult: 1,
    },
    movementPresets: {},           // name -> movement object
    weapons: {
      adsMult: 1,                  // <1 = faster ADS
      fireRateMult: 1,
      recoilMult: 1,
      reloadMult: 1,
      spreadMult: 1,
      damageMult: 1,
      scopeSpeedMult: 1,
      infiniteAmmo: false,
      attachments: {},             // weaponId -> {slot: attachmentId}
    },
    visuals: {
      enemyIndicators: true,
      radar: true,
      radarRange: 45,
      damageNumbers: true,
      hitmarkers: true,
      fpsCounter: true,
      perfGraph: false,
      crosshair: { size: 10, gap: 5, thickness: 2, color: '#39ff88', dot: true, outline: true },
    },
  };
}

const NUM = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : dflt;
};

// Deep-validate + clamp any (possibly untrusted) mod config into a safe shape.
export function sanitizeMods(input) {
  const d = createDefaultMods();
  if (!input || typeof input !== 'object') return d;
  const a = input.aim || {};
  d.aim.enabled = !!a.enabled;
  if (['crosshair', 'nearest', 'weakest'].includes(a.lockMode)) d.aim.lockMode = a.lockMode;
  if (['head', 'body'].includes(a.bone)) d.aim.bone = a.bone;
  d.aim.smoothing = NUM(a.smoothing, 0, 1, d.aim.smoothing);
  d.aim.strength = NUM(a.strength, 0, 1, d.aim.strength);
  d.aim.fovDeg = NUM(a.fovDeg, 2, 120, d.aim.fovDeg);
  d.aim.autoSwitch = a.autoSwitch !== false;
  d.aim.flickAssist = !!a.flickAssist;
  d.aim.flickThresholdDeg = NUM(a.flickThresholdDeg, 1, 30, d.aim.flickThresholdDeg);
  d.aim.prediction = NUM(a.prediction, 0, 1, d.aim.prediction);
  if (a.perWeapon && typeof a.perWeapon === 'object') {
    for (const [wid, ov] of Object.entries(a.perWeapon)) {
      if (!weaponById(wid) || !ov || typeof ov !== 'object') continue;
      d.aim.perWeapon[wid] = {
        bone: ['head', 'body'].includes(ov.bone) ? ov.bone : undefined,
        smoothing: ov.smoothing !== undefined ? NUM(ov.smoothing, 0, 1, 0.45) : undefined,
        strength: ov.strength !== undefined ? NUM(ov.strength, 0, 1, 0.7) : undefined,
        fovDeg: ov.fovDeg !== undefined ? NUM(ov.fovDeg, 2, 120, 35) : undefined,
      };
    }
  }
  const m = input.movement || {};
  d.movement.fly = !!m.fly;
  d.movement.speedMult = NUM(m.speedMult, 0.2, 6, 1);
  d.movement.sprintMult = NUM(m.sprintMult, 1, 4, 1.45);
  d.movement.jumpMult = NUM(m.jumpMult, 0.2, 4, 1);
  d.movement.airControl = NUM(m.airControl, 0, 1, 0.35);
  d.movement.gravityMult = NUM(m.gravityMult, 0.05, 3, 1);
  if (input.movementPresets && typeof input.movementPresets === 'object') {
    for (const [name, p] of Object.entries(input.movementPresets)) {
      if (p && typeof p === 'object') {
        d.movementPresets[String(name).slice(0, 32)] = {
          fly: !!p.fly,
          speedMult: NUM(p.speedMult, 0.2, 6, 1),
          sprintMult: NUM(p.sprintMult, 1, 4, 1.45),
          jumpMult: NUM(p.jumpMult, 0.2, 4, 1),
          airControl: NUM(p.airControl, 0, 1, 0.35),
          gravityMult: NUM(p.gravityMult, 0.05, 3, 1),
        };
      }
    }
  }
  const w = input.weapons || {};
  d.weapons.adsMult = NUM(w.adsMult, 0.05, 3, 1);
  d.weapons.fireRateMult = NUM(w.fireRateMult, 0.2, 5, 1);
  d.weapons.recoilMult = NUM(w.recoilMult, 0, 3, 1);
  d.weapons.reloadMult = NUM(w.reloadMult, 0.05, 3, 1);
  d.weapons.spreadMult = NUM(w.spreadMult, 0, 3, 1);
  d.weapons.damageMult = NUM(w.damageMult, 0.1, 6, 1);
  d.weapons.scopeSpeedMult = NUM(w.scopeSpeedMult, 0.1, 4, 1);
  d.weapons.infiniteAmmo = !!w.infiniteAmmo;
  if (w.attachments && typeof w.attachments === 'object') {
    for (const [wid, slots] of Object.entries(w.attachments)) {
      if (!weaponById(wid) || !slots || typeof slots !== 'object') continue;
      d.weapons.attachments[wid] = {};
      for (const [slot, attId] of Object.entries(slots)) {
        const att = attachmentById(attId);
        if (att && att.slot === slot) d.weapons.attachments[wid][slot] = attId;
      }
    }
  }
  const v = input.visuals || {};
  d.visuals.enemyIndicators = v.enemyIndicators !== false;
  d.visuals.radar = v.radar !== false;
  d.visuals.radarRange = NUM(v.radarRange, 10, 120, 45);
  d.visuals.damageNumbers = v.damageNumbers !== false;
  d.visuals.hitmarkers = v.hitmarkers !== false;
  d.visuals.fpsCounter = v.fpsCounter !== false;
  d.visuals.perfGraph = !!v.perfGraph;
  if (v.crosshair && typeof v.crosshair === 'object') {
    const c = v.crosshair;
    d.visuals.crosshair = {
      size: NUM(c.size, 2, 40, 10),
      gap: NUM(c.gap, 0, 30, 5),
      thickness: NUM(c.thickness, 1, 8, 2),
      color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#39ff88',
      dot: c.dot !== false,
      outline: c.outline !== false,
    };
  }
  return d;
}

// Effective aim config for a specific weapon (per-weapon profile merged over global).
export function resolveAimProfile(mods, weaponId) {
  const base = { ...mods.aim };
  const ov = (weaponId && mods.aim.perWeapon[weaponId]) || {};
  for (const k of ['bone', 'smoothing', 'strength', 'fovDeg']) {
    if (ov[k] !== undefined) base[k] = ov[k];
  }
  return base;
}

// --- Aim solver -------------------------------------------------------------
export const normAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

// World-space -> camera angles (yaw=0 faces -Z, matching the game camera).
export function anglesTo(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz) || 0.0001;
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: clamp(Math.asin(clamp(dy / dist, -1, 1)), -1.45, 1.45),
    dist,
  };
}

// Bone world-point for a target whose origin is at its feet.
export function bonePoint(target, bone) {
  const h = target.height || 1.8;
  const y = bone === 'head' ? h * 0.93 : h * 0.62;
  return { x: target.pos.x, y: target.pos.y + y, z: target.pos.z };
}

// Lead a moving target. Hitscan uses a simulated finite muzzle velocity so the
// prediction experiment is observable; factor 0 disables leading.
export function predictPoint(point, velocity, dist, cfg) {
  if (!velocity || cfg.prediction <= 0) return { ...point };
  const speed = 220; // simulated m/s
  const t = (dist / speed) * cfg.prediction;
  return {
    x: point.x + velocity.x * t,
    y: point.y + velocity.y * t,
    z: point.z + velocity.z * t,
  };
}

// Pick the current target from live candidates.
// candidate: {id, pos, vel, hp, alive, visible, angle (rad from crosshair), dist, height}
export function selectTarget(candidates, mods, weaponId, currentId = null) {
  const cfg = resolveAimProfile(mods, weaponId);
  if (!cfg.enabled) return { target: null, cfg, switched: false };
  const halfFov = (cfg.fovDeg * Math.PI / 180) / 2;
  const inFov = candidates.filter((c) => c.alive && c.visible && c.angle <= halfFov);
  if (!inFov.length) return { target: null, cfg, switched: !!currentId };
  const current = inFov.find((c) => c.id === currentId);
  if (current && !cfg.autoSwitch) return { target: current, cfg, switched: false };
  let best = inFov[0];
  const score = (c) =>
    cfg.lockMode === 'nearest' ? c.dist :
    cfg.lockMode === 'weakest' ? c.hp : c.angle;
  for (const c of inFov) if (score(c) < score(best)) best = c;
  // Stickiness: keep current target unless the new one is clearly better.
  if (current && cfg.autoSwitch && best.id !== current.id) {
    if (score(best) > score(current) * 0.6) best = current;
  }
  return { target: best, cfg, switched: !!currentId && best.id !== currentId };
}

// Advance camera angles toward the desired ones for one frame.
// Returns {yaw, pitch, snapped, errorRad}.
export function stepAim(cur, want, cfg, dt, firing = false) {
  const errYaw = normAngle(want.yaw - cur.yaw);
  const errPitch = normAngle(want.pitch - cur.pitch);
  const err = Math.hypot(errYaw, errPitch);
  const flickRad = cfg.flickThresholdDeg * Math.PI / 180;
  if (cfg.flickAssist && firing && err > 0 && err <= flickRad) {
    return { yaw: want.yaw, pitch: want.pitch, snapped: true, errorRad: 0 };
  }
  // Smoothing 0 -> near-instant tracking; 1 -> heavy exponential glide.
  const responsiveness = (1 - cfg.smoothing * 0.92) * (0.35 + cfg.strength * 2.4);
  const alpha = clamp(responsiveness * dt * 14, 0, 1);
  const maxStep = (3 + cfg.strength * 20) * dt; // hard turn-rate cap (rad/s scaled)
  let dYaw = errYaw * alpha, dPitch = errPitch * alpha;
  const mag = Math.hypot(dYaw, dPitch);
  if (mag > maxStep && mag > 0) { dYaw = dYaw / mag * maxStep; dPitch = dPitch / mag * maxStep; }
  return {
    yaw: cur.yaw + dYaw,
    pitch: clamp(cur.pitch + dPitch, -1.45, 1.45),
    snapped: false,
    errorRad: Math.hypot(normAngle(want.yaw - (cur.yaw + dYaw)), normAngle(want.pitch - (cur.pitch + dPitch))),
  };
}

// --- Weapon stat computation -------------------------------------------------
export function computeWeaponStats(weapon, mods, level = 1) {
  const wm = mods.weapons;
  const stats = {
    damage: weapon.damage * (1 + 0.06 * (clamp(level, 1, weapon.maxLevel) - 1)),
    headMult: weapon.headMult,
    fireRateRpm: weapon.fireRate,
    adsTimeMs: weapon.adsTime,
    reloadMs: weapon.reload,
    spreadDeg: weapon.spread,
    recoilDeg: weapon.recoil,
    range: weapon.range,
    magSize: weapon.mag,
    zoom: weapon.zoom,
    moveMult: weapon.move,
    pellets: weapon.pellets || 1,
    projectileSpeed: weapon.projectileSpeed || 0,
    infiniteAmmo: !!wm.infiniteAmmo,
  };
  const slots = wm.attachments[weapon.id] || {};
  for (const attId of Object.values(slots)) {
    const att = attachmentById(attId);
    if (!att) continue;
    for (const [k, mult] of Object.entries(att.mods)) {
      if (k === 'mag') stats.magSize = Math.max(1, Math.round(stats.magSize * mult));
      else if (k === 'adsTime') stats.adsTimeMs *= mult;
      else if (k === 'damage') stats.damage *= mult;
      else if (k === 'recoil') stats.recoilDeg *= mult;
      else if (k === 'spread') stats.spreadDeg *= mult;
      else if (k === 'reload') stats.reloadMs *= mult;
      else if (k === 'range') stats.range *= mult;
      else if (k === 'zoom') stats.zoom *= mult;
      else if (k === 'move') stats.moveMult *= mult;
    }
  }
  stats.damage *= wm.damageMult;
  stats.fireRateRpm *= wm.fireRateMult;
  stats.adsTimeMs = Math.max(25, stats.adsTimeMs * wm.adsMult);
  stats.reloadMs = Math.max(150, stats.reloadMs * wm.reloadMult);
  stats.spreadDeg = Math.max(0, stats.spreadDeg * wm.spreadMult);
  stats.recoilDeg = Math.max(0, stats.recoilDeg * wm.recoilMult);
  stats.fireIntervalMs = 60000 / stats.fireRateRpm;
  return stats;
}

// --- Movement physics ---------------------------------------------------------
// Pure fixed-step character physics used by the game loop. groundY is supplied
// by the game's collision pass (0 = flat floor).
export function stepMovement(state, input, mv, dt, groundY = 0) {
  const s = {
    pos: { ...state.pos }, vel: { ...state.vel },
    grounded: state.grounded, flying: !!mv.fly,
  };
  const walkSpeed = 4.3 * mv.speedMult;
  const sprintSpeed = walkSpeed * mv.sprintMult;
  const targetSpeed = input.sprint ? sprintSpeed : walkSpeed;
  const wishX = (input.wish?.x || 0), wishZ = (input.wish?.z || 0);
  const wishLen = Math.hypot(wishX, wishZ) || 1;
  const tx = (wishX / wishLen) * targetSpeed * (input.moveAmount ?? 1);
  const tz = (wishZ / wishLen) * targetSpeed * (input.moveAmount ?? 1);
  const hasWish = Math.abs(wishX) + Math.abs(wishZ) > 0.001;

  if (mv.fly) {
    const flySpeed = 11 * mv.speedMult;
    s.vel.x = lerp(s.vel.x, hasWish ? tx * 2.2 : 0, clamp(dt * 6, 0, 1));
    s.vel.z = lerp(s.vel.z, hasWish ? tz * 2.2 : 0, clamp(dt * 6, 0, 1));
    s.vel.y = ((input.flyUp ? 1 : 0) - (input.flyDown ? 1 : 0)) * flySpeed;
    s.grounded = false;
  } else {
    const accel = s.grounded ? 14 : 14 * mv.airControl * 3.2;
    const t = clamp(accel * dt, 0, 1);
    s.vel.x = lerp(s.vel.x, hasWish ? tx : 0, t);
    s.vel.z = lerp(s.vel.z, hasWish ? tz : 0, t);
    s.vel.y += -22 * mv.gravityMult * dt;
    if (input.jump && s.grounded) {
      s.vel.y = 7.6 * mv.jumpMult;
      s.grounded = false;
    }
  }
  s.pos.x += s.vel.x * dt;
  s.pos.y += s.vel.y * dt;
  s.pos.z += s.vel.z * dt;
  if (!mv.fly && s.pos.y <= groundY) {
    s.pos.y = groundY;
    if (s.vel.y < 0) s.vel.y = 0;
    s.grounded = true;
  } else if (!mv.fly) {
    s.grounded = s.pos.y <= groundY + 0.001;
  }
  return s;
}
