/** اتاق هم‌کلام: دروازهٔ ورود، استیج ویدیو، پنل‌ها، میان‌برها و همهٔ سیم‌کشی‌ها */
import {
  $, $$, el, esc, toast, modal, closeModal, fmtClock, copy, uid, store, beep, vibrate,
  avatarOf, throttle, debounce, initTheme, toggleTheme, isMobile,
} from '../core/util.js';
import { api, QualityMonitor, TIERS, suggestInitialProfile, connectionInfo } from '../core/net.js';
import { Socket } from '../core/socket.js';
import { Mesh, PROFILES } from '../core/rtc.js';
import { MediaManager } from '../core/media.js';
import { ChatPane } from './chat.js';
import { Board } from './board.js';
import { Tools } from './tools.js';
import { FEATURES, FEATURE_COUNT } from '../features/registry.js';
import { APP } from '../core/const.js';

initTheme();

/* ─────────────── وضعیت مشترک ─────────────── */
const CODE = (location.pathname.split('/')[2] || new URLSearchParams(location.search).get('code') || '')
  .toUpperCase().replace(/[^A-Z0-9_-]/g, '');
const QP = new URLSearchParams(location.search);

const ctx = {
  code: CODE,
  me: { id: store.session.get('id', uid(10)), name: store.get('name', ''), avatar: store.get('avatar', null) },
  room: { code: CODE, name: `اتاق ${CODE}`, maxP: 8, ttlLeftMs: 0, hostId: null, locked: false, pin: false, waitingRoom: false },
  peers: new Map(),
  tiles: new Map(),
  prefs: store.get('prefs', {
    profile: null, sound: true, vibrate: true, notify: true, mirror: true, compressImg: true,
    ttsAuto: false, sttLang: 'fa-IR', screenQuality: 'normal', autoProfile: true, micOn: true, camOn: true,
  }),
  media: new MediaManager(),
  chat: null,
  board: null,
  tools: null,
  qt: null,
  socket: null,
  mesh: null,
  joined: false,
  leaving: false,
  isHost: () => ctx.room.hostId === ctx.me.id || ctx.me.role === 'host',
  savePrefs: () => store.set('prefs', ctx.prefs),
  bumpTitle: () => {
    const n = ctx.chat?.unread || 0;
    document.title = `${n ? `(${n}) ` : ''}${ctx.room.name} — ${APP.name}`;
  },
  signalRaw: (o) => ctx.socket?.send({ t: 's', ...o }),
  sendMicTrack: async (track) => { ctx.mesh?.setMicTrack(track); },
  toggleMic: () => toggleMic(),
  toggleCam: () => toggleCam(),
  toggleScreen: () => toggleScreen(),
  toggleBoard: (v) => toggleBoard(v),
  toggleHand: () => toggleHand(),
  react: () => sendReaction(),
  setProfile: (k, o) => setProfile(k, o),
  setIncomingVideo,
  messages: new Map(),
};

ctx.chat = new ChatPane(ctx);
ctx.board = new Board(ctx);
ctx.tools = new Tools(ctx);
window.__hk = ctx; // برای اشکال‌زدایی

/* ─────────────── دروازهٔ ورود ─────────────── */
const gate = {
  async init() {
    if (!CODE) {
      location.replace('/');
      return;
    }
    $('#gateCode').textContent = `کد اتاق: ${CODE}`;
    $('#gateName').value = ctx.me.name || '';
    $('#gatePinWrap').hidden = !QP.get('pin');
    if (QP.get('pin')) $('#gatePin').value = QP.get('pin');

    // اطلاعات اتاق
    try {
      const info = await api(`/api/room/${CODE}`, { retry: 0 });
      if (info?.name) ctx.room.name = info.name;
      if (info?.pin) $('#gatePinWrap').hidden = false;
      if (info?.locked) $('#gateHint').textContent = '🔒 این اتاق قفل است؛ ورود فقط با اجازهٔ میزبان.';
      if (info?.exists === false) $('#gateHint').textContent = '✨ اتاق تازه است — شما اولین نفر خواهید بود.';
    } catch { /* آفلاین یا فقط استاتیک */ }

    const profile = ctx.prefs.profile || suggestInitialProfile();
    ctx.prefs.profile = profile;
    $('#gateMicSel').append(el('option', { value: '', text: 'میکروفن پیش‌فرض' }));
    $('#gateCamSel').append(el('option', { value: '', text: 'دوربین پیش‌فرض' }));
    ctx.media.on('devices', (d) => {
      const fill = (sel, list, cur) => {
        const val = sel.value;
        sel.innerHTML = '';
        sel.append(el('option', { value: '', text: 'پیش‌فرض' }));
        for (const x of list) sel.append(el('option', { value: x.id, text: x.label.slice(0, 26) }));
        sel.value = val || cur || '';
      };
      fill($('#gateMicSel'), d.audioinput, ctx.media.micId);
      fill($('#gateCamSel'), d.videoinput, ctx.media.camId);
    });

    $('#gateMic').onclick = async () => {
      const on = !ctx.media.micTrack;
      await ctx.media.toggleMic(on);
      $('#gateMic').classList.toggle('on', on);
    };
    $('#gateCam').onclick = async () => {
      const on = !ctx.media.camTrack;
      await ctx.media.toggleCam(on);
      $('#gateVideo').srcObject = ctx.media.local;
      $('#gateAvatar').hidden = on;
      $('#gateCam').classList.toggle('on', on);
    };
    $('#gateMicSel').onchange = (e) => ctx.media.switchDevice('audioinput', e.target.value);
    $('#gateCamSel').onchange = (e) => ctx.media.switchDevice('videoinput', e.target.value);
    $('#gateCamBtn').onclick = () => $('#gateCam').click();
    $('#gateMicBtn').onclick = () => $('#gateMic').click();
    $('#gateJoin').onclick = () => this.join();

    // اگر داخل آی‌فریم/پیش‌نمایش باشیم، مرورگر اجازهٔ دوربین نمی‌دهد → راهنمایی می‌کنیم
    try {
      if (window.self !== window.top) {
        $('#gateHint').innerHTML = '⚠️ این صفحه داخل یک قاب (iframe) باز شده؛ برای دسترسی به دوربین و میکروفن، <a href="' + location.href + '" target="_blank" rel="noopener">در تب جدید بازش کنید</a>.';
      }
    } catch { /* دسترسی به والد ممکن نیست = همان آی‌فریم */ }

    // پیش‌نمایش و سطح صدا
    const auto = store.session.get('inCall') === CODE || QP.get('auto') === '1';
    await startPreview({ audio: auto ? ctx.prefs.micOn : ctx.prefs.micOn !== false, video: auto ? false : ctx.prefs.camOn !== false });
    if (auto && ctx.me.name) {
      toast('بازگشت خودکار به اتاق…', 'ok', 1500);
      this.join();
    }
  },

  async join() {
    const name = $('#gateName').value.trim() || `مهمان ${Math.floor(Math.random() * 900 + 100)}`;
    const pin = $('#gatePin').value.trim();
    if ($('#gateRemember').checked) store.set('name', name);
    ctx.me.name = name;
    store.session.set('id', ctx.me.id);
    $('#gateJoin').disabled = true;
    $('#gateJoin').textContent = '⏳ در حال ورود…';
    ctx.socket = new Socket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws?room=${CODE}`);
    wireSocket();
    ctx.socket.open();
    ctx.ice = await api('/api/ice', { retry: 0 }).catch(() => null);
    ctx.mesh = new Mesh({
      selfId: ctx.me.id,
      ice: ctx.ice?.iceServers || undefined,
      send: (to, d) => ctx.socket.send({ t: 's', to, d }),
      profile: ctx.prefs.profile || 'normal',
    });
    wireMesh();
    ctx.socket.send({
      t: 'join',
      code: CODE,
      id: ctx.me.id,
      name,
      avatar: ctx.me.avatar,
      pin,
      ttlHours: 8,
      s: { mic: !!ctx.media.micTrack, cam: !!ctx.media.camTrack },
    });
  },
};

async function startPreview({ audio = true, video = true } = {}) {
  const r = await ctx.media.init({ audio, video, profile: ctx.prefs.profile || 'normal' });
  $('#gateVideo').srcObject = ctx.media.local;
  $('#gateVideo').muted = true;
  $('#gateAvatar').hidden = !!ctx.media.camTrack;
  $('#gateCam').classList.toggle('on', !!ctx.media.camTrack);
  $('#gateMic').classList.toggle('on', !!ctx.media.micTrack);
  if (r.errors?.length) {
    const [kind, err] = r.errors[0];
    toast(kind === 'cam' ? `دوربین در دسترس نیست (${err}) — بدون تصویر ادامه می‌دهیم` : `میکروفن در دسترس نیست (${err})`, 'warn', 4200);
  }
  if (ctx.media.local.getAudioTracks().length) {
    ctx.media.attachMeter(ctx.media.local, (v) => { $('#gateBar').style.width = `${Math.min(100, v * 140)}%`; });
  }
}

/* ─────────────── سیم‌کشی سوکت ─────────────── */
function wireSocket() {
  const s = ctx.socket;
  s.on('open', () => {
    if (ctx.joined) toast('اتصال برگشت ✅', 'ok', 1800);
  });
  s.on('close', (ev) => {
    if (ctx.leaving) return;
    $('#netPill').textContent = '🔴 قطع — تلاش برای اتصال…';
  });
  s.on('retry', (n) => {
    if (n === 3) toast('اینترنت قطع شده؛ خودکار وصل می‌شویم…', 'warn', 2600);
  });
  s.on('gaveup', () => toast('اتصال برقرار نشد. صفحه را دوباره باز کنید.', 'err', 6000));
  s.on('rtt', (rtt) => { if (ctx.joined) updateNetPill({ rtt, tier: ctx.qt?.tier }); });
  s.on('msg', (m) => { if (m.t === 'err') onError(m); });
  s.on('welcome', onWelcome);
  s.on('pjoin', (m) => onPeerJoin(m.peer));
  s.on('pleave', (m) => onPeerLeave(m.id));
  s.on('s', (m) => {
    if (m.d?.f) { ctx.chat.handleChunk(m.d, m.from); return; }
    if (m.d?.react) { floatReaction(m.d.react, m.from); return; }
    ctx.mesh?.handleSignal(m.from, m.d);
  });
  s.on('state', onPeerState);
  s.on('hand', (m) => {
    const p = ctx.peers.get(m.id);
    if (!p) return;
    p.hand = m.up;
    if (!m.up) beep('out');
    updateTile(p);
    renderPeople();
  });
  s.on('typing', (m) => ctx.chat.onTyping(m));
  s.on('chat', (m) => ctx.chat.onIncoming(m.m));
  s.on('chatop', (m) => {
    if (m.op === 'del') {
      ctx.chat.messages = ctx.chat.messages.filter((x) => x.id !== m.id);
      ctx.chat.byId.delete(m.id);
      ctx.chat.render();
    } else {
      const i = ctx.chat.messages.findIndex((x) => x.id === m.m.id);
      if (i >= 0) ctx.chat.messages[i] = m.m;
      ctx.chat.byId.set(m.m.id, m.m);
      ctx.chat.pinned = ctx.chat.messages.find((x) => x.pinned) || null;
      ctx.chat.renderPinned();
      ctx.chat.render();
    }
  });
  s.on('react', (m) => floatReaction(m.emoji, m.id, m.name));
  s.on('sys', (m) => { ctx.chat.onSystem(m.text, m.kind); });
  s.on('sub', (m) => ctx.tools.pushLine(m.name || 'نفر', m.text));
  s.on('poll', (m) => ctx.tools.renderPoll(m.poll));
  s.on('notes', (m) => {
    if (document.activeElement !== $('#notes')) {
      $('#notes').value = m.text || '';
      $('#notesStat').textContent = `${(m.text || '').length} نویسه — از ${ctx.peers.get(m.from)?.name || 'یک نفر'}`;
    }
  });
  s.on('wb', (m) => ctx.board.onRemote(m));
  s.on('knock', (m) => onKnock(m.peer));
  s.on('waiting', () => {
    $('#gateHint').textContent = '⏳ در انتظار پذیرش میزبان…';
    toast('درخواست ورود فرستاده شد؛ منتظر تأیید میزبان باشید', 'ok', 3000);
  });
  s.on('room', onRoomUpdate);
  s.on('bye', (m) => {
    ctx.leaving = true;
    toast(m.reason || 'از اتاق خارج شدید', 'warn', 5000);
    modal({
      title: '🚪 پایان',
      html: `<p>${esc(m.reason || '')}</p>`,
      actions: [{ label: 'بازگشت به صفحهٔ اصلی', kind: 'primary', onClick: () => { location.href = '/'; return false; } }],
    });
    setTimeout(() => { try { ctx.socket.close(); } catch { /* ignore */ } }, 500);
  });
  s.on('pong', () => {});
}

function onError(m) {
  toast(m.text || 'خطا', m.fatal ? 'err' : 'warn', m.fatal ? 6000 : 3000);
  if (m.fatal) {
    ctx.leaving = true;
    $('#gateJoin').disabled = false;
    $('#gateJoin').textContent = 'ورود به اتاق';
    if (m.code === 'bad_pin') { $('#gatePinWrap').hidden = false; $('#gatePin').focus(); }
  }
}

/* ─────────────── سیم‌کشی مش ─────────────── */
function wireMesh() {
  const m = ctx.mesh;
  m.on('stream', (id, role) => {
    const p = ctx.peers.get(id);
    if (!p) return;
    if (role === 'screen' || role === 'screenA') showRemoteScreen(id);
    updateTile(p);
  });
  m.on('state', (id, state) => {
    const p = ctx.peers.get(id);
    if (!p) return;
    p.conn = state;
    updateTile(p);
    renderPeople();
    if (state === 'failed') toast(`اتصال با ${p.name} قطع شد — تلاش برای ترمیم…`, 'warn', 2600);
  });
  m.on('ice-restart', (id) => toast(`مسیر اتصال با ${ctx.peers.get(id)?.name || ''} تازه شد`, 'ok', 1600));
  m.on('error', (id, e) => console.warn('rtc', id, e));
}

/* ─────────────── ورود موفق ─────────────── */
async function onWelcome(m) {
  ctx.joined = true;
  store.session.set('inCall', CODE);
  ctx.room = { ...ctx.room, ...(m.room || {}) };
  ctx.me.role = m.you?.role || 'member';
  if (ctx.me.role === 'host') ctx.room.hostId = ctx.me.id; // مرجع نهایی: نقش اعلام‌شده از سرور
  $('#gate').hidden = true;
  $('#app').hidden = false;
  $('#roomName').textContent = ctx.room.name || `اتاق ${CODE}`;
  $('#roomCode').textContent = ctx.room.code;
  $('#hostPill').hidden = !ctx.isHost();
  ctx.chat.load(m.chat || []);
  $('#notes').value = m.notes || '';
  ctx.tools.renderPoll(m.poll || null);
  ctx.board.load(m.wb);
  ctx.board.resize();

  // پوست خودم
  addLocalTile();

  // همتاهای موجود
  for (const p of m.peers || []) {
    ctx.peers.set(p.id, { ...p, streams: emptyStreams(), vol: 1, muted: false });
    addRemoteTile(p.id);
    ctx.mesh.ensurePeer(p.id, { initiator: true });
  }

  ctx.mesh.on('peer', () => {});
  renderPeople();
  refreshLayout();
  mountUI();
  ctx.qt = new QualityMonitor({ mesh: ctx.mesh, socket: ctx.socket }).start();
  ctx.qt.on('quality', updateNetPill);
  // آمار هر همتا (تأخیر/افت) برای نقطهٔ رنگی کنار نام‌ها
  ctx.mesh.on('stats', (map) => {
    for (const [id, st] of Object.entries(map)) {
      const p = ctx.peers.get(id);
      if (p) { p.stats = st; updatePeerNetFlag(id); }
    }
    renderPeople();
  });
  ctx.qt.on('suggest', (profile, st) => {
    if (!ctx.prefs.autoProfile || profile === ctx.prefs.profile) return;
    toast(`شبکه ${TIERS[st.tier]?.label || ''} است — کیفیت روی «${PROFILES[profile].label}» تنظیم شد`, 'warn', 3200);
    setProfile(profile, { silent: true });
  });
  if (ctx.ice?.relay) toast('TURN فعال است — اتصال پشت NAT سخت هم کار می‌کند', 'ok', 3000);
  else if (!ctx.ice?.relay) toast('حالت مستقیم P2P — کم‌مصرف‌ترین حالت', 'ok', 2600);

  // مجوز اعلان و بیدارباش
  if (Notification && Notification.permission === 'default' && ctx.prefs.notify !== false) {
    Notification.requestPermission().catch(() => {});
  }
  if (isMobile()) ctx.tools.toggleWakeLock().catch?.(() => {});

  addEventListener('beforeunload', (e) => {
    if (!ctx.joined || ctx.leaving) return null;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });
  addEventListener('visibilitychange', () => { if (!document.hidden) { ctx.chat.unread = 0; ctx.chat.renderCounter(); } });
  document.title = `${ctx.room.name} — ${APP.name}`;
}

function emptyStreams() { return { mic: new MediaStream(), cam: new MediaStream(), screen: new MediaStream(), screenA: new MediaStream() }; }

/* ─────────────── استیج و کارت‌ها ─────────────── */
function addLocalTile() {
  const wrap = el('div', { class: `tile local${ctx.prefs.mirror ? ' mirror' : ''}`, dataset: { id: ctx.me.id } });
  const video = el('video', { playsinline: true, autoplay: true, muted: true });
  video.srcObject = ctx.media.local;
  const av = avatarOf(ctx.me.name, ctx.me.avatar);
  const fb = el('div', { class: 'fallback', hidden: !!ctx.media.camTrack, text: av.emoji, style: { background: av.color || '' } });
  wrap.append(video, fb,
    el('div', { class: 'name', text: `${ctx.me.name} (شما)` }),
    el('div', { class: 'flags' },
      el('span', { class: 'mic', text: ctx.media.micTrack ? '🎙️' : '🔇' }),
      el('span', { class: 'cam', text: ctx.media.camTrack ? '🎥' : '📷', hidden: !ctx.media.camTrack }),
      el('span', { class: 'hand', hidden: true, text: '✋' }),
      el('span', { class: 'lk', hidden: true, text: '📌' }),
    ),
    el('div', { class: 'quick' },
      el('button', { title: 'سنجاق', text: '📌', onclick: () => togglePin(ctx.me.id) }),
      el('button', { title: 'تصویر در تصویر', text: '📺', onclick: () => enterPip(video) }),
    ),
    el('div', { class: 'spk', text: 'در حال صحبت', hidden: true }),
  );
  ctx.tiles.set(ctx.me.id, { wrap, video, fb, flags: wrap.querySelector('.flags') });
  $('#stage').append(wrap);
  if (ctx.media.local.getAudioTracks().length) {
    ctx.media.attachMeter(ctx.media.local, (v) => {
      const on = v > 0.06;
      wrap.classList.toggle('speaking', on);
      wrap.querySelector('.spk').hidden = !on;
    });
  }
  refreshLayout();
}

function addRemoteTile(id) {
  if (ctx.tiles.has(id)) return;
  const p = ctx.peers.get(id);
  if (!p) return;
  const av = avatarOf(p.name, p.avatar);
  const wrap = el('div', { class: 'tile', dataset: { id } });
  const video = el('video', { playsinline: true, autoplay: true });
  const fb = el('div', { class: 'fallback', text: av.emoji, style: { background: av.color || '' } });
  const vol = el('div', { class: 'vol' }, el('input', {
    type: 'range', min: 0, max: 100, value: 100,
    oninput: (e) => { video.volume = e.target.value / 100; video.muted = e.target.value === '0'; },
  }));
  wrap.append(video, fb,
    el('div', { class: 'name', text: p.name }),
    el('div', { class: 'flags' },
      el('span', { class: 'mic', text: '🔇' }),
      el('span', { class: 'cam', hidden: true, text: '🎥' }),
      el('span', { class: 'hand', hidden: true, text: '✋' }),
      el('span', { class: 'net', title: 'کیفیت اتصال', text: '⚪' }),
      el('span', { class: 'lk', hidden: true, text: '📌' }),
    ),
    el('div', { class: 'quick' },
      el('button', { title: 'بی‌صدا/باصدا', text: '🔈', onclick: () => togglePeerMute(id) }),
      el('button', { title: 'سنجاق', text: '📌', onclick: () => togglePin(id) }),
      el('button', { title: 'عکس', text: '📸', onclick: () => snapPeer(id) }),
      el('button', { title: 'تصویر در تصویر', text: '📺', onclick: () => enterPip(video) }),
      el('button', { title: 'منوی میزبان', text: '⋯', onclick: () => peerMenu(id) }),
    ),
    vol,
  );
  ctx.tiles.set(id, { wrap, video, fb, flags: wrap.querySelector('.flags'), vol });
  $('#stage').append(wrap);
  updateTile(p);
  // تشخیص صحبت با تحلیل صدای دریافتی
  const stream = p.streams.cam;
  p.stopMeter = attachRemoteMeter(id, stream);
  refreshLayout();
}

function attachRemoteMeter(id, stream) {
  let stop = () => {};
  const tryAttach = () => {
    if (stream.getAudioTracks().length) {
      stop();
      stop = ctx.media.attachMeter(stream, (v) => {
        const t = ctx.tiles.get(id);
        if (!t) return;
        const on = v > 0.06;
        t.wrap.classList.toggle('speaking', on);
      });
      return true;
    }
    return false;
  };
  if (!tryAttach()) {
    const iv = setInterval(() => { if (tryAttach()) clearInterval(iv); }, 1200);
    setTimeout(() => clearInterval(iv), 20_000);
    stop = () => clearInterval(iv);
  }
  return () => stop();
}

function updateTile(p) {
  const t = ctx.tiles.get(p.id);
  if (!t) return;
  const { wrap, video, fb, flags } = t;
  const camOn = !!p.state?.cam && !ctx.lowData;
  const screenOn = !!p.state?.screen;
  const stream = p.streams.cam;
  if (video.srcObject !== stream && (stream.getTracks().length)) video.srcObject = stream;
  if (screenOn && p.streams.screen.getVideoTracks().length) {
    video.srcObject = p.streams.screen;
  }
  video.hidden = !camOn && !screenOn;
  fb.hidden = camOn || screenOn;
  fb.textContent = avatarOf(p.name, p.avatar).emoji;
  wrap.classList.toggle('hand', !!p.hand);
  const f = flags.querySelector('.mic');
  if (f) f.textContent = p.state?.mic ? '🎙️' : '🔇';
  const fc = flags.querySelector('.cam');
  if (fc) fc.hidden = !camOn;
  const fh = flags.querySelector('.hand');
  if (fh) fh.hidden = !p.hand;
  const fl = flags.querySelector('.lk');
  if (fl) fl.hidden = !wrap.classList.contains('pinned');
  if (screenOn && p.state?.screenId) showRemoteScreen(p.id);
}

function refreshLayout() {
  const stage = $('#stage');
  const n = stage.childElementCount;
  stage.dataset.count = String(Math.max(1, Math.min(16, n)));
  $('#roomBadge').textContent = `${ctx.peers.size + 1} نفر`;
  $('#ttlPill').textContent = `⏱ ${fmtClock(ctx.room.ttlLeftMs || 0)}`;
}

function togglePin(id) {
  const stage = $('#stage');
  const cur = new Set((stage.dataset.pins || '').split(',').filter(Boolean));
  if (cur.has(id)) cur.delete(id);
  else cur.add(id);
  stage.dataset.pins = [...cur].join(',');
  for (const [pid, t] of ctx.tiles) t.wrap.classList.toggle('pinned', cur.has(pid));
}

function enterPip(video) {
  if (!document.pictureInPictureEnabled) return toast('تصویر در تصویر پشتیبانی نمی‌شود', 'warn');
  video.requestPictureInPicture?.().catch(() => toast('نشد — یک ویدئو در هر لحظه', 'warn', 2500));
}

function togglePeerMute(id) {
  const p = ctx.peers.get(id);
  if (!p) return;
  p.muted = !p.muted;
  const t = ctx.tiles.get(id);
  if (t) t.video.muted = p.muted;
  toast(p.muted ? `صدای ${p.name} برای شما قطع شد` : `صدای ${p.name} برگشت`, 'ok', 1800);
}

function snapPeer(id) {
  const t = ctx.tiles.get(id);
  const url = t && ctx.media.snapElement(t.video);
  if (!url) return toast('تصویری برای عکس نیست', 'warn');
  downloadDataUrl(url, `peer-${id}-${Date.now()}.jpg`);
}
function downloadDataUrl(url, name) {
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

/* ─────────────── رویدادهای همتا ─────────────── */
function onPeerJoin(peer) {
  if (!peer || peer.id === ctx.me.id) return;
  const isNew = !ctx.peers.has(peer.id);
  ctx.peers.set(peer.id, { ...(ctx.peers.get(peer.id) || {}), ...peer, streams: ctx.peers.get(peer.id)?.streams || emptyStreams(), vol: 1 });
  addRemoteTile(peer.id);
  ctx.mesh.ensurePeer(peer.id, { initiator: false });
  if (isNew) {
    beep('in');
    vibrate(20);
    toast(`👋 ${peer.name} وارد شد`, 'ok', 2200);
  }
  renderPeople();
  refreshLayout();
}

function onPeerLeave(id) {
  const p = ctx.peers.get(id);
  ctx.peers.delete(id);
  const t = ctx.tiles.get(id);
  if (t) {
    p?.stopMeter?.();
    t.wrap.remove();
    ctx.tiles.delete(id);
  }
  ctx.mesh?.removePeer(id);
  if (p) toast(`${p.name} خارج شد`, 'warn', 1800);
  if (ctx.screenOwner === id) closeScreenPane();
  renderPeople();
  refreshLayout();
}

function onPeerState(m) {
  const p = ctx.peers.get(m.id);
  if (!p) return;
  if (m.s) p.state = { ...(p.state || {}), ...m.s };
  if (m.name) p.name = m.name;
  if (m.avatar !== undefined) p.avatar = m.avatar;
  if (m.host) {
    if (m.host.op === 'mute') { toast(`میزبان میکروفن شما را بست`, 'warn', 3000); toggleMic(false); }
    if (m.host.op === 'muteall') { toast('میزبان میکروفن همه را بست', 'warn', 3000); toggleMic(false); }
    if (m.host.op === 'cameraoff') { toggleCam(false); }
  }
  const t = ctx.tiles.get(m.id);
  if (t) {
    t.wrap.querySelector('.name').textContent = p.name;
    updateTile(p);
  }
  renderPeople();
}

function onRoomUpdate(m) {
  if (m.room) {
    ctx.room = { ...ctx.room, ...m.room };
    $('#roomName').textContent = ctx.room.name;
    $('#ttlPill').textContent = `⏱ ${fmtClock(ctx.room.ttlLeftMs || 0)}`;
  }
  if (m.you?.role) {
    ctx.me.role = m.you.role;
    ctx.room.hostId = m.you.role === 'host' ? ctx.me.id : ctx.room.hostId;
    $('#hostPill').hidden = !ctx.isHost();
    toast(m.you.role === 'host' ? '👑 شما میزبان شدید' : 'نقش شما تغییر کرد', 'ok', 2600);
    renderPeople();
  }
  if (m.warn === 'expiring') toast('⚠️ عمر اتاق دارد تمام می‌شود (کمتر از ۵ دقیقه)', 'warn', 5000);
  if (m.host?.op === 'mute') { toast('میزبان میکروفن شما را بست', 'warn'); toggleMic(false); }
  if (m.host?.op === 'muteall') { toast('میزبان میکروفن همه را بست', 'warn'); toggleMic(false); }
  if (m.host?.op === 'cameraoff') toggleCam(false);
}

function onKnock(peer) {
  if (!ctx.isHost()) return;
  const host = $('#knockList');
  host.hidden = false;
  const row = el('div', { class: 'person' },
    el('span', { class: 'av', text: avatarOf(peer.name).emoji }),
    el('span', { class: 'nm', text: `${peer.name} می‌خواهد وارد شود` }),
    el('button', { class: 'btn xs primary', text: 'پذیرش', onclick: () => { ctx.socket.send({ t: 'host', op: 'approve', id: peer.id }); row.remove(); } }),
    el('button', { class: 'btn xs danger', text: 'رد', onclick: () => { ctx.socket.send({ t: 'host', op: 'deny', id: peer.id }); row.remove(); } }),
  );
  host.append(row);
  toast(`🛎️ ${peer.name} در انتظار ورود است`, 'warn', 4000);
}

/* ─────────────── فهرست اعضا ─────────────── */
function renderPeople() {
  const host = $('#peopleList');
  host.innerHTML = '';
  const rows = [{ id: ctx.me.id, name: `${ctx.me.name} (شما)`, role: ctx.isHost() ? 'host' : 'member', state: { mic: !!ctx.media.micTrack, cam: !!ctx.media.camTrack }, hand: false }, ...ctx.peers.values()];
  for (const p of rows) {
    const t = ctx.tiles.get(p.id);
    const dots = t ? qualityDots(p) : '';
    host.append(el('div', { class: 'person', onclick: () => p.id !== ctx.me.id && peerMenu(p.id) },
      el('span', { class: 'av', text: avatarOf(p.name, p.avatar).emoji }),
      el('span', { class: 'nm', text: p.name + (p.role === 'host' ? ' 👑' : '') }),
      el('span', { class: 'md', html: `${p.state?.mic ? '🎙️' : '🔇'} ${p.state?.cam ? '🎥' : '📷'} ${p.state?.screen ? '🖥️' : ''} ${p.hand ? '✋' : ''} ${dots}` }),
    ));
  }
  $('#hostMuteAll').hidden = !ctx.isHost();
  $('#hostCamOff').hidden = !ctx.isHost();
  $('#hostWaiting').hidden = !ctx.isHost();
}

function qualityDots(p) {
  const q = p.stats || {};
  const rtt = q.rtt || 0;
  if (!rtt) return '<span title="در حال سنجش">⚪</span>';
  const e = rtt < 150 ? '🟢' : rtt < 350 ? '🟡' : '🔴';
  return `<span title="تأخیر ${Math.round(rtt)}ms · افت ${q.loss || 0}%">${e}</span>`;
}

function peerMenu(id) {
  const p = ctx.peers.get(id);
  if (!p) return;
  const host = ctx.isHost();
  modal({
    title: `${avatarOf(p.name).emoji} ${p.name}`,
    html: `
      <p class="fine">اتصال: ${p.conn || '…'} · تأخیر: ${Math.round(p.stats?.rtt || 0)}ms · افت: ${p.stats?.loss || 0}% · رزولوشن: ${p.stats?.res || '—'}</p>
      <div class="row">
        <button class="btn sm" id="pmMute">${p.muted ? '🔊 پخش صدا' : '🔇 بی‌صدا برای من'}</button>
        <button class="btn sm" id="pmSnap">📸 عکس</button>
        <button class="btn sm" id="pmPin">📌 سنجاق</button>
        ${host ? '<button class="btn sm" id="pmMic">🎙️ بستن میکروفن او</button>' : ''}
        ${host ? '<button class="btn sm" id="pmTransfer">👑 انتقال میزبانی</button>' : ''}
        ${host ? '<button class="btn sm danger" id="pmKick">🚫 اخراج</button>' : ''}
        ${host ? '<button class="btn sm danger" id="pmBan">⛔ اخراج و مسدودی</button>' : ''}
      </div>
      <label style="margin-top:.6rem">بلندی صدا (فقط برای شما)
        <input type="range" id="pmVol" min="0" max="100" value="${Math.round((p.vol || 1) * 100)}" />
      </label>`,
    onOpen: (body) => {
      body.querySelector('#pmVol').oninput = (e) => {
        const t = ctx.tiles.get(id);
        const v = Number(e.target.value) / 100;
        p.vol = v;
        if (t) { t.video.volume = v; t.video.muted = v === 0; }
      };
      body.querySelector('#pmMute').onclick = () => { togglePeerMute(id); closeModal(); };
      body.querySelector('#pmSnap').onclick = () => { snapPeer(id); };
      body.querySelector('#pmPin').onclick = () => { togglePin(id); };
      body.querySelector('#pmMic')?.addEventListener('click', () => { ctx.socket.send({ t: 'host', op: 'mute', id }); });
      body.querySelector('#pmKick')?.addEventListener('click', () => { ctx.socket.send({ t: 'host', op: 'kick', id }); closeModal(); });
      body.querySelector('#pmBan')?.addEventListener('click', () => { ctx.socket.send({ t: 'host', op: 'ban', id }); closeModal(); });
      body.querySelector('#pmTransfer')?.addEventListener('click', () => { ctx.socket.send({ t: 'host', op: 'transfer', id }); closeModal(); });
    },
  });
}

/* ─────────────── کنترل‌های محلی ─────────────── */
async function toggleMic(force = null) {
  const on = force === null ? !ctx.media.micTrack : force;
  try {
    await ctx.media.toggleMic(on);
  } catch (e) {
    toast('دسترسی به میکروفن ممکن نشد', 'err');
    return;
  }
  ctx.mesh?.setMicTrack(ctx.media.micTrack);
  ctx.socket?.send({ t: 'state', s: { mic: on } });
  updateMicUI();
}

async function toggleCam(force = null) {
  const on = force === null ? !ctx.media.camTrack : force;
  try {
    await ctx.media.toggleCam(on);
  } catch {
    toast('دسترسی به دوربین ممکن نشد', 'err');
    return;
  }
  ctx.mesh?.setCamTrack(ctx.media.camTrack);
  ctx.socket?.send({ t: 'state', s: { cam: on } });
  updateCamUI();
}

function updateMicUI() {
  const on = !!ctx.media.micTrack;
  $('#micState').textContent = on ? 'روشن' : 'بسته';
  $('#barMic').classList.toggle('off', !on);
  $('#barMic').classList.toggle('on', on);
  const t = ctx.tiles.get(ctx.me.id);
  if (t) {
    t.flags.querySelector('.mic').textContent = on ? '🎙️' : '🔇';
    t.fb.hidden = !!ctx.media.camTrack;
  }
  ctx.prefs.micOn = on;
  ctx.savePrefs();
  renderPeople();
}

function updateCamUI() {
  const on = !!ctx.media.camTrack;
  $('#camState').textContent = on ? 'روشن' : 'بسته';
  $('#barCam').classList.toggle('off', !on);
  $('#barCam').classList.toggle('on', on);
  const t = ctx.tiles.get(ctx.me.id);
  if (t) {
    t.fb.hidden = on;
    const fc = t.flags.querySelector('.cam');
    if (fc) fc.hidden = !on;
  }
  ctx.prefs.camOn = on;
  ctx.savePrefs();
}

async function toggleScreen() {
  if (ctx.media.screenStream) return stopScreen();
  try {
    const stream = await ctx.media.startScreen({ audio: true, quality: ctx.prefs.screenQuality });
    await ctx.mesh.startScreen(stream);
    ctx.socket.send({ t: 'state', s: { screen: true, screenId: stream.id } });
    $('#shareVideo').srcObject = stream;
    showPane('#sharePane', true);
    $('#barScreen').classList.add('on');
    ctx.screenOwner = ctx.me.id;
    stream.getVideoTracks()[0].onended = () => stopScreen();
    toast('اشتراک صفحه شروع شد — دکمهٔ پایان در بالای تصویر', 'ok', 3000);
  } catch (e) {
    toast('اشتراک صفحه لغو شد', 'warn');
  }
}

async function stopScreen() {
  ctx.media.stopScreen();
  await ctx.mesh.stopScreen();
  ctx.socket.send({ t: 'state', s: { screen: false } });
  closeScreenPane();
  $('#barScreen').classList.remove('on');
}

function showRemoteScreen(id) {
  const p = ctx.peers.get(id);
  if (!p) return;
  if (!p.state?.screen) return;
  if (p.streams.screen.getVideoTracks().length) {
    const v = $('#shareVideo');
    if (v.srcObject !== p.streams.screen) {
      v.srcObject = p.streams.screen;
      ctx.screenOwner = id;
      showPane('#sharePane', true);
      toast(`🖥️ ${p.name} در حال اشتراک صفحه است`, 'ok', 2600);
    }
  }
}
function closeScreenPane() {
  $('#shareVideo').srcObject = null;
  showPane('#sharePane', false);
  ctx.screenOwner = null;
}

function toggleHand() {
  const up = !ctx.handUp;
  ctx.handUp = up;
  ctx.socket.send({ t: 'hand', up });
  $('#barHand').classList.toggle('on', up);
  const t = ctx.tiles.get(ctx.me.id);
  if (t) { t.wrap.classList.toggle('hand', up); t.flags.querySelector('.hand').hidden = !up; }
  toast(up ? '✋ دست شما بلند شد' : 'دست شما پایین آمد', 'ok', 1400);
}

function sendReaction() {
  const set = ['👍', '❤️', '😂', '🎉', '👏', '🙏', '🔥', '👀'];
  const picker = el('div', { class: 'emoji-picker', style: { position: 'fixed', insetBlockEnd: '5rem', insetInlineStart: '50%', translate: '-50% 0', zIndex: 50, background: 'var(--panel)' } });
  for (const e of set) picker.append(el('button', { text: e, onclick: () => { ctx.socket.send({ t: 'react', emoji: e }); picker.remove(); floatReaction(e, ctx.me.id); } }));
  document.body.append(picker);
  setTimeout(() => picker.remove(), 5000);
}

function floatReaction(emoji, fromId, name) {
  const host = $('#reactions');
  const s = el('span', { text: emoji, style: { insetInlineStart: `${10 + Math.random() * 78}%` } });
  host.append(s);
  setTimeout(() => s.remove(), 2800);
  const who = name || ctx.peers.get(fromId)?.name || (fromId === ctx.me.id ? ctx.me.name : '');
  if (who && fromId !== ctx.me.id) toast(`${who}: ${emoji}`, 'ok', 1400);
}

/* ─────────────── پنل‌ها و زبانه‌ها ─────────────── */
function showPane(sel, on) {
  const node = $(sel);
  if (!node) return;
  node.hidden = !on;
}
function toggleBoard(v = null) {
  const pane = $('#boardPane');
  const on = v === null ? pane.hidden : v;
  pane.hidden = !on;
  if (on) { ctx.board.resize(); showPane('#sharePane', false); }
}
function selectTab(name) {
  $$('#side .tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tabpane').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  $('#side').classList.remove('hidden');
  if (name === 'chat') { ctx.chat.unread = 0; ctx.chat.renderCounter(); ctx.chat.scroll(); }
  if (name === 'capsule') ctx.tools.renderCapsules();
  if (name === 'files') ctx.chat.renderFiles();
}

function mountUI() {
  ctx.chat.mount();
  ctx.board.mount();
  ctx.tools.mount();

  $$('#side .tab[data-tab]').forEach((b) => { b.onclick = () => selectTab(b.dataset.tab); });
  $('#sideClose').onclick = () => $('#side').classList.toggle('hidden');
  $('#btnPanel').onclick = () => $('#side').classList.toggle('hidden');
  $('#btnHelp').onclick = showHelp;
  $('#btnInvite').onclick = showInvite;
  $('#btnSettings').onclick = showSettings;
  $('#roomCode').onclick = () => copy(ctx.room.code, 'کد اتاق کپی شد ✅');
  $('#btnLayout').onclick = cycleLayout;
  $('#btnLeave').onclick = leave;
  $('#barLeave').onclick = leave;
  $('#barEnd').onclick = endForAll;
  $('#barMic').onclick = () => toggleMic();
  $('#barCam').onclick = () => toggleCam();
  $('#barScreen').onclick = () => toggleScreen();
  $('#barHand').onclick = () => toggleHand();
  $('#barReact').onclick = () => sendReaction();
  $('#barMore').onclick = () => selectTab('tools');
  $('#shareStop').onclick = () => stopScreen();
  $('#shareQuality').onclick = () => {
    const order = ['lite', 'normal', 'hd'];
    const cur = order.indexOf(ctx.prefs.screenQuality || 'normal');
    const next = order[(cur + 1) % 3];
    ctx.prefs.screenQuality = next;
    ctx.savePrefs();
    ctx.mesh.setScreenKbps(PROFILES[next].screenKbps);
    $('#shareQuality').textContent = `کیفیت: ${{ lite: 'پایین', normal: 'متوسط', hd: 'بالا' }[next]}`;
    toast(`کیفیت اشتراک صفحه: ${{ lite: 'پایین', normal: 'متوسط', hd: 'بالا' }[next]}`, 'ok');
  };
  $('#shareAudio').onclick = () => toast('صدای سیستم با شروع اشتراک فعال می‌شود (اگر مرورگر اجازه دهد)', 'ok', 2600);
  $('#shareFull').onclick = () => { const v = $('#shareVideo'); (v.requestFullscreen || v.webkitEnterFullscreen)?.call(v); };
  $('#hostMuteAll').onclick = () => ctx.socket.send({ t: 'host', op: 'muteall' });
  $('#hostCamOff').onclick = () => { if (confirm('دوربین همه بسته شود؟')) ctx.socket.send({ t: 'host', op: 'cameraoff' }); };
  $('#hostWaiting').onclick = () => ctx.socket.send({ t: 'host', op: 'waitingroom', on: !ctx.room.waitingRoom });
  $('#pickCam').onclick = () => $('#tShot').click();
  $('#tMic').classList.toggle('on', !!ctx.media.micTrack);
  $('#tCam').classList.toggle('on', !!ctx.media.camTrack);

  updateMicUI();
  updateCamUI();
  ctx.tools.renderCapsules();
  ctx.chat.renderFiles();
  selectTab('chat');
  if (!isMobile()) $('#side').classList.remove('hidden');

  // میان‌برها
  addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'm') toggleMic();
    else if (k === 'v') toggleCam();
    else if (k === 's') toggleScreen();
    else if (k === 'h') toggleHand();
    else if (k === 'r') sendReaction();
    else if (k === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#side').classList.toggle('hidden'); }
    else if (k === 'g' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cycleLayout(); }
    else if (k === '?') showHelp();
    else if (k === 'f') ctx.tools.fullscreen();
    else if (k === 'escape') { closeModal(); }
  });
  setInterval(() => {
    if (!ctx.room.ttlLeftMs) return;
    ctx.room.ttlLeftMs = Math.max(0, ctx.room.ttlLeftMs - 5000);
    $('#ttlPill').textContent = `⏱ ${fmtClock(ctx.room.ttlLeftMs)}`;
  }, 5000);
  setInterval(async () => {
    if (!ctx.mesh) return;
    const s = await ctx.mesh.collectStats().catch(() => null);
    if (s) for (const [id, p] of ctx.peers) { if (p.stats) updatePeerNetFlag(id); }
  }, 6000);
}

function updatePeerNetFlag(id) {
  const t = ctx.tiles.get(id);
  const p = ctx.peers.get(id);
  if (!t || !p) return;
  const sp = t.flags.querySelector('.net');
  if (sp) sp.innerHTML = qualityDots(p);
}

function cycleLayout() {
  const order = ['auto', 'grid', 'spotlight', 'filmstrip'];
  const cur = $('#stage').dataset.layout || 'auto';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  $('#stage').dataset.layout = next;
  toast(`چیدمان: ${{ auto: 'خودکار', grid: 'شبکه‌ای', spotlight: 'تک‌نفره', filmstrip: 'نوار فیلم' }[next]}`, 'ok', 1400);
}

/* ─────────────── خروج ─────────────── */
function leave() {
  if (!confirm('از اتاق خارج می‌شوید؟')) return;
  ctx.leaving = true;
  store.session.del('inCall');
  ctx.socket?.send({ t: 'bye' });
  ctx.media.stop();
  ctx.mesh?.close();
  ctx.socket?.close();
  location.href = '/';
}

function endForAll() {
  if (!ctx.isHost()) return toast('فقط میزبان می‌تواند', 'warn');
  if (!confirm('جلسه برای همه تمام شود و اتاق پاک شود؟')) return;
  ctx.socket.send({ t: 'host', op: 'end' });
  setTimeout(() => { ctx.leaving = true; location.href = '/'; }, 500);
}

/* ─────────────── مودال‌ها ─────────────── */
function showInvite() {
  const url = `${location.origin}/r/${ctx.room.code}`;
  const text = `هم‌کلام: دعوت به «${ctx.room.name}» — ${url}`;
  modal({
    title: '🔗 دعوت به اتاق',
    html: `
      <label>لینک اتاق<input id="invUrl" readonly value="${esc(url)}" /></label>
      <div class="row">
        <button class="btn" id="invCopy">📋 کپی لینک</button>
        <button class="btn ghost" id="invCode">🔑 کپی کد ${esc(ctx.room.code)}</button>
      </div>
      <div class="row" style="margin-top:.6rem">
        <a class="btn" target="_blank" rel="noreferrer" href="https://wa.me/?text=${encodeURIComponent(text)}">واتساپ</a>
        <a class="btn" target="_blank" rel="noreferrer" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(ctx.room.name)}">تلگرام</a>
        <a class="btn" target="_blank" rel="noreferrer" href="sms:?body=${encodeURIComponent(text)}">پیامک</a>
        <a class="btn" href="mailto:?subject=${encodeURIComponent(ctx.room.name)}&body=${encodeURIComponent(text)}">ایمیل</a>
      </div>
      <hr>
      <p class="fine">عمر باقی‌ماندهٔ اتاق: ${fmtClock(ctx.room.ttlLeftMs)} · سقف نفرات: ${ctx.room.maxP}${ctx.room.pin ? ' · 🔐 رمزدار' : ''}${ctx.room.waitingRoom ? ' · 🛎️ اتاق انتظار روشن' : ''}</p>`,
    onOpen: (body) => {
      body.querySelector('#invCopy').onclick = () => copy(url, 'لینک کپی شد — بفرستید برای بقیه ✅');
      body.querySelector('#invCode').onclick = () => copy(ctx.room.code, 'کد اتاق کپی شد');
    },
  });
}

function showHelp() {
  const rows = [
    ['M', 'میکروفن روشن/بسته'], ['V', 'دوربین روشن/بسته'], ['S', 'اشتراک صفحه'],
    ['H', 'دست بلند'], ['R', 'واکنش سریع'], ['Ctrl+B', 'پنل کنار'],
    ['Ctrl+G', 'چیدمان'], ['F', 'تمام‌صفحه'], ['؟', 'همین راهنما'], ['Esc', 'بستن پنجره'],
  ];
  modal({
    title: `📚 راهنما و ${FEATURE_COUNT} قابلیت`,
    wide: true,
    html: `
      <div class="set-grid">
        <section>
          <b>میان‌برهای کیبورد</b>
          <table>${rows.map(([k, v]) => `<tr><td><span class="kbd">${k}</span></td><td>${v}</td></tr>`).join('')}</table>
        </section>
        <section>
          <b>اتصال و کیفیت</b>
          <p class="fine">صدا و تصویر مستقیم بین مرورگرها می‌رود (P2P). برای شبکهٔ ضعیف «سبک» و برای موبایل «فقط صدا» را انتخاب کنید.
          اگر همه پشت NAT سخت هستند، TURN رایگان کلودفلر را در تنظیمات پروژه فعال کنید.</p>
        </section>
      </div>
      <hr>
      <input id="helpSearch" placeholder="جست‌وجو در قابلیت‌ها…" style="margin-bottom:.6rem" />
      <div class="feature-list" id="helpList"></div>`,
    actions: [{ label: 'فهمیدم', kind: 'primary' }],
    onOpen: (body) => {
      const list = body.querySelector('#helpList');
      const draw = (q = '') => {
        list.innerHTML = '';
        for (const f of FEATURES.filter((x) => !q || x.k.toLowerCase().includes(q.toLowerCase()))) {
          list.append(el('div', { class: 'feat' }, el('span', { class: 'em', text: f.e }), el('div', {}, el('b', { text: f.t }), el('small', { text: f.d }))));
        }
      };
      draw();
      body.querySelector('#helpSearch').oninput = (e) => draw(e.target.value);
    },
  });
}

function showSettings() {
  const p = ctx.prefs;
  modal({
    title: '⚙️ تنظیمات',
    wide: true,
    html: `
      <div class="set-grid">
        <section>
          <b>کیفیت</b>
          <label>پروفایل کیفیت
            <select id="setProfile">${Object.values(PROFILES).map((x) => `<option value="${x.key}" ${p.profile === x.key ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
          </label>
          <label class="check"><input type="checkbox" id="setAuto" ${p.autoProfile !== false ? 'checked' : ''} /> تنظیم خودکار کیفیت بر اساس شبکه</label>
          <label>کیفیت اشتراک صفحه
            <select id="setScreenQ">
              <option value="lite" ${p.screenQuality === 'lite' ? 'selected' : ''}>پایین (کم‌مصرف)</option>
              <option value="normal" ${p.screenQuality === 'normal' ? 'selected' : ''}>متوسط</option>
              <option value="hd" ${p.screenQuality === 'hd' ? 'selected' : ''}>بالا</option>
            </select>
          </label>
          <button class="btn sm" id="setLowData">🪫 ${ctx.tools.lowData ? 'خاموش‌کردن' : 'روشن‌کردن'} حالت داده‌کم</button>
        </section>
        <section>
          <b>دستگاه‌ها</b>
          <label>میکروفن<select id="setMic"></select></label>
          <label>دوربین<select id="setCam"></select></label>
          <label>خروجی صدا<select id="setSpk"></select></label>
          <label class="check"><input type="checkbox" id="setNoise" ${ctx.media.noise ? 'checked' : ''} /> نویزکشی</label>
          <label class="check"><input type="checkbox" id="setMirror" ${p.mirror !== false ? 'checked' : ''} /> آینه‌کردن تصویر خودم</label>
        </section>
        <section>
          <b>پیام و هشدار</b>
          <label class="check"><input type="checkbox" id="setSound" ${p.sound !== false ? 'checked' : ''} /> صدای پیام</label>
          <label class="check"><input type="checkbox" id="setVib" ${p.vibrate !== false ? 'checked' : ''} /> لرزش موبایل</label>
          <label class="check"><input type="checkbox" id="setNotify" ${p.notify !== false ? 'checked' : ''} /> اعلان مرورگر</label>
          <label class="check"><input type="checkbox" id="setTts" ${p.ttsAuto ? 'checked' : ''} /> خواندن پیام‌های تازه</label>
          <label>زبان تشخیص گفتار
            <select id="setLang">
              <option value="fa-IR" ${p.sttLang === 'fa-IR' ? 'selected' : ''}>فارسی</option>
              <option value="en-US" ${p.sttLang === 'en-US' ? 'selected' : ''}>انگلیسی</option>
              <option value="ar-SA" ${p.sttLang === 'ar-SA' ? 'selected' : ''}>عربی</option>
            </select>
          </label>
        </section>
        <section>
          <b>اتاق</b>
          <p class="fine">کد: ${esc(ctx.room.code)} · میزبان: ${esc([...ctx.peers.values()].find((x) => x.role === 'host')?.name || ctx.me.name)}</p>
          ${ctx.isHost() ? `
            <label>عمر اتاق (ساعت)<input type="number" id="setTtl" min="0.25" max="24" step="0.25" value="${ctx.room.ttlHours || 8}" /></label>
            <button class="btn sm" id="setTtlSave">اعمال عمر تازه</button>
            <label class="check"><input type="checkbox" id="setLock" ${ctx.room.locked ? 'checked' : ''} /> قفل اتاق</label>
            <label class="check"><input type="checkbox" id="setWait" ${ctx.room.waitingRoom ? 'checked' : ''} /> اتاق انتظار</label>` : '<p class="fine">تنظیمات اتاق فقط برای میزبان است.</p>'}
          <button class="btn sm" id="setTheme">🌗 تغییر پوسته</button>
        </section>
      </div>`,
    actions: [{ label: 'بستن', kind: 'primary' }],
    onOpen: (body) => {
      const fill = (sel, list, cur, kind) => {
        sel.innerHTML = '';
        sel.append(el('option', { value: '', text: 'پیش‌فرض' }));
        for (const d of list) sel.append(el('option', { value: d.id, text: d.label.slice(0, 30) }));
        sel.value = cur || '';
        sel.onchange = (e) => ctx.media.switchDevice(kind, e.target.value);
      };
      const d = ctx.media.devices;
      fill(body.querySelector('#setMic'), d.audioinput, ctx.media.micId, 'audioinput');
      fill(body.querySelector('#setCam'), d.videoinput, ctx.media.camId, 'videoinput');
      const spk = body.querySelector('#setSpk');
      spk.innerHTML = '';
      spk.append(el('option', { value: '', text: 'پیش‌فرض' }));
      for (const x of d.audiooutput) spk.append(el('option', { value: x.id, text: x.label.slice(0, 30) }));
      spk.onchange = (e) => ctx.media.setSpeaker(e.target.value) ? toast('خروجی صدا تغییر کرد', 'ok') : toast('این مرورگر انتخاب اسپیکر را پشتیبانی نمی‌کند', 'warn');
      body.querySelector('#setProfile').onchange = (e) => setProfile(e.target.value);
      body.querySelector('#setAuto').onchange = (e) => { ctx.prefs.autoProfile = e.target.checked; ctx.savePrefs(); };
      body.querySelector('#setScreenQ').onchange = (e) => { ctx.prefs.screenQuality = e.target.value; ctx.savePrefs(); };
      body.querySelector('#setLowData').onclick = () => { ctx.tools.toggleLowData(); closeModal(); };
      body.querySelector('#setNoise').onchange = (e) => ctx.media.setNoise(e.target.checked);
      body.querySelector('#setMirror').onchange = (e) => {
        ctx.prefs.mirror = e.target.checked;
        ctx.savePrefs();
        ctx.tiles.get(ctx.me.id)?.wrap.classList.toggle('mirror', e.target.checked);
      };
      const bind = (id, key) => { body.querySelector(id).onchange = (e) => { ctx.prefs[key] = e.target.checked; ctx.savePrefs(); }; };
      bind('#setSound', 'sound');
      bind('#setVib', 'vibrate');
      bind('#setNotify', 'notify');
      body.querySelector('#setTts').onchange = (e) => { ctx.prefs.ttsAuto = e.target.checked; ctx.savePrefs(); };
      body.querySelector('#setLang').onchange = (e) => { ctx.prefs.sttLang = e.target.value; ctx.savePrefs(); };
      body.querySelector('#setTheme').onclick = () => toggleTheme();
      body.querySelector('#setTtlSave')?.addEventListener('click', () => {
        const h = Number(body.querySelector('#setTtl').value) || 8;
        ctx.socket.send({ t: 'host', op: 'setttl', hours: h });
        closeModal();
      });
      body.querySelector('#setLock')?.addEventListener('change', (e) => ctx.socket.send({ t: 'host', op: 'lock', on: e.target.checked }));
      body.querySelector('#setWait')?.addEventListener('change', (e) => ctx.socket.send({ t: 'host', op: 'waitingroom', on: e.target.checked }));
    },
  });
}

function setProfile(key, { silent = false } = {}) {
  ctx.prefs.profile = key;
  ctx.savePrefs();
  ctx.mesh?.setProfile(key);
  ctx.media?.setProfile(key);
  if (!silent) toast(`کیفیت: ${PROFILES[key]?.label || key}`, 'ok', 1800);
}

function setIncomingVideo(on) {
  ctx.lowData = !on;
  $('#stage').classList.toggle('lowdata', !on);
  for (const p of ctx.peers.values()) {
    for (const s of [p.streams.cam, p.streams.screen, p.streams.screenA]) {
      s.getVideoTracks().forEach((t) => { t.enabled = on; });
    }
    updateTile(p);
  }
}

function updateNetPill(q) {
  const tier = q.tier || 'ok';
  const t = TIERS[tier] || TIERS.ok;
  const rtt = q.rtt ? `${Math.round(q.rtt)}ms` : '—';
  $('#netPill').textContent = `${t.emoji} ${rtt}`;
  $('#netPill').title = `${t.label} — ${t.hint}\nبالا: ${q.up || 0}kbps · پایین: ${q.down || 0}kbps · افت: ${q.loss || 0}%${q.res ? ` · ${q.res}` : ''}${q.limited ? ` · محدودیت: ${q.limited}` : ''}`;
}

/* ─────────────── شروع ─────────────── */
gate.init();
window.addEventListener('pagehide', () => { if (ctx.joined && !ctx.leaving) store.session.set('inCall', CODE); });
