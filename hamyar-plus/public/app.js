/* همیار پلاس — هستهٔ واحد سایت، APK و EXE
   آنلاین باشد: بانک سوال از سایت تازه می‌شود؛ آفلاین باشد: نسخهٔ لوکالِ داخل برنامه کار می‌کند. */
'use strict';
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hp-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('hp-' + k, JSON.stringify(v)); } catch { /* حافظه پر است */ } },
  };
  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); };

  /* ---------- داده: اول لوکال (فوری و آفلاین)، بعد تازه‌سازی از سایت ---------- */
  let CAT = window.__HAMYAR_CATALOG__;
  const cached = store.get('catalog', null);
  if (cached && CAT && (cached.version > CAT.version || (cached.version === CAT.version && cached.updatedAt > CAT.updatedAt))) CAT = cached;
  if (!CAT) { document.getElementById('view').innerHTML = '<div class="empty">⚠️ بانک محتوا پیدا نشد. فایل data/catalog.js باید کنار برنامه باشد.</div>'; return; }

  let byId = {};
  const rebuildIndex = () => {
    byId = { subject: new Map(), lesson: new Map(), grade: new Map() };
    CAT.grades.forEach((g) => byId.grade.set(g.id, g));
    CAT.subjects.forEach((s) => byId.subject.set(s.id, s));
    CAT.lessons.forEach((l) => byId.lesson.set(l.id, l));
  };
  rebuildIndex();

  const siteOrigin = () => {
    const saved = store.get('siteOrigin', '');
    if (saved) return saved;
    if (window.HAMYAR_CONFIG?.siteOrigin) return window.HAMYAR_CONFIG.siteOrigin;
    if (/^https?:$/.test(location.protocol)) return location.origin;
    return '';
  };

  let online = false;
  function setBadge() {
    const b = $('#netBadge');
    if (online) { b.textContent = '🟢 متصل به سایت'; b.className = 'net-badge online'; b.title = 'نسخهٔ تازه از سایت گرفته می‌شود: ' + siteOrigin(); }
    else { b.textContent = '📦 حالت لوکال'; b.className = 'net-badge local'; b.title = 'بدون اینترنت هم همه‌چیز کار می‌کند'; }
  }

  async function refreshFromSite(silent = true) {
    const origin = siteOrigin();
    if (!origin) { online = false; setBadge(); return false; }
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const res = await fetch(origin + '/api/catalog', { signal: ctl.signal, headers: { accept: 'application/json' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const fresh = await res.json();
      online = true;
      if (fresh.app === 'hamyar-plus' && (fresh.version > CAT.version || (fresh.version === CAT.version && fresh.updatedAt > CAT.updatedAt))) {
        CAT = fresh; rebuildIndex(); store.set('catalog', fresh);
        toast('✨ بانک سوال‌ها از سایت به‌روز شد');
        render();
      }
      setBadge();
      return true;
    } catch {
      online = false; setBadge();
      if (!silent) toast('📴 به سایت وصل نشدیم؛ نسخهٔ لوکال فعال است، نگران نباش!');
      return false;
    }
  }
  setInterval(() => refreshFromSite(true), 5 * 60 * 1000);
  addEventListener('online', () => refreshFromSite(true));
  addEventListener('offline', () => { online = false; setBadge(); });

  /* ---------- پوسته و فونت ---------- */
  const themeBtn = $('#themeBtn');
  const applyTheme = () => { document.documentElement.dataset.theme = store.get('theme', 'dark'); themeBtn.textContent = store.get('theme', 'dark') === 'dark' ? '🌙' : '☀️'; };
  themeBtn.addEventListener('click', () => { store.set('theme', store.get('theme', 'dark') === 'dark' ? 'light' : 'dark'); applyTheme(); });
  applyTheme();
  document.documentElement.style.setProperty('--fs', store.get('fontSize', 16) + 'px');

  /* ---------- پیشرفت، علاقه‌مندی، اخیرها ---------- */
  const done = new Set(store.get('done', []));
  const favs = new Set(store.get('favs', []));
  const saveSets = () => { store.set('done', [...done]); store.set('favs', [...favs]); };
  const pushRecent = (id) => { const r = [id, ...store.get('recent', []).filter((x) => x !== id)].slice(0, 6); store.set('recent', r); };
  const gradeProgress = (gid) => {
    const ls = CAT.lessons.filter((l) => l.grade === gid);
    const d = ls.filter((l) => done.has(l.id)).length;
    return { d, total: ls.length, pct: ls.length ? Math.round((d / ls.length) * 100) : 0 };
  };

  /* ---------- جستجو ---------- */
  const norm = (s) => String(s).toLowerCase().replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/‌/g, ' ');
  function search(q, limit = 30) {
    q = norm(q).trim(); if (q.length < 2) return [];
    const words = q.split(/\s+/);
    const score = (text) => { const t = norm(text); return words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0); };
    const out = [];
    for (const l of CAT.lessons) {
      const subject = byId.subject.get(l.subject);
      let sc = score(l.title) * 4 + score(subject.title) * 3 + score(l.summary) * 2;
      let hitQa = null;
      for (const item of l.qa) { const s = score(item.q) * 3 + score(item.a); if (s) { sc += s; hitQa = item; break; } }
      if (sc) out.push({ lesson: l, subject, sc, hitQa });
    }
    return out.sort((a, b) => b.sc - a.sc).slice(0, limit);
  }

  const searchInput = $('#searchInput'); const live = $('#liveResults');
  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const r = search(searchInput.value, 8);
      if (!r.length) { live.hidden = true; return; }
      live.innerHTML = r.map(({ lesson, subject }) => `<a href="#/lesson/${lesson.id}">${subject.emoji} ${esc(lesson.title)}<small>${esc(byId.grade.get(lesson.grade).title)} · ${esc(subject.title)}</small></a>`).join('') + `<a href="#/search/${encodeURIComponent(searchInput.value)}"><b>دیدن همهٔ نتیجه‌ها ←</b></a>`;
      live.hidden = false;
    }, 160);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.searchbar')) live.hidden = true; });
  live.addEventListener('click', () => { live.hidden = true; });
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); if (searchInput.value.trim()) location.hash = '#/search/' + encodeURIComponent(searchInput.value.trim()); live.hidden = true; });

  /* ---------- کامپوننت‌ها ---------- */
  const lessonCard = (l) => {
    const s = byId.subject.get(l.subject);
    return `<a class="card" style="--accent:${s.color}" href="#/lesson/${l.id}">
      <div class="emoji">${s.emoji}</div><h3>${esc(l.title)} ${done.has(l.id) ? '✅' : ''}</h3>
      <p>${esc(byId.grade.get(l.grade).title)} · ${esc(s.title)} · ${fa(l.qa.length)} پرسش و پاسخ</p></a>`;
  };

  /* ---------- نماها ---------- */
  const views = {};
  views.home = () => {
    const totalQa = CAT.lessons.reduce((n, l) => n + l.qa.length, 0);
    const myGrade = store.get('myGrade', 0);
    const recent = store.get('recent', []).map((id) => byId.lesson.get(id)).filter(Boolean);
    const favList = [...favs].map((id) => byId.lesson.get(id)).filter(Boolean).slice(0, 4);
    return `<div class="fade-in">
      <section class="hero">
        <h1>جواب همهٔ درس‌ها،<br><span class="grad">از اول دبستان تا دوازدهم 🎓</span></h1>
        <p>گام‌به‌گام، جواب فعالیت و تمرین و کار در کلاس — با توضیح ساده، بدون تبلیغ و شلوغ‌کاری. پایه‌ات را انتخاب کن و شروع کن؛ حتی بدون اینترنت!</p>
        <div class="stats">
          <div class="stat"><b>${fa(CAT.grades.length)}</b><span>پایه تحصیلی</span></div>
          <div class="stat"><b>${fa(CAT.subjects.length)}</b><span>کتاب درسی</span></div>
          <div class="stat"><b>${fa(CAT.lessons.length)}</b><span>فصل و درس</span></div>
          <div class="stat"><b>${fa(totalQa)}</b><span>پرسش و پاسخ</span></div>
          <div class="stat"><b>${fa(done.size)}</b><span>درسِ تمام‌کردهٔ تو</span></div>
        </div>
        <div class="row-actions" style="justify-content:center">
          ${myGrade ? `<a class="btn primary" href="#/grade/${myGrade}">🚀 ادامه بده: ${esc(byId.grade.get(myGrade)?.title || '')}</a>` : `<a class="btn primary" href="#/grades">🚀 شروع یادگیری</a>`}
          <a class="btn" href="#/quiz">🎯 از خودم آزمون بگیر</a>
        </div>
      </section>
      ${recent.length ? `<h2 class="sec">⏱️ ادامهٔ مطالعه</h2><div class="grid wide">${recent.map(lessonCard).join('')}</div>` : ''}
      <h2 class="sec">🎒 انتخاب پایه تحصیلی</h2>
      <div class="grid">${CAT.grades.map((g) => { const p = gradeProgress(g.id); return `<a class="card" href="#/grade/${g.id}"><div class="emoji">${g.emoji}</div><h3>${esc(g.title)}</h3><p>${esc(g.stage)} · ${fa(g.subjects.length)} درس · ${fa(p.total)} فصل</p>${p.d ? `<div class="progress"><i style="width:${p.pct}%"></i></div><p>پیشرفت تو: ${fa(p.pct)}٪</p>` : ''}</a>`; }).join('')}</div>
      ${favList.length ? `<h2 class="sec">⭐ نشان‌کرده‌ها</h2><div class="grid wide">${favList.map(lessonCard).join('')}</div>` : ''}
      <h2 class="sec">✨ چرا همیار پلاس؟</h2>
      <div class="grid wide">
        <div class="card"><div class="emoji">📴</div><h3> کاملاً آفلاین</h3><p>همهٔ درس‌ها داخل برنامه است؛ در مترو، روستا یا موقع قطعی اینترنت هم درس‌هایت همراهت است.</p></div>
        <div class="card"><div class="emoji">🎯</div><h3>آزمون از خودت</h3><p>از هر پایه‌ای سوال تصادفی بپرس، خودت را تصحیح کن و رکورد بزن.</p></div>
        <div class="card"><div class="emoji">🔎</div><h3>جستجوی همه‌جا</h3><p>یه کلمه بنویس؛ بین همهٔ فصل‌ها و جواب‌ها برات پیدا می‌کند.</p></div>
        <div class="card"><div class="emoji">☁️</div><h3>همگام با سایت</h3><p>هر وقت نت داشتی، بانک سوال‌ها خودکار از سایت تازه می‌شود.</p></div>
      </div>
    </div>`;
  };

  views.grades = () => `<div class="fade-in"><h2 class="sec">🎒 همهٔ پایه‌ها (اول تا دوازدهم)</h2>
    <div class="grid">${CAT.grades.map((g) => { const p = gradeProgress(g.id); return `<a class="card" href="#/grade/${g.id}"><div class="emoji">${g.emoji}</div><h3>${esc(g.title)}</h3><p>${esc(g.stage)} · ${fa(g.subjects.length)} درس</p>${p.d ? `<div class="progress"><i style="width:${p.pct}%"></i></div><p>${fa(p.pct)}٪ خوانده‌ای</p>` : ''}</a>`; }).join('')}</div></div>`;

  views.grade = (gid, field = '') => {
    const g = byId.grade.get(+gid); if (!g) return '<div class="empty">پایه پیدا نشد 😕</div>';
    store.set('myGrade', g.id);
    const subjects = g.subjects.map((id) => byId.subject.get(id));
    const fields = [...new Set(subjects.map((s) => s.field).filter(Boolean))];
    const shown = field ? subjects.filter((s) => !s.field || s.field.includes(field)) : subjects;
    const p = gradeProgress(g.id);
    return `<div class="fade-in">
      <div class="crumbs"><a href="#/">خانه</a> ← <a href="#/grades">پایه‌ها</a> ← ${esc(g.title)}</div>
      <div class="panel"><h1>${g.emoji} ${esc(g.title)} <small class="muted" style="font-size:.6em">(${esc(g.stage)})</small></h1>
      <p class="muted">${fa(subjects.length)} درس · ${fa(p.total)} فصل — هر کتابی رو که می‌خوای انتخاب کن، جواب همهٔ فعالیت‌ها و تمرین‌هاش آنجاست.</p>
      ${p.d ? `<div class="progress"><i style="width:${p.pct}%"></i></div><p class="muted">پیشرفت تو در این پایه: ${fa(p.d)} از ${fa(p.total)} فصل (${fa(p.pct)}٪)</p>` : ''}
      ${fields.length ? `<div class="chips"><a class="chip ${!field ? 'on' : ''}" href="#/grade/${g.id}">همه رشته‌ها</a>${fields.map((f) => `<a class="chip ${field === f ? 'on' : ''}" href="#/grade/${g.id}/${encodeURIComponent(f)}">${esc(f)}</a>`).join('')}</div>` : ''}
      </div>
      <div class="grid wide">${shown.map((s) => `<a class="card" style="--accent:${s.color}" href="#/subject/${s.id}"><div class="emoji">${s.emoji}</div><h3>${esc(s.title)}</h3><p>${fa(s.lessons.length)} فصل/درس${s.field ? ' · ' + esc(s.field) : ' · عمومی'}</p></a>`).join('')}</div>
    </div>`;
  };

  views.subject = (sid) => {
    const s = byId.subject.get(sid); if (!s) return '<div class="empty">درس پیدا نشد 😕</div>';
    const g = byId.grade.get(s.grade);
    return `<div class="fade-in">
      <div class="crumbs"><a href="#/">خانه</a> ← <a href="#/grade/${g.id}">${esc(g.title)}</a> ← ${esc(s.title)}</div>
      <div class="panel" style="border-top:5px solid ${s.color}"><h1>${s.emoji} گام‌به‌گام ${esc(s.title)} ${esc(g.title.replace('پایه ', ''))}</h1>
      <p class="muted">فصل یا درس را انتخاب کن؛ داخل هر فصل خلاصهٔ درس، نکات مهم و جواب همهٔ پرسش‌ها با توضیح هست.</p></div>
      <div class="list">${s.lessons.map((id) => { const l = byId.lesson.get(id); return `<a class="list-item" href="#/lesson/${l.id}"><span><b>${fa(l.no)}. ${esc(l.title)}</b><small>${fa(l.qa.length)} پرسش و پاسخ ${done.has(l.id) ? '· ✅ خوانده شد' : ''}</small></span><span>←</span></a>`; }).join('')}</div>
      <div class="row-actions"><a class="btn primary" href="#/quiz/${s.grade}/${s.id}">🎯 آزمون از همین درس</a></div>
    </div>`;
  };

  views.lesson = (lid) => {
    const l = byId.lesson.get(lid); if (!l) return '<div class="empty">فصل پیدا نشد 😕</div>';
    const s = byId.subject.get(l.subject); const g = byId.grade.get(l.grade);
    pushRecent(l.id);
    const idx = s.lessons.indexOf(l.id);
    const prev = s.lessons[idx - 1]; const next = s.lessons[idx + 1];
    const isFav = favs.has(l.id); const isDone = done.has(l.id);
    return `<div class="fade-in">
      <div class="crumbs"><a href="#/">خانه</a> ← <a href="#/grade/${g.id}">${esc(g.title)}</a> ← <a href="#/subject/${s.id}">${esc(s.title)}</a> ← ${esc(l.title)}</div>
      <article class="panel" style="border-top:5px solid ${s.color}">
        <h1>${s.emoji} ${esc(l.title)}</h1>
        <p>${esc(l.summary)}</p>
        <div class="row-actions">
          <button class="btn" id="favBtn">${isFav ? '⭐ نشان شد' : '☆ نشان کردن'}</button>
          <button class="btn ${isDone ? 'good' : ''}" id="doneBtn">${isDone ? '✅ خواندم!' : '☑️ خواندم، تمامش کن'}</button>
          <button class="btn" id="shareBtn">🔗 اشتراک‌گذاری</button>
          <a class="btn primary" href="#/quiz/${l.grade}/${s.id}">🎯 آزمون بگیر</a>
        </div>
        ${l.points?.length ? `<div class="points"><b>📌 نکات کلیدی این فصل:</b><ul>${l.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
        <h2 class="sec">✍️ پرسش و پاسخ (گام‌به‌گام)</h2>
        <p class="muted">روی هر پرسش بزن تا جواب و توضیحش باز بشه. اول خودت حدس بزن، بعد ببین؛ اینجوری بهتر یاد می‌گیری 😉</p>
        ${l.qa.map((item, i) => `<details class="qa" ${i === 0 ? 'open' : ''}><summary>${esc(item.q)}</summary><div class="ans"><p class="a">${esc(item.a)}</p>${item.x ? `<p class="why">${esc(item.x)}</p>` : ''}</div></details>`).join('') || '<p class="empty">برای این فصل به‌زودی پرسش‌های بیشتری اضافه می‌کنیم.</p>'}
      </article>
      <div class="row-actions">
        ${prev ? `<a class="btn" href="#/lesson/${prev}">→ فصل قبلی</a>` : ''}
        <a class="btn" href="#/subject/${s.id}">📚 همهٔ فصل‌های ${esc(s.title)}</a>
        ${next ? `<a class="btn primary" href="#/lesson/${next}">فصل بعدی ←</a>` : ''}
      </div>
    </div>`;
  };

  views.search = (q) => {
    const r = search(q, 40);
    return `<div class="fade-in"><h2 class="sec">🔎 نتیجه‌های «${esc(q)}» (${fa(r.length)})</h2>
    ${r.length ? `<div class="list">${r.map(({ lesson, subject, hitQa }) => `<a class="list-item" href="#/lesson/${lesson.id}"><span><b>${subject.emoji} ${esc(lesson.title)}</b><small>${esc(byId.grade.get(lesson.grade).title)} · ${esc(subject.title)}${hitQa ? ' · «' + esc(hitQa.q) + '»' : ''}</small></span><span>←</span></a>`).join('')}</div>`
      : '<div class="empty">چیزی پیدا نشد 😕 یک کلمهٔ کوتاه‌تر امتحان کن؛ مثلاً فقط «کسر» یا «نیوتن».</div>'}</div>`;
  };

  views.favorites = () => {
    const list = [...favs].map((id) => byId.lesson.get(id)).filter(Boolean);
    const dn = [...done].map((id) => byId.lesson.get(id)).filter(Boolean);
    return `<div class="fade-in"><h2 class="sec">⭐ نشان‌کرده‌ها (${fa(list.length)})</h2>
    ${list.length ? `<div class="grid wide">${list.map(lessonCard).join('')}</div>` : '<div class="empty">هنوز چیزی نشان نکرده‌ای. داخل هر فصل دکمهٔ «☆ نشان کردن» را بزن تا اینجا ذخیره شود.</div>'}
    <h2 class="sec">✅ خوانده‌شده‌ها (${fa(dn.length)} از ${fa(CAT.lessons.length)})</h2>
    ${dn.length ? `<div class="grid wide">${dn.slice(0, 12).map(lessonCard).join('')}</div>` : '<div class="empty">هنوز فصلی رو کامل نکردی؛ از خانه شروع کن 💪</div>'}</div>`;
  };

  /* ---------- آزمون ---------- */
  let quiz = null;
  views.quiz = (gid, sid) => {
    let pool = CAT.lessons.flatMap((l) => l.qa.map((item) => ({ ...item, lesson: l })));
    if (gid) pool = pool.filter((x) => x.lesson.grade === +gid);
    if (sid) pool = pool.filter((x) => x.lesson.subject === sid);
    if (!pool.length) return '<div class="empty">برای این انتخاب هنوز سوالی نداریم.</div>';
    if (!quiz || quiz.key !== `${gid || ''}|${sid || ''}`) quiz = { key: `${gid || ''}|${sid || ''}`, pool, cur: null, right: 0, wrong: 0 };
    const best = store.get('quizBest', 0);
    const item = quiz.cur || (quiz.cur = quiz.pool[Math.floor(Math.random() * quiz.pool.length)]);
    const subject = byId.subject.get(item.lesson.subject);
    return `<div class="fade-in">
      <div class="crumbs"><a href="#/">خانه</a> ← آزمون از خودت</div>
      <div class="panel">
        <h1>🎯 آزمون ${gid ? esc(byId.grade.get(+gid)?.title || '') : 'از همهٔ پایه‌ها'}</h1>
        <p class="muted">اول توی ذهنت (یا روی کاغذ) جواب بده، بعد روی «دیدن جواب» بزن و صادقانه خودت را تصحیح کن. رکورد بهترین رشتهٔ درستت: <b>${fa(best)}</b> · درست این دور: <b>${fa(quiz.right)}</b> · غلط: <b>${fa(quiz.wrong)}</b></p>
        <div class="chips"><a class="chip ${!gid ? 'on' : ''}" href="#/quiz">همه</a>${CAT.grades.map((g) => `<a class="chip ${+gid === g.id ? 'on' : ''}" href="#/quiz/${g.id}">${fa(g.id)}</a>`).join('')}</div>
        <p class="muted">${subject.emoji} ${esc(byId.grade.get(item.lesson.grade).title)} · ${esc(subject.title)} · <a href="#/lesson/${item.lesson.id}">${esc(item.lesson.title)}</a></p>
        <p class="quiz-q">❓ ${esc(item.q)}</p>
        <details class="qa" id="quizAns"><summary>دیدن جواب</summary><div class="ans"><p class="a">${esc(item.a)}</p>${item.x ? `<p class="why">${esc(item.x)}</p>` : ''}</div></details>
        <div class="row-actions">
          <button class="btn good" id="qRight">✅ درست گفتم</button>
          <button class="btn bad" id="qWrong">❌ غلط گفتم</button>
          <button class="btn" id="qSkip">⏭️ رد شو</button>
        </div>
      </div></div>`;
  };

  views.settings = () => {
    const origin = store.get('siteOrigin', '') || window.HAMYAR_CONFIG?.siteOrigin || '';
    return `<div class="fade-in"><h2 class="sec">⚙️ تنظیمات</h2>
    <div class="panel form-grid">
      <label class="f">☁️ آدرس سایت همیار پلاس (برای به‌روزرسانی بانک سوال)
        <input type="url" id="originInput" placeholder="https://hamyar-plus.pages.dev" value="${esc(origin)}">
        <small class="muted">خالی هم باشد برنامه کاملاً لوکال و آفلاین کار می‌کند. الآن: ${online ? '🟢 متصل' : '📦 لوکال'} · مبدأ فعال: <span dir="ltr">${esc(siteOrigin() || '—')}</span></small>
      </label>
      <div class="row-actions"><button class="btn primary" id="saveOrigin">ذخیره و تست اتصال</button><button class="btn" id="clearOrigin">حذف آدرس (فقط لوکال)</button></div>
      <label class="f">🔠 اندازهٔ نوشته‌ها: <span id="fsVal">${fa(store.get('fontSize', 16))}</span>
        <input type="range" id="fontRange" min="14" max="21" step="1" value="${store.get('fontSize', 16)}"></label>
      <label class="f">🎨 پوسته
        <select id="themeSel"><option value="dark" ${store.get('theme', 'dark') === 'dark' ? 'selected' : ''}>🌙 تاریک</option><option value="light" ${store.get('theme', 'dark') === 'light' ? 'selected' : ''}>☀️ روشن</option></select></label>
      <label class="f">🎒 پایهٔ تحصیلی من
        <select id="myGradeSel"><option value="0">انتخاب نکرده‌ام</option>${CAT.grades.map((g) => `<option value="${g.id}" ${store.get('myGrade', 0) === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label>
    </div>
    <div class="panel">
      <h3>📊 وضعیت بانک محتوا</h3>
      <p class="muted">نسخهٔ محتوا: ${fa(CAT.version)} · آخرین به‌روزرسانی: ${fa(CAT.updatedAt)} · ${fa(CAT.lessons.length)} فصل و ${fa(CAT.lessons.reduce((n, l) => n + l.qa.length, 0))} پرسش و پاسخ · حالت اجرا: ${esc(window.HAMYAR_CONFIG?.appMode || 'web')} · نسخهٔ برنامه: ${fa(window.HAMYAR_CONFIG?.version || '۱/۰/۰')}</p>
      <div class="row-actions"><button class="btn" id="syncNow">🔄 الان با سایت همگام شو</button><button class="btn bad" id="resetAll">🗑️ پاک کردن پیشرفت و نشان‌ها</button></div>
      <p class="muted">📱 روی گوشی هم می‌توانی از منوی مرورگر «نصب برنامه / Add to Home Screen» را بزنی تا مثل یک اپ روی صفحه‌ات بیاید.</p>
    </div></div>`;
  };

  /* ---------- روتر ---------- */
  const view = $('#view');
  function render() {
    const parts = location.hash.replace(/^#\//, '').split('/').map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
    const [head, a, b] = parts;
    let html, nav = 'home';
    if (!head) html = views.home();
    else if (head === 'grades') { html = views.grades(); nav = 'grades'; }
    else if (head === 'grade') { html = views.grade(a, b || ''); nav = 'grades'; }
    else if (head === 'subject') { html = views.subject(a); nav = 'grades'; }
    else if (head === 'lesson') { html = views.lesson(a); nav = 'grades'; }
    else if (head === 'search') html = views.search(a || '');
    else if (head === 'favorites') { html = views.favorites(); nav = 'favorites'; }
    else if (head === 'quiz') { html = views.quiz(a, b); nav = 'quiz'; }
    else if (head === 'settings') { html = views.settings(); nav = 'settings'; }
    else html = '<div class="empty">این صفحه وجود ندارد 😕 <a href="#/">برگردیم خانه ←</a></div>';
    view.innerHTML = html;
    document.querySelectorAll('.bottom-nav a').forEach((el) => el.classList.toggle('on', el.dataset.nav === nav));
    window.scrollTo({ top: 0 });
    bindView(parts);
  }

  function nextQuiz(ok) {
    if (!quiz) return;
    if (ok === true) { quiz.right++; quiz.streak = (quiz.streak || 0) + 1; if (quiz.streak > store.get('quizBest', 0)) store.set('quizBest', quiz.streak); toast('آفرین! 🎉'); }
    if (ok === false) { quiz.wrong++; quiz.streak = 0; toast('اشکالی نداره، الان یادش گرفتی 💪'); }
    let nxt; do { nxt = quiz.pool[Math.floor(Math.random() * quiz.pool.length)]; } while (quiz.pool.length > 1 && nxt === quiz.cur);
    quiz.cur = nxt; render();
  }

  function bindView(parts) {
    const [head, a] = parts;
    if (head === 'lesson') {
      const l = byId.lesson.get(a); if (!l) return;
      $('#favBtn')?.addEventListener('click', () => { favs.has(l.id) ? favs.delete(l.id) : favs.add(l.id); saveSets(); toast(favs.has(l.id) ? '⭐ نشان شد' : 'از نشان‌ها برداشته شد'); render(); });
      $('#doneBtn')?.addEventListener('click', () => { done.has(l.id) ? done.delete(l.id) : done.add(l.id); saveSets(); toast(done.has(l.id) ? '✅ آفرین! این فصل تمام شد' : 'برگردانده شد'); render(); });
      $('#shareBtn')?.addEventListener('click', async () => {
        const url = (siteOrigin() || location.origin) + '/#/lesson/' + l.id;
        const text = `${l.title} — همیار پلاس`;
        try { if (navigator.share) await navigator.share({ title: text, url }); else throw 0; }
        catch { try { await navigator.clipboard.writeText(url); toast('🔗 لینک کپی شد'); } catch { toast(url); } }
      });
    }
    if (head === 'quiz') {
      $('#qRight')?.addEventListener('click', () => nextQuiz(true));
      $('#qWrong')?.addEventListener('click', () => nextQuiz(false));
      $('#qSkip')?.addEventListener('click', () => nextQuiz(null));
    }
    if (head === 'settings') {
      $('#saveOrigin')?.addEventListener('click', async () => {
        const v = $('#originInput').value.trim().replace(/\/+$/, '');
        if (v && !/^https:\/\/[^\s/]+$/.test(v)) { toast('⚠️ فقط نشانی https بدون مسیر وارد کن؛ مثل https://hamyar-plus.pages.dev'); return; }
        store.set('siteOrigin', v); toast('در حال تست اتصال…');
        const ok = await refreshFromSite(false);
        toast(ok ? '🟢 وصل شدیم! از حالا بانک سوال از سایت تازه می‌شود' : '📦 به سایت وصل نشد؛ حالت لوکال فعال ماند');
        render();
      });
      $('#clearOrigin')?.addEventListener('click', () => { store.set('siteOrigin', ''); online = false; setBadge(); toast('📦 برنامه فقط لوکال کار می‌کند'); render(); });
      $('#syncNow')?.addEventListener('click', async () => { const ok = await refreshFromSite(false); toast(ok ? '✅ همگام‌سازی انجام شد' : '📴 اینترنت یا آدرس سایت در دسترس نیست'); });
      $('#fontRange')?.addEventListener('input', (e) => { store.set('fontSize', +e.target.value); document.documentElement.style.setProperty('--fs', e.target.value + 'px'); $('#fsVal').textContent = fa(e.target.value); });
      $('#themeSel')?.addEventListener('change', (e) => { store.set('theme', e.target.value); applyTheme(); });
      $('#myGradeSel')?.addEventListener('change', (e) => { store.set('myGrade', +e.target.value); toast('🎒 پایه‌ات ذخیره شد'); });
      $('#resetAll')?.addEventListener('click', () => { if (confirm('پیشرفت، نشان‌ها و رکورد آزمون پاک بشه؟')) { done.clear(); favs.clear(); saveSets(); store.set('recent', []); store.set('quizBest', 0); toast('🗑️ پاک شد'); render(); } });
    }
  }

  addEventListener('hashchange', render);
  render();
  setBadge();
  refreshFromSite(true);

  /* سرویس‌ورکر: کش کامل برای آفلاین (فقط روی وب http/https) */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* آفلاین با کش لوکال اپ همچنان برقرار است */ });
  }
})();
