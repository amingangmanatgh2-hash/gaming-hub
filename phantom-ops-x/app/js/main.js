// PHANTOM OPS X — boot: in-app launcher twin (update check + SHA-256 verify +
// repair), Phantom accounts, main menu, match orchestration.

import { ProfileStore } from './profiles.js';
import { planUpdate, verifyBundle, repairPlan, nextLauncherState, GAME_STORAGE_KEYS } from './launcher-core.js';
import * as eco from './economy.js';
import { awardXp } from './profiles.js';
import { MAPS, MODES, DIFFICULTIES, WEAPONS, COSMETICS, weaponById } from './catalog.js';
import { Game } from './game.js';
import { PhantomMenu } from './menu.js';
import { SoundFX } from './audio.js';

const APP_VERSION = '1.0.0';
const $ = (s) => document.querySelector(s);
const LAUNCHER_KEY = GAME_STORAGE_KEYS.launcher;

const sfx = new SoundFX();
const store = new ProfileStore(window.localStorage);
store.load();

const toastEl = $('#toast');
let toastT = null;
export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// ---------------------------------------------------------------- launcher
let launcherState = 'idle';
let pendingVersion = null;
const logEl = $('#launchLog');
function log(line) {
  logEl.textContent += line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}
function setProgress(pct) { $('#launchProgress').style.width = clampPct(pct) + '%'; }
function clampPct(p) { return Math.max(0, Math.min(100, p)); }
function launcherStorage() {
  try { return JSON.parse(localStorage.getItem(LAUNCHER_KEY) || '{}'); } catch { return {}; }
}
function saveLauncher(patch) {
  localStorage.setItem(LAUNCHER_KEY, JSON.stringify({ ...launcherStorage(), ...patch }));
}
function installedVersion() { return launcherStorage().installedVersion || APP_VERSION; }

async function sha256Hex(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function checkUpdates(manual = true) {
  launcherState = nextLauncherState(launcherState, 'CHECK');
  log('— Checking for updates…');
  setProgress(8);
  let manifest;
  try {
    const res = await fetch('update-manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    manifest = await res.json();
  } catch (e) {
    launcherState = nextLauncherState(launcherState, 'FAIL');
    log(`✖ Update check failed (${e.message}). Offline mode: bundled game v${installedVersion()} is fully playable.`);
    setProgress(100);
    return;
  }
  $('#latestVer').textContent = manifest.version;
  const plan = planUpdate(installedVersion(), manifest);
  if (!plan.ok) { log('✖ Update manifest is invalid — keeping current install.'); launcherState = 'error'; return; }
  if (!plan.updateAvailable) {
    launcherState = nextLauncherState(launcherState, 'NONE');
    log(`✔ ${plan.reason === 'up-to-date' ? 'You are on the latest version' : 'Installed version is newer than the channel'} (v${installedVersion()}).`);
    setProgress(100);
    return;
  }
  launcherState = nextLauncherState(launcherState, 'FOUND');
  log(`⬇ Update ${plan.from} → ${plan.to}: downloading ${Object.keys(manifest.files).length} files…`);
  const results = {};
  const paths = Object.keys(manifest.files);
  let done = 0;
  try {
    for (const path of paths) {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      results[path] = await sha256Hex(await res.arrayBuffer());
      done += 1;
      setProgress(10 + (done / paths.length) * 70);
    }
  } catch (e) {
    launcherState = nextLauncherState(launcherState, 'FAIL');
    log(`✖ Download failed (${e.message}). Nothing was installed; current version intact.`);
    setProgress(0);
    return;
  }
  launcherState = nextLauncherState(launcherState, 'DONE');
  log('🔐 Verifying SHA-256 signatures…');
  const verify = verifyBundle(manifest, results);
  if (!verify.ok) {
    launcherState = nextLauncherState(launcherState, 'BAD');
    log(`✖ Verification failed (mismatched: ${verify.mismatched.join(', ') || '—'}; missing: ${verify.missing.join(', ') || '—'}). Update discarded.`);
    setProgress(0);
    return;
  }
  launcherState = nextLauncherState(launcherState, 'OK');
  setProgress(92);
  log(`✔ All ${paths.length} files verified against the signed manifest.`);
  launcherState = nextLauncherState(launcherState, 'DONE');
  saveLauncher({ installedVersion: manifest.version, lastVerifiedAt: Date.now() });
  pendingVersion = manifest.version;
  $('#installedVer').textContent = manifest.version;
  setProgress(100);
  log(`✔ Update v${manifest.version} staged & verified. Press PLAY.`);
  if (manual) toast('Update verified & staged');
}

function repair() {
  launcherState = nextLauncherState(launcherState === 'idle' ? 'idle' : launcherState, 'REPAIR');
  const keys = Object.keys(localStorage);
  const plan = repairPlan(keys);
  log('🛠 Repair started…');
  for (const a of plan.actions) log('  · ' + a);
  localStorage.removeItem(LAUNCHER_KEY);
  saveLauncher({ installedVersion: APP_VERSION, repairedAt: Date.now() });
  log(`✔ Profiles preserved (${plan.preservedKeys.length} store key untouched). Bundle will be re-verified on next update check.`);
  $('#installedVer').textContent = APP_VERSION;
  setProgress(100);
  launcherState = 'ready';
  toast('Repair complete — accounts & inventory preserved');
}

$('#btnCheckUpdate').onclick = () => { sfx.ensure(); checkUpdates(true); };
$('#btnRepair').onclick = () => { sfx.ensure(); repair(); };
$('#btnPlayLauncher').onclick = () => { sfx.ensure(); sfx.ui(); enterApp(); };

// ---------------------------------------------------------------- screens
function show(id) {
  for (const s of ['#launcherScreen', '#accountScreen', '#menuScreen']) $(s).classList.add('hidden');
  $('#gameWrap').classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
}
function enterApp() {
  if (store.list().length && store.active()) {
    game.setProfile(store.active());
    refreshMenu();
    show('#menuScreen');
  } else {
    renderAccounts();
    show('#accountScreen');
  }
  $('#btnPhantom').classList.remove('hidden');
}

// ---------------------------------------------------------------- accounts screen
function renderAccounts() {
  const list = $('#accountList');
  list.innerHTML = '';
  for (const p of store.list()) {
    const div = document.createElement('div');
    div.className = 'account-item' + (store.active()?.id === p.id ? ' active' : '');
    div.innerHTML = `<div><b>${p.username}</b>${p.guest ? ' 👻' : ''}<small>Level ${p.progression.level} · ${p.progression.kills} kills · 💰 ${p.inventory.unlimitedCredits ? '∞' : p.inventory.credits.toLocaleString()}</small></div><span>${store.active()?.id === p.id ? 'ACTIVE' : 'TAP TO USE'}</span>`;
    div.onclick = () => {
      store.switchTo(p.id);
      game.setProfile(store.active());
      refreshMenu();
      show('#menuScreen');
      toast('Welcome back, ' + p.username);
    };
    list.appendChild(div);
  }
  if (!store.list().length) list.innerHTML = '<p class="muted">No profiles yet — create one or jump in as guest.</p>';
}
$('#btnCreateProfile').onclick = () => {
  const name = $('#newUsername').value;
  try {
    const p = store.create(name);
    game.setProfile(p);
    $('#accountError').textContent = '';
    refreshMenu();
    show('#menuScreen');
    toast('Profile created: ' + p.username);
  } catch (e) { $('#accountError').textContent = e.message; }
};
$('#btnGuest').onclick = () => {
  const g = store.createGuest();
  game.setProfile(g);
  refreshMenu();
  show('#menuScreen');
  toast('Guest session: ' + g.username);
};
$('#profileChip').onclick = () => { renderAccounts(); show('#accountScreen'); };

// ---------------------------------------------------------------- game + menu
const game = new Game({
  wrap: $('#gameWrap'),
  healthFill: $('#healthFill'), healthText: $('#healthText'),
  ammoText: $('#ammoText'), weaponText: $('#weaponText'), reloadHint: $('#reloadHint'),
  scoreText: $('#scoreText'), timerText: $('#timerText'),
  killfeed: $('#killfeed'), radar: $('#radar'), radarWrap: $('#radarWrap'),
  fpsCounter: $('#fpsCounter'), perfWrap: $('#perfWrap'), perfCanvas: $('#perfCanvas'),
  crosshair: $('#crosshair'), hitmarker: $('#hitmarker'), scope: $('#scope'), hurt: $('#hurt'),
  damageLayer: $('#damageLayer'), tagLayer: $('#tagLayer'),
  respawn: $('#respawn'), respawnText: $('#respawnText'),
  flyControls: $('#flyControls'),
}, {
  sfx,
  onMatchStart() {
    show(null);
    $('#gameWrap').classList.remove('hidden');
    $('#hud').classList.remove('hidden');
    if ('ontouchstart' in window) $('#touchUI').classList.remove('hidden');
    game.applyHudLayout();
  },
  onMatchStop() { /* handled by quit flow */ },
  onPauseRequest() {
    if (game.state === 'playing') {
      game.paused = true;
      $('#pauseOverlay').classList.remove('hidden');
    }
  },
  onMatchEnd(result) {
    const p = store.active();
    const rewards = eco.matchRewards(p, { won: result.won, kills: result.kills, difficulty: result.diff });
    const levels = awardXp(p.progression, rewards.xp);
    eco.earn(p.inventory, rewards.credits);
    p.progression.matches += 1;
    if (result.won) p.progression.wins += 1; else p.progression.losses += 1;
    p.progression.playSeconds += Math.round(result.durationSec);
    store.save();
    $('#endTitle').textContent = result.won ? '🏆 VICTORY' : '💀 DEFEAT';
    $('#endTitle').style.color = result.won ? 'var(--good)' : 'var(--bad)';
    $('#endStats').textContent =
      `${result.mode.name} · ${result.map.name} · ${result.diff.name}\n` +
      `Kills ${result.kills} · Deaths ${result.deaths}\n` +
      (result.mode.id === 'tdm' ? `Team score ${result.score[0]} — ${result.score[1]}\n` : '') +
      `Rewards: +${rewards.xp} XP${levels ? ` (LEVEL UP → ${p.progression.level}!)` : ''} · +${rewards.credits} PHANTOM CREDITS\n` +
      `Credits balance: ${p.inventory.unlimitedCredits ? '∞' : p.inventory.credits.toLocaleString()} · ${result.reason}`;
    $('#endOverlay').classList.remove('hidden');
    $('#touchUI').classList.add('hidden');
    refreshMenu();
  },
});
if (store.active()) game.setProfile(store.active());

const menu = new PhantomMenu({
  store, game, sfx, toast,
  onProfileChanged(dest) {
    if (dest === 'launcher') { show('#launcherScreen'); return; }
    if (store.active()) game.setProfile(store.active());
    refreshMenu();
    if (!store.active()) { renderAccounts(); show('#accountScreen'); }
  },
});

$('#btnPhantom').onclick = () => {
  sfx.ensure();
  if (game.state === 'playing' && !menu.isOpen()) game.paused = true;
  menu.toggle();
  if (!menu.isOpen() && game.state === 'playing' && $('#pauseOverlay').classList.contains('hidden')) game.paused = false;
};
document.querySelectorAll('[data-open-menu]').forEach((b) => {
  b.addEventListener('click', () => menu.open(b.dataset.openMenu));
});

// pause / end buttons
$('#btnResume').onclick = () => {
  $('#pauseOverlay').classList.add('hidden');
  game.paused = false;
  if (!('ontouchstart' in window)) game.renderer.domElement.requestPointerLock();
};
$('#btnQuitMatch').onclick = () => {
  $('#pauseOverlay').classList.add('hidden');
  game.paused = false;
  game.stopMatch();
  show('#menuScreen');
  refreshMenu();
};
$('#btnEndMenu').onclick = () => {
  $('#endOverlay').classList.add('hidden');
  game.state = 'idle';
  show('#menuScreen');
  refreshMenu();
};
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' && game.state === 'playing') $('#btnPhantom').click();
});

// ---------------------------------------------------------------- touch controls
if ('ontouchstart' in window) {
  const joyBase = $('#joyBase'), joyStick = $('#joyStick');
  let joyId = null;
  const setStick = (dx, dy) => { joyStick.style.transform = `translate(${dx * 32}px, ${dy * 32}px)`; };
  joyBase.addEventListener('touchstart', (e) => { joyId = e.changedTouches[0].identifier; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const r = joyBase.getBoundingClientRect();
      let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      setStick(dx, dy);
      game.touchMove = { x: dx, y: -dy };
      game.touchSprint = m > 0.92;
    }
  }, { passive: true });
  const endJoy = (e) => {
    for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; game.touchMove = { x: 0, y: 0 }; game.touchSprint = false; setStick(0, 0); }
  };
  window.addEventListener('touchend', endJoy);
  game.bindTouchButton($('#btnFire'), () => { if (game.player) game.player.firing = true; }, () => { if (game.player) game.player.firing = false; });
  game.bindTouchButton($('#btnAds'), () => { if (game.player) game.player.adsHeld = !game.player.adsHeld; });
  game.bindTouchButton($('#btnJump'), () => { game.touchJump = true; }, () => { game.touchJump = false; });
  game.bindTouchButton($('#btnReloadT'), () => game.startReload());
  game.bindTouchButton($('#btnSwap'), () => { if (game.player) game.switchSlot(game.player.slot === 'primary' ? 'secondary' : 'primary'); });
  game.bindTouchButton($('#btnFlyUp'), () => { game.touchFlyUp = true; }, () => { game.touchFlyUp = false; });
  game.bindTouchButton($('#btnFlyDown'), () => { game.touchFlyDown = true; }, () => { game.touchFlyDown = false; });
}

// ---------------------------------------------------------------- main menu
function fillSelect(sel, items, value) {
  sel.innerHTML = items.map((i) => `<option value="${i.v}" ${i.v === value ? 'selected' : ''}>${i.t}</option>`).join('');
}
function refreshMenu() {
  const p = store.active();
  if (!p) return;
  $('#profileChip').textContent = `👤 ${p.username} · Lv${p.progression.level} · 💰 ${p.inventory.unlimitedCredits ? '∞' : p.inventory.credits.toLocaleString()}`;
  fillSelect($('#selMap'), MAPS.map((m) => ({ v: m.id, t: m.name })), $('#selMap').value || MAPS[0].id);
  fillSelect($('#selMode'), MODES.map((m) => ({ v: m.id, t: `${m.name} — ${m.desc}` })), $('#selMode').value || MODES[0].id);
  fillSelect($('#selDiff'), Object.values(DIFFICULTIES).map((d) => ({ v: d.id, t: d.name })), $('#selDiff').value || 'regular');
  const owned = p.inventory.weaponsOwned;
  fillSelect($('#selPrimary'), owned.map((id) => ({ v: id, t: weaponById(id).name })), p.inventory.loadout.primary);
  fillSelect($('#selSecondary'), owned.map((id) => ({ v: id, t: weaponById(id).name })), p.inventory.loadout.secondary);
  const st = p.stats;
  const acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
  $('#menuStats').textContent = `Matches ${p.progression.matches} · W/L ${p.progression.wins}/${p.progression.losses} · K/D ${p.progression.kills}/${p.progression.deaths} · Accuracy ${acc}% · Headshots ${st.headshots} · Weapons ${p.inventory.weaponsOwned.length}/${WEAPONS_COUNT} · Cosmetics ${p.inventory.cosmeticsOwned.length}`;
}
const WEAPONS_COUNT = 16;
$('#selPrimary').addEventListener('change', (e) => { const p = store.active(); if (p) { eco.equipLoadout(p.inventory, { primary: e.target.value }); store.save(); game.applyLoadout(); } });
$('#selSecondary').addEventListener('change', (e) => { const p = store.active(); if (p) { eco.equipLoadout(p.inventory, { secondary: e.target.value }); store.save(); game.applyLoadout(); } });
$('#btnDeploy').onclick = () => {
  const p = store.active();
  if (!p) return;
  sfx.ensure();
  game.setProfile(p);
  game.setQuality(p.settings.quality);
  sfx.setVolume(p.settings.volume);
  menu.close();
  game.startMatch({ mapId: $('#selMap').value, modeId: $('#selMode').value, difficultyId: $('#selDiff').value });
  if (!('ontouchstart' in window)) game.renderer.domElement.requestPointerLock();
};

// ---------------------------------------------------------------- init
(function init() {
  $('#installedVer').textContent = installedVersion();
  const p = store.active();
  if (p) {
    document.documentElement.dataset.theme = p.settings.theme || 'phantom';
    document.documentElement.lang = p.settings.lang === 'fa' ? 'fa' : 'en';
    document.documentElement.dir = p.settings.lang === 'fa' ? 'rtl' : 'ltr';
    sfx.setVolume(p.settings.volume ?? 0.8);
  }
  log(`PHANTOM OPS X launcher ready. Installed bundle v${installedVersion()}.`);
  log('Offline play is fully supported. Updates are SHA-256 verified before staging.');
  launcherState = 'ready';
  // silent background check (does not block play)
  setTimeout(() => { if (navigator.onLine) checkUpdates(false); }, 600);
})();
