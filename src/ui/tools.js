/** ابزارهای جلسه: یادداشت، نظرسنجی، کپسول زمان، زیرنویس، خواندن متن، ترجمه،
 *  تایمر، پومودورو، کوییز، اتاق‌های موازی، ضبط، عکس، پخش صدا، Wake Lock */
import { $, $$, el, esc, toast, modal, closeModal, fmtClock, copy, download, store, uid } from '../core/util.js';
import { QUIZ } from '../core/const.js';
import { iconFor } from '../core/files.js';

export class Tools {
  constructor(ctx) {
    this.ctx = ctx;
    this.timers = [];
    this.pomodoro = null;
    this.speech = null;
    this.speaking = false;
    this.recording = null;
    this.audioShare = null;
    this.wakeLock = null;
    this.lowData = false;
  }

  mount() {
    const c = this.ctx;
    /* یادداشت مشترک */
    this.notes = $('#notes');
    this.notes.addEventListener('input', () => {
      $('#notesStat').textContent = `${this.notes.value.length} نویسه — ذخیره می‌شود…`;
      clearTimeout(this.noteT);
      this.noteT = setTimeout(() => {
        c.socket.send({ t: 'notes', text: this.notes.value });
        $('#notesStat').textContent = `${this.notes.value.length} نویسه — ذخیره شد ✅`;
      }, 500);
    });
    $('#notesCopy').onclick = () => copy(this.notes.value, 'یادداشت کپی شد');
    $('#notesMd').onclick = () => {
      const md = `# صورت‌جلسهٔ ${c.room.name} (${c.room.code})\n\n${this.notes.value}\n\n---\nتاریخ: ${new Date().toLocaleString('fa-IR')}\nاعضا: ${[...c.peers.values()].map((p) => p.name).join('، ')}\n`;
      download(URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), `notes-${c.room.code}.md`);
      toast('فایل Markdown ساخته شد', 'ok');
    };
    $('#notesClear').onclick = () => {
      if (!confirm('یادداشت پاک شود؟')) return;
      this.notes.value = '';
      c.socket.send({ t: 'notes', text: '' });
    };

    /* نظرسنجی */
    $('#pollForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#pollQ').value.trim();
      const opts = $('#pollOpts').value.split(',').map((s) => s.trim()).filter(Boolean);
      if (!q || opts.length < 2) return toast('سؤال و حداقل دو گزینه لازم است', 'warn');
      c.socket.send({ t: 'poll', op: 'add', q, options: opts, multi: $('#pollMulti').checked });
      $('#pollQ').value = '';
      $('#pollOpts').value = '';
    });

    /* کپسول زمان */
    $('#capAdd').onclick = () => {
      const text = $('#capText').value.trim();
      if (!text) return;
      const when = $('#capWhen').value;
      const to = $('#capTo').value.trim() || 'همه';
      const at = when === 'tomorrow' ? Date.now() + 24 * 3600_000 : when === 'manual' ? 0 : Date.now() + Number(when) * 60_000;
      this.capsules = [...(this.capsules || []), { id: uid(), text, to, at, opened: false, by: c.me.name }];
      c.socket.send({ t: 'chat', m: { id: uid(), text: `⏳ پیام به آینده از ${c.me.name}${to !== 'همه' ? ` برای ${to}` : ''} ثبت شد${at ? ` (باز شدن: ${new Date(at).toLocaleTimeString('fa-IR')})` : ''}` } });
      $('#capText').value = '';
      this.renderCapsules();
      if (at) setTimeout(() => this.openCapsule(this.capsules[this.capsules.length - 1]), Math.max(2000, at - Date.now()));
    };

    /* ابزارها */
    $('#tMic').onclick = () => c.toggleMic();
    $('#tCam').onclick = () => c.toggleCam();
    $('#tScreen').onclick = () => c.toggleScreen();
    $('#tBoard').onclick = () => c.toggleBoard();
    $('#tRec').onclick = () => this.toggleRecording();
    $('#tSnap').onclick = () => this.snapStage();
    $('#tShot').onclick = () => this.snapCamera();
    $('#tAudio').onclick = () => this.pickAudioFile();
    $('#tBlur').onclick = () => this.setFx('blur');
    $('#tVbg').onclick = () => this.setFx('vbg');
    $('#tCc').onclick = () => this.toggleCC();
    $('#tTts').onclick = () => this.toggleAutoTTS();
    $('#tTrans').onclick = () => this.translateLast();
    $('#tNoise').onclick = () => this.toggleNoise();
    $('#tTimer').onclick = () => this.sessionTimer();
    $('#tPomo').onclick = () => this.startPomodoro();
    $('#tQuiz').onclick = () => this.quiz();
    $('#tRooms').onclick = () => this.breakout();
    $('#tRaise').onclick = () => c.toggleHand();
    $('#tReact').onclick = () => c.react();
    $('#tWake').onclick = () => this.toggleWakeLock();
    $('#tLow').onclick = () => this.toggleLowData();
    $('#tPip').onclick = () => this.pip();
    $('#tFull').onclick = () => this.fullscreen();

    // ضبط: فایل آماده‌شده را یک‌بار برای همیشه مدیریت می‌کنیم
    c.media.on('recording', ({ blob, url }) => this.downloadRecording(blob, url));

    $('#ccCopy').onclick = () => copy($('#transcript').innerText, 'زیرنویس کپی شد');
    $('#ccClear').onclick = () => { $('#transcript').innerHTML = ''; this.lines = []; };
  }

  /* ── پنل‌ها: نظرسنجی، عکس استیج، کپسول ── */
  renderPoll(poll) {
    this.poll = poll;
    const host = $('#pollWrap');
    host.innerHTML = '';
    const isHost = this.ctx.isHost();
    $('#pollForm').hidden = !isHost || !!poll;
    if (!poll) {
      host.append(el('div', { class: 'fine', text: isHost ? 'نظرسنجی تازه‌ای بسازید.' : 'میزبان هنوز نظرسنجی نساخته است.' }));
      return;
    }
    const total = Object.values(poll.votes || {}).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0) || 0;
    host.append(el('h4', { text: poll.q }));
    poll.opts.forEach((o, i) => {
      const n = Object.values(poll.votes || {}).filter((v) => (v || []).includes(i)).length;
      const pct = total ? Math.round((n / total) * 100) : 0;
      host.append(el('label', { class: 'poll-opt', onclick: () => poll.open !== false && this.ctx.socket.send({ t: 'poll', op: 'vote', i }) },
        el('span', { text: `${o} (${n})`, style: { minWidth: '38%', fontSize: '.84rem' } }),
        el('span', { class: 'poll-bar' }, el('i', { style: { width: `${pct}%` } })),
        el('small', { class: 'fine', text: `${pct}%` }),
      ));
    });
    host.append(el('div', { class: 'fine', text: `مجموع آرا: ${total}${poll.open === false ? ' — بسته شده' : ''}` }));
    if (isHost) {
      host.append(el('div', { class: 'row' },
        el('button', { class: 'btn xs', text: poll.open === false ? 'بازکردن' : 'بستن', onclick: () => this.ctx.socket.send({ t: 'poll', op: poll.open === false ? 'add' : 'close', q: poll.q, options: poll.opts }) }),
        el('button', { class: 'btn xs danger', text: 'حذف نظرسنجی', onclick: () => this.ctx.socket.send({ t: 'poll', op: 'clear' }) }),
      ));
    }
  }

  renderCapsules() {
    const host = $('#capList');
    host.innerHTML = '';
    for (const c of (this.capsules || []).slice().reverse()) {
      host.append(el('div', { class: 'cap' },
        el('b', { text: c.opened ? '✅ ' : c.at ? '⏳ ' : '🔓 ' }),
        el('span', { text: `${c.by} → ${c.to}: ${c.text.slice(0, 80)}` }),
        el('div', { class: 'fine', text: c.at ? `باز شدن: ${new Date(c.at).toLocaleString('fa-IR')}` : 'دستی باز می‌شود' }),
        !c.opened && !c.at ? el('button', { class: 'btn xs', text: 'باز کن', onclick: () => this.openCapsule(c) }) : null,
      ));
    }
  }

  openCapsule(c) {
    c.opened = true;
    this.renderCapsules();
    this.ctx.socket.send({ t: 'chat', m: { id: uid(), text: `⏳ پیامِ آینده برای ${c.to} باز شد:\n${c.text}` } });
    modal({ title: '⏳ پیام به آینده', html: `<b>${esc(c.by)} → ${esc(c.to)}</b><p>${esc(c.text)}</p>`, actions: [{ label: 'باشه', kind: 'primary' }] });
  }

  /* ── ضبط جلسه ── */
  toggleRecording() {
    const c = this.ctx;
    if (this.recording) {
      this.recording.stop();
      this.recording = null;
      $('#tRec').classList.remove('on');
      $('#recPill').hidden = true;
      toast('ضبط پایان یافت و فایل آماده شد', 'ok');
      return;
    }
    const els = [...document.querySelectorAll('#stage video')].filter((v) => v.srcObject);
    c.media.recordingSources = [
      ...(c.media.micTrack ? [new MediaStream([c.media.micTrack])] : []),
      ...[...c.peers.values()].flatMap((p) => [p.streams.cam, p.streams.mic, p.streams.screen, p.streams.screenA]).filter((s) => s && s.getAudioTracks().length),
    ];
    this.recording = c.media.startRecording(els, { fps: 6 });
    $('#tRec').classList.add('on');
    $('#recPill').hidden = false;
    toast('ضبط شروع شد (تصویر کارت‌ها + صدای همه)', 'ok', 2600);
  }

  downloadRecording(blob, url) {
    modal({
      title: '⏺ ضبط جلسه آماده است',
      html: `<p>حجم: ${(blob.size / 1024 / 1024).toFixed(2)} مگابایت — فرمت WebM</p><video src="${url}" controls style="width:100%;border-radius:10px"></video>`,
      actions: [
        { label: '⬇ دانلود', kind: 'primary', onClick: () => { download(url, `hamkalam-${this.ctx.room.code}-${Date.now()}.webm`); return false; } },
        { label: 'فرستادن در چت (اگر کوچک است)', onClick: async () => {
          if (blob.size > 15 * 1024 * 1024) { toast('فایل بزرگ است؛ دانلودش کنید', 'warn'); return false; }
          const f = new File([blob], `recording-${Date.now()}.webm`, { type: 'video/webm' });
          await this.ctx.chat.handleFiles([f]);
          return false;
        } },
      ],
    });
  }

  /* ── عکس ── */
  snapStage() {
    const els = [...document.querySelectorAll('#stage video')].filter((v) => v.videoWidth);
    if (!els.length) return toast('چیزی برای عکس‌گرفتن نیست', 'warn');
    const cols = Math.ceil(Math.sqrt(els.length));
    const rows = Math.ceil(els.length / cols);
    const tw = 640;
    const th = 360;
    const cv = document.createElement('canvas');
    cv.width = cols * tw;
    cv.height = rows * th;
    const g = cv.getContext('2d');
    g.fillStyle = '#05070f';
    g.fillRect(0, 0, cv.width, cv.height);
    els.forEach((v, i) => {
      const x = (i % cols) * tw;
      const y = Math.floor(i / cols) * th;
      const r = Math.min(tw / v.videoWidth, th / v.videoHeight);
      const w = v.videoWidth * r;
      const h = v.videoHeight * r;
      g.drawImage(v, x + (tw - w) / 2, y + (th - h) / 2, w, h);
    });
    const url = cv.toDataURL('image/jpeg', 0.85);
    download(url, `snapshot-${this.ctx.room.code}-${Date.now()}.jpg`);
    toast('عکس از استیج گرفته شد', 'ok');
  }

  async snapCamera() {
    const url = await this.ctx.media.snapshotFromTrack(this.ctx.media.rawCamTrack, { w: 1280 });
    if (!url) return toast('دوربین روشن نیست', 'warn');
    const file = new File([await (await fetch(url)).blob()], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    await this.ctx.chat.handleFiles([file], { images: true });
  }

  /* ── پخش صدا از سیستم به داخل جلسه ── */
  pickAudioFile() {
    const inp = el('input', { type: 'file', accept: 'audio/*', hidden: true });
    document.body.append(inp);
    inp.onchange = async () => {
      const f = inp.files[0];
      inp.remove();
      if (!f) return;
      if (this.audioShare) this.stopAudioShare();
      const ctx = this.ctx.media.audioCtx();
      const audio = new Audio(URL.createObjectURL(f));
      audio.loop = false;
      const src = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = 0.9;
      const dest = ctx.createMediaStreamDestination();
      src.connect(gain).connect(dest);
      if (this.ctx.media.micTrack) {
        try {
          const micSrc = ctx.createMediaStreamSource(new MediaStream([this.ctx.media.micTrack]));
          micSrc.connect(dest);
        } catch { /* ignore */ }
      }
      await this.ctx.sendMicTrack(dest.stream.getAudioTracks()[0]);
      audio.onended = () => this.stopAudioShare();
      await audio.play().catch(() => toast('اجرای صدا ممکن نشد', 'err'));
      this.audioShare = { audio, dest, src };
      $('#tAudio').classList.add('on');
      toast(`🎵 «${f.name}» برای همه پخش می‌شود`, 'ok');
    };
    inp.click();
  }

  async stopAudioShare() {
    if (!this.audioShare) return;
    try { this.audioShare.audio.pause(); } catch { /* ignore */ }
    try { this.audioShare.src.disconnect(); } catch { /* ignore */ }
    this.audioShare = null;
    await this.ctx.sendMicTrack(this.ctx.media.micTrack);
    $('#tAudio').classList.remove('on');
    toast('پخش صدا متوقف شد', 'ok', 1500);
  }

  /* ── افکت‌های تصویری ── */
  async setFx(mode) {
    const cur = this.ctx.media.fx.mode;
    const next = cur === mode ? 'none' : mode;
    try {
      await this.ctx.media.setFx(next);
      $$('#tools .tool').forEach((b) => b.classList.remove('on'));
      if (next === 'blur') $('#tBlur').classList.add('on');
      if (next === 'vbg') $('#tVbg').classList.add('on');
      toast(next === 'none' ? 'افکت برداشته شد' : next === 'blur' ? 'محو اطراف فعال شد' : 'پس‌زمینهٔ مجازی فعال شد', 'ok');
    } catch (e) {
      toast('افکت اعمال نشد (دوربین روشن است؟)', 'err');
    }
  }

  /* ── زیرنویس خودکار ── */
  toggleCC() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast('مرورگر شما تشخیص گفتار را پشتیبانی نمی‌کند (کروم اندروید/دسکتاپ)', 'err', 4200);
    const c = this.ctx;
    this.lines = this.lines || [];
    if (c.cc?.active) {
      c.cc.active = false;
      try { this.speech?.stop(); } catch { /* ignore */ }
      $('#transcriptWrap').hidden = true;
      $('#tCc').classList.remove('on');
      toast('زیرنویس خاموش شد', 'ok', 1500);
      return;
    }
    const rec = new SR();
    rec.lang = c.prefs.sttLang || 'fa-IR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      let finalText = '';
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += t;
        else interim += t;
      }
      $('#transcriptWrap').hidden = false;
      if (interim) this.pushLine(c.me.name, interim, true);
      if (finalText.trim()) {
        this.pushLine(c.me.name, finalText.trim(), false);
        c.socket.send({ t: 'sub', text: finalText.trim(), name: c.me.name });
      }
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech') toast(`زیرنویس: ${e.error}`, 'warn');
    };
    rec.onend = () => { if (c.cc?.active) setTimeout(() => { try { rec.start(); } catch { /* ignore */ } }, 800); };
    try {
      rec.start();
      this.speech = rec;
      c.cc = { active: true, pushLocal: () => {}, pushRemote: (n, t) => this.pushLine(n, t, false) };
      $('#tCc').classList.add('on');
      $('#transcriptWrap').hidden = false;
      toast('زیرنویس روشن شد — فارسی تشخیص داده می‌شود', 'ok', 2600);
    } catch {
      toast('شروع زیرنویس نشد', 'err');
    }
  }

  pushLine(name, text, interim) {
    const host = $('#transcript');
    const cls = interim ? 'interim' : '';
    const last = host.lastElementChild;
    if (last && last.dataset.interim === '1') last.remove();
    host.append(el('div', { dataset: { interim: interim ? '1' : '0' }, class: cls },
      el('span', { text: `${name}: ` }), el('span', { text })));
    host.scrollTop = host.scrollHeight;
    this.lines = this.lines || [];
    this.lines.push(`${name}: ${text}`);
  }

  /* ── خواندن متن (TTS) ── */
  speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text.slice(0, 400));
      u.lang = this.ctx.prefs.sttLang || 'fa-IR';
      u.rate = 1;
      const voices = speechSynthesis.getVoices();
      const v = voices.find((x) => x.lang.startsWith('fa')) || voices.find((x) => x.lang.startsWith('en'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  toggleAutoTTS() {
    this.ctx.prefs.ttsAuto = !this.ctx.prefs.ttsAuto;
    this.ctx.savePrefs();
    $('#tTts').classList.toggle('on', this.ctx.prefs.ttsAuto);
    toast(this.ctx.prefs.ttsAuto ? 'خواندن پیام‌های تازه روشن شد' : 'خاموش شد', 'ok', 1800);
  }

  /* ── ترجمه ── */
  async translate(text, from = 'auto', to = 'fa') {
    const q = encodeURIComponent(text.slice(0, 900));
    const urls = [
      `https://api.mymemory.translated.net/get?q=${q}&langpair=${from === 'auto' ? 'fa' : from}|${to}`,
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${q}`,
    ];
    for (const u of urls) {
      try {
        const r = await fetch(u);
        const j = await r.json();
        if (j.responseData?.translatedText) return j.responseData.translatedText;
        if (Array.isArray(j?.[0])) return j[0].map((x) => x[0]).join('');
      } catch { /* بعدی */ }
    }
    throw new Error('سرویس ترجمه در دسترس نیست (ممکن است فیلتر باشد)');
  }

  async translateLast() {
    const last = [...this.ctx.chat.messages].reverse().find((m) => m.text && !m.file);
    if (!last) return toast('پیامی برای ترجمه نیست', 'warn');
    toast('در حال ترجمه…', 'ok', 1500);
    try {
      const out = await this.translate(last.text);
      modal({ title: '🌐 ترجمه', html: `<b>${esc(last.name)}</b><p>${esc(last.text)}</p><hr><p><b>ترجمه:</b><br>${esc(out)}</p>`, actions: [{ label: '📋 کپی ترجمه', onClick: () => copy(out) }] });
    } catch (e) {
      toast(e.message, 'err', 4000);
    }
  }

  /* ── نویزکشی ── */
  async toggleNoise() {
    const on = !this.ctx.media.noise;
    await this.ctx.media.setNoise(on);
    $('#tNoise').classList.toggle('on', on);
    toast(on ? 'نویزکشی روشن شد' : 'نویزکشی خاموش شد', 'ok', 1800);
  }

  /* ── تایمرها ── */
  sessionTimer() {
    if (this.timerOpen) return;
    this.timerOpen = true;
    const body = modal({
      title: '⏲ تایمر جلسه',
      html: `<p id="timerNow" class="stat">00:00</p><div class="row"><input type="number" id="timerSec" min="5" max="7200" value="300" /><button class="btn sm" id="timerSet">شروع</button><button class="btn sm ghost" id="timerStop">توقف</button></div><p class="fine">هنگام پایان، صدا و پیام در چت می‌آید.</p>`,
      actions: [{ label: 'بستن' }],
    });
    const started = Date.now();
    const tick = setInterval(() => {
      const nowEl = body.querySelector('#timerNow');
      if (nowEl) nowEl.textContent = fmtClock(Date.now() - started);
    }, 1000);
    body.querySelector('#timerSet').onclick = () => {
      const sec = Number(body.querySelector('#timerSec').value) || 300;
      this.countdown(sec, () => this.ctx.chat.onSystem(`⏲ زمان ${fmtClock(sec * 1000)} تمام شد!`));
    };
    body.querySelector('#timerStop').onclick = () => { clearInterval(tick); this.timerOpen = false; toast('تایمر بسته شد', 'ok', 1200); };
  }

  countdown(sec, done) {
    clearTimeout(this.cdTimer);
    toast(`⏲ شمارش معکوس ${fmtClock(sec * 1000)} شروع شد`, 'ok', 2000);
    this.cdTimer = setTimeout(() => { done?.(); this.ctx.media.emit('beep'); }, sec * 1000);
  }

  startPomodoro() {
    const body = modal({
      title: '🍅 پومودورو',
      html: `<p id="pomoNow" class="stat">۲۵:۰۰</p><p class="fine">۲۵ دقیقه کار، ۵ دقیقه استراحت. بعد از هر دوره، اتاق خبردار می‌شود.</p>`,
      actions: [{ label: 'توقف', onClick: () => { clearInterval(this.pomoTimer); return false; } }, { label: 'بستن' }],
    });
    let left = 25 * 60;
    let work = true;
    const upd = () => { body.querySelector('#pomoNow').textContent = fmtClock(left * 1000); };
    clearInterval(this.pomoTimer);
    this.pomoTimer = setInterval(() => {
      left--;
      upd();
      if (left <= 0) {
        if (work) {
          this.ctx.chat.onSystem('🍅 وقت استراحت ۵ دقیقه‌ای شد!');
          this.speak('وقت استراحت است');
          left = 5 * 60;
        } else {
          this.ctx.chat.onSystem('🍅 استراحت تمام شد — برگردیم به کار');
          this.speak('استراحت تمام شد');
          left = 25 * 60;
        }
        work = !work;
      }
    }, 1000);
    upd();
    $('#tPomo').classList.add('on');
  }

  /* ── کوییز ── */
  quiz() {
    const item = QUIZ[Math.floor(Math.random() * QUIZ.length)];
    const opts = [...item.a].sort(() => Math.random() - 0.5);
    modal({
      title: '❓ کوییز سریع',
      html: `<h4>${esc(item.q)}</h4><div class="row" id="quizOpts">${opts.map((o) => `<button class="btn" data-a="${esc(o)}">${esc(o)}</button>`).join('')}</div>`,
      onOpen: (body) => {
        body.querySelectorAll('#quizOpts button').forEach((b) => {
          b.onclick = () => {
            const right = b.dataset.a === item.a[item.i];
            b.style.borderColor = right ? 'var(--ok)' : 'var(--danger)';
            toast(right ? '✅ آفرین، درست!' : `❌ درستش: ${item.a[item.i]}`, right ? 'ok' : 'err', 3000);
            this.ctx.chat.onSystem(`❓ کوییز: ${this.ctx.me.name} ${right ? 'درست' : 'نادرست'} جواب داد (${item.q})`);
            setTimeout(closeModal, 1200);
          };
        });
      },
    });
  }

  /* ── اتاق‌های موازی ── */
  breakout() {
    const c = this.ctx;
    const n = Number(c.room.maxP) || 4;
    modal({
      title: '🧩 اتاق‌های موازی',
      html: `<p class="fine">برای کار گروهی، هر شعبه یک اتاق مستقل با لینک خودش است (همان تنظیمات رمز و عمر).</p>
        <div class="row">${[1, 2, 3, 4, 5].map((i) => `<button class="btn" data-i="${i}">شعبهٔ ${i} — ${c.room.code}-${i}</button>`).join('')}</div>`,
      onOpen: (body) => {
        body.querySelectorAll('[data-i]').forEach((b) => {
          b.onclick = () => {
            const url = `${location.origin}/r/${c.room.code}-${b.dataset.i}`;
            window.open(url, '_blank');
            copy(url, `لینک شعبهٔ ${b.dataset.i} کپی شد`);
          };
        });
      },
    });
  }

  /* ── Wake Lock ── */
  async toggleWakeLock() {
    try {
      if (this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
        $('#tWake').classList.remove('on');
        toast('بیدارباش اتاق خاموش شد', 'ok', 1500);
        return;
      }
      if (!navigator.wakeLock) throw new Error('پشتیبانی نمی‌شود');
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { $('#tWake').classList.remove('on'); });
      $('#tWake').classList.add('on');
      toast('بیدارباش فعال شد — صفحه خواب نمی‌رود 😴🚫', 'ok', 2200);
    } catch (e) {
      toast('بیدارباش در این مرورگر ممکن نیست', 'warn', 3000);
    }
  }

  /* ── حالت داده‌کم ── */
  toggleLowData() {
    this.lowData = !this.lowData;
    this.ctx.setIncomingVideo(!this.lowData);
    if (this.lowData) {
      this.ctx.setProfile('lite', { silent: true });
      toast('🪫 حالت داده‌کم: ویدئوهای دریافتی متوقف شد', 'warn', 3500);
    } else {
      this.ctx.setProfile('normal', { silent: true });
      toast('حالت داده‌کم خاموش شد', 'ok', 2000);
    }
    $('#tLow').classList.toggle('on', this.lowData);
  }

  /* ── تصویر در تصویر / تمام‌صفحه ── */
  async pip() {
    const v = document.querySelector('#stage video:not([muted])') || document.querySelector('#stage video');
    if (!v || !document.pictureInPictureEnabled) return toast('تصویر در تصویر پشتیبانی نمی‌شود', 'warn');
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      toast('نشد! (بعضی مرورگرها فقط یک ویدئو را می‌پذیرند)', 'warn', 3000);
    }
  }

  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => toast('تمام‌صفحه ممکن نشد', 'warn'));
  }

  /* ── نمایش پیشرفت انتقال فایل ── */
  fileBadge() {
    const items = this.ctx.chat.receiver.list();
    return items.length ? `${items.length} فایل در حال دریافت` : '';
  }
}
