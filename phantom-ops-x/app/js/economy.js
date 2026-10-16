// PHANTOM OPS X — Unlimited Inventory Lab (sandbox economy).
// Fictional PHANTOM CREDITS only — no real money, no official accounts.

import { WEAPONS, COSMETICS, weaponById, cosmeticById } from './catalog.js';

export const STARTER_WEAPONS = ['ar_phantom', 'p_sidearm', 'smg_wasp'];
export const STARTER_COSMETICS = ['outfit_operator', 'camo_factory', 'fx_standard', 'mz_standard'];
export const MAX_CREDITS = 999_999_999;

export function createInventory() {
  return {
    credits: 5000,
    unlimitedCredits: false,
    weaponsOwned: [...STARTER_WEAPONS],
    weaponLevels: Object.fromEntries(STARTER_WEAPONS.map((id) => [id, 1])),
    attachmentsOwned: 'all', // sandbox lab: attachments are experiment-free
    cosmeticsOwned: [...STARTER_COSMETICS],
    loadout: {
      primary: 'ar_phantom',
      secondary: 'p_sidearm',
      outfit: 'outfit_operator',
      camoByWeapon: {},
      charm: null,
      killEffect: 'fx_standard',
      muzzle: 'mz_standard',
    },
  };
}

export function setCredits(inv, amount) {
  const n = Math.floor(Number(amount));
  inv.credits = Number.isFinite(n) ? Math.min(MAX_CREDITS, Math.max(0, n)) : inv.credits;
  return inv.credits;
}

export function setUnlimited(inv, on) {
  inv.unlimitedCredits = !!on;
  return inv.unlimitedCredits;
}

export function canAfford(inv, price) {
  return inv.unlimitedCredits || inv.credits >= price;
}

export function spend(inv, price) {
  price = Math.max(0, Math.floor(Number(price) || 0));
  if (!canAfford(inv, price)) return false;
  if (!inv.unlimitedCredits) inv.credits -= price;
  return true;
}

export function earn(inv, amount) {
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!inv.unlimitedCredits) inv.credits = Math.min(MAX_CREDITS, inv.credits + amount);
  return inv.credits;
}

export function buyWeapon(inv, weaponId) {
  const w = weaponById(weaponId);
  if (!w) return { ok: false, error: 'Unknown weapon.' };
  if (inv.weaponsOwned.includes(weaponId)) return { ok: true, already: true };
  if (!spend(inv, w.price)) return { ok: false, error: 'Not enough PHANTOM CREDITS.' };
  inv.weaponsOwned.push(weaponId);
  inv.weaponLevels[weaponId] = 1;
  return { ok: true };
}

export function buyCosmetic(inv, cosmeticId) {
  const c = cosmeticById(cosmeticId);
  if (!c) return { ok: false, error: 'Unknown cosmetic.' };
  if (inv.cosmeticsOwned.includes(cosmeticId)) return { ok: true, already: true };
  if (!spend(inv, c.price)) return { ok: false, error: 'Not enough PHANTOM CREDITS.' };
  inv.cosmeticsOwned.push(cosmeticId);
  return { ok: true };
}

export function unlockAllWeapons(inv) {
  inv.weaponsOwned = WEAPONS.map((w) => w.id);
  for (const w of WEAPONS) if (!inv.weaponLevels[w.id]) inv.weaponLevels[w.id] = 1;
  return inv.weaponsOwned.length;
}

export function unlockAllCosmetics(inv) {
  inv.cosmeticsOwned = COSMETICS.map((c) => c.id);
  return inv.cosmeticsOwned.length;
}

export function weaponLevel(inv, weaponId) {
  return inv.weaponLevels[weaponId] || (inv.weaponsOwned.includes(weaponId) ? 1 : 0);
}

export function upgradeCost(weapon, currentLevel) {
  if (currentLevel >= weapon.maxLevel) return null;
  return 400 * currentLevel + Math.floor(weapon.price * 0.04);
}

export function upgradeWeapon(inv, weaponId) {
  const w = weaponById(weaponId);
  if (!w) return { ok: false, error: 'Unknown weapon.' };
  if (!inv.weaponsOwned.includes(weaponId)) return { ok: false, error: 'Weapon not owned.' };
  const lvl = weaponLevel(inv, weaponId);
  const cost = upgradeCost(w, lvl);
  if (cost === null) return { ok: false, error: 'Already at max level.' };
  if (!spend(inv, cost)) return { ok: false, error: 'Not enough PHANTOM CREDITS.' };
  inv.weaponLevels[weaponId] = lvl + 1;
  return { ok: true, level: lvl + 1, cost };
}

export function setWeaponLevel(inv, weaponId, level) {
  const w = weaponById(weaponId);
  if (!w) throw new Error('Unknown weapon.');
  if (!inv.weaponsOwned.includes(weaponId)) inv.weaponsOwned.push(weaponId);
  inv.weaponLevels[weaponId] = Math.min(w.maxLevel, Math.max(1, Math.floor(Number(level) || 1)));
  return inv.weaponLevels[weaponId];
}

export function equipLoadout(inv, patch) {
  const L = inv.loadout;
  if (patch.primary && inv.weaponsOwned.includes(patch.primary)) L.primary = patch.primary;
  if (patch.secondary && inv.weaponsOwned.includes(patch.secondary)) L.secondary = patch.secondary;
  for (const key of ['outfit', 'killEffect', 'muzzle']) {
    if (patch[key]) {
      const c = cosmeticById(patch[key]);
      if (c && inv.cosmeticsOwned.includes(c.id)) L[key] = c.id;
    }
  }
  if (patch.charm !== undefined) {
    if (patch.charm === null) L.charm = null;
    else if (cosmeticById(patch.charm) && inv.cosmeticsOwned.includes(patch.charm)) L.charm = patch.charm;
  }
  if (patch.camo && typeof patch.camo === 'object') {
    for (const [wid, cid] of Object.entries(patch.camo)) {
      if (inv.cosmeticsOwned.includes(cid)) L.camoByWeapon[wid] = cid;
    }
  }
  return L;
}

// Preview is always allowed in the lab (any tier), equipping needs ownership.
export function previewCosmetic(cosmeticId) {
  return cosmeticById(cosmeticId);
}

export function resetInventory(profile) {
  profile.inventory = createInventory();
  return profile.inventory;
}

export function matchRewards(profile, { won, kills, difficulty }) {
  const xp = Math.round((120 + kills * 35 + (won ? 150 : 40)) * (difficulty?.xpMult || 1));
  const credits = Math.round(150 + kills * 40 + (won ? 250 : 60));
  return { xp, credits };
}
