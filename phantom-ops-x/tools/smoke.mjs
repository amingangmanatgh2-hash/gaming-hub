// Headless DOM smoke test: loads the real index.html into jsdom, wires the
// real ProfileStore + PhantomMenu with a stub game surface, renders every
// menu tab, and drives real controls to prove settings actually mutate state.
// Run: npm run smoke   (WebGL gameplay itself needs a real browser — see TESTING.md)
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.devicePixelRatio = 1;

const { ProfileStore } = await import('../app/js/profiles.js');
const { PhantomMenu } = await import('../app/js/menu.js');
const eco = await import('../app/js/economy.js');
const mods = await import('../app/js/mods.js');
const catalog = await import('../app/js/catalog.js');

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures += 1;
};

const store = new ProfileStore(dom.window.localStorage);
let profile = store.create('SmokeTester');
const calls = { crosshair: 0, loadout: 0, quality: 0 };
const fakeGame = {
  updateCrosshair() { calls.crosshair += 1; },
  applyLoadout() { calls.loadout += 1; },
  setQuality() { calls.quality += 1; },
};
const fakeSfx = { ui() {}, setVolume() {} };
const menu = new PhantomMenu({ store, game: fakeGame, sfx: fakeSfx, toast: () => {}, onProfileChanged: () => {} });

// Every tab renders with real controls
for (const tab of ['aim', 'move', 'weapons', 'visuals', 'inventory', 'accounts', 'configs', 'system']) {
  menu.open(tab);
  const controls = document.querySelectorAll('#pmBody .pm-row, #pmBody button, #pmBody input, #pmBody select, #pmBody .wcard').length;
  check(`tab "${tab}" renders controls`, controls >= 3);
}

// Armory renders the weapon grid (skip 3D preview internals w/o WebGL, but grid must render)
menu.open('armory');
const cards = document.querySelectorAll('#pmBody .wcard').length;
check(`armory grid lists catalog (${cards}/${catalog.WEAPONS.length})`, cards === catalog.WEAPONS.length);

// Drive the aim tab: flip the lock toggle -> live mod state
menu.open('aim');
const toggles = document.querySelectorAll('#pmBody .toggle input');
toggles[0].checked = true;
toggles[0].dispatchEvent(new dom.window.Event('change'));
check('aim lock toggle mutates live mods', profile.mods.aim.enabled === true);
check('aim lock persists to storage', store.load() !== false && JSON.parse(dom.window.localStorage.getItem('phantomopsx.profiles.v1')).profiles[profile.id].mods.aim.enabled === true);

profile = store.active(); // load() above rehydrated fresh objects
menu.open('aim'); // rebind control closures to the rehydrated profile

// Drive a slider: ranges are [smoothing, strength, fov, flick, prediction, ...]
const ranges = document.querySelectorAll('#pmBody input[type=range]');
ranges[1].value = '0.33';
ranges[1].dispatchEvent(new dom.window.Event('input'));
check('strength slider mutates live mods', Math.abs(profile.mods.aim.strength - 0.33) < 1e-9);

// Inventory lab: unlock-all through the economy the tab is bound to
eco.unlockAllWeapons(profile.inventory);
eco.unlockAllCosmetics(profile.inventory);
check('unlock-all covers catalog', profile.inventory.weaponsOwned.length === catalog.WEAPONS.length && profile.inventory.cosmeticsOwned.length === catalog.COSMETICS.length);

// Weapon stat solver reacts to menu-bound mods
profile.mods.weapons.fireRateMult = 2;
const w = catalog.weaponById('ar_phantom');
const stats = mods.computeWeaponStats(w, profile.mods, 1);
check('mod engine doubles fire rate', Math.abs(stats.fireRateRpm - w.fireRate * 2) < 1e-6);

// Search filters rows
menu.open('move');
document.querySelector('#pmSearch').value = 'flight';
document.querySelector('#pmSearch').dispatchEvent(new dom.window.Event('input'));
const visibleRows = [...document.querySelectorAll('#pmBody .pm-row')].filter((r) => r.style.display !== 'none');
check('menu search filters modules', visibleRows.length >= 1 && visibleRows.some((r) => /flight/i.test(r.textContent)));

// Language switch -> RTL
profile.settings.lang = 'fa';
menu.open('system');
check('Persian switches document to RTL', document.documentElement.dir === 'rtl');
profile.settings.lang = 'en';
menu.renderBody();
check('English switches back to LTR', document.documentElement.dir === 'ltr');

console.log(failures ? `\n${failures} smoke checks FAILED` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
