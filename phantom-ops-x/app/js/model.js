// Procedural low-poly weapon models built from primitives (original designs).
// Shared by the FPS viewmodel and the Mythic Armory X 3D preview.

export function buildWeaponModel(THREE, weapon, opts = {}) {
  const camo = new THREE.Color(opts.camoColor || '#22262b');
  const accent = new THREE.Color(opts.accentColor || camo).lerp(new THREE.Color('#ffffff'), 0.15);
  const animated = !!weapon.animated || !!opts.animated;
  const matBody = new THREE.MeshStandardMaterial({ color: camo, roughness: 0.45, metalness: 0.65 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.6, metalness: 0.4 });
  const matAccent = new THREE.MeshStandardMaterial({
    color: accent, roughness: 0.3, metalness: 0.5,
    emissive: accent, emissiveIntensity: animated ? 0.9 : 0.08,
  });
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, mat = matBody) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const cyl = (r, len, x, y, z, mat = matDark) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const cls = weapon.cls;
  const L = { AR: 0.78, SMG: 0.6, Sniper: 1.05, Shotgun: 0.85, LMG: 0.95, Pistol: 0.34, DMR: 0.9, Special: 0.7 }[cls] || 0.7;
  // receiver + handguard
  box(0.07, 0.11, L * 0.62, 0, 0, -L * 0.1);
  box(0.06, 0.07, L * 0.4, 0, 0.005, -L * 0.55, matDark);
  // barrel + muzzle
  const barrel = cyl(0.016, L * 0.34, 0, 0.02, -L * 0.78);
  box(0.035, 0.05, 0.09, 0, 0.02, -L * 0.95, matDark);
  // magazine
  if (cls === 'LMG') box(0.09, 0.13, 0.16, 0, -0.1, -L * 0.18, matDark);
  else if (cls !== 'Pistol') box(0.05, 0.14, 0.08, 0, -0.1, -L * 0.16);
  // grip + stock
  box(0.045, 0.12, 0.05, 0, -0.09, L * 0.08, matDark).rotation.x = 0.25;
  if (cls !== 'Pistol') box(0.05, 0.08, L * 0.24, 0, 0.01, L * 0.28, matDark);
  else box(0.06, 0.09, 0.12, 0, 0, 0.12, matDark);
  // optic / scope
  if (cls === 'Sniper' || cls === 'DMR') {
    cyl(0.028, 0.22, 0, 0.1, -L * 0.2, matDark);
    box(0.02, 0.04, 0.05, 0, 0.06, -L * 0.2, matDark);
  } else if (cls !== 'Shotgun') {
    box(0.02, 0.045, 0.06, 0, 0.085, -L * 0.15, matAccent);
  }
  // class flavour
  if (cls === 'Shotgun') { cyl(0.03, L * 0.4, 0, -0.03, -L * 0.6, matDark); }
  if (cls === 'LMG') { box(0.02, 0.16, 0.02, -0.05, -0.14, -L * 0.7, matDark); box(0.02, 0.16, 0.02, 0.05, -0.14, -L * 0.7, matDark); }
  if (cls === 'Special' && weapon.id === 'x_crossbow') {
    const bowL = box(0.5, 0.02, 0.03, 0, 0.03, -L * 0.75, matDark);
    bowL.rotation.y = 0.5;
    const bowR = box(0.5, 0.02, 0.03, 0, 0.03, -L * 0.75, matDark);
    bowR.rotation.y = -0.5;
  }
  if (cls === 'Special' && weapon.id === 'x_pulse') {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), matAccent);
    core.position.set(0, 0.01, -L * 0.3);
    g.add(core);
    g.userData.core = core;
  }
  // mythic/legendary animated energy strips
  if (animated) {
    box(0.075, 0.02, L * 0.4, 0, 0.045, -L * 0.2, matAccent);
    box(0.075, 0.02, L * 0.3, 0, -0.045, -L * 0.25, matAccent);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -L - 0.02);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.materials = { matBody, matAccent, matDark };
  g.userData.animated = animated;
  g.userData.pulse = (t) => {
    if (!animated) return;
    matAccent.emissiveIntensity = 0.7 + Math.sin(t * 4) * 0.45;
    if (g.userData.core) g.userData.core.rotation.y = t * 2.4;
  };
  return g;
}

// Simple bot body: capsule torso + head sphere + gun block. Team-coloured.
export function buildBotModel(THREE, teamColor, outfitColor) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: outfitColor || teamColor, roughness: 0.7, metalness: 0.2 });
  const vest = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.55, metalness: 0.3, emissive: teamColor, emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.85, 4, 10), suit);
  body.position.y = 0.95;
  body.userData.part = 'body';
  g.add(body);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), vest);
  chest.position.y = 1.12;
  chest.userData.part = 'body';
  g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.4, metalness: 0.4 }));
  head.position.y = 1.68;
  head.userData.part = 'head';
  g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x15181d }));
  gun.position.set(0.22, 1.15, -0.25);
  g.add(gun);
  g.userData.parts = { body, chest, head, gun };
  g.userData.hitMeshes = [body, chest, head];
  return g;
}
