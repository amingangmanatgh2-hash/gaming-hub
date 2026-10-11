/** پنل چت: پیام، پاسخ، ویرایش، حذف، سنجاق، واکنش، جست‌وجو، فایل، ویس */
import { $, el, esc, linkify, toast, fmtTime, copy, uid, avatarOf, beep, vibrate, store, download } from '../core/util.js';
import { EMOJIS } from '../core/const.js';
import { compressImage, VoiceRecorder, FileSender, FileReceiver, iconFor, LIMITS, readAsDataURL, splitMessage } from '../core/files.js';

const REACTS = ['👍', '❤️', '😂', '🎉', '👏', '🙏'];

export class ChatPane {
  constructor(ctx) {
    this.ctx = ctx;
    this.messages = [];
    this.byId = new Map();
    this.filter = 'all';
    this.query = '';
    this.unread = 0;
    this.reply = null;
    this.typing = new Map();
    this.pinned = null;
    this.rec = new VoiceRecorder();
    this.sender = new FileSender({
      send: (o) => ctx.signalRaw(o),
      isBusy: () => (ctx.socket.ws?.bufferedAmount || 0) > 512 * 1024,
    });
    this.receiver = new FileReceiver();
    this.receiver.on('file', (f) => this.onLiveFile(f));
    this.receiver.on('progress', (id, got, total, pct) => {
      $('#fileProg').textContent = `دریافت ${pct}% (${got}/${total})`;
    });
    this.sender.on('progress', (i, n, pct) => { $('#fileProg').textContent = `ارسال ${pct}% (${i}/${n})`; });
    this.sender.on('done', () => { $('#fileProg').textContent = 'ارسال شد ✅'; setTimeout(() => { $('#fileProg').textContent = ''; }, 2500); });
    this.liveFiles = [];
    setInterval(() => this.receiver.cleanup(), 30_000);
  }

  /* ───── اتصال به DOM ───── */
  mount() {
    const c = this.ctx;
    this.list = $('#chatList');
    $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    const ta = $('#chatInput');
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
      if (e.key === 'Escape' && this.reply) this.setReply(null);
    });
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 130)}px`;
      c.socket.send({ t: 'typing', on: true });
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => c.socket.send({ t: 'typing', on: false }), 2200);
      const draft = ta.value;
      c.socket.send({ t: 'state', s: { draft: draft.length > 0 } });
    });

    // ایموجی
    const picker = $('#emojiPicker');
    for (const e of EMOJIS) {
      picker.append(el('button', { type: 'button', text: e, onclick: () => { ta.value += e; ta.focus(); } }));
    }
    $('#emojiBtn').onclick = () => { picker.hidden = !picker.hidden; if (!picker.hidden) picker.scrollTop = 0; };

    // پیوست
    const fileInput = $('#fileInput');
    const imgInput = $('#imgInput');
    $('#fileBtn').onclick = () => fileInput.click();
    $('#pickFile').onclick = () => fileInput.click();
    $('#pickImg').onclick = () => imgInput.click();
    fileInput.onchange = () => { this.handleFiles([...fileInput.files]); fileInput.value = ''; };
    imgInput.onchange = () => { this.handleFiles([...imgInput.files], { images: true }); imgInput.value = ''; };

    // ویس
    $('#shotBtn').onclick = () => this.toggleVoice();

    // جست‌وجو و فیلتر
    $('#chatSearch').oninput = (e) => { this.query = e.target.value.trim().toLowerCase(); this.render(); };
    $('#chipAll').onclick = () => { this.filter = 'all'; $('#chipAll').classList.add('on'); $('#chipUnread').classList.remove('on'); this.render(); };
    $('#chipUnread').onclick = () => { this.filter = 'unread'; $('#chipUnread').classList.add('on'); $('#chipAll').classList.remove('on'); this.render(); };
    $('#chipAll').classList.add('on');
    $('#chatExport').onclick = () => {
      const blob = new Blob([JSON.stringify(this.messages, null, 1)], { type: 'application/json' });
      download(URL.createObjectURL(blob), `hamkalam-chat-${c.room.code}-${new Date().toISOString().slice(0, 10)}.json`);
      toast('خروجی چت دانلود شد', 'ok');
    };

    // کشیدن و رهاکردن
    const drop = $('#drop');
    const onDrag = (on) => (e) => { e.preventDefault(); drop.classList.toggle('over', on); };
    ['dragenter', 'dragover'].forEach((ev) => addEventListener(ev, onDrag(true)));
    ['dragleave', 'drop'].forEach((ev) => addEventListener(ev, onDrag(false)));
    addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) { e.preventDefault(); this.handleFiles(files); }
    });
    drop.onclick = () => fileInput.click();

    $('#replyX').onclick = () => this.setReply(null);
    $('#slomoHide').onchange = (e) => { c.prefs.slomo = e.target.checked; c.savePrefs(); };
    $('#slomoHide').checked = !!c.prefs.slomo;
    $('#compressImg').checked = c.prefs.compressImg !== false;
    $('#compressImg').onchange = (e) => { c.prefs.compressImg = e.target.checked; c.savePrefs(); };
  }

  /* ───── پیام‌ها ───── */
  load(list) {
    this.messages = Array.isArray(list) ? list : [];
    this.byId = new Map(this.messages.map((m) => [m.id, m]));
    this.pinned = this.messages.find((m) => m.pinned) || null;
    this.renderPinned();
    this.render();
  }

  onIncoming(m) {
    if (this.byId.has(m.id)) return;
    this.messages.push(m);
    this.byId.set(m.id, m);
    if (this.messages.length > 300) this.messages.shift();
    for (const p of this.liveFiles) if (p.meta?.name === m.text) { /* noop */ }
    this.appendBubble(m);
    this.afterIncoming(m);
  }

  afterIncoming(m) {
    const c = this.ctx;
    const hidden = document.hidden || !$('[data-pane="chat"]').isConnected || $('.side')?.classList.contains('hidden');
    const mine = m.from === c.me.id;
    if (!mine) {
      if (hidden) { this.unread++; this.renderCounter(); }
      if (c.prefs.sound !== false) beep(mine ? 'out' : 'in');
      if (c.prefs.vibrate !== false) vibrate(14);
      if (document.hidden && c.prefs.notify !== false && Notification?.permission === 'granted') {
        const n = new Notification(`${c.room.name} — ${m.name}`, { body: (m.text || 'فایل فرستاد').slice(0, 90), tag: 'hk-chat' });
        n.onclick = () => { window.focus(); n.close(); };
      }
      if (c.prefs.ttsAuto) c.tools?.speak(`${m.name} گفت: ${m.text || ''}`);
      if (c.cc?.active) c.cc.pushRemote(m.name, m.text || '');
      c.bumpTitle();
    }
    this.scroll();
  }

  appendBubble(m) {
    const c = this.ctx;
    if (this.query && !JSON.stringify(m).toLowerCase().includes(this.query)) return;
    if (this.filter === 'unread' && this.unreadSeen?.has?.(m.id)) { /* فقط تازه‌ها */ }
    const b = this.bubble(m);
    if (!b) return;
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 80;
    this.list.append(b);
    if (atBottom) this.scroll();
    c.bumpTitle();
  }

  bubble(m) {
    const c = this.ctx;
    const av = avatarOf(m.name, m.photo);
    const isSystem = m.sys;
    if (isSystem) {
      return el('div', { class: 'msg sys' }, el('div', { class: 'body', html: linkify(m.text) }));
    }
    const mine = m.from === c.me.id;
    const file = m.file;
    const isEmojiOnly = m.text && m.text.length <= 8 && /^[\p{Emoji}\p{Extended_Pictographic}\s]+$/u.test(m.text);
    const quoted = m.reply && this.byId.get(m.reply);
    const body = el('div', { class: 'body' });
    const who = el('div', { class: 'who' },
      el('b', { text: mine ? 'شما' : m.name, style: { color: av.color ? av.color.replace('45%)', '65%)') : '' } }),
      el('span', { text: fmtTime(m.ts) }),
      m.edited ? el('span', { text: '(ویرایش‌شده)', class: 'fine' }) : null,
      m.pinned ? el('span', { text: '📌' }) : null,
    );
    body.append(who);
    if (quoted) body.append(el('div', { class: 'quote', html: `<b>${esc(quoted.name)}:</b> ${esc((quoted.text || 'فایل').slice(0, 90))}` }));
    if (m.text) body.append(el('div', { class: isEmojiOnly ? 'txt' : 'txt', style: isEmojiOnly ? { fontSize: '2rem' } : {}, html: linkify(m.text) }));
    if (file) {
      const kind = file.isImage ? 'image' : file.isAudio ? 'audio' : 'file';
      if (kind === 'image' && file.data) body.append(el('img', { src: file.data, alt: file.n, loading: 'lazy' }));
      else if (kind === 'audio' && file.data) body.append(el('audio', { controls: true, src: file.data, preload: 'metadata' }));
      else if (file.data && /^data:video\//.test(file.data)) body.append(el('video', { controls: true, src: file.data, preload: 'metadata', style: { maxWidth: '100%' } }));
      const dl = el('div', { class: 'file' },
        el('span', { text: iconFor(file.n, file.mime) }),
        el('span', { class: 'grow', text: file.n }),
        el('small', { class: 'fine', text: `${Math.max(1, Math.round(file.s / 1024))}KB` }),
      );
      if (file.data) dl.append(el('a', { href: file.data, download: file.n, text: '⬇' }));
      body.append(dl);
    }
    if (m.reactions && Object.keys(m.reactions).length) {
      body.append(el('div', { class: 'meta' }, ...Object.entries(m.reactions).map(([e, arr]) =>
        el('button', { text: `${e} ${arr.length}`, onclick: () => c.socket.send({ t: 'chatop', op: 'react', id: m.id, emoji: e }) }))));
    }
    const meta = el('div', { class: 'meta' });
    meta.append(el('button', { text: '↩ پاسخ', onclick: () => this.setReply(m) }));
    if (file?.data) meta.append(el('button', { text: '⬇ دانلود', onclick: () => { download(file.data, file.n); } }));
    meta.append(el('button', { text: '📋', title: 'کپی', onclick: () => copy(m.text || '', 'متن پیام کپی شد') }));
    if (mine) meta.append(el('button', { text: '✏️', title: 'ویرایش', onclick: () => this.editMessage(m) }));
    if (mine || c.isHost()) meta.append(el('button', { text: '🗑', title: 'حذف', onclick: () => c.socket.send({ t: 'chatop', op: 'del', id: m.id }) }));
    if (c.isHost()) meta.append(el('button', { text: m.pinned ? '📌 برداشتن' : '📌 سنجاق', onclick: () => c.socket.send({ t: 'chatop', op: 'pin', id: m.id }) }));
    for (const r of REACTS.slice(0, 4)) meta.append(el('button', { text: r, onclick: () => c.socket.send({ t: 'chatop', op: 'react', id: m.id, emoji: r }) }));
    body.append(meta);

    const avEl = el('div', { class: 'av', text: av.emoji, style: { background: av.color || '' } });
    return el('div', { class: `msg${mine ? ' me' : ''}`, dataset: { id: m.id } }, avEl, body);
  }

  render() {
    if (!this.list) return;
    this.list.innerHTML = '';
    const list = this.messages.filter((m) => {
      if (this.query && !JSON.stringify(m).toLowerCase().includes(this.query)) return false;
      return true;
    });
    for (const m of list) this.list.append(this.bubble(m));
    this.scroll();
  }

  renderPinned() {
    const host = $('#pinned');
    if (!this.pinned) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = '';
    host.append(el('b', { text: '📌 سنجاق‌شده: ' }), el('span', { html: linkify((this.pinned.text || 'فایل').slice(0, 140)) }));
  }

  renderCounter() {
    const i = $('#unread');
    i.hidden = this.unread === 0;
    i.textContent = this.unread > 9 ? '9+' : String(this.unread);
    this.ctx.bumpTitle();
  }

  scroll() {
    if (!this.list) return;
    this.list.scrollTop = this.list.scrollHeight;
  }

  setReply(m) {
    this.reply = m;
    const bar = $('#replyBar');
    bar.hidden = !m;
    if (m) $('#replyText').textContent = `${m.name}: ${(m.text || 'فایل').slice(0, 70)}`;
    $('#chatInput').focus();
  }

  editMessage(m) {
    const bar = $('#replyBar');
    $('#replyText').textContent = 'ویرایش پیام — Enter برای ذخیره';
    bar.hidden = false;
    const ta = $('#chatInput');
    ta.value = m.text || '';
    ta.focus();
    this.setReply(null);
    const submit = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.ctx.socket.send({ t: 'chatop', op: 'edit', id: m.id, text: ta.value });
        ta.value = '';
        ta.removeEventListener('keydown', submit);
      }
    };
    ta.addEventListener('keydown', submit);
  }

  /* ───── ارسال ───── */
  send() {
    const c = this.ctx;
    const ta = $('#chatInput');
    const text = ta.value.trim();
    if (!text) return;
    const parts = splitMessage(text, 3800);
    for (const p of parts) {
      c.socket.send({ t: 'chat', m: { id: uid(), text: p, reply: this.reply?.id } });
    }
    ta.value = '';
    ta.style.height = 'auto';
    this.setReply(null);
    if (c.cc?.active) c.cc.pushLocal(text);
  }

  async handleFiles(files, { images = false } = {}) {
    const c = this.ctx;
    for (const f of files.slice(0, 8)) {
      try {
        if (/^image\//.test(f.type) && !/gif|svg/.test(f.type) && c.prefs.compressImg !== false) {
          const { dataUrl, w, h } = await compressImage(f);
          if (dataUrl.length <= LIMITS.inline * 1.35) {
            c.socket.send({ t: 'chat', m: { id: uid(), file: { n: f.name, s: dataUrl.length, mime: 'image/webp', data: dataUrl, isImage: true, w, h }, text: '' } });
            continue;
          }
        }
        if (f.size <= LIMITS.inline) {
          const data = await readAsDataURL(f);
          c.socket.send({ t: 'chat', m: { id: uid(), file: { n: f.name, s: f.size, mime: f.type, data, isImage: /^image\//.test(f.type), isAudio: /^audio\//.test(f.type) }, text: '' } });
          continue;
        }
        if (f.size > LIMITS.liveMax) {
          toast(`${f.name}: حجم بیش از ${Math.round(LIMITS.liveMax / 1024 / 1024)} مگابایت است`, 'err', 4000);
          continue;
        }
        toast(`«${f.name}» به‌صورت زنده برای حاضرین فرستاده می‌شود (${Math.round(f.size / 1024)}KB)…`, 'ok', 2600);
        const id = uid();
        this.liveFiles.push({ id, meta: { name: f.name, size: f.size }, startedAt: Date.now(), mine: true });
        this.renderFiles();
        const out = await this.sender.start(f, { id, compress: images || false });
        const item = this.liveFiles.find((x) => x.id === id);
        if (item) { item.meta.parts = out?.meta?.parts; item.done = true; item.price = f.size; }
        this.renderFiles();
        // پیام محلی در چت تا فرستنده هم ببیند (فقط در همین جلسه، ذخیره نمی‌شود)
        const url = URL.createObjectURL(f);
        this.pushLocalFile({ id, from: c.me.id, name: c.me.name, file: { n: out?.meta?.n || f.name, s: out?.meta?.s || f.size, mime: out?.meta?.mime || f.type, data: url, isImage: /^image\//.test(f.type), isAudio: /^audio\//.test(f.type) } });
      } catch (e) {
        toast(`ارسال «${f.name}» نشد: ${e.message || e}`, 'err', 4500);
      }
    }
  }

  onLiveFile(f) {
    const c = this.ctx;
    const from = f.from || 'peer';
    const sender = c.peers.get(from);
    const item = { id: f.id, meta: { name: f.name, size: f.size }, url: f.url, done: true, received: true, blob: f.blob };
    this.liveFiles.push(item);
    this.renderFiles();
    toast(`📥 فایل «${f.name}» از ${sender?.name || 'یک نفر'} رسید`, 'ok', 3000);
    this.pushLocalFile({
      id: f.id, from, name: sender?.name || 'یک نفر',
      file: { n: f.name, s: f.size, mime: f.mime, data: f.url, isImage: /^image\//.test(f.mime || ''), isAudio: /^audio\//.test(f.mime || '') },
    });
    beep('in');
    if (c.prefs.vibrate !== false) vibrate(18);
  }

  /** نمایش پیام فایلی که در تاریخچهٔ سرور نیست (فایل‌های زنده) */
  pushLocalFile({ id, from, name, file }) {
    const msg = { id: `live-${id}`, from, name, text: '', file, ts: Date.now(), live: true };
    this.messages.push(msg);
    this.byId.set(msg.id, msg);
    if (this.list) this.appendBubble(msg);
    this.scroll();
  }

  renderFiles() {
    const host = $('#fileList');
    if (!host) return;
    host.innerHTML = '';
    for (const f of this.liveFiles.slice(-40).reverse()) {
      const a = f.url ? el('a', { href: f.url, download: f.meta.name, text: 'دانلود' }) : el('span', { class: 'fine', text: f.done ? 'پایان' : '…' });
      host.append(el('div', { class: 'file-item' },
        el('span', { class: 'em', text: iconFor(f.meta.name) }),
        el('span', { class: 'grow', text: `${f.meta.name} · ${Math.max(1, Math.round((f.meta.size || 0) / 1024))}KB` }),
        a,
      ));
    }
    if (!this.liveFiles.length) host.append(el('div', { class: 'fine', text: 'هنوز فایلی ردوبدل نشده. فایل را روی کادر بالا بکشید یا دکمهٔ 📎 را بزنید.' }));
  }

  async toggleVoice() {
    const btn = $('#shotBtn');
    if (this.rec.recording) {
      const out = await this.rec.stop();
      btn.classList.remove('on');
      btn.textContent = '🎤';
      if (out && out.blob.size > 300) {
        const data = out.dataUrl;
        if (data.length < 400_000) {
          this.ctx.socket.send({ t: 'chat', m: { id: uid(), text: `🎤 پیام صوتی (${(out.ms / 1000).toFixed(0)} ثانیه)`, file: { n: `voice-${Date.now()}.webm`, s: out.blob.size, mime: out.blob.type, data, isAudio: true, d: out.ms } } });
        } else {
          const blob = out.blob;
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
          this.handleFiles([file]);
        }
      }
      return;
    }
    try {
      await this.rec.start();
      btn.classList.add('on');
      btn.textContent = '⏹';
      this.rec.on('tick', (ms) => { $('#fileProg').textContent = `⏺ ضبط… ${(ms / 1000).toFixed(1)} ثانیه`; });
      toast('در حال ضبط پیام صوتی — برای پایان دوباره بزنید', 'ok', 2200);
    } catch (e) {
      toast('دسترسی به میکروفن نشد', 'err');
    }
  }

  onSystem(text, kind) {
    this.onIncoming({ id: uid(), sys: true, text, ts: Date.now(), from: 'sys', name: 'سیستم', kind });
  }

  onTyping(m) {
    if (m.on) this.typing.set(m.id, Date.now());
    else this.typing.delete(m.id);
    this.renderTyping();
  }

  renderTyping() {
    const now = Date.now();
    const names = [...this.typing.entries()].filter(([, t]) => now - t < 3500)
      .map(([id]) => this.ctx.peers.get(id)?.name || this.ctx.messages?.get?.(id) || 'یک نفر');
    $('#typing').hidden = names.length === 0;
    $('#typing').textContent = names.length ? `${names.join('، ')} در حال نوشتن…` : '';
  }

  handleChunk(d, from) {
    if (from) d.__from = from;
    const out = this.receiver.handle(d);
    return out;
  }

  clear() {
    this.messages = [];
    this.byId.clear();
    this.list.innerHTML = '';
  }
}
