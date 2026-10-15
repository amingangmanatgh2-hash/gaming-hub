import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, COSMETICS, ATTACHMENTS, MAPS, MODES, DIFFICULTIES, RARITIES } from '../app/js/catalog.js';

test('catalog integrity: unique ids, valid rarities, sane stats', () => {
  const ids = new Set();
  for (const w of WEAPONS) {
    assert.ok(!ids.has(w.id), `dup weapon ${w.id}`); ids.add(w.id);
    assert.ok(RARITIES[w.rarity], `${w.id} rarity`);
    assert.ok(w.damage > 0 && w.fireRate > 0 && w.mag > 0 && w.maxLevel >= 1);
  }
  for (const c of COSMETICS) {
    assert.ok(!ids.has(c.id), `dup cosmetic ${c.id}`); ids.add(c.id);
    assert.ok(RARITIES[c.rarity]);
    assert.ok(['outfit', 'camo', 'charm', 'killEffect', 'muzzle'].includes(c.category), c.category);
  }
  for (const a of ATTACHMENTS) {
    assert.ok(!ids.has(a.id), `dup attachment ${a.id}`); ids.add(a.id);
    assert.ok(['muzzle', 'barrel', 'optic', 'mag', 'grip'].includes(a.slot));
  }
  assert.ok(WEAPONS.filter((w) => w.rarity === 'mythic').length >= 3, 'mythic armory present');
  assert.ok(WEAPONS.filter((w) => w.rarity === 'legendary').length >= 3, 'legendary armory present');
  assert.equal(MAPS.length >= 3, true);
  assert.equal(MODES.length >= 3, true);
  assert.equal(Object.keys(DIFFICULTIES).length, 4);
});
