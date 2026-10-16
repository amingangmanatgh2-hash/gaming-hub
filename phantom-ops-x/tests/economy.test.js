import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInventory, setCredits, setUnlimited, spend, earn, buyWeapon, buyCosmetic,
  unlockAllWeapons, unlockAllCosmetics, upgradeWeapon, setWeaponLevel, weaponLevel,
  upgradeCost, equipLoadout, previewCosmetic, resetInventory, matchRewards, MAX_CREDITS,
} from '../app/js/economy.js';
import { WEAPONS, COSMETICS, weaponById } from '../app/js/catalog.js';

test('set PHANTOM CREDITS to any amount (clamped)', () => {
  const inv = createInventory();
  assert.equal(setCredits(inv, 123456), 123456);
  assert.equal(setCredits(inv, -5), 0);
  assert.equal(setCredits(inv, 1e12), MAX_CREDITS);
});

test('unlimited credits: spend never drains, buy always works', () => {
  const inv = createInventory();
  setCredits(inv, 10);
  setUnlimited(inv, true);
  assert.equal(spend(inv, 99999), true);
  assert.equal(inv.credits, 10, 'balance untouched while unlimited');
  const pricey = WEAPONS.find((w) => w.price > 20000);
  assert.equal(buyWeapon(inv, pricey.id).ok, true);
});

test('spend fails when broke (not unlimited)', () => {
  const inv = createInventory();
  setCredits(inv, 100);
  assert.equal(spend(inv, 101), false);
  assert.equal(spend(inv, 100), true);
  assert.equal(inv.credits, 0);
});

test('buy weapon/cosmetic deducts credits and grants ownership', () => {
  const inv = createInventory();
  setCredits(inv, 100000);
  const w = weaponById('sr_longshot');
  assert.equal(buyWeapon(inv, w.id).ok, true);
  assert.ok(inv.weaponsOwned.includes(w.id));
  assert.equal(inv.credits, 100000 - w.price);
  assert.equal(buyWeapon(inv, w.id).already, true);
  const c = COSMETICS.find((x) => x.id === 'camo_gold');
  assert.equal(buyCosmetic(inv, c.id).ok, true);
  assert.ok(inv.cosmeticsOwned.includes(c.id));
});

test('unlock all weapons & cosmetics covers the whole catalog', () => {
  const inv = createInventory();
  assert.equal(unlockAllWeapons(inv), WEAPONS.length);
  assert.equal(unlockAllCosmetics(inv), COSMETICS.length);
  for (const w of WEAPONS) assert.ok(inv.weaponsOwned.includes(w.id));
  for (const c of COSMETICS) assert.ok(inv.cosmeticsOwned.includes(c.id));
});

test('weapon upgrade path: cost grows, level caps at max', () => {
  const inv = createInventory();
  setUnlimited(inv, true);
  const w = weaponById('ar_phantom');
  let last = 0;
  for (let lvl = 1; lvl < w.maxLevel; lvl++) {
    const r = upgradeWeapon(inv, w.id);
    assert.equal(r.ok, true);
    assert.equal(r.level, lvl + 1);
    assert.ok(r.cost >= last);
    last = r.cost;
  }
  assert.equal(weaponLevel(inv, w.id), w.maxLevel);
  assert.equal(upgradeWeapon(inv, w.id).ok, false, 'cannot pass max level');
  assert.equal(upgradeCost(w, w.maxLevel), null);
});

test('set weapon upgrade level directly (lab control)', () => {
  const inv = createInventory();
  assert.equal(setWeaponLevel(inv, 'sr_eclipse', 7), 7);
  assert.equal(setWeaponLevel(inv, 'sr_eclipse', 999), 10);
  assert.equal(setWeaponLevel(inv, 'sr_eclipse', 0), 1);
});

test('equip requires ownership; preview works for every tier', () => {
  const inv = createInventory();
  equipLoadout(inv, { outfit: 'outfit_phantom' });
  assert.notEqual(inv.loadout.outfit, 'outfit_phantom', 'cannot equip unowned');
  assert.equal(previewCosmetic('outfit_phantom').rarity, 'mythic', 'preview any tier');
  unlockAllCosmetics(inv);
  equipLoadout(inv, { outfit: 'outfit_phantom', killEffect: 'fx_void', muzzle: 'mz_void', charm: 'charm_dragon' });
  assert.equal(inv.loadout.outfit, 'outfit_phantom');
  assert.equal(inv.loadout.killEffect, 'fx_void');
});

test('inventory reset restores starter state', () => {
  const profile = { inventory: createInventory() };
  unlockAllWeapons(profile.inventory);
  setCredits(profile.inventory, 1);
  resetInventory(profile);
  assert.equal(profile.inventory.credits, 5000);
  assert.equal(profile.inventory.weaponsOwned.length, 3);
});

test('match rewards scale with performance & difficulty', () => {
  const rec = { xpMult: 0.8 }, elite = { xpMult: 1.6 };
  const a = matchRewards({}, { won: true, kills: 10, difficulty: elite });
  const b = matchRewards({}, { won: false, kills: 0, difficulty: rec });
  assert.ok(a.xp > b.xp && a.credits > b.credits);
});
