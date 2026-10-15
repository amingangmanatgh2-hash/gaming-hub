// PHANTOM OPS X — standalone first-person shooter.
// Built on the *tested* pure modules (mods.js physics/aim/stats, economy.js),
// so every floating-menu setting changes real gameplay here.

import * as THREE from 'three';
import {
  sanitizeMods, resolveAimProfile, selectTarget, stepAim, anglesTo, bonePoint,
  predictPoint, computeWeaponStats, stepMovement, clamp, normAngle,
} from './mods.js';
import { weaponById, cosmeticById, mapById, modeById, DIFFICULTIES } from './catalog.js';
import { buildWeaponModel, buildBotModel } from './model.js';

const BOT_NAMES = ['VIPER', 'HAVOC', 'ORION', 'JINX', 'ROGUE', 'ECHO', 'TITAN', 'NOVA', 'ONYX', 'FABLE', 'WRAITH', 'ZERO'];
const rand = (a, b) => a + Math.random() * (b - a);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor(els, callbacks) {
    this.els = els;
    this.cb = callbacks; // { onMatchEnd(result), onSave(), sfx }
    this.sfx = callbacks.sfx;
    this.profile = null;
    this.state = 'idle';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    els.wrap.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.08, 400);
    this.camera.rotation.order = 'YXZ';
    this.clock = new THREE.Clock();
    this.keys = {};
    this.bots = [];
    this.colliders = [];   // THREE.Box3
    this.solids = [];      // meshes for raycast
    this.projectiles = [];
    this.effects = [];
    this.tracers = [];
    this.player = null;
    this.match = null;
    this.aimTargetId = null;
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this.bindInput();
    this.makeCrosshair();
    this.damagePool = [];
    for (let i = 0; i < 22; i++) {
      const d = document.createElement('div');
      d.className = 'dmgnum';
      els.damageLayer.appendChild(d);
      this.damagePool.push({ el: d, life: 0, world: new THREE.Vector3(), vel: 0 });
    }
    for (let i = 0; i < 24; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tagPool = [];
    for (let i = 0; i < 14; i++) {
      const d = document.createElement('div');
      d.className = 'enemy-tag';
      els.tagLayer.appendChild(d);
      this.tagPool.push(d);
    }
    this.fpsFrames = 0; this.fpsTime = 0; this.fps = 0; this.frameTimes = [];
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setProfile(profile) {
    this.profile = profile;
    if (profile) profile.mods = sanitizeMods(profile.mods);
  }

  setQuality(q) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? 1 : q === 'high' ? Math.min(dpr, 2) : Math.min(dpr, 1.75));
    this.onResize();
  }

  // Rebuild player weapon states after loadout changes (works mid-match too).
  applyLoadout() {
    if (!this.profile) return;
    const inv = this.profile.inventory;
    if (this.state === 'playing' && this.player) {
      this.player.weapons.primary = this.makeWeaponState(inv.loadout.primary);
      this.player.weapons.secondary = this.makeWeaponState(inv.loadout.secondary);
      this.equipViewmodel();
    }
  }

  mods() { return this.profile ? this.profile.mods : sanitizeMods(null); }
  settings() { return this.profile?.settings || { sensitivity: 1, volume: 0.8, fov: 78, quality: 'auto' }; }

  onResize() {
    const w = this.els.wrap.clientWidth || window.innerWidth;
    const h = this.els.wrap.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------- world build
  buildWorld(map) {
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    this.colliders = []; this.solids = []; this.bots = []; this.projectiles = []; this.effects = [];
    this.scene.background = new THREE.Color(map.sky);
    this.scene.fog = new THREE.Fog(new THREE.Color(map.fog), 40, map.size * 1.9);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, map.night ? 0.35 : 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(map.night ? 0x8fb4ff : 0xfff2d8, map.night ? 0.5 : 1.1);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);
    if (map.night) {
      for (let i = 0; i < 6; i++) {
        const p = new THREE.PointLight(0x22d3ee, 12, 30);
        p.position.set(rand(-map.size / 2, map.size / 2), 5, rand(-map.size / 2, map.size / 2));
        this.scene.add(p);
      }
    }
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(map.size * 2, map.size * 2),
      new THREE.MeshStandardMaterial({ color: map.ground, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const rng = mulberry32(map.id.split('').reduce((a, c) => a + c.charCodeAt(0), 7));
    const addBox = (w, h, d, x, z, color, emissive = 0) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1, emissive: color, emissiveIntensity: emissive })
      );
      m.position.set(x, h / 2, z);
      this.scene.add(m);
      this.solids.push(m);
      this.colliders.push(new THREE.Box3().setFromObject(m));
      return m;
    };
    const S = map.size;
    // perimeter
    addBox(S, 5, 1, 0, -S / 2, 0x3c4657); addBox(S, 5, 1, 0, S / 2, 0x3c4657);
    addBox(1, 5, S, -S / 2, 0, 0x3c4657); addBox(1, 5, S, S / 2, 0, 0x3c4657);
    for (let i = 0; i < map.buildings; i++) {
      const w = 6 + rng() * 8, d = 6 + rng() * 8, h = 4 + rng() * 7;
      let x = (rng() - 0.5) * (S - 24), z = (rng() - 0.5) * (S - 24);
      if (Math.hypot(x, z) < 14) { x += 18; }
      addBox(w, h, d, x, z, map.night ? 0x1d2748 : 0x8d99ae, map.night ? 0.35 : 0);
    }
    for (let i = 0; i < map.crates; i++) {
      const s = 1.1 + rng() * 1.6;
      let x = (rng() - 0.5) * (S - 14), z = (rng() - 0.5) * (S - 14);
      if (Math.hypot(x, z) < 8) continue;
      addBox(s, s, s, x, z, [0xa9825a, 0x6b7f5e, 0x707a8c][i % 3]);
      if (rng() > 0.6) addBox(s * 0.8, s * 0.8, s * 0.8, x, z, 0x8a6f4d).position.y = s + s * 0.4;
    }
    // viewmodel + flash light
    this.viewGroup = new THREE.Group();
    this.camera.add(this.viewGroup);
    this.scene.add(this.camera);
    this.flashLight = new THREE.PointLight(0xffd76a, 0, 12);
    this.scene.add(this.flashLight);
  }

  spawnsFor(map) {
    const S = map.size / 2 - 7;
    return {
      0: [new THREE.Vector3(-S, 0, S), new THREE.Vector3(-S + 5, 0, S - 4), new THREE.Vector3(-S + 10, 0, S), new THREE.Vector3(0, 0, S)],
      1: [new THREE.Vector3(S, 0, -S), new THREE.Vector3(S - 5, 0, -S + 4), new THREE.Vector3(S - 10, 0, -S), new THREE.Vector3(0, 0, -S)],
      2: [new THREE.Vector3(-S, 0, -S), new THREE.Vector3(S, 0, S), new THREE.Vector3(0, 0, -S), new THREE.Vector3(-S, 0, 0), new THREE.Vector3(S, 0, 0), new THREE.Vector3(0, 0, S), new THREE.Vector3(S / 2, 0, -S / 2)],
    };
  }

  groundYAt(x, z, feetY) {
    let g = 0;
    for (const b of this.colliders) {
      if (x >= b.min.x - 0.3 && x <= b.max.x + 0.3 && z >= b.min.z - 0.3 && z <= b.max.z + 0.3) {
        if (b.max.y <= feetY + 0.55 && b.max.y > g) g = b.max.y;
      }
    }
    return g;
  }

  collide(pos, radius = 0.36, height = 1.8) {
    for (const b of this.colliders) {
      if (b.max.y - b.min.y > 4.5 && height < 5) { /* walls handled below */ }
      const nx = clamp(pos.x, b.min.x, b.max.x);
      const nz = clamp(pos.z, b.min.z, b.max.z);
      const dx = pos.x - nx, dz = pos.z - nz;
      const feet = pos.y, top = pos.y + height;
      if (top <= b.min.y + 0.05 || feet >= b.max.y - 0.05) continue;
      if (dx * dx + dz * dz < radius * radius) {
        const len = Math.hypot(dx, dz) || 0.001;
        if (len > 0.01 || (pos.x > b.min.x && pos.x < b.max.x && pos.z > b.min.z && pos.z < b.max.z)) {
          // push out horizontally along smallest exit
          const exits = [
            { d: pos.x - (b.min.x - radius), ax: 'x', v: b.min.x - radius },
            { d: (b.max.x + radius) - pos.x, ax: 'x', v: b.max.x + radius },
            { d: pos.z - (b.min.z - radius), ax: 'z', v: b.min.z - radius },
            { d: (b.max.z + radius) - pos.z, ax: 'z', v: b.max.z + radius },
          ].sort((a, b2) => a.d - b2.d);
          pos[exits[0].ax] = exits[0].v;
        } else {
          pos.x += (dx / len) * (radius - len);
          pos.z += (dz / len) * (radius - len);
        }
      }
    }
    const lim = (this.mapDef ? this.mapDef.size / 2 - 1 : 60);
    pos.x = clamp(pos.x, -lim, lim);
    pos.z = clamp(pos.z, -lim, lim);
  }

  losBlocked(from, to) {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.5) return false;
    this.ray.set(from, dir.normalize());
    const hits = this.ray.intersectObjects(this.solids, false);
    return hits.length > 0 && hits[0].distance < dist - 0.6;
  }

  // ------------------------------------------------------------- match setup
  startMatch(cfg) {
    const map = mapById(cfg.mapId);
    const mode = modeById(cfg.modeId);
    const diff = DIFFICULTIES[cfg.difficultyId] || DIFFICULTIES.regular;
    this.mapDef = map;
    this.ray = new THREE.Raycaster();
    this.buildWorld(map);
    this.diff = diff;
    this.match = {
      mode, map, diff, timeLeft: 300, over: false,
      score: { 0: 0, 1: 0 }, playerTeam: 0,
      startedAt: performance.now(),
    };
    const inv = this.profile.inventory;
    this.player = {
      isPlayer: true, name: this.profile.username, team: 0,
      pos: new THREE.Vector3(), vel: { x: 0, y: 0, z: 0 }, grounded: true,
      yaw: 0, pitch: 0, hp: 100, maxHp: 100, alive: true, respawnAt: 0,
      slot: 'primary',
      weapons: {
        primary: this.makeWeaponState(inv.loadout.primary),
        secondary: this.makeWeaponState(inv.loadout.secondary),
      },
      adsHeld: false, adsProgress: 0, firing: false, lastShot: 0, bloom: 0,
      reloadingUntil: 0, kills: 0, deaths: 0, flyUp: false, flyDown: false,
      moveState: null,
    };
    this.player.moveState = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, grounded: true };
    this.spawnPlayer();
    // bots
    const spawns = this.spawnsFor(map);
    const mkBot = (team, i, passive = false) => {
      const sp = spawns[mode.id === 'ffa' ? 2 : team][i % spawns[mode.id === 'ffa' ? 2 : team].length];
      const outfitColors = [0x5b6b7a, 0x232a3d, 0xb99b5f, 0x35424f, 0x6e3b3b];
      const grp = buildBotModel(THREE, team === 0 ? 0x2f7bff : 0xff4545, outfitColors[i % outfitColors.length]);
      grp.position.copy(sp);
      this.scene.add(grp);
      const bot = {
        isPlayer: false, id: `bot_${team}_${i}`, name: BOT_NAMES[(i + team * 5) % BOT_NAMES.length],
        team: mode.id === 'ffa' ? 100 + i : team, grp,
        pos: sp.clone(), vel: new THREE.Vector3(), hp: diff.botHp, maxHp: diff.botHp,
        alive: true, respawnAt: 0, height: 1.8, passive,
        state: 'patrol', target: null, seenAt: 0, nextShot: 0, burst: 0, nextBurst: 0,
        strafeDir: 1, strafeFlip: 0, waypoint: sp.clone(), thinkAt: Math.random() * 0.3,
        vel3: { x: 0, y: 0, z: 0 }, visibleToPlayer: false,
      };
      grp.traverse((o) => { o.userData.botId = bot.id; });
      this.bots.push(bot);
      return bot;
    };
    if (mode.id === 'tdm') { for (let i = 0; i < 3; i++) mkBot(0, i); for (let i = 0; i < 4; i++) mkBot(1, i); }
    else if (mode.id === 'ffa') { for (let i = 0; i < 7; i++) mkBot(2, i); this.bots.forEach((b, i) => { b.team = 100 + i; }); }
    else { for (let i = 0; i < 6; i++) mkBot(1, i, true); }
    this.state = 'playing';
    this.aimTargetId = null;
    this.equipViewmodel();
    this.updateCrosshair();
    this.cb.onMatchStart?.();
  }

  makeWeaponState(weaponId) {
    const w = weaponById(weaponId) || weaponById('ar_phantom');
    return { id: w.id, def: w, mag: 0, reserve: 0, _init: false };
  }

  weaponStats(ws) {
    const level = this.profile.inventory.weaponLevels[ws.id] || 1;
    return computeWeaponStats(ws.def, this.mods(), level);
  }

  currentWeapon() { return this.player.weapons[this.player.slot]; }

  equipViewmodel() {
    while (this.viewGroup.children.length) this.viewGroup.remove(this.viewGroup.children[0]);
    const ws = this.currentWeapon();
    const inv = this.profile.inventory;
    const camoId = inv.loadout.camoByWeapon[ws.id] || 'camo_factory';
    const camo = cosmeticById(camoId);
    const outfit = cosmeticById(inv.loadout.outfit);
    const model = buildWeaponModel(THREE, ws.def, { camoColor: camo?.color, animated: ws.def.animated || camo?.animated });
    model.position.set(0.26, -0.22, -0.45);
    model.rotation.y = Math.PI;
    this.viewGroup.add(model);
    this.viewModel = model;
    // arms in outfit colour
    const armMat = new THREE.MeshStandardMaterial({ color: outfit?.color || '#5b6b7a', roughness: 0.8 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3), armMat);
    arm.position.set(0.18, -0.28, -0.3);
    arm.rotation.x = 0.4;
    this.viewGroup.add(arm);
    const stats = this.weaponStats(ws);
    if (!ws._init) { ws.mag = stats.magSize; ws.reserve = stats.magSize * 6; ws._init = true; }
    ws.mag = Math.min(ws.mag, stats.magSize);
  }

  spawnPlayer() {
    const spawns = this.spawnsFor(this.mapDef);
    const list = this.match.mode.id === 'ffa' ? spawns[2] : spawns[0];
    const sp = list[Math.floor(Math.random() * list.length)];
    this.player.pos.copy(sp);
    this.player.moveState.pos = { x: sp.x, y: 0, z: sp.z };
    this.player.moveState.vel = { x: 0, y: 0, z: 0 };
    this.player.hp = this.player.maxHp;
    this.player.alive = true;
    this.player.yaw = Math.atan2(-(0 - sp.x), -(0 - sp.z));
    const ws = this.currentWeapon();
    const stats = this.weaponStats(ws);
    ws.mag = stats.magSize; ws.reserve = stats.magSize * 6; ws._init = true;
    this.player.reloadingUntil = 0;
  }

  spawnBot(bot) {
    const spawns = this.spawnsFor(this.mapDef);
    const key = this.match.mode.id === 'ffa' ? 2 : (bot.team === 0 ? 0 : 1);
    const sp = spawns[key][Math.floor(Math.random() * spawns[key].length)];
    bot.pos.copy(sp);
    bot.hp = bot.maxHp;
    bot.alive = true;
    bot.grp.visible = true;
    bot.state = 'patrol';
    bot.target = null;
  }

  stopMatch(toMenu = true) {
    this.state = 'idle';
    this.match = null;
    if (document.pointerLockElement) document.exitPointerLock();
    this.cb.onMatchStop?.(toMenu);
  }

  endMatch(reason) {
    if (!this.match || this.match.over) return;
    this.match.over = true;
    this.state = 'ended';
    if (document.pointerLockElement) document.exitPointerLock();
    const m = this.match;
    let won;
    if (m.mode.id === 'tdm') won = m.score[0] >= m.score[1];
    else won = this.player.kills >= this.bots.reduce((a, b) => Math.max(a, b.kills || 0), 0);
    const result = {
      mode: m.mode, map: m.map, diff: m.diff, won, reason,
      kills: this.player.kills, deaths: this.player.deaths,
      score: { ...m.score }, durationSec: (performance.now() - m.startedAt) / 1000,
    };
    this.cb.onMatchEnd(result);
  }

  // ------------------------------------------------------------- input
  bindInput() {
    const cvs = this.renderer.domElement;
    cvs.addEventListener('click', () => {
      if (this.state === 'playing' && !('ontouchstart' in window)) cvs.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cvs;
      if (!this.locked && this.state === 'playing' && !('ontouchstart' in window)) this.cb.onPauseRequest?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.state !== 'playing' || !this.player?.alive) return;
      const sens = 0.0021 * this.settings().sensitivity * (1 - this.player.adsProgress * 0.45);
      this.player.yaw -= e.movementX * sens;
      this.player.pitch = clamp(this.player.pitch - e.movementY * sens, -1.45, 1.45);
    });
    cvs.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (e.button === 0) this.player.firing = true;
      if (e.button === 2) this.player.adsHeld = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.player) return;
      if (e.button === 0) this.player.firing = false;
      if (e.button === 2) this.player.adsHeld = false;
    });
    cvs.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (this.state !== 'playing') return;
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'Digit1') this.switchSlot('primary');
      if (e.code === 'Digit2') this.switchSlot('secondary');
      if (e.code === 'KeyQ') this.switchSlot(this.player.slot === 'primary' ? 'secondary' : 'primary');
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    // touch look
    let lookId = null, lx = 0, ly = 0;
    cvs.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > window.innerWidth * 0.45 && lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    cvs.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookId && this.player && this.state === 'playing') {
          const sens = 0.0042 * this.settings().sensitivity;
          this.player.yaw -= (t.clientX - lx) * sens;
          this.player.pitch = clamp(this.player.pitch - (t.clientY - ly) * sens, -1.45, 1.45);
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    cvs.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    });
  }

  bindTouchButton(el, down, up) {
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); up && up(); }, { passive: false });
    el.addEventListener('mousedown', () => down());
    el.addEventListener('mouseup', () => up && up());
  }

  switchSlot(slot) {
    if (!this.player || this.player.slot === slot || !this.player.alive) return;
    this.player.slot = slot;
    this.player.reloadingUntil = 0;
    this.equipViewmodel();
    this.sfx.ui();
  }

  startReload() {
    const p = this.player;
    if (!p?.alive || this.state !== 'playing') return;
    const ws = this.currentWeapon();
    const stats = this.weaponStats(ws);
    if (stats.infiniteAmmo || ws.mag >= stats.magSize || ws.reserve <= 0) return;
    if (performance.now() < p.reloadingUntil) return;
    p.reloadingUntil = performance.now() + stats.reloadMs;
    p._reloadDone = false;
    this.sfx.reload();
  }

  // ------------------------------------------------------------- combat
  eyePos() {
    return new THREE.Vector3(this.player.pos.x, this.player.pos.y + 1.62, this.player.pos.z);
  }

  camDir() {
    const p = this.player;
    return new THREE.Vector3(
      -Math.sin(p.yaw) * Math.cos(p.pitch),
      Math.sin(p.pitch),
      -Math.cos(p.yaw) * Math.cos(p.pitch)
    ).normalize();
  }

  tryShoot(now) {
    const p = this.player;
    const ws = this.currentWeapon();
    const stats = this.weaponStats(ws);
    const semi = stats.fireRateRpm < 300;
    if (semi && p._semiLatch) return;
    if (now - p.lastShot < stats.fireIntervalMs) return;
    if (now < p.reloadingUntil) return;
    if (ws.mag <= 0) {
      if (!p._emptyClicked) { this.sfx.empty(); p._emptyClicked = true; this.startReload(); }
      return;
    }
    p._emptyClicked = false;
    p._semiLatch = true;
    p.lastShot = now;
    if (!stats.infiniteAmmo) ws.mag -= 1;
    p.bloom = Math.min(3.2, p.bloom + stats.spreadDeg * 0.55 + 0.25);
    this.profile.stats.shots += stats.pellets;
    this.sfx.shoot(ws.def.cls);
    // muzzle flash
    const muzzleFx = cosmeticById(this.profile.inventory.loadout.muzzle);
    const mwp = new THREE.Vector3();
    this.viewModel.userData.muzzle.getWorldPosition(mwp);
    this.flashLight.position.copy(mwp);
    this.flashLight.color.set(muzzleFx?.color || '#ffd76a');
    this.flashLight.intensity = 14;
    // recoil kick (real camera effect, scaled by recoil mod)
    const kick = stats.recoilDeg * (p.adsProgress > 0.5 ? 0.65 : 1);
    p.pitch = clamp(p.pitch + kick * 0.011, -1.45, 1.45);
    p.yaw += rand(-1, 1) * kick * 0.004;
    this.viewKick = 1;
    const eye = this.eyePos();
    const baseDir = this.camDir();
    const right = new THREE.Vector3().crossVectors(baseDir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, baseDir).normalize();
    const spreadRad = ((stats.spreadDeg * (p.adsProgress > 0.6 ? 0.22 : 1)) + p.bloom * 0.35) * Math.PI / 180;
    for (let pellet = 0; pellet < stats.pellets; pellet++) {
      const a = rand(-spreadRad, spreadRad), b = rand(-spreadRad, spreadRad);
      const dir = baseDir.clone().addScaledVector(right, a).addScaledVector(up, b).normalize();
      if (stats.projectileSpeed > 0) {
        this.projectiles.push({ pos: eye.clone().addScaledVector(dir, 0.4), vel: dir.clone().multiplyScalar(stats.projectileSpeed), stats, life: 2.4, fromPlayer: true });
        this.spawnTracer(eye.clone().addScaledVector(dir, 0.4), eye.clone().addScaledVector(dir, 3), muzzleFx?.color);
      } else {
        this.fireHitscan(eye, dir, stats, ws, true, muzzleFx?.color);
      }
    }
    if (ws.mag === 0 && !stats.infiniteAmmo) this.startReload();
  }

  fireHitscan(eye, dir, stats, ws, fromPlayer, fxColor) {
    this.ray.set(eye, dir);
    this.ray.far = 300;
    const botMeshes = [];
    for (const b of this.bots) if (b.alive) botMeshes.push(...b.grp.userData.hitMeshes);
    const hits = this.ray.intersectObjects([...botMeshes, ...this.solids], false);
    let end = eye.clone().addScaledVector(dir, 120);
    if (hits.length) {
      const h = hits[0];
      end = h.point;
      const botId = h.object.userData.botId;
      if (botId) {
        const bot = this.bots.find((b) => b.id === botId);
        if (bot && bot.alive && bot.team !== this.player.team) {
          const part = h.object.userData.part;
          let dmg = stats.damage * (part === 'head' ? stats.headMult : 1);
          if (h.distance > stats.range) dmg *= clamp(1.15 - h.distance / (stats.range * 2.2), 0.35, 1);
          this.damageBot(bot, dmg, part, this.player);
        }
      } else {
        this.spawnImpact(end, 0xbfae8e);
      }
    }
    this.spawnTracer(eye.clone().addScaledVector(dir, 0.6), end, fxColor);
  }

  damageBot(bot, dmg, part, attacker) {
    if (!bot.alive) return;
    bot.hp -= dmg;
    const fromPlayer = attacker === this.player;
    if (fromPlayer) {
      this.profile.stats.hits += 1;
      if (part === 'head') this.profile.stats.headshots += 1;
      this.showHitmarker(part === 'head');
      this.sfx.hit(part === 'head');
      if (this.mods().visuals.damageNumbers) this.spawnDamageNumber(bot, Math.round(dmg), part === 'head');
      if (bot.state === 'patrol') { bot.state = 'engage'; bot.target = this.player; }
    }
    if (bot.hp <= 0) this.killBot(bot, attacker);
  }

  killBot(bot, attacker) {
    bot.alive = false;
    bot.hp = 0;
    bot.grp.visible = false;
    bot.respawnAt = performance.now() + 2600;
    const fxId = attacker === this.player ? this.profile.inventory.loadout.killEffect : 'fx_standard';
    const fx = cosmeticById(fxId);
    this.spawnKillEffect(bot.pos.clone().setY(bot.pos.y + 1), fx?.color || '#ffffff');
    const killerName = attacker === this.player ? this.profile.username : attacker.name;
    this.killfeed(`${killerName} ▸ ${bot.name}`, attacker === this.player);
    if (attacker === this.player) {
      this.player.kills += 1;
      this.profile.progression.kills += 1;
      this.sfx.kill();
    } else if (attacker.isPlayer === false) {
      attacker.kills = (attacker.kills || 0) + 1;
    }
    if (this.match) {
      if (this.match.mode.id === 'tdm') {
        const t = attacker === this.player ? 0 : attacker.team;
        if (t === 0 || t === 1) this.match.score[t] += 1;
        if (this.match.score[0] >= this.match.mode.scoreLimit || this.match.score[1] >= this.match.mode.scoreLimit) {
          this.endMatch('Score limit reached');
        }
      } else if (this.match.mode.id === 'ffa') {
        const leader = Math.max(this.player.kills, ...this.bots.map((b) => b.kills || 0));
        if (leader >= this.match.mode.scoreLimit) this.endMatch('Score limit reached');
      } else if (this.match.mode.id === 'training') {
        if (this.player.kills >= this.match.mode.scoreLimit) this.endMatch('Training complete');
      }
    }
  }

  damagePlayer(dmg, attacker) {
    const p = this.player;
    if (!p.alive || this.state !== 'playing') return;
    p.hp -= dmg;
    p._lastHurt = performance.now();
    this.els.hurt.style.opacity = clamp(1 - p.hp / 100, 0.25, 0.85);
    setTimeout(() => { this.els.hurt.style.opacity = 0; }, 120);
    this.sfx.hurt();
    if (p.hp <= 0) {
      p.alive = false;
      p.deaths += 1;
      this.profile.progression.deaths += 1;
      p.respawnAt = performance.now() + 2400;
      this.killfeed(`${attacker?.name || 'ENEMY'} ▸ ${p.name}`, false);
      if (this.match?.mode.id === 'tdm' && attacker && attacker.team === 1) {
        this.match.score[1] += 1;
        if (this.match.score[1] >= this.match.mode.scoreLimit) this.endMatch('Score limit reached');
      }
      if (this.match?.mode.id === 'ffa' && attacker) {
        attacker.kills = (attacker.kills || 0) + 1;
        if (attacker.kills >= this.match.mode.scoreLimit) this.endMatch('Score limit reached');
      }
    }
  }

  // ------------------------------------------------------------- bots AI
  updateBot(bot, dt, now) {
    if (!bot.alive) {
      if (now > bot.respawnAt && this.state === 'playing') this.spawnBot(bot);
      return;
    }
    bot.grp.position.copy(bot.pos);
    // --- perception (staggered think)
    if (now >= bot.thinkAt) {
      bot.thinkAt = now + (bot.passive ? 350 : 140);
      const enemies = [];
      if (!bot.passive) {
        const p = this.player;
        if (p.alive && p.team !== bot.team) enemies.push(p);
        for (const o of this.bots) if (o !== bot && o.alive && o.team !== bot.team) enemies.push(o);
      }
      let best = null, bestD = 1e9;
      for (const e of enemies) {
        const ep = e.isPlayer ? e.pos : e.pos;
        const d = bot.pos.distanceTo(ep);
        if (d > 75) continue;
        const eyeB = bot.pos.clone().setY(bot.pos.y + 1.55);
        const eyeE = (e.isPlayer ? this.eyePosFor(e) : ep.clone().setY(ep.y + 1.3));
        if (!this.losBlocked(eyeB, eyeE) && d < bestD) { best = e; bestD = d; }
      }
      if (best) {
        if (!bot.target || bot.target !== best) bot.seenAt = now;
        bot.target = best;
        bot.state = 'engage';
      } else if (bot.target && now - bot.seenAt > 3500) {
        bot.target = null;
        bot.state = 'patrol';
      }
    }
    // --- movement
    const diff = this.diff;
    let desired = null;
    if (bot.state === 'engage' && bot.target) {
      const tp = bot.target.isPlayer ? this.player.pos : bot.target.pos;
      const toT = tp.clone().sub(bot.pos); toT.y = 0;
      const dist = toT.length();
      const pref = bot.passive ? 14 : 17;
      if (now > bot.strafeFlip) { bot.strafeDir *= -1; bot.strafeFlip = now + rand(1200, 2600); }
      const perp = new THREE.Vector3(-toT.z, 0, toT.x).normalize().multiplyScalar(bot.strafeDir * 3);
      desired = tp.clone().add(perp);
      if (dist < pref * 0.65) desired = bot.pos.clone().add(toT.normalize().multiplyScalar(-6)).add(perp);
      else if (dist > pref * 1.5) desired = tp.clone();
      bot.grp.lookAt(tp.x, bot.pos.y, tp.z);
      // --- shooting
      const delay = this.match.mode.id === 'training' ? Infinity : diff.reactionMs;
      if (now - bot.seenAt > delay && dist < 70) {
        if (bot.burst <= 0 && now > bot.nextBurst) { bot.burst = 3 + Math.floor(Math.random() * 4); }
        if (bot.burst > 0 && now > bot.nextShot) {
          bot.nextShot = now + 110;
          bot.burst -= 1;
          if (bot.burst === 0) bot.nextBurst = now + rand(500, 1100);
          this.botShoot(bot, bot.target, dist);
        }
      }
    } else {
      if (bot.pos.distanceTo(bot.waypoint) < 2 || now > (bot.wpNext || 0)) {
        const S = this.mapDef.size / 2 - 8;
        bot.waypoint = new THREE.Vector3(rand(-S, S), 0, rand(-S, S));
        bot.wpNext = now + 6000;
      }
      desired = bot.waypoint;
      bot.grp.lookAt(bot.waypoint.x, bot.pos.y, bot.waypoint.z);
    }
    if (desired) {
      const mv = desired.clone().sub(bot.pos); mv.y = 0;
      const d = mv.length();
      if (d > 0.4) {
        mv.normalize().multiplyScalar(Math.min(diff.speed, d / dt) * dt);
        const prev = bot.pos.clone();
        bot.pos.add(mv);
        this.collide(bot.pos, 0.36, 1.8);
        if (bot.pos.distanceToSquared(prev) < 1e-6) { // stuck: pick new waypoint
          bot.wpNext = 0;
          bot.pos.x += rand(-1, 1); bot.pos.z += rand(-1, 1);
        }
      }
    }
    bot.pos.y = this.groundYAt(bot.pos.x, bot.pos.z, bot.pos.y);
    bot.grp.position.copy(bot.pos);
    // visibility flag for indicators/aim candidates (cheap, per-bot each think handled in HUD pass)
  }

  eyePosFor(e) {
    if (e.isPlayer) return this.eyePos();
    return e.pos.clone().setY(e.pos.y + 1.55);
  }

  botShoot(bot, target, dist) {
    const from = bot.pos.clone().setY(bot.pos.y + 1.3);
    const tp = target.isPlayer ? this.eyePos() : target.pos.clone().setY(target.pos.y + 1.1);
    this.spawnTracer(from, tp.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1))), '#ff9a5c');
    const diff = this.diff;
    const movePenalty = target.isPlayer && (Math.abs(this.player.moveState.vel.x) + Math.abs(this.player.moveState.vel.z) > 2) ? 0.8 : 1;
    const hitChance = diff.accuracy * clamp(1.25 - dist / 65, 0.15, 1) * movePenalty;
    if (Math.random() < hitChance) {
      if (target.isPlayer) this.damagePlayer(diff.damage * rand(0.8, 1.2), bot);
      else if (target.alive) {
        target.hp -= diff.damage * 0.7;
        if (target.hp <= 0) this.killBot(target, bot);
      }
    }
  }

  // ------------------------------------------------------------- effects
  spawnTracer(a, b, color = '#ffe9a8') {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    t.line.material.color.set(color);
    t.line.material.opacity = 0.85;
    t.life = 0.07;
  }

  spawnImpact(point, color) {
    this.spawnPoints(point, color, 6, 2.2, 0.35);
  }

  spawnKillEffect(point, color) {
    this.spawnPoints(point, color, 42, 4.2, 0.85, true);
    this.sfx.explosion();
  }

  spawnPoints(point, color, count, speed, life, burst = false) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vels = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = point.x; positions[i * 3 + 1] = point.y; positions[i * 3 + 2] = point.z;
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.4, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.3, speed));
      vels.push(v);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: burst ? 0.16 : 0.09, transparent: true, opacity: 1 });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.effects.push({ pts, vels, life, maxLife: life });
  }

  spawnDamageNumber(bot, amount, crit) {
    const slot = this.damagePool.find((d) => d.life <= 0);
    if (!slot) return;
    slot.world.copy(bot.pos).setY(bot.pos.y + 2.05);
    slot.life = 0.8;
    slot.el.textContent = amount;
    slot.el.style.color = crit ? '#ffd23e' : '#ffffff';
    slot.el.style.fontSize = crit ? '20px' : '15px';
    slot.el.style.opacity = 1;
  }

  killfeed(text, good) {
    const div = document.createElement('div');
    div.className = 'kf' + (good ? ' good' : '');
    div.textContent = text;
    this.els.killfeed.prepend(div);
    while (this.els.killfeed.children.length > 5) this.els.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 4200);
  }

  showHitmarker(crit) {
    if (!this.mods().visuals.hitmarkers) return;
    const hm = this.els.hitmarker;
    hm.style.opacity = 1;
    hm.style.color = crit ? '#ffd23e' : '#ffffff';
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => { hm.style.opacity = 0; }, 90);
  }

  // ------------------------------------------------------------- crosshair / HUD
  makeCrosshair() { this.updateCrosshair(); }

  updateCrosshair() {
    const c = this.mods().visuals.crosshair;
    const el = this.els.crosshair;
    const s = c.size, g = c.gap, t = c.thickness;
    el.innerHTML = `
      <div class="ch" style="left:50%;top:calc(50% - ${g + s}px);width:${t}px;height:${s}px;margin-left:${-t / 2}px;background:${c.color};${c.outline ? 'box-shadow:0 0 2px #000;' : ''}"></div>
      <div class="ch" style="left:50%;top:calc(50% + ${g}px);width:${t}px;height:${s}px;margin-left:${-t / 2}px;background:${c.color};${c.outline ? 'box-shadow:0 0 2px #000;' : ''}"></div>
      <div class="ch" style="top:50%;left:calc(50% - ${g + s}px);height:${t}px;width:${s}px;margin-top:${-t / 2}px;background:${c.color};${c.outline ? 'box-shadow:0 0 2px #000;' : ''}"></div>
      <div class="ch" style="top:50%;left:calc(50% + ${g}px);height:${t}px;width:${s}px;margin-top:${-t / 2}px;background:${c.color};${c.outline ? 'box-shadow:0 0 2px #000;' : ''}"></div>
      ${c.dot ? `<div class="ch" style="left:50%;top:50%;width:${t}px;height:${t}px;margin:${-t / 2}px 0 0 ${-t / 2}px;border-radius:50%;background:${c.color}"></div>` : ''}`;
  }

  applyHudLayout() {
    const layout = this.profile?.hudLayout || {};
    document.querySelectorAll('[data-hud]').forEach((el) => {
      const saved = layout[el.dataset.hud];
      if (saved) { el.style.left = saved.x + '%'; el.style.top = saved.y + '%'; el.style.right = 'auto'; el.style.bottom = 'auto'; }
    });
  }

  updateHud(now) {
    const p = this.player;
    const v = this.mods().visuals;
    const ws = this.currentWeapon();
    const stats = this.weaponStats(ws);
    this.els.healthFill.style.width = clamp(p.hp, 0, 100) + '%';
    this.els.healthText.textContent = `${Math.max(0, Math.ceil(p.hp))} HP`;
    this.els.ammoText.textContent = stats.infiniteAmmo ? `${ws.mag} / ∞` : `${ws.mag} / ${ws.reserve}`;
    this.els.weaponText.textContent = `${ws.def.name} · Lv${this.profile.inventory.weaponLevels[ws.id] || 1}`;
    this.els.reloadHint.style.opacity = now < p.reloadingUntil ? 1 : 0;
    if (this.match) {
      const t = Math.max(0, Math.ceil(this.match.timeLeft));
      this.els.timerText.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      this.els.scoreText.textContent = this.match.mode.id === 'tdm'
        ? `BLU ${this.match.score[0]} — ${this.match.score[1]} RED`
        : `Kills ${p.kills} · Deaths ${p.deaths}`;
    }
    this.els.fpsCounter.style.display = v.fpsCounter ? 'block' : 'none';
    this.els.fpsCounter.textContent = `${this.fps} FPS`;
    this.els.perfWrap.style.display = v.perfGraph ? 'block' : 'none';
    this.els.radarWrap.style.display = v.radar ? 'block' : 'none';
    this.els.scope.style.opacity = (p.adsProgress > 0.75 && stats.zoom >= 2.6) ? 1 : 0;
    if (v.radar && now - (this._radarAt || 0) > 90) { this._radarAt = now; this.drawRadar(); }
    if (v.perfGraph && now - (this._perfAt || 0) > 120) { this._perfAt = now; this.drawPerf(); }
    // respawn overlay text
    this.els.respawn.style.display = !p.alive && this.state === 'playing' ? 'flex' : 'none';
    if (!p.alive) this.els.respawnText.textContent = `Eliminated — redeploying in ${Math.max(0, (p.respawnAt - now) / 1000).toFixed(1)}s`;
    // enemy tags
    this.updateTags(v);
    // fly controls visibility
    this.els.flyControls.style.display = this.mods().movement.fly ? 'flex' : 'none';
  }

  updateTags(v) {
    let i = 0;
    const w = window.innerWidth, h = window.innerHeight;
    for (const bot of this.bots) {
      if (i >= this.tagPool.length) break;
      const el = this.tagPool[i];
      if (!v.enemyIndicators || !bot.alive || bot.team === this.player.team || this.state !== 'playing') { el.style.display = 'none'; continue; }
      const proj = bot.pos.clone().setY(bot.pos.y + 2.15).project(this.camera);
      const dist = this.player.pos.distanceTo(bot.pos);
      if (proj.z > 1 || proj.z < -1 || dist > 80) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.left = ((proj.x * 0.5 + 0.5) * w) + 'px';
      el.style.top = ((-proj.y * 0.5 + 0.5) * h) + 'px';
      el.innerHTML = `${bot.name} · ${Math.round(dist)}m<div class="taghp"><span style="width:${clamp(bot.hp / bot.maxHp * 100, 0, 100)}%"></span></div>`;
      i++;
    }
    for (; i < this.tagPool.length; i++) this.tagPool[i].style.display = 'none';
  }

  drawRadar() {
    const ctx = this.els.radar.getContext('2d');
    const S = this.els.radar.width;
    const range = this.mods().visuals.radarRange;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(8,14,24,0.72)';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,255,0.35)';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 4, 0, Math.PI * 2); ctx.stroke();
    const yaw = this.player.yaw;
    const dot = (dx, dz, color, r = 3.5) => {
      const d = Math.hypot(dx, dz);
      if (d > range) return;
      const rx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const rz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(S / 2 + (rx / range) * (S / 2 - 6), S / 2 + (rz / range) * (S / 2 - 6), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const b of this.bots) {
      if (!b.alive) continue;
      const ally = b.team === this.player.team;
      dot(b.pos.x - this.player.pos.x, b.pos.z - this.player.pos.z, ally ? '#3fa9f5' : '#ff4545');
    }
    // player arrow
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2 - 6); ctx.lineTo(S / 2 - 4.5, S / 2 + 5); ctx.lineTo(S / 2 + 4.5, S / 2 + 5);
    ctx.closePath(); ctx.fill();
  }

  drawPerf() {
    const c = this.els.perfCanvas;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(8,14,24,0.7)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#39ff88';
    ctx.beginPath();
    this.frameTimes.forEach((ms, i) => {
      const x = (i / 119) * c.width;
      const y = c.height - clamp(ms / 33, 0, 1) * (c.height - 6) - 2;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = '#cfe8ff';
    ctx.font = '10px monospace';
    const last = this.frameTimes[this.frameTimes.length - 1] || 0;
    ctx.fillText(`${last.toFixed(1)} ms`, 6, 12);
  }

  // ------------------------------------------------------------- aim assist
  applyAimAssist(dt, now) {
    const mods = this.mods();
    const cfgBase = resolveAimProfile(mods, this.currentWeapon().id);
    if (!cfgBase.enabled || !this.player.alive) return;
    if (!(this.player.adsHeld || this.player.firing)) return;
    const eye = this.eyePos();
    const candidates = [];
    for (const bot of this.bots) {
      if (!bot.alive || bot.team === this.player.team) continue;
      const bp = bonePoint({ pos: { x: bot.pos.x, y: bot.pos.y, z: bot.pos.z }, height: 1.8 }, cfgBase.bone);
      const ang = anglesTo({ x: eye.x, y: eye.y, z: eye.z }, bp);
      const yawErr = Math.abs(normAngle(ang.yaw - this.player.yaw));
      const pitchErr = Math.abs(ang.pitch - this.player.pitch);
      // LOS refresh at ~12Hz per bot
      if (now > (bot._losAt || 0)) {
        bot._losAt = now + 85;
        bot._visible = !this.losBlocked(eye, new THREE.Vector3(bp.x, bp.y, bp.z));
      }
      candidates.push({
        id: bot.id, alive: true, visible: !!bot._visible, hp: bot.hp,
        angle: Math.hypot(yawErr, pitchErr), dist: ang.dist,
        pos: { x: bot.pos.x, y: bot.pos.y, z: bot.pos.z },
        vel: bot.vel3 || { x: 0, y: 0, z: 0 }, height: 1.8,
      });
    }
    const { target, cfg } = selectTarget(candidates, mods, this.currentWeapon().id, this.aimTargetId);
    this.aimTargetId = target ? target.id : null;
    if (!target) return;
    const bp = bonePoint(target, cfg.bone);
    const led = predictPoint(bp, target.vel, target.dist, cfg);
    const want = anglesTo({ x: eye.x, y: eye.y, z: eye.z }, led);
    const r = stepAim({ yaw: this.player.yaw, pitch: this.player.pitch }, want, cfg, dt, this.player.firing);
    this.player.yaw = r.yaw;
    this.player.pitch = r.pitch;
  }

  // ------------------------------------------------------------- main loop
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    // fps accounting
    this.fpsFrames += 1; this.fpsTime += dt;
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    if (this.fpsTime >= 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0; }

    if (this.state === 'playing' && !this.paused && this.profile) {
      const p = this.player;
      const mods = this.mods();
      this.match.timeLeft -= dt;
      if (this.match.timeLeft <= 0 && !this.match.over) this.endMatch('Time expired');

      if (p.alive) {
        // --- input wish dir (camera relative)
        let ix = 0, iz = 0;
        if (this.keys.KeyW) iz += 1;
        if (this.keys.KeyS) iz -= 1;
        if (this.keys.KeyA) ix -= 1;
        if (this.keys.KeyD) ix += 1;
        if (this.touchMove) { ix += this.touchMove.x; iz += this.touchMove.y; }
        const len = Math.hypot(ix, iz);
        if (len > 1) { ix /= len; iz /= len; }
        const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
        const wish = {
          x: (-sin * iz + -cos * ix) * -1 * -1, // forward = (-sin,-cos)*iz ; right=(cos,-sin)*ix -> combined below
          z: 0,
        };
        // forward vector (-sinYaw, -cosYaw); right vector (cosYaw*? ) compute properly:
        wish.x = (-sin) * iz + (cos) * ix * 1;
        wish.x = (-sin * iz) + (Math.cos(p.yaw) * ix);
        wish.z = (-cos * iz) + (-Math.sin(p.yaw) * ix);
        wish.z = (-cos) * iz + (-sin) * ix;
        const sprint = !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.touchSprint);
        const input = {
          wish, moveAmount: Math.min(1, len || (ix || iz ? 1 : 0)),
          sprint, jump: !!(this.keys.Space || this.touchJump),
          flyUp: !!(this.keys.Space || this.touchFlyUp), flyDown: !!(this.keys.KeyC || this.touchFlyDown),
        };
        if (!input.wish.x && !input.wish.z) input.moveAmount = 0;
        const groundY = this.groundYAt(p.moveState.pos.x, p.moveState.pos.z, p.moveState.pos.y);
        const prevY = p.moveState.pos.y;
        p.moveState = stepMovement(p.moveState, input, mods.movement, dt, groundY);
        p.pos.set(p.moveState.pos.x, p.moveState.pos.y, p.moveState.pos.z);
        this.collide(p.pos, 0.36, 1.8);
        p.moveState.pos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
        if (input.jump && p.moveState.grounded && prevY === p.moveState.pos.y) { /* landed */ }
        // --- aim assist (real rotation of the actual camera)
        this.applyAimAssist(dt, now);
        // --- ADS
        const stats = this.weaponStats(this.currentWeapon());
        const adsRate = (1000 / Math.max(25, stats.adsTimeMs * (stats.zoom >= 2.6 ? mods.weapons.scopeSpeedMult : 1))) * dt;
        p.adsProgress = clamp(p.adsProgress + (p.adsHeld ? adsRate : -adsRate * 1.6), 0, 1);
        // --- firing / reload
        if (p.firing) this.tryShoot(now);
        if (!p.firing) p._semiLatch = false;
        if (p.reloadingUntil && now >= p.reloadingUntil && !p._reloadDone) {
          p._reloadDone = true;
          const ws = this.currentWeapon();
          const st = this.weaponStats(ws);
          if (!st.infiniteAmmo) {
            const need = st.magSize - ws.mag;
            const take = Math.min(need, ws.reserve);
            ws.mag += take; ws.reserve -= take;
          } else ws.mag = st.magSize;
        }
        p.bloom = Math.max(0, p.bloom - dt * 6);
        // --- camera & viewmodel
        this.camera.position.copy(this.eyePos());
        this.camera.rotation.set(p.pitch, p.yaw, 0);
        const baseFov = this.settings().fov || 78;
        const targetFov = baseFov / (1 + (stats.zoom - 1) * p.adsProgress);
        if (Math.abs(this.camera.fov - targetFov) > 0.05) { this.camera.fov += (targetFov - this.camera.fov) * clamp(dt * 18, 0, 1); this.camera.updateProjectionMatrix(); }
        const hip = { x: 0.26, y: -0.22, z: -0.45 };
        const ads = { x: 0, y: -0.148, z: -0.35 };
        this.viewModel.position.set(
          hip.x + (ads.x - hip.x) * p.adsProgress,
          hip.y + (ads.y - hip.y) * p.adsProgress + Math.sin(now * 0.0022) * 0.0035 * (1 - p.adsProgress),
          hip.z + (ads.z - hip.z) * p.adsProgress + (this.viewKick || 0) * 0.05
        );
        this.viewKick = Math.max(0, (this.viewKick || 0) - dt * 9);
        this.viewModel.userData.pulse?.(now / 1000);
        // hp regen (sandbox pacing)
        if (p.hp > 0 && p.hp < p.maxHp && now - (p._lastHurt || 0) > 4500) p.hp = Math.min(p.maxHp, p.hp + dt * 9);
      } else if (now > p.respawnAt && this.state === 'playing') {
        this.spawnPlayer();
        this.equipViewmodel();
      }
      if (this.player.hp < this.player.maxHp) this.player._lastHurt = this.player._hurtAt || this.player._lastHurt;
      // --- bots
      for (const bot of this.bots) {
        const prevPos = bot.grp.position.clone();
        this.updateBot(bot, dt, now);
        if (bot.alive) {
          bot.vel3 = {
            x: (bot.pos.x - prevPos.x) / Math.max(dt, 0.001),
            y: 0,
            z: (bot.pos.z - prevPos.z) / Math.max(dt, 0.001),
          };
        }
      }
      // --- projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.life -= dt;
        pr.pos.addScaledVector(pr.vel, dt);
        let dead = pr.life <= 0 || pr.pos.y < 0;
        if (!dead) for (const b of this.colliders) {
          if (pr.pos.x > b.min.x && pr.pos.x < b.max.x && pr.pos.y > b.min.y && pr.pos.y < b.max.y && pr.pos.z > b.min.z && pr.pos.z < b.max.z) { dead = true; break; }
        }
        if (!dead && pr.fromPlayer) {
          for (const bot of this.bots) {
            if (!bot.alive || bot.team === this.player.team) continue;
            const headC = bot.pos.clone().setY(bot.pos.y + 1.68);
            let part = null;
            if (pr.pos.distanceTo(headC) < 0.3) part = 'head';
            else {
              const feet = bot.pos.clone().setY(bot.pos.y + 0.25);
              const topB = bot.pos.clone().setY(bot.pos.y + 1.45);
              const seg = topB.sub(feet);
              const t = clamp(pr.pos.clone().sub(feet).dot(seg) / seg.lengthSq(), 0, 1);
              const closest = feet.addScaledVector(seg, t);
              if (pr.pos.distanceTo(closest) < 0.42) part = 'body';
            }
            if (part) {
              let dmg = pr.stats.damage * (part === 'head' ? pr.stats.headMult : 1);
              this.damageBot(bot, dmg, part, this.player);
              dead = true;
              break;
            }
          }
        }
        if (dead) { this.spawnImpact(pr.pos, 0x9fd8ff); this.projectiles.splice(i, 1); }
      }
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 160);
      this.updateHud(now);
    }
    // effects & tracers always tick
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      const pos = e.pts.geometry.attributes.position;
      for (let j = 0; j < e.vels.length; j++) {
        const v = e.vels[j];
        v.y -= 3.2 * dt;
        pos.setXYZ(j, pos.getX(j) + v.x * dt, Math.max(0.03, pos.getY(j) + v.y * dt), pos.getZ(j) + v.z * dt);
      }
      pos.needsUpdate = true;
      e.pts.material.opacity = clamp(e.life / e.maxLife, 0, 1);
      if (e.life <= 0) { this.scene.remove(e.pts); e.pts.geometry.dispose(); e.pts.material.dispose(); this.effects.splice(i, 1); }
    }
    for (const t of this.tracers) {
      if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.material.opacity = 0; }
    }
    // damage numbers float
    for (const d of this.damagePool) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.world.y += dt * 1.1;
      const proj = d.world.clone().project(this.camera);
      d.el.style.left = ((proj.x * 0.5 + 0.5) * window.innerWidth) + 'px';
      d.el.style.top = ((-proj.y * 0.5 + 0.5) * window.innerHeight) + 'px';
      d.el.style.opacity = clamp(d.life / 0.8, 0, 1);
      if (d.life <= 0) d.el.style.opacity = 0;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
