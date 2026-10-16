// PHANTOM OPS X — content catalog (pure data, no DOM/engine deps).
// All weapons/cosmetics are ORIGINAL sandbox designs. No COD assets.

export const RARITIES = {
  common:    { id: 'common',    label: 'Common',    color: '#9aa7b4' },
  rare:      { id: 'rare',      label: 'Rare',      color: '#3fa9f5' },
  epic:      { id: 'epic',      label: 'Epic',      color: '#b45cf0' },
  legendary: { id: 'legendary', label: 'Legendary', color: '#ffb02e' },
  mythic:    { id: 'mythic',    label: 'Mythic',    color: '#ff3d5e' },
};

// fireRate = rounds/min, adsTime/reload = ms, spread = degrees (hip), recoil = deg/kick per shot
export const WEAPONS = [
  { id: 'ar_phantom',  name: 'PHANTOM-7 Spectre',   cls: 'AR',      rarity: 'rare',      price: 0,     damage: 34, headMult: 1.6, fireRate: 720,  adsTime: 220, reload: 1900, spread: 1.6, recoil: 0.55, range: 55, mag: 30, zoom: 1.4, move: 1.0,  maxLevel: 10 },
  { id: 'ar_void',     name: 'VOIDREAPER X',        cls: 'AR',      rarity: 'mythic',    price: 24000, damage: 38, headMult: 1.7, fireRate: 760,  adsTime: 190, reload: 1750, spread: 1.4, recoil: 0.5,  range: 60, mag: 35, zoom: 1.6, move: 0.98, maxLevel: 10, animated: true,  killFx: 'fx_void' },
  { id: 'ar_onyx',     name: 'ONYX JACKAL',         cls: 'AR',      rarity: 'legendary', price: 15000, damage: 36, headMult: 1.6, fireRate: 700,  adsTime: 200, reload: 1800, spread: 1.5, recoil: 0.52, range: 58, mag: 32, zoom: 1.5, move: 0.99, maxLevel: 10, animated: true },
  { id: 'smg_wasp',    name: 'WASP-9 Hornet',       cls: 'SMG',     rarity: 'common',    price: 2500,  damage: 24, headMult: 1.5, fireRate: 950,  adsTime: 160, reload: 1600, spread: 2.4, recoil: 0.4,  range: 30, mag: 36, zoom: 1.25, move: 1.06, maxLevel: 10 },
  { id: 'smg_tempest', name: 'TEMPEST NEON',        cls: 'SMG',     rarity: 'epic',      price: 9000,  damage: 26, headMult: 1.5, fireRate: 1020, adsTime: 140, reload: 1500, spread: 2.2, recoil: 0.38, range: 32, mag: 40, zoom: 1.3, move: 1.08, maxLevel: 10, animated: true },
  { id: 'sr_longshot', name: 'LONGSHOT-50 Wraith',  cls: 'Sniper',  rarity: 'epic',      price: 11000, damage: 120, headMult: 2.2, fireRate: 45,   adsTime: 380, reload: 3200, spread: 0.15, recoil: 2.4, range: 160, mag: 5,  zoom: 6.0, move: 0.9,  maxLevel: 10 },
  { id: 'sr_eclipse',  name: 'ECLIPSE MYTHIC SR',   cls: 'Sniper',  rarity: 'mythic',    price: 26000, damage: 135, headMult: 2.4, fireRate: 52,   adsTime: 330, reload: 2900, spread: 0.1, recoil: 2.1, range: 180, mag: 6,  zoom: 8.0, move: 0.92, maxLevel: 10, animated: true, killFx: 'fx_eclipse' },
  { id: 'sg_breach',   name: 'BREACHER-12',         cls: 'Shotgun', rarity: 'rare',      price: 6000,  damage: 13, headMult: 1.3, fireRate: 75,   adsTime: 200, reload: 2600, spread: 5.5, recoil: 1.8, range: 16, mag: 7,  zoom: 1.2, move: 0.97, maxLevel: 10, pellets: 8 },
  { id: 'sg_dragon',   name: 'DRAGONFIRE SG',       cls: 'Shotgun', rarity: 'legendary', price: 17000, damage: 14, headMult: 1.3, fireRate: 90,   adsTime: 180, reload: 2400, spread: 5.0, recoil: 1.6, range: 18, mag: 8,  zoom: 1.25, move: 0.98, maxLevel: 10, pellets: 8, animated: true },
  { id: 'lmg_anvil',   name: 'ANVIL LMG',           cls: 'LMG',     rarity: 'rare',      price: 8000,  damage: 32, headMult: 1.5, fireRate: 640,  adsTime: 320, reload: 4200, spread: 2.0, recoil: 0.6,  range: 50, mag: 75, zoom: 1.35, move: 0.88, maxLevel: 10 },
  { id: 'lmg_overlord',name: 'OVERLORD MINIGUN',    cls: 'LMG',     rarity: 'mythic',    price: 30000, damage: 30, headMult: 1.5, fireRate: 1100, adsTime: 350, reload: 4600, spread: 2.6, recoil: 0.45, range: 48, mag: 120, zoom: 1.3, move: 0.85, maxLevel: 10, animated: true, killFx: 'fx_overlord' },
  { id: 'p_sidearm',   name: 'P9 SIDEARM',          cls: 'Pistol',  rarity: 'common',    price: 0,     damage: 28, headMult: 1.7, fireRate: 380,  adsTime: 130, reload: 1200, spread: 1.2, recoil: 0.5,  range: 28, mag: 14, zoom: 1.2, move: 1.05, maxLevel: 10 },
  { id: 'p_executioner',name:'EXECUTIONER .50',     cls: 'Pistol',  rarity: 'legendary', price: 13000, damage: 58, headMult: 1.9, fireRate: 210,  adsTime: 170, reload: 1500, spread: 0.9, recoil: 1.1,  range: 34, mag: 8,  zoom: 1.3, move: 1.02, maxLevel: 10 },
  { id: 'dmr_scout',   name: 'SCOUT DMR-6',         cls: 'DMR',     rarity: 'epic',      price: 10000, damage: 62, headMult: 1.9, fireRate: 240,  adsTime: 240, reload: 2100, spread: 0.5, recoil: 0.9,  range: 90, mag: 16, zoom: 3.0, move: 0.95, maxLevel: 10 },
  { id: 'x_crossbow',  name: 'PHANTOM CROSSBOW',    cls: 'Special', rarity: 'legendary', price: 18000, damage: 110, headMult: 2.0, fireRate: 55,   adsTime: 210, reload: 1800, spread: 0.2, recoil: 0.8,  range: 70, mag: 1,  zoom: 2.5, move: 1.0,  maxLevel: 10, projectileSpeed: 90 },
  { id: 'x_pulse',     name: 'PULSE BLASTER PX',    cls: 'Special', rarity: 'mythic',    price: 28000, damage: 44, headMult: 1.6, fireRate: 540,  adsTime: 180, reload: 2000, spread: 0.8, recoil: 0.3,  range: 65, mag: 24, zoom: 1.8, move: 1.0,  maxLevel: 10, animated: true, projectileSpeed: 140, killFx: 'fx_pulse' },
];

// Attachment slots; mods are multiplicative unless key ends with '+' (additive).
export const ATTACHMENT_SLOTS = ['muzzle', 'barrel', 'optic', 'mag', 'grip'];
export const ATTACHMENTS = [
  { id: 'att_muzzle_suppressor', slot: 'muzzle', name: 'Phantom Suppressor', mods: { damage: 0.97, recoil: 0.9, spread: 0.95 } },
  { id: 'att_muzzle_brake',      slot: 'muzzle', name: 'Vortex Muzzle Brake', mods: { recoil: 0.78, spread: 1.05 } },
  { id: 'att_muzzle_flash',      slot: 'muzzle', name: 'Neon Flash Hider',    mods: { adsTime: 0.94, recoil: 0.95 } },
  { id: 'att_barrel_long',       slot: 'barrel', name: 'Longshot Barrel',     mods: { range: 1.25, damage: 1.06, adsTime: 1.08 } },
  { id: 'att_barrel_short',      slot: 'barrel', name: 'CQB Short Barrel',    mods: { adsTime: 0.88, move: 1.05, range: 0.85 } },
  { id: 'att_barrel_carbon',     slot: 'barrel', name: 'Carbon Weave Barrel', mods: { spread: 0.85, recoil: 0.92 } },
  { id: 'att_optic_reddot',      slot: 'optic',  name: 'Holo Red Dot',        mods: { adsTime: 0.92, zoom: 1.15 } },
  { id: 'att_optic_scope4x',     slot: 'optic',  name: 'Recon 4x Scope',      mods: { zoom: 2.2, adsTime: 1.12 } },
  { id: 'att_optic_thermal',     slot: 'optic',  name: 'Thermal Sight X',     mods: { zoom: 1.6, adsTime: 1.05 } },
  { id: 'att_mag_extended',      slot: 'mag',    name: 'Extended Mag +50%',   mods: { mag: 1.5, reload: 1.08 } },
  { id: 'att_mag_fast',          slot: 'mag',    name: 'Fast Mag',            mods: { reload: 0.8, mag: 0.9 } },
  { id: 'att_mag_drum',          slot: 'mag',    name: 'Drum Mag x2',         mods: { mag: 2.0, reload: 1.2, move: 0.96 } },
  { id: 'att_grip_vertical',     slot: 'grip',   name: 'Vertical Grip',       mods: { recoil: 0.82 } },
  { id: 'att_grip_angled',       slot: 'grip',   name: 'Angled Grip',         mods: { adsTime: 0.9, recoil: 0.94 } },
  { id: 'att_grip_laser',        slot: 'grip',   name: 'Phantom Laser Grip',  mods: { spread: 0.8, adsTime: 0.95 } },
];

export const COSMETICS = [
  // outfits
  { id: 'outfit_operator', category: 'outfit', name: 'Operator Standard',   rarity: 'common',    price: 0,     color: '#5b6b7a' },
  { id: 'outfit_night',    category: 'outfit', name: 'Night Stalker',       rarity: 'rare',      price: 3000,  color: '#232a3d' },
  { id: 'outfit_desert',   category: 'outfit', name: 'Desert Wraith',       rarity: 'rare',      price: 3500,  color: '#b99b5f' },
  { id: 'outfit_neon',     category: 'outfit', name: 'Neon Ronin',          rarity: 'epic',      price: 9000,  color: '#00e5ff', animated: true },
  { id: 'outfit_crimson',  category: 'outfit', name: 'Crimson Warlord',     rarity: 'legendary', price: 16000, color: '#ff2438', animated: true },
  { id: 'outfit_phantom',  category: 'outfit', name: 'PHANTOM SPECTRE',     rarity: 'mythic',    price: 25000, color: '#a855f7', animated: true },
  // camos
  { id: 'camo_factory', category: 'camo', name: 'Factory Black',    rarity: 'common',    price: 0,     color: '#22262b' },
  { id: 'camo_woodland',category: 'camo', name: 'Woodland',         rarity: 'common',    price: 1200,  color: '#4a6741' },
  { id: 'camo_arctic',  category: 'camo', name: 'Arctic White',     rarity: 'rare',      price: 2800,  color: '#dfe9f2' },
  { id: 'camo_gold',    category: 'camo', name: '24K Gold',         rarity: 'legendary', price: 14000, color: '#ffd23e' },
  { id: 'camo_diamond', category: 'camo', name: 'Diamond Prism',    rarity: 'legendary', price: 18000, color: '#b9f2ff', animated: true },
  { id: 'camo_plasma',  category: 'camo', name: 'Plasma Flow',      rarity: 'mythic',    price: 22000, color: '#ff3df0', animated: true },
  { id: 'camo_void',    category: 'camo', name: 'Void Matter',      rarity: 'mythic',    price: 24000, color: '#3b0764', animated: true },
  // charms
  { id: 'charm_skull',  category: 'charm', name: 'Mini Skull',      rarity: 'rare',   price: 2000, color: '#e8e8e8' },
  { id: 'charm_dice',   category: 'charm', name: 'Lucky Dice',      rarity: 'epic',   price: 5000, color: '#ff4757' },
  { id: 'charm_dragon', category: 'charm', name: 'Dragon Charm',    rarity: 'legendary', price: 11000, color: '#ffb02e', animated: true },
  // elimination effects (original kill animations)
  { id: 'fx_standard', category: 'killEffect', name: 'Standard Burst',   rarity: 'common',    price: 0,     color: '#ffffff' },
  { id: 'fx_void',     category: 'killEffect', name: 'Void Implosion',   rarity: 'mythic',    price: 20000, color: '#7c3aed' },
  { id: 'fx_eclipse',  category: 'killEffect', name: 'Eclipse Collapse', rarity: 'mythic',    price: 20000, color: '#f59e0b' },
  { id: 'fx_overlord', category: 'killEffect', name: 'Overlord Shockwave', rarity: 'legendary', price: 15000, color: '#38bdf8' },
  { id: 'fx_pulse',    category: 'killEffect', name: 'Pulse Disintegration', rarity: 'epic',   price: 9000,  color: '#22d3ee' },
  { id: 'fx_ember',    category: 'killEffect', name: 'Ember Eruption',   rarity: 'epic',      price: 8000,  color: '#ff7b1c' },
  // muzzle effects
  { id: 'mz_standard', category: 'muzzle', name: 'Standard Flash', rarity: 'common',    price: 0,    color: '#ffd76a' },
  { id: 'mz_neon',     category: 'muzzle', name: 'Neon Arc Flash', rarity: 'epic',      price: 6000, color: '#22d3ee' },
  { id: 'mz_void',     category: 'muzzle', name: 'Void Flame',     rarity: 'mythic',    price: 16000, color: '#a855f7' },
  { id: 'mz_ember',    category: 'muzzle', name: 'Ember Jet',      rarity: 'legendary', price: 12000, color: '#ff7b1c' },
];

export const MAPS = [
  { id: 'training_yard', name: 'Training Yard',  size: 90,  crates: 26, buildings: 5, sky: '#87b7e8', fog: '#a8c8ec', ground: '#6f7f5e' },
  { id: 'desert_outpost', name: 'Desert Outpost', size: 120, crates: 40, buildings: 9, sky: '#e8c48a', fog: '#ecd9ae', ground: '#c2a06b' },
  { id: 'neon_docks',    name: 'Neon Docks (Night)', size: 110, crates: 44, buildings: 8, sky: '#0b1026', fog: '#141c3f', ground: '#2a3350', night: true },
];

export const MODES = [
  { id: 'tdm',      name: 'Team Deathmatch', scoreLimit: 30, desc: 'Two teams. First to the score limit wins.' },
  { id: 'ffa',      name: 'Free-For-All',    scoreLimit: 20, desc: 'Every operator for themselves.' },
  { id: 'training', name: 'Training Mission', scoreLimit: 25, desc: 'Targets & passive bots. No incoming fire.' },
];

export const DIFFICULTIES = {
  recruit: { id: 'recruit', name: 'Recruit', botHp: 70,  reactionMs: 900, accuracy: 0.25, damage: 6,  speed: 3.0, xpMult: 0.8 },
  regular: { id: 'regular', name: 'Regular', botHp: 100, reactionMs: 600, accuracy: 0.45, damage: 10, speed: 3.6, xpMult: 1.0 },
  veteran: { id: 'veteran', name: 'Veteran', botHp: 120, reactionMs: 380, accuracy: 0.65, damage: 14, speed: 4.2, xpMult: 1.3 },
  elite:   { id: 'elite',   name: 'Elite',   botHp: 150, reactionMs: 220, accuracy: 0.82, damage: 18, speed: 4.8, xpMult: 1.6 },
};

export const weaponById = (id) => WEAPONS.find((w) => w.id === id) || null;
export const cosmeticById = (id) => COSMETICS.find((c) => c.id === id) || null;
export const attachmentById = (id) => ATTACHMENTS.find((a) => a.id === id) || null;
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];
