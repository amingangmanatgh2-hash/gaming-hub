// PHANTOM OPS X — floating modification menu + Mythic Armory X + Inventory Lab
// + Accounts + Configs. Every control writes into the active profile's live
// mod/economy state that the game loop reads each frame (no fake switches).

import * as THREE from 'three';
import { WEAPONS, COSMETICS, ATTACHMENTS, RARITIES, weaponById, cosmeticById, ATTACHMENT_SLOTS } from './catalog.js';
import * as eco from './economy.js';
import { computeWeaponStats, sanitizeMods, clamp } from './mods.js';
import { buildWeaponModel } from './model.js';
import { validateUsername } from './profiles.js';

const I18N = {
  en: { aim: 'Aim', move: 'Movement', weapons: 'Weapons', visuals: 'Visuals', armory: 'Armory', inventory: 'Inventory', accounts: 'Accounts', configs: 'Configs', system: 'System', search: 'Search modules…', on: 'ON', off: 'OFF' },
  fa: { aim: 'هدف‌گیری', move: 'حرکت', weapons: 'سلاح‌ها', visuals: 'تصویری', armory: 'زرادخانه', inventory: 'موجودی', accounts: 'حساب‌ها', configs: 'پیکربندی', system: 'سیستم', search: 'جستجوی ماژول…', on: 'روشن', off: 'خاموش' },
};

const $ = (sel, root = document) => root.querySelector(sel);

export class PhantomMenu {
  constructor(opts) {
    this.store = opts.store;
    this.game = opts.game;
    this.sfx = opts.sfx;
    this.toast = opts.toast;
    this.onProfileChanged = opts.onProfileChanged || (() => {});
    this.root = $('#phantomMenu');
    this.body = $('#pmBody');
    this.tabsEl = $('#pmTabs');
    this.tab = 'aim';
    this.armorySel = null;
    this._preview = null;
    this.lang = 'en';
    this.buildChrome();
  }

  profile() { return this.store.active(); }
  t(k) { return (I18N[this.lang] || I18N.en)[k] || I18N.en[k] || k; }
  save() { this.store.save(); }

  buildChrome() {
    // drag
    const header = $('#pmHeader');
    let drag = null;
    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input,button')) return;
      drag = { x: e.clientX - this.root.offsetLeft, y: e.clientY - this.root.offsetTop };
      header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.root.style.left = clamp(e.clientX - drag.x, 0, window.innerWidth - 90) + 'px';
      this.root.style.top = clamp(e.clientY - drag.y, 0, window.innerHeight - 60) + 'px';
    });
    header.addEventListener('pointerup', () => { drag = null; });
    // resize
    const rz = $('#pmResize');
    let rs = null;
    rz.addEventListener('pointerdown', (e) => { rs = { x: e.clientX, y: e.clientY, w: this.root.offsetWidth, h: this.root.offsetHeight }; rz.setPointerCapture(e.pointerId); e.stopPropagation(); });
    rz.addEventListener('pointermove', (e) => {
      if (!rs) return;
      this.root.style.width = clamp(rs.w + e.clientX - rs.x, 300, window.innerWidth - 10) + 'px';
      this.root.style.height = clamp(rs.h + e.clientY - rs.y, 260, window.innerHeight - 10) + 'px';
    });
    rz.addEventListener('pointerup', () => { rs = null; });
    $('#pmClose').onclick = () => this.close();
    $('#pmMin').onclick = () => { this.body.style.display = this.body.style.display === 'none' ? '' : 'none'; this.tabsEl.style.display = this.body.style.display; };
    $('#pmSearch').addEventListener('input', (e) => this.applySearch(e.target.value));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Insert' || e.code === 'KeyM') { /* M toggles menu outside match typing */ }
    });
  }

  applySearch(q) {
    q = String(q || '').trim().toLowerCase();
    this.body.querySelectorAll('.pm-row, .wcard, .pm-sec').forEach((el) => {
      if (el.classList.contains('pm-sec')) return;
      el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }

  open(tab) {
    if (!this.profile()) { this.toast('Create or select a profile first'); return; }
    if (tab) this.tab = tab;
    this.root.classList.remove('hidden');
    this.lang = this.profile().settings.lang || 'en';
    $('#pmSearch').placeholder = this.t('search');
    this.renderTabs();
    this.renderBody();
  }
  close() {
    this.root.classList.add('hidden');
    this.stopPreview();
  }
  toggle(tab) { this.root.classList.contains('hidden') ? this.open(tab) : this.close(); }
  isOpen() { return !this.root.classList.contains('hidden'); }

  renderTabs() {
    const tabs = ['aim', 'move', 'weapons', 'visuals', 'armory', 'inventory', 'accounts', 'configs', 'system'];
    this.tabsEl.innerHTML = tabs.map((id) =>
      `<button class="pm-tab ${this.tab === id ? 'active' : ''}" data-tab="${id}">${this.t(id)}</button>`).join('');
    this.tabsEl.querySelectorAll('.pm-tab').forEach((b) => b.onclick = () => { this.tab = b.dataset.tab; this.sfx.ui(); this.renderTabs(); this.renderBody(); });
  }

  // ---- control builders -------------------------------------------------
  sec(title) {
    const s = document.createElement('div');
    s.className = 'pm-sec';
    s.innerHTML = `<h4>${title}</h4>`;
    this.body.appendChild(s);
    return s;
  }
  row(parent, label) {
    const r = document.createElement('div');
    r.className = 'pm-row';
    r.innerHTML = `<label>${label}</label>`;
    parent.appendChild(r);
    return r;
  }
  switchRow(parent, label, get, set) {
    const r = this.row(parent, label);
    const l = document.createElement('label');
    l.className = 'toggle';
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.checked = !!get();
    const i = document.createElement('i');
    l.append(inp, i); r.appendChild(l);
    inp.onchange = () => { set(inp.checked); this.save(); this.sfx.ui(); };
    return inp;
  }
  slider(parent, label, get, set, min, max, step = 0.05, fmt) {
    const r = this.row(parent, label);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
    const val = document.createElement('span');
    val.className = 'pm-val';
    const show = () => { val.textContent = fmt ? fmt(Number(inp.value)) : Number(inp.value).toFixed(2); };
    show();
    inp.oninput = () => { set(Number(inp.value)); show(); this.save(); };
    r.append(inp, val);
    return inp;
  }
  select(parent, label, get, set, options) {
    const r = this.row(parent, label);
    const sel = document.createElement('select');
    sel.className = 'input';
    sel.innerHTML = options.map((o) => `<option value="${o.v}" ${String(o.v) === String(get()) ? 'selected' : ''}>${o.t}</option>`).join('');
    sel.onchange = () => { set(sel.value); this.save(); this.sfx.ui(); };
    r.appendChild(sel);
    return sel;
  }
  button(parent, label, fn, cls = 'btn') {
    const b = document.createElement('button');
    b.className = cls; b.textContent = label; b.style.margin = '4px 0 8px';
    b.onclick = () => { fn(); };
    parent.appendChild(b);
    return b;
  }

  renderBody() {
    this.stopPreview();
    this.body.innerHTML = '';
    const p = this.profile();
    if (!p) { this.body.textContent = 'No active profile.'; return; }
    document.documentElement.lang = p.settings.lang === 'fa' ? 'fa' : 'en';
    document.documentElement.dir = p.settings.lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.dataset.theme = p.settings.theme || 'phantom';
    const fn = {
      aim: () => this.tabAim(p), move: () => this.tabMove(p), weapons: () => this.tabWeapons(p),
      visuals: () => this.tabVisuals(p), armory: () => this.tabArmory(p), inventory: () => this.tabInventory(p),
      accounts: () => this.tabAccounts(p), configs: () => this.tabConfigs(p), system: () => this.tabSystem(p),
    }[this.tab];
    (fn || (() => {}))();
    const q = $('#pmSearch').value;
    if (q) this.applySearch(q);
  }

  refreshAfterEconomy(msg) {
    this.save();
    this.onProfileChanged();
    if (msg) this.toast(msg);
    this.renderBody();
  }

  // ---- AIM ---------------------------------------------------------------
  tabAim(p) {
    const a = p.mods.aim;
    let s = this.sec('🎯 EXPERIMENTAL AIM CONTROL');
    this.switchRow(s, 'Aim lock (experimental)', () => a.enabled, (v) => a.enabled = v);
    this.select(s, 'Target selection', () => a.lockMode, (v) => a.lockMode = v, [
      { v: 'crosshair', t: 'Closest to crosshair' }, { v: 'nearest', t: 'Nearest enemy' }, { v: 'weakest', t: 'Lowest HP' }]);
    this.select(s, 'Target bone', () => a.bone, (v) => a.bone = v, [
      { v: 'body', t: 'Body / chest' }, { v: 'head', t: 'Head' }]);
    this.slider(s, 'Aim smoothing', () => a.smoothing, (v) => a.smoothing = v, 0, 1, 0.01);
    this.slider(s, 'Aim strength', () => a.strength, (v) => a.strength = v, 0, 1, 0.01);
    this.slider(s, 'Acquisition FOV (deg)', () => a.fovDeg, (v) => a.fovDeg = v, 2, 120, 1, (v) => v + '°');
    this.switchRow(s, 'Automatic target switching', () => a.autoSwitch, (v) => a.autoSwitch = v);
    this.switchRow(s, 'Flick-shot assistance', () => a.flickAssist, (v) => a.flickAssist = v);
    this.slider(s, 'Flick threshold (deg)', () => a.flickThresholdDeg, (v) => a.flickThresholdDeg = v, 1, 30, 0.5, (v) => v + '°');
    this.slider(s, 'Target prediction', () => a.prediction, (v) => a.prediction = v, 0, 1, 0.01);
    s = this.sec('🔫 PER-WEAPON AIM PROFILE');
    const owned = p.inventory.weaponsOwned;
    let selW = owned[0];
    const applyPer = () => {
      this.slider(s, `↳ ${weaponById(selW)?.name} strength`, () => a.perWeapon[selW]?.strength ?? a.strength,
        (v) => { (a.perWeapon[selW] ||= {}).strength = v; }, 0, 1, 0.01);
      this.slider(s, '↳ smoothing override', () => a.perWeapon[selW]?.smoothing ?? a.smoothing,
        (v) => { (a.perWeapon[selW] ||= {}).smoothing = v; }, 0, 1, 0.01);
      this.select(s, '↳ bone override', () => a.perWeapon[selW]?.bone || a.bone,
        (v) => { (a.perWeapon[selW] ||= {}).bone = v; }, [{ v: 'body', t: 'Body' }, { v: 'head', t: 'Head' }]);
    };
    this.select(s, 'Weapon', () => selW, (v) => { selW = v; this.renderBody(); },
      owned.map((id) => ({ v: id, t: weaponById(id).name })));
    applyPer();
    this.button(s, 'Clear this weapon override', () => { delete a.perWeapon[selW]; this.save(); this.renderBody(); });
  }

  // ---- MOVEMENT ------------------------------------------------------------
  tabMove(p) {
    const m = p.mods.movement;
    let s = this.sec('🕊 MOVEMENT LAB');
    this.switchRow(s, 'Flight mode', () => m.fly, (v) => m.fly = v);
    this.slider(s, 'Move speed ×', () => m.speedMult, (v) => m.speedMult = v, 0.2, 6, 0.05, (v) => '×' + v.toFixed(2));
    this.slider(s, 'Sprint ×', () => m.sprintMult, (v) => m.sprintMult = v, 1, 4, 0.05, (v) => '×' + v.toFixed(2));
    this.slider(s, 'Jump power ×', () => m.jumpMult, (v) => m.jumpMult = v, 0.2, 4, 0.05, (v) => '×' + v.toFixed(2));
    this.slider(s, 'Air control', () => m.airControl, (v) => m.airControl = v, 0, 1, 0.01);
    this.slider(s, 'Gravity ×', () => m.gravityMult, (v) => m.gravityMult = v, 0.05, 3, 0.05, (v) => '×' + v.toFixed(2));
    s = this.sec('💾 MOVEMENT PRESETS');
    const nameIn = document.createElement('input');
    nameIn.className = 'input'; nameIn.placeholder = 'Preset name…';
    s.appendChild(nameIn);
    this.button(s, 'Save current as preset', () => {
      const n = nameIn.value.trim().slice(0, 32);
      if (!n) return this.toast('Name the preset first');
      p.mods.movementPresets[n] = { ...m };
      this.save(); this.renderBody(); this.toast('Preset saved');
    });
    for (const [name, preset] of Object.entries(p.mods.movementPresets)) {
      const r = this.row(s, `Preset: ${name}`);
      const apply = document.createElement('button'); apply.className = 'btn'; apply.textContent = 'Apply';
      apply.onclick = () => { Object.assign(m, preset); this.save(); this.renderBody(); };
      const del = document.createElement('button'); del.className = 'btn warn'; del.textContent = '✕';
      del.onclick = () => { delete p.mods.movementPresets[name]; this.save(); this.renderBody(); };
      r.append(apply, del);
    }
  }

  // ---- WEAPONS (mod engine) --------------------------------------------------
  tabWeapons(p) {
    const w = p.mods.weapons;
    const s = this.sec('⚙ WEAPON BEHAVIOUR LAB');
    this.slider(s, 'ADS speed × (lower=faster)', () => w.adsMult, (v) => w.adsMult = v, 0.05, 3, 0.01, (v) => '×' + v.toFixed(2));
    this.slider(s, 'Fire rate ×', () => w.fireRateMult, (v) => w.fireRateMult = v, 0.2, 5, 0.05, (v) => '×' + v.toFixed(2));
    this.slider(s, 'Recoil ×', () => w.recoilMult, (v) => w.recoilMult = v, 0, 3, 0.01, (v) => '×' + v.toFixed(2));
    this.slider(s, 'Reload speed × (lower=faster)', () => w.reloadMult, (v) => w.reloadMult = v, 0.05, 3, 0.01, (v) => '×' + v.toFixed(2));
    this.slider(s, 'Spread ×', () => w.spreadMult, (v) => w.spreadMult = v, 0, 3, 0.01, (v) => '×' + v.toFixed(2));
    this.slider(s, 'Damage ×', () => w.damageMult, (v) => w.damageMult = v, 0.1, 6, 0.05, (v) => '×' + v.toFixed(2));
    this.slider(s, 'Scope transition ×', () => w.scopeSpeedMult, (v) => w.scopeSpeedMult = v, 0.1, 4, 0.05, (v) => '×' + v.toFixed(2));
    this.switchRow(s, 'Unlimited ammunition (sandbox)', () => w.infiniteAmmo, (v) => w.infiniteAmmo = v);
    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = 'Attachments, camos, levels & firing feel per weapon: open the Armory tab. All values feed the real stat solver.';
    s.appendChild(note);
  }

  // ---- VISUALS / HUD -----------------------------------------------------------
  tabVisuals(p) {
    const v = p.mods.visuals;
    let s = this.sec('🖥 INTERFACE OVERLAYS');
    this.switchRow(s, 'Simulated enemy indicators (name/HP)', () => v.enemyIndicators, (x) => v.enemyIndicators = x);
    this.switchRow(s, 'Training radar', () => v.radar, (x) => v.radar = x);
    this.slider(s, 'Radar range (m)', () => v.radarRange, (x) => v.radarRange = x, 10, 120, 1, (x) => x + 'm');
    this.switchRow(s, 'Damage numbers', () => v.damageNumbers, (x) => v.damageNumbers = x);
    this.switchRow(s, 'Hit markers', () => v.hitmarkers, (x) => v.hitmarkers = x);
    this.switchRow(s, 'FPS counter', () => v.fpsCounter, (x) => v.fpsCounter = x);
    this.switchRow(s, 'Performance graph', () => v.perfGraph, (x) => v.perfGraph = x);
    s = this.sec('🎯 CUSTOM CROSSHAIR');
    const c = v.crosshair;
    const upd = () => this.game.updateCrosshair();
    this.slider(s, 'Size', () => c.size, (x) => { c.size = x; upd(); }, 2, 40, 1);
    this.slider(s, 'Gap', () => c.gap, (x) => { c.gap = x; upd(); }, 0, 30, 1);
    this.slider(s, 'Thickness', () => c.thickness, (x) => { c.thickness = x; upd(); }, 1, 8, 1);
    const r = this.row(s, 'Colour');
    const col = document.createElement('input');
    col.type = 'color'; col.value = c.color;
    col.oninput = () => { c.color = col.value; upd(); this.save(); };
    r.appendChild(col);
    this.switchRow(s, 'Center dot', () => c.dot, (x) => { c.dot = x; upd(); });
    this.switchRow(s, 'Outline', () => c.outline, (x) => { c.outline = x; upd(); });
    s = this.sec('🧩 HUD EDITOR');
    this.button(s, this._hudEditing ? '✔ Finish editing HUD' : '✥ Edit HUD layout (drag elements)', () => {
      this._hudEditing = !this._hudEditing;
      document.getElementById('hud').classList.toggle('hud-editing', this._hudEditing);
      if (this._hudEditing) this.enableHudDrag(p); else this.disableHudDrag();
      this.renderBody();
    });
    this.button(s, 'Reset HUD layout', () => { p.hudLayout = {}; this.save(); location.reload(); });
    const hint = document.createElement('p');
    hint.className = 'muted small';
    hint.textContent = 'Start a match, open this tab, enable the editor and drag the health / ammo / score / radar / FPS blocks. Positions save to your profile.';
    s.appendChild(hint);
  }

  enableHudDrag(p) {
    this._hudHandlers = [];
    document.querySelectorAll('[data-hud]').forEach((el) => {
      const down = (e) => {
        e.preventDefault();
        const move = (ev) => {
          const x = clamp((ev.clientX / window.innerWidth) * 100, 0, 92);
          const y = clamp((ev.clientY / window.innerHeight) * 100, 0, 92);
          el.style.left = x + '%'; el.style.top = y + '%'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
          p.hudLayout[el.dataset.hud] = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.save(); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
      el.addEventListener('pointerdown', down);
      this._hudHandlers.push([el, down]);
    });
  }
  disableHudDrag() {
    (this._hudHandlers || []).forEach(([el, fn]) => el.removeEventListener('pointerdown', fn));
    this._hudHandlers = [];
  }

  // ---- ARMORY ----------------------------------------------------------------
  tabArmory(p) {
    const inv = p.inventory;
    const s = this.sec('🔫 MYTHIC ARMORY X — ORIGINAL LEGENDARY & MYTHIC DESIGNS');
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    for (const w of WEAPONS) {
      const owned = inv.weaponsOwned.includes(w.id);
      const card = document.createElement('div');
      card.className = 'wcard' + (this.armorySel === w.id ? ' sel' : '');
      card.style.borderColor = RARITIES[w.rarity].color + '88';
      card.innerHTML = `<div class="wname">${w.name}</div>
        <div class="wr" style="color:${RARITIES[w.rarity].color}">${RARITIES[w.rarity].label.toUpperCase()} · ${w.cls}</div>
        <div>${owned ? 'Lv ' + (inv.weaponLevels[w.id] || 1) : '💰 ' + w.price.toLocaleString()}</div>`;
      card.onclick = () => { this.armorySel = w.id; this.sfx.ui(); this.renderBody(); };
      grid.appendChild(card);
    }
    s.appendChild(grid);
    if (!this.armorySel) {
      const hint = document.createElement('p');
      hint.className = 'muted small';
      hint.textContent = 'Select a weapon for 3D inspection, upgrade path, attachments and first-person preview.';
      s.appendChild(hint);
      return;
    }
    const w = weaponById(this.armorySel);
    const owned = inv.weaponsOwned.includes(w.id);
    const level = inv.weaponLevels[w.id] || 1;
    const d = this.sec(`🔍 INSPECT — ${w.name}`);
    const prevWrap = document.createElement('div');
    prevWrap.innerHTML = `<canvas id="armoryPreview"></canvas>`;
    d.appendChild(prevWrap);
    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    const orbitBtn = document.createElement('button'); orbitBtn.className = 'btn'; orbitBtn.textContent = '🔄 Orbit inspect';
    const fpBtn = document.createElement('button'); fpBtn.className = 'btn'; fpBtn.textContent = '🎯 First-person preview';
    btnRow.append(orbitBtn, fpBtn);
    d.appendChild(btnRow);
    this.startPreview(w, p);
    orbitBtn.onclick = () => { if (this._preview) this._preview.mode = 'orbit'; };
    fpBtn.onclick = () => {
      if (this._preview) this._preview.mode = 'fp';
      if (owned) {
        eco.equipLoadout(inv, { primary: w.id });
        this.save(); this.game.applyLoadout(); this.onProfileChanged();
        this.toast('Equipped as primary — FP preview live in match');
      } else this.toast('Buy/unlock it to wield it in first person');
    };
    const stats = computeWeaponStats(w, p.mods, level);
    const bars = [['Damage', stats.damage, 160], ['Fire rate', stats.fireRateRpm, 1200], ['Range', stats.range, 180], ['Magazine', stats.magSize, 120], ['ADS (ms, lower better)', 500 - Math.min(480, stats.adsTimeMs), 500], ['Recoil control', 100 - Math.min(95, stats.recoilDeg * 30), 100]];
    for (const [name, val, max] of bars) {
      const b = document.createElement('div');
      b.className = 'statbar';
      b.innerHTML = `<span style="width:92px">${name}</span><span class="sb"><span style="width:${clamp(val / max * 100, 2, 100)}%"></span></span><b>${Math.round(val)}</b>`;
      d.appendChild(b);
    }
    this.switchRow(d, 'Wield as primary', () => inv.loadout.primary === w.id, (v) => {
      if (v && owned) { eco.equipLoadout(inv, { primary: w.id }); this.game.applyLoadout(); this.onProfileChanged(); }
      this.renderBody();
    });
    if (!owned) {
      this.button(d, `Buy for 💰 ${w.price.toLocaleString()} PHANTOM CREDITS`, () => {
        const r = eco.buyWeapon(inv, w.id);
        this.refreshAfterEconomy(r.ok ? `${w.name} added to your armory` : r.error);
      });
    }
    // upgrade path
    const up = this.sec('⬆ CUSTOM UPGRADE PATH');
    const cost = eco.upgradeCost(w, level);
    const r1 = this.row(up, `Current level`); 
    const lv = document.createElement('b'); lv.textContent = `Lv ${level} / ${w.maxLevel}`; r1.appendChild(lv);
    this.slider(up, 'Set level (lab)', () => level, (v) => { eco.setWeaponLevel(inv, w.id, v); }, 1, w.maxLevel, 1, (v) => 'Lv ' + v).addEventListener('change', () => this.refreshAfterEconomy());
    if (cost !== null) this.button(up, `Upgrade legit path (💰 ${cost})`, () => {
      const r = eco.upgradeWeapon(inv, w.id);
      this.refreshAfterEconomy(r.ok ? `Upgraded to Lv ${r.level}` : r.error);
    });
    // attachments
    const at = this.sec('🧩 CUSTOM ATTACHMENTS');
    for (const slot of ATTACHMENT_SLOTS) {
      const opts = [{ v: '', t: '— none —' }, ...ATTACHMENTS.filter((a) => a.slot === slot).map((a) => ({ v: a.id, t: a.name }))];
      this.select(at, slot[0].toUpperCase() + slot.slice(1), () => p.mods.weapons.attachments[w.id]?.[slot] || '', (v) => {
        (p.mods.weapons.attachments[w.id] ||= {})[slot] = v || undefined;
        if (!v) delete p.mods.weapons.attachments[w.id][slot];
      }, opts);
    }
    // cosmetics for this weapon
    const cm = this.sec('🎨 COSMETICS (every tier previewable)');
    const camos = COSMETICS.filter((c) => c.category === 'camo');
    this.select(cm, 'Weapon camo', () => inv.loadout.camoByWeapon[w.id] || 'camo_factory', (v) => {
      if (!inv.cosmeticsOwned.includes(v)) return this.toast('Unlock it in the Inventory Lab first');
      eco.equipLoadout(inv, { camo: { [w.id]: v } });
      this.game.applyLoadout(); this.startPreview(w, p);
    }, camos.map((c) => ({ v: c.id, t: `${c.name} (${RARITIES[c.rarity].label})${inv.cosmeticsOwned.includes(c.id) ? '' : ' 🔒'}` })));
    this.select(cm, 'Charm', () => inv.loadout.charm || '', (v) => { eco.equipLoadout(inv, { charm: v || null }); },
      [{ v: '', t: '— none —' }, ...COSMETICS.filter((c) => c.category === 'charm').map((c) => ({ v: c.id, t: c.name }))]);
    this.select(cm, 'Muzzle effect', () => inv.loadout.muzzle, (v) => eco.equipLoadout(inv, { muzzle: v }),
      COSMETICS.filter((c) => c.category === 'muzzle').map((c) => ({ v: c.id, t: `${c.name} (${RARITIES[c.rarity].label})` })));
    this.select(cm, 'Elimination effect', () => inv.loadout.killEffect, (v) => eco.equipLoadout(inv, { killEffect: v }),
      COSMETICS.filter((c) => c.category === 'killEffect').map((c) => ({ v: c.id, t: `${c.name} (${RARITIES[c.rarity].label})` })));
    for (const c of COSMETICS.filter((x) => x.category === 'camo')) {
      // preview strip
    }
    const pv = document.createElement('div');
    pv.className = 'cos-preview' + (cosmeticById(inv.loadout.camoByWeapon[w.id] || 'camo_factory')?.animated ? ' chip-anim' : '');
    pv.style.background = `linear-gradient(135deg, ${cosmeticById(inv.loadout.camoByWeapon[w.id] || 'camo_factory')?.color}, #111827)`;
    pv.style.color = '#fff';
    pv.textContent = `CAMO PREVIEW — ${cosmeticById(inv.loadout.camoByWeapon[w.id] || 'camo_factory')?.name}`;
    cm.appendChild(pv);
  }

  startPreview(w, p) {
    const canvas = document.getElementById('armoryPreview');
    if (!canvas) return;
    this.stopPreview();
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, 2, 0.05, 50);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 3); scene.add(key);
    const camo = cosmeticById(p.inventory.loadout.camoByWeapon[w.id] || 'camo_factory');
    const model = buildWeaponModel(THREE, w, { camoColor: camo?.color, animated: w.animated || camo?.animated });
    scene.add(model);
    const state = { mode: 'orbit', raf: 0, renderer, scene, cam, model };
    this._preview = state;
    const camoDef = camo;
    void camoDef;
    const tick = () => {
      if (this._preview !== state) return;
      state.raf = requestAnimationFrame(tick);
      const t = performance.now() / 1000;
      const wdt = canvas.clientWidth || 380, hgt = canvas.clientHeight || 210;
      if (canvas.width !== wdt) { renderer.setSize(wdt, hgt, false); cam.aspect = wdt / hgt; cam.updateProjectionMatrix(); }
      model.rotation.y = state.mode === 'orbit' ? t * 0.9 : Math.PI;
      model.position.y = state.mode === 'orbit' ? Math.sin(t * 1.4) * 0.03 : 0;
      if (state.mode === 'fp') { cam.position.set(0.32, 0.06, 0.55); cam.lookAt(0, 0, -1); }
      else { cam.position.set(0.55, 0.3, 0.85); cam.lookAt(0, 0, -0.2); }
      model.userData.pulse?.(t);
      renderer.render(scene, cam);
    };
    tick();
  }
  stopPreview() {
    if (this._preview) {
      cancelAnimationFrame(this._preview.raf);
      this._preview.renderer.dispose();
      this._preview = null;
    }
  }

  // ---- INVENTORY LAB ----------------------------------------------------------
  tabInventory(p) {
    const inv = p.inventory;
    const s = this.sec('💰 UNLIMITED INVENTORY LAB (fictional credits)');
    const bal = this.row(s, 'PHANTOM CREDITS balance');
    const b = document.createElement('b');
    b.style.color = 'var(--accent2)';
    b.textContent = inv.unlimitedCredits ? '∞ UNLIMITED' : inv.credits.toLocaleString();
    bal.appendChild(b);
    const inp = document.createElement('input');
    inp.className = 'input'; inp.type = 'number'; inp.placeholder = 'Set any amount…';
    s.appendChild(inp);
    this.button(s, 'Set credits', () => { eco.setCredits(inv, inp.value); this.refreshAfterEconomy('Credits set to ' + inv.credits.toLocaleString()); });
    this.button(s, '＋ Earn 10,000 (sandbox faucet)', () => { eco.earn(inv, 10000); this.refreshAfterEconomy(); });
    this.switchRow(s, 'Unlimited fictional credits', () => inv.unlimitedCredits, (v) => { eco.setUnlimited(inv, v); this.refreshAfterEconomy(); });
    this.button(s, '🔓 Unlock ALL sandbox weapons', () => { eco.unlockAllWeapons(inv); this.refreshAfterEconomy(`All ${WEAPONS.length} weapons unlocked`); });
    this.button(s, '🔓 Unlock ALL original cosmetics', () => { eco.unlockAllCosmetics(inv); this.refreshAfterEconomy(`All ${COSMETICS.length} cosmetics unlocked`); });
    this.button(s, '↺ Reset entire inventory', () => { if (confirm('Reset inventory to starter state?')) { eco.resetInventory(p); this.game.applyLoadout(); this.refreshAfterEconomy('Inventory reset'); } }, 'btn warn');
    const out = this.sec('🧍 CHARACTER OUTFITS (tap to equip · all tiers preview)');
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    for (const c of COSMETICS) {
      const owned = inv.cosmeticsOwned.includes(c.id);
      const card = document.createElement('div');
      card.className = 'wcard' + (inv.loadout.outfit === c.id && c.category === 'outfit' ? ' sel' : '');
      card.innerHTML = `<div class="wname" style="color:${c.color === '#22262b' ? '#fff' : c.color}">${c.category === 'outfit' && inv.loadout.outfit === c.id ? '✔ ' : ''}${c.name}</div>
        <div class="wr" style="color:${RARITIES[c.rarity].color}">${RARITIES[c.rarity].label.toUpperCase()} · ${c.category}${c.animated ? ' · ANIMATED' : ''}</div>
        <div>${owned ? 'Owned' : '💰 ' + c.price.toLocaleString()}</div>`;
      card.onclick = () => {
        if (!owned) {
          const r = eco.buyCosmetic(inv, c.id);
          if (!r.ok) return this.toast(r.error);
        }
        if (c.category === 'outfit') eco.equipLoadout(inv, { outfit: c.id });
        if (c.category === 'killEffect') eco.equipLoadout(inv, { killEffect: c.id });
        if (c.category === 'muzzle') eco.equipLoadout(inv, { muzzle: c.id });
        if (c.category === 'charm') eco.equipLoadout(inv, { charm: c.id });
        this.game.applyLoadout();
        this.refreshAfterEconomy(`${c.name} equipped`);
      };
      grid.appendChild(card);
    }
    out.appendChild(grid);
    const info = document.createElement('p');
    info.className = 'muted small';
    info.textContent = 'Every sandbox cosmetic can be tested free via Unlock-All. Animated effects pulse in the Armory 3D preview and in first person. This never touches real purchases or official accounts.';
    out.appendChild(info);
  }

  // ---- ACCOUNTS ----------------------------------------------------------------
  tabAccounts(p) {
    const s = this.sec('👤 PHANTOM ACCOUNTS (local only)');
    for (const prof of this.store.list()) {
      const r = this.row(s, `${prof.id === p.id ? '▶ ' : ''}${prof.username}${prof.guest ? ' (guest)' : ''}`);
      const meta = document.createElement('span');
      meta.className = 'pm-val';
      meta.textContent = `Lv${prof.progression.level} · 💰${prof.inventory.unlimitedCredits ? '∞' : prof.inventory.credits}`;
      r.appendChild(meta);
      if (prof.id !== p.id) {
        const sw = document.createElement('button'); sw.className = 'btn'; sw.textContent = 'Switch';
        sw.onclick = () => { this.store.switchTo(prof.id); this.game.setProfile(this.profile()); this.game.applyLoadout(); this.onProfileChanged(); this.renderBody(); this.toast('Switched to ' + prof.username); };
        r.appendChild(sw);
      }
      const del = document.createElement('button'); del.className = 'btn warn'; del.textContent = '✕';
      del.onclick = () => { if (confirm(`Delete profile ${prof.username}?`)) { this.store.delete(prof.id); this.onProfileChanged(); if (this.profile()) { this.game.setProfile(this.profile()); this.renderBody(); } else this.close(); } };
      r.appendChild(del);
    }
    const nameIn = document.createElement('input');
    nameIn.className = 'input'; nameIn.placeholder = 'Username for new profile…'; nameIn.maxLength = 20;
    s.appendChild(nameIn);
    this.button(s, '＋ Create profile', () => {
      try { const np = this.store.create(nameIn.value); this.game.setProfile(np); this.onProfileChanged(); this.renderBody(); this.toast('Welcome, ' + np.username); }
      catch (e) { this.toast(e.message); }
    });
    this.button(s, '👻 Guest mode', () => { const g = this.store.createGuest(); this.game.setProfile(g); this.onProfileChanged(); this.renderBody(); });
    this.button(s, '↺ Reset current profile', () => { if (confirm('Reset progression, inventory & mods for this profile?')) { this.store.reset(p.id); this.game.setProfile(this.profile()); this.game.applyLoadout(); this.onProfileChanged(); this.renderBody(); } }, 'btn warn');
    const bk = this.sec('💾 LOCAL BACKUPS');
    const ta = document.createElement('textarea');
    ta.className = 'input'; ta.placeholder = 'Backup JSON (export fills this, or paste to import)…';
    bk.appendChild(ta);
    this.button(bk, '⬇ Export backup', () => { ta.value = this.store.exportBackup(); this.toast('Backup ready — copy or download'); });
    this.button(bk, '⬆ Import backup', () => {
      try { const n = this.store.importBackup(ta.value); this.game.setProfile(this.profile()); this.onProfileChanged(); this.renderBody(); this.toast(`Backup restored (${n} profiles)`); }
      catch (e) { this.toast(e.message); }
    });
    const dl = document.createElement('a');
    dl.className = 'btn'; dl.textContent = 'Download .json'; dl.style.display = 'inline-block';
    dl.onclick = () => {
      const blob = new Blob([this.store.exportBackup()], { type: 'application/json' });
      dl.href = URL.createObjectURL(blob); dl.download = 'phantom-ops-x-backup.json';
    };
    bk.appendChild(dl);
    void validateUsername;
  }

  // ---- CONFIGS -------------------------------------------------------------------
  tabConfigs(p) {
    const s = this.sec('💾 SAVED CONFIGURATIONS (per profile)');
    const nameIn = document.createElement('input');
    nameIn.className = 'input'; nameIn.placeholder = 'Configuration name…';
    s.appendChild(nameIn);
    this.button(s, 'Save current mods', () => {
      const n = nameIn.value.trim().slice(0, 40);
      if (!n) return this.toast('Name the configuration first');
      p.configs[n] = sanitizeMods(JSON.parse(JSON.stringify(p.mods)));
      this.save(); this.renderBody(); this.toast('Configuration saved');
    });
    for (const [name, cfg] of Object.entries(p.configs)) {
      const r = this.row(s, name);
      const load = document.createElement('button'); load.className = 'btn'; load.textContent = 'Load';
      load.onclick = () => { p.mods = sanitizeMods(JSON.parse(JSON.stringify(cfg))); this.save(); this.game.setProfile(p); this.game.updateCrosshair(); this.renderBody(); this.toast('Loaded ' + name); };
      const del = document.createElement('button'); del.className = 'btn warn'; del.textContent = '✕';
      del.onclick = () => { delete p.configs[name]; this.save(); this.renderBody(); };
      r.append(load, del);
    }
    const ta = document.createElement('textarea');
    ta.className = 'input'; ta.placeholder = 'Mod configuration JSON…';
    s.appendChild(ta);
    this.button(s, 'Export mods JSON', () => { ta.value = JSON.stringify(p.mods, null, 1); });
    this.button(s, 'Import mods JSON (validated & clamped)', () => {
      try { p.mods = sanitizeMods(JSON.parse(ta.value)); this.save(); this.game.setProfile(p); this.game.updateCrosshair(); this.renderBody(); this.toast('Configuration imported safely'); }
      catch { this.toast('Invalid JSON'); }
    });
  }

  // ---- SYSTEM -----------------------------------------------------------------------
  tabSystem(p) {
    const s = this.sec('⚙ SYSTEM');
    this.select(s, 'Theme', () => p.settings.theme, (v) => { p.settings.theme = v; this.renderBody(); }, [
      { v: 'phantom', t: 'Phantom Purple' }, { v: 'toxic', t: 'Toxic Green' }, { v: 'crimson', t: 'Crimson' }, { v: 'arctic', t: 'Arctic' }]);
    this.select(s, 'Language / زبان', () => p.settings.lang, (v) => { p.settings.lang = v; this.lang = v; this.renderTabs(); this.renderBody(); }, [
      { v: 'en', t: 'English (LTR)' }, { v: 'fa', t: 'فارسی (RTL)' }]);
    this.slider(s, 'Mouse/touch sensitivity', () => p.settings.sensitivity, (v) => p.settings.sensitivity = v, 0.3, 2.5, 0.05);
    this.slider(s, 'Camera FOV', () => p.settings.fov, (v) => p.settings.fov = v, 60, 110, 1, (v) => v + '°');
    const vol = this.slider(s, 'Volume', () => p.settings.volume, (v) => { p.settings.volume = v; this.sfx.setVolume(v); }, 0, 1, 0.05);
    vol.addEventListener('change', () => this.sfx.ui());
    this.select(s, 'Render quality', () => p.settings.quality, (v) => { p.settings.quality = v; this.game.setQuality(v); }, [
      { v: 'auto', t: 'Auto' }, { v: 'high', t: 'High' }, { v: 'low', t: 'Low (battery)' }]);
    const st = p.stats;
    const info = document.createElement('p');
    info.className = 'muted small';
    const acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
    info.textContent = `Profile: ${p.username} · Level ${p.progression.level} (${p.progression.xp} XP) · Matches ${p.progression.matches} · K/D ${p.progression.kills}/${p.progression.deaths} · Accuracy ${acc}% · Headshots ${st.headshots}`;
    s.appendChild(info);
    this.button(s, '⬅ Back to launcher', () => { this.close(); this.onProfileChanged('launcher'); });
  }
}
