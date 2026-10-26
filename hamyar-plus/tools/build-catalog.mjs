// سازندهٔ بانک محتوا: content/*.mjs → public/data/catalog.json + catalog.js
// خروجی واحد برای سایت، ورکر، APK و EXE — با یک بار ویرایش محتوا، همه به‌روز می‌شوند.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import g16 from '../content/grades-1-6.mjs';
import g79 from '../content/grades-7-9.mjs';
import g1012 from '../content/grades-10-12.mjs';
import deep from '../content/deep-6-9.mjs';
import { expandCatalog } from './expand-content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADE_NAMES = ['', 'پایه اول', 'پایه دوم', 'پایه سوم', 'پایه چهارم', 'پایه پنجم', 'پایه ششم', 'پایه هفتم', 'پایه هشتم', 'پایه نهم', 'پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'];
const STAGES = (g) => (g <= 6 ? 'دبستان' : g <= 9 ? 'متوسطه اول' : 'متوسطه دوم');
const GRADE_EMOJI = ['', '🐣', '✏️', '🎒', '📐', '🌍', '🧪', '📖', '🔬', '➗', '🧬', '💡', '🎓'];

// درس‌های استاندارد هر پایه که اگر در محتوای دستی نبودند، با درس‌نامهٔ پایه تکمیل می‌شوند
const FILLERS = {
  quran: ['قرآن', '🕌', '#8b5cf6', [
    ['روخوانی و روان‌خوانی قرآن', 'خواندن درست و روان آیات با رعایت مخارج حروف و حرکت‌ها، اولین گام انس با قرآن است.', ['قبل از خواندن قرآن وضو می‌گیریم و «اعوذ بالله» و «بسم الله» می‌گوییم.', 'حرکت‌های ـَ ـِ ـُ را کوتاه و حروف مد را کشیده می‌خوانیم.'], [
      ['قرآن کریم چند جزء و چند سوره دارد؟', '۳۰ جزء و ۱۱۴ سوره'],
      ['طولانی‌ترین سورهٔ قرآن کدام است؟', 'سورهٔ بقره (دومین سوره)'],
    ]],
  ]],
  hedye: ['هدیه‌های آسمان', '🌙', '#0ea5e9', [
    ['ایمان و نماز', 'نماز مهم‌ترین عبادت و راه گفت‌وگو با خداست. نمازهای روزانه پنج نوبت و در مجموع هفده رکعت‌اند.', ['وضو گرفتن شرط نماز است.', 'قبلهٔ مسلمانان کعبه در شهر مکه است.'], [
      ['در شبانه‌روز چند رکعت نماز واجب خوانده می‌شود؟', '۱۷ رکعت (صبح ۲، ظهر ۴، عصر ۴، مغرب ۳ و عشا ۴)'],
      ['چرا نماز می‌خوانیم؟', 'برای تشکر از خدا، یاد خدا و دوری از کارهای بد؛ نماز انسان را آرام و منظم می‌کند.'],
    ]],
  ]],
  payam: ['پیام‌های آسمان', '🌙', '#0ea5e9', [
    ['خداشناسی و توحید', 'توحید یعنی یگانگی خدا؛ او آفریدگار، روزی‌دهنده و گردانندهٔ جهان است و هیچ شریکی ندارد. نظم جهان نشانهٔ آفریدگار حکیم است.', ['شرک یعنی برای خدا شریک قائل شدن.', 'ایمان به خدا به زندگی معنا و هدف می‌دهد.'], [
      ['توحید به چه معناست؟', 'یگانه دانستن خدا در ذات و صفات و عبادت؛ او تنها آفریدگار و پروردگار جهان است.'],
      ['معاد یعنی چه و چرا باید زندگی پس از مرگ باشد؟', 'معاد بازگشت و زنده شدن پس از مرگ است؛ تا عدالت الهی اجرا و نتیجهٔ اعمال هر کس دیده شود.'],
    ]],
  ]],
  tafakkor: ['تفکر و سبک زندگی', '🧠', '#f97316', [
    ['مدیریت زمان و رفتار پرخطر', 'زمان سرمایه‌ای است که برنمی‌گردد. با برنامه‌ریزی و اولویت‌بندی می‌توانیم از آن بهترین استفاده را ببریم. رفتار پرخطر یعنی رفتارهایی که سلامت و آینده‌مان را تهدید می‌کند.', ['«نه» گفتن در برابر پیشنهادهای خطرناک یک مهارت است.', 'کارها را به ترتیب اهمیت بنویس و از مهم‌ترین شروع کن.'], [
      ['رفتار پرخطر چیست؟ دو مثال بزن.', 'رفتاری که سلامت جسم، روان یا آیندهٔ انسان را به خطر می‌اندازد؛ مانند بی‌احتیاطی در فضای مجازی و همراهی با دوستان ناباب'],
      ['سه گام برنامه‌ریزی روزانه را بگو.', 'نوشتن کارها، اولویت‌بندی و مشخص کردن زمان هر کار (و در پایان، بررسی انجام‌شدن آن‌ها)'],
    ]],
  ]],
  defae: ['آمادگی دفاعی', '🛡️', '#78716c', [
    ['دفاع مقدس و ایمنی', 'جنگ تحمیلی عراق علیه ایران در سال ۱۳۵۹ آغاز و هشت سال طول کشید. آشنایی با ایمنی و کمک‌های اولیه از سرفصل‌های مهم این درس است.', ['در کمک‌های اولیه ابتدا باید از خطر دوری و با اورژانس (۱۱۵) تماس گرفت.'], [
      ['جنگ تحمیلی چند سال طول کشید و چگونه پایان یافت؟', 'هشت سال (۱۳۵۹ تا ۱۳۶۷) و با پذیرش قطعنامهٔ ۵۹۸ و عقب‌نشینی دشمن پایان یافت.'],
      ['شمارهٔ تماس اورژانس و آتش‌نشانی چیست؟', 'اورژانس ۱۱۵ و آتش‌نشانی ۱۲۵'],
    ]],
  ]],
  honar: ['هنر', '🎨', '#f472b6', [
    ['رنگ و نقاشی', 'رنگ‌های اصلی زرد، قرمز و آبی‌اند و از ترکیب آن‌ها رنگ‌های فرعی (سبز، نارنجی و بنفش) ساخته می‌شود.', ['ترکیب زرد و آبی می‌شود سبز.', 'رنگ‌های گرم مثل قرمز و نارنجی حس گرما می‌دهند.'], [
      ['از ترکیب قرمز و زرد چه رنگی ساخته می‌شود؟', 'نارنجی'],
      ['سه رنگ اصلی را نام ببر.', 'قرمز، زرد و آبی'],
    ]],
  ]],
  varzesh: ['تربیت بدنی و سلامت', '🏃', '#84cc16', [
    ['ورزش و بهداشت', 'بدن سالم به حرکت روزانه، خواب کافی و تغذیهٔ درست نیاز دارد. قبل از ورزش باید بدن را گرم کرد.', ['روزانه دست‌کم ۳۰ دقیقه تحرک داشته باش.', 'حركات کششی قبل و بعد ورزش از آسیب جلوگیری می‌کند.'], [
      ['چرا قبل از ورزش گرم می‌کنیم؟', 'تا عضلات آماده شوند و احتمال آسیب و گرفتگی کمتر شود.'],
      ['دانش‌آموز در شبانه‌روز چند ساعت خواب نیاز دارد؟', 'بین ۸ تا ۱۰ ساعت'],
    ]],
  ]],
  dini: ['دین و زندگی', '🌙', '#0ea5e9', [
    ['هدف و مسیر زندگی', 'از نگاه دینی، هدف زندگی رشد و رسیدن به خدا (لقاءالله) است. قرآن، پیامبران و امامان راهنمای این مسیر هستند.', ['دنیا مزرعه و مقدمهٔ زندگی جاودانهٔ آخرت است.'], [
      ['از نظر اسلام سرمایهٔ اصلی انسان برای ساختن آینده‌اش چیست؟', 'عمر و فرصتی که در دنیا دارد؛ هر کس با انتخاب‌های خود سرنوشت ابدی‌اش را می‌سازد.'],
      ['چرا خداوند پیامبران را فرستاده است؟', 'برای هدایت انسان‌ها، رساندن پیام خدا و نشان دادن راه درست زندگی'],
    ]],
  ]],
  karfan: ['کار و فناوری', '💻', '#64748b', [
    ['رایانه، اینترنت و برنامه‌نویسی', 'رایانه از سخت‌افزار و نرم‌افزار ساخته شده است. در اینترنت باید مراقب حریم خصوصی باشیم و رمز عبور قوی انتخاب کنیم.', ['از رمز عبور طولانی و متفاوت برای هر حساب استفاده کن.', 'اطلاعات شخصی را با غریبه‌ها به اشتراک نگذار.'], [
      ['سخت‌افزار و نرم‌افزار چه فرقی دارند؟', 'سخت‌افزار قسمت‌های فیزیکی رایانه است (مثل صفحه‌کلید و هارد) و نرم‌افزار برنامه‌هایی است که روی آن اجرا می‌شود.'],
      ['سه نکتهٔ امنیتی در فضای مجازی را بگو.', 'رمز عبور قوی و متفاوت، فعال‌کردن ورود دومرحله‌ای و ندادن اطلاعات شخصی و رمز به دیگران'],
    ]],
  ]],
};

const REQUIRED = {
  1: ['math', 'farsi', 'science', 'quran', 'honar', 'varzesh'],
  2: ['math', 'farsi', 'science', 'quran', 'hedye', 'honar', 'varzesh'],
  3: ['math', 'farsi', 'science', 'social', 'quran', 'hedye'],
  4: ['math', 'farsi', 'science', 'social', 'quran', 'hedye'],
  5: ['math', 'farsi', 'science', 'social', 'quran', 'hedye'],
  6: ['math', 'farsi', 'science', 'social', 'quran', 'hedye', 'karfan'],
  7: ['math', 'science', 'farsi', 'arabic', 'english', 'social', 'payam', 'quran', 'karfan', 'tafakkor'],
  8: ['math', 'science', 'farsi', 'arabic', 'english', 'social', 'payam', 'quran', 'karfan', 'tafakkor'],
  9: ['math', 'science', 'farsi', 'arabic', 'english', 'social', 'payam', 'quran', 'karfan', 'defae'],
  10: ['farsi', 'english', 'dini'],
  11: ['english11', 'dini'],
  12: ['farsi12', 'english12', 'dini'],
};

// ادغام فصل‌های عمیق (deep) با درس‌های هم‌شناسهٔ همان پایه
const source = [...g16, ...g79, ...g1012].map((g) => ({ grade: g.grade, subjects: [...g.subjects] }));
for (const dg of deep) {
  const target = source.find((g) => g.grade === dg.grade);
  if (!target) continue;
  for (const ds of dg.subjects) {
    const idx = target.subjects.findIndex((s) => s.id === ds.id);
    if (idx >= 0) target.subjects[idx] = { ...target.subjects[idx], lessons: [...target.subjects[idx].lessons, ...ds.lessons] };
  }
}
const grades = [], subjects = [], lessons = [];
let qaTotal = 0;

for (const g of source) {
  const grade = { id: g.grade, title: GRADE_NAMES[g.grade], stage: STAGES(g.grade), emoji: GRADE_EMOJI[g.grade], subjects: [] };
  const have = new Set(g.subjects.map(s => s.id));
  const list = [...g.subjects];
  for (const need of REQUIRED[g.grade] || []) {
    if (!have.has(need) && FILLERS[need]) {
      const [t, e, c, ls] = FILLERS[need];
      list.push({ id: need, t, e, c, field: '', lessons: ls.map(([lt, ls2, lp, lqa]) => ({ t: lt, s: ls2, p: lp, qa: lqa.map(([q, a, x]) => ({ q, a, x: x || '' })) })) });
    }
  }
  for (const s of list) {
    const sid = `g${g.grade}-${s.id}`;
    const subject = { id: sid, grade: g.grade, title: s.t, emoji: s.e, color: s.c, field: s.field || '', lessons: [] };
    s.lessons.forEach((l, i) => {
      const lid = `${sid}-${i + 1}`;
      subject.lessons.push(lid);
      qaTotal += l.qa.length;
      lessons.push({ id: lid, subject: sid, grade: g.grade, no: i + 1, title: l.t, summary: l.s, points: l.p, qa: l.qa });
    });
    subjects.push(subject);
    grade.subjects.push(sid);
  }
  grades.push(grade);
}

// لایهٔ تکمیلی v1.1: جمع‌بندی هر درس + تمرین و نمونه‌سوال بیشتر + تمرین‌های محاسباتی ریاضی
const expanded = expandCatalog({ grades, subjects, lessons });
qaTotal = lessons.reduce((n, l) => n + l.qa.length + (l.pages || []).reduce((m, p) => m + p.qa.length, 0), 0);
console.log(`➕ لایهٔ تکمیلی: ${expanded.addedLessons} فصل و ${expanded.addedQa} پرسش اضافه شد`);

grades.sort((a, b) => a.id - b.id);
const catalog = { app: 'hamyar-plus', version: 4, updatedAt: '2026-10-26', grades, subjects, lessons };

// اعتبارسنجی سخت‌گیرانه
const errors = [];
if (grades.length !== 12) errors.push(`تعداد پایه‌ها باید ۱۲ باشد ولی ${grades.length} است`);
const ids = new Set();
for (const l of lessons) {
  if (ids.has(l.id)) errors.push(`شناسه تکراری: ${l.id}`);
  ids.add(l.id);
  if (!l.title || !l.summary) errors.push(`درس ناقص: ${l.id}`);
  for (const item of l.qa) if (!item.q || !item.a) errors.push(`پرسش بدون جواب در ${l.id}`);
}
for (const s of subjects) if (!s.lessons.length) errors.push(`درس/کتاب بدون فصل: ${s.id}`);
if (errors.length) { console.error('❌ خطای اعتبارسنجی محتوا:\n' + errors.join('\n')); process.exit(1); }

const outDir = join(root, 'public', 'data');
await mkdir(outDir, { recursive: true });
const json = JSON.stringify(catalog);
await writeFile(join(outDir, 'catalog.json'), json + '\n');
await writeFile(join(outDir, 'catalog.js'), `// تولید خودکار از build-catalog — دستی ویرایش نکنید\nwindow.__HAMYAR_CATALOG__ = ${json};\n`);

const kb = Math.round(Buffer.byteLength(json) / 1024);
console.log(`✅ کاتالوگ ساخته شد: ${grades.length} پایه، ${subjects.length} درس، ${lessons.length} درس/فصل، ${qaTotal} پرسش و پاسخ — حجم ${kb}KB`);
for (const g of grades) console.log(`   ${g.title}: ${g.subjects.length} درس`);
