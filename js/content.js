/* ==========================================================================
   content.js  ::  داده‌ی بازی — ۱۶ خودرو و ۲۰ پیست
   --------------------------------------------------------------------------
   همه‌ی مشخصات فنی، رنگ‌ها، سیلوئت بدنه‌ها و تم پیست‌ها این‌جا تعریف شده.
   car.js و track.js از این داده هندسه‌ی سه‌بعدی می‌سازند.
   ========================================================================== */
(function (root) {
  'use strict';
  var KK = root.KK;

  /* =======================================================================
     گونه‌های بدنه  —  هر گونه یک سیلوئت پایه دارد و پارامترها آن را تغییر
     می‌دهند:  hatch | sedan | coupe | muscle | hyper | gt | buggy | pickup
               | truck | drift
     ======================================================================= */

  /* ---------------------------------------------------------------- خودروها
     power  : قدرت موتور        (0..100)
     grip   : چسبندگی لاستیک    (0..100)
     aero   : آیرودینامیک/سرعت نهایی
     weight : وزن (کیلوگرم)
     brake  : ترمز
     drift  : تمایل به دریفت (هرچه بیشتر، عقب سبک‌تر)
     offroad: توانایی خارج از پیست
     ======================================================================= */
  var CARS = [
    {
      id: 'tandar', name: 'تندر', latin: 'TANDAR', tag: 'شهری', kind: 'hatch', tier: 0, price: 0,
      color: 0xd8dde3, accent: 0x2b3440, glass: 0x1d2733,
      len: 3.85, wid: 1.68, ht: 1.44, wr: 0.30, ww: 0.19, fOffset: 0.72, rOffset: 0.66,
      power: 34, grip: 46, aero: 38, weight: 1050, brake: 48, drift: 34, offroad: 30,
      wheels: 'spoke5', spoiler: 0, scoop: 0, exhaust: 1, widebody: 0, skirt: 0,
      desc: 'هاچ‌بک کوچک و جان‌سخت. شروع کار همه با همین است.'
    },
    {
      id: 'rakhsh', name: 'رخش', latin: 'RAKHSH', tag: 'دیفرانسیل عقب', kind: 'sedan', tier: 0, price: 1200,
      color: 0xf2f0e6, accent: 0x8a2b1e, glass: 0x24303c,
      len: 4.35, wid: 1.66, ht: 1.42, wr: 0.32, ww: 0.19, fOffset: 0.86, rOffset: 0.80,
      power: 42, grip: 42, aero: 36, weight: 1120, brake: 44, drift: 62, offroad: 26,
      wheels: 'dish', spoiler: 0, scoop: 0, exhaust: 1, widebody: 0, skirt: 0,
      desc: 'سدان قدیمی با موتور تقویت‌شده. سبک و دریفت‌پذیر، سلطان پیچ‌های تنگ.'
    },
    {
      id: 'kaftar', name: 'کفتار', latin: 'KAFTAR', tag: 'وانت', kind: 'pickup', tier: 0, price: 1800,
      color: 0x6f7d55, accent: 0x2f2a24, glass: 0x202932,
      len: 4.90, wid: 1.80, ht: 1.62, wr: 0.36, ww: 0.24, fOffset: 0.92, rOffset: 0.86,
      power: 48, grip: 40, aero: 30, weight: 1560, brake: 40, drift: 55, offroad: 62,
      wheels: 'offroad', spoiler: 0, scoop: 1, exhaust: 2, widebody: 1, skirt: 0, bullbar: 1,
      desc: 'وانت زنگ‌زده با موتور قوی. سنگین، کوبنده، ولی در خاکی بی‌رقیب.'
    },
    {
      id: 'sahand', name: 'سهند', latin: 'SAHAND', tag: 'کوپه', kind: 'coupe', tier: 1, price: 3400,
      color: 0x1b6fa8, accent: 0xd9e2ea, glass: 0x16222e,
      len: 4.20, wid: 1.78, ht: 1.30, wr: 0.33, ww: 0.22, fOffset: 0.80, rOffset: 0.78,
      power: 58, grip: 60, aero: 55, weight: 1210, brake: 58, drift: 40, offroad: 24,
      wheels: 'spoke10', spoiler: 1, scoop: 1, exhaust: 2, widebody: 0, skirt: 1,
      desc: 'کوپه‌ی متعادل. هم در پیست خوب است هم در اتوبان.'
    },
    {
      id: 'arash', name: 'آرش', latin: 'ARASH', tag: 'رالی', kind: 'hatch', tier: 1, price: 4200,
      color: 0x1a4fd6, accent: 0xffcc22, glass: 0x141d28,
      len: 4.05, wid: 1.76, ht: 1.46, wr: 0.34, ww: 0.23, fOffset: 0.78, rOffset: 0.74,
      power: 62, grip: 66, aero: 50, weight: 1180, brake: 62, drift: 44, offroad: 68,
      wheels: 'turbine', spoiler: 2, scoop: 2, exhaust: 2, widebody: 1, skirt: 1, mudflap: 1, lightbar: 1,
      desc: 'هاچ‌بک رالی چهارچرخ‌محرک. در شن و باران بی‌رقیب است.'
    },
    {
      id: 'palang', name: 'پلنگ', latin: 'PALANG', tag: 'ماسل V8', kind: 'muscle', tier: 1, price: 5200,
      color: 0xf0a11b, accent: 0x141414, glass: 0x1b2430,
      len: 4.70, wid: 1.92, ht: 1.36, wr: 0.35, ww: 0.26, fOffset: 0.94, rOffset: 0.86,
      power: 74, grip: 48, aero: 46, weight: 1620, brake: 50, drift: 72, offroad: 30,
      wheels: 'dish', spoiler: 1, scoop: 3, exhaust: 2, widebody: 1, skirt: 1, stripe: 1,
      desc: 'هشت سیلندر، گشتاور وحشی، لاستیک عقب ضعیف. فقط برای حرفه‌ای‌ها.'
    },
    {
      id: 'ghasedak', name: 'قاصدک', latin: 'GHASEDAK', tag: 'سبک‌وزن', kind: 'coupe', tier: 1, price: 6000,
      color: 0x9fd356, accent: 0x1d2b16, glass: 0x14202a,
      len: 3.70, wid: 1.66, ht: 1.16, wr: 0.30, ww: 0.21, fOffset: 0.74, rOffset: 0.70,
      power: 52, grip: 78, aero: 52, weight: 780, brake: 70, drift: 30, offroad: 34,
      wheels: 'mesh', spoiler: 1, scoop: 1, exhaust: 1, widebody: 0, skirt: 1, wing: 0,
      desc: 'شاسی فیبرکربن و موتور وسط. کم‌وزن‌ترین ماشین گاراژ.'
    },
    {
      id: 'shahab', name: 'شهاب', latin: 'SHAHAB', tag: 'سوپراسپرت', kind: 'hyper', tier: 2, price: 9500,
      color: 0xc8102e, accent: 0x111318, glass: 0x0f1720,
      len: 4.55, wid: 2.00, ht: 1.14, wr: 0.34, ww: 0.27, fOffset: 0.92, rOffset: 0.90,
      power: 84, grip: 76, aero: 82, weight: 1420, brake: 76, drift: 34, offroad: 18,
      wheels: 'spoke10', spoiler: 2, scoop: 3, exhaust: 2, widebody: 1, skirt: 1, wing: 1, canard: 1,
      desc: 'سوपरاسپرت تمام‌آلومینیومی. تعادل کامل قدرت و چسبندگی.'
    },
    {
      id: 'oghab', name: 'عقاب', latin: 'OGHAB', tag: 'جی‌تی پیست', kind: 'gt', tier: 2, price: 11000,
      color: 0x0f6b57, accent: 0xf2c14e, glass: 0x101a22,
      len: 4.62, wid: 1.96, ht: 1.22, wr: 0.34, ww: 0.26, fOffset: 0.90, rOffset: 0.88,
      power: 80, grip: 82, aero: 80, weight: 1380, brake: 82, drift: 28, offroad: 16,
      wheels: 'turbine', spoiler: 2, scoop: 2, exhaust: 2, widebody: 1, skirt: 1, wing: 2, diffuser: 1,
      desc: 'ماشین مسابقه‌ی endurance با بال بزرگ. رکورددار اکثر پیست‌ها.'
    },
    {
      id: 'kavir', name: 'کویر', latin: 'KAVIR', tag: 'باگی آفرود', kind: 'buggy', tier: 2, price: 8800,
      color: 0xe2622a, accent: 0x2a2622, glass: 0x1a222a,
      len: 4.30, wid: 1.94, ht: 1.72, wr: 0.44, ww: 0.30, fOffset: 1.00, rOffset: 0.94,
      power: 70, grip: 58, aero: 34, weight: 1140, brake: 56, drift: 50, offroad: 96,
      wheels: 'offroad', spoiler: 0, scoop: 0, exhaust: 2, widebody: 0, skirt: 0, cage: 1, lightbar: 1,
      desc: 'باگی شنی با لاستیک پهن و کمک‌فنر بلند. پادشاه خاکی و پیست‌های کویری.'
    },
    {
      id: 'alborz', name: 'البرز', latin: 'ALBORZ', tag: 'پیکاپ آفرود', kind: 'pickup', tier: 2, price: 12500,
      color: 0x2c3a4a, accent: 0xd8721c, glass: 0x18222c,
      len: 5.30, wid: 2.02, ht: 1.88, wr: 0.42, ww: 0.29, fOffset: 1.08, rOffset: 1.00,
      power: 76, grip: 56, aero: 36, weight: 2100, brake: 54, drift: 46, offroad: 92,
      wheels: 'offroad', spoiler: 0, scoop: 2, exhaust: 2, widebody: 1, skirt: 0, bullbar: 1, lightbar: 1, cage: 0,
      desc: 'پیکاپ غول با موتور توربودیزل. تانکِ مسابقه.'
    },
    {
      id: 'damavand', name: 'دماوند', latin: 'DAMAVAND', tag: 'کامیون دریفت', kind: 'truck', tier: 2, price: 14000,
      color: 0x1f5fbf, accent: 0xe9ecef, glass: 0x14202b,
      len: 6.20, wid: 2.30, ht: 2.30, wr: 0.52, ww: 0.34, fOffset: 1.40, rOffset: 1.20,
      power: 88, grip: 38, aero: 30, weight: 4200, brake: 42, drift: 84, offroad: 40,
      wheels: 'offroad', spoiler: 0, scoop: 0, exhaust: 4, widebody: 0, skirt: 0, stack: 1, bullbar: 1,
      desc: 'کامیون مسابقه‌ای. شتاب کم، ولی وقتی راه می‌افتد کسی جلودارش نیست.'
    },
    {
      id: 'azarakhsh', name: 'آذرخش', latin: 'AZARAKHSH', tag: 'هایپرکار', kind: 'hyper', tier: 3, price: 21000,
      color: 0x6f2fd6, accent: 0x00e5ff, glass: 0x0b1220,
      len: 4.72, wid: 2.06, ht: 1.08, wr: 0.34, ww: 0.28, fOffset: 0.96, rOffset: 0.94,
      power: 92, grip: 84, aero: 92, weight: 1350, brake: 84, drift: 30, offroad: 14,
      wheels: 'mesh', spoiler: 2, scoop: 3, exhaust: 4, widebody: 1, skirt: 1, wing: 2, canard: 1, diffuser: 1, underglow: 1,
      desc: 'موتور هیبریدی و بال فعال. سریع‌ترین شتاب گاراژ.'
    },
    {
      id: 'nahang', name: 'نهنگ', latin: 'NAHANG', tag: 'سلطان دریفت', kind: 'drift', tier: 3, price: 24000,
      color: 0x101418, accent: 0x00ffa3, glass: 0x0a1218,
      len: 4.50, wid: 1.98, ht: 1.34, wr: 0.35, ww: 0.28, fOffset: 0.94, rOffset: 0.86,
      power: 90, grip: 44, aero: 52, weight: 1480, brake: 58, drift: 100, offroad: 20,
      wheels: 'dish', spoiler: 1, scoop: 3, exhaust: 2, widebody: 1, skirt: 1, wing: 1, underglow: 1, angleKit: 1,
      desc: '۱۰۰۰ اسب، زاویه‌ی فرمان دریفت، صفر چسبندگی. فقط برای نمایش.'
    },
    {
      id: 'tufan', name: 'طوفان', latin: 'TOOFAN', tag: 'پروتوتایپ', kind: 'gt', tier: 3, price: 30000,
      color: 0x00b3ff, accent: 0x0a1420, glass: 0x081018,
      len: 4.80, wid: 2.04, ht: 1.10, wr: 0.35, ww: 0.28, fOffset: 0.98, rOffset: 0.96,
      power: 96, grip: 88, aero: 96, weight: 1290, brake: 90, drift: 26, offroad: 14,
      wheels: 'turbine', spoiler: 3, scoop: 3, exhaust: 4, widebody: 1, skirt: 1, wing: 2, canard: 1, diffuser: 1, underglow: 1,
      desc: 'پروتوتایپ لمان. بهترین زمان‌گیری دور در همه‌ی ۲۰ پیست.'
    },
    {
      id: 'simorgh', name: 'سیمرغ', latin: 'SIMORGH', tag: 'پرچمدار', kind: 'hyper', tier: 3, price: 42000,
      color: 0xffd24a, accent: 0x1a1206, glass: 0x120c04,
      len: 4.88, wid: 2.10, ht: 1.06, wr: 0.35, ww: 0.29, fOffset: 1.00, rOffset: 0.98,
      power: 100, grip: 92, aero: 100, weight: 1240, brake: 94, drift: 24, offroad: 14,
      wheels: 'mesh', spoiler: 3, scoop: 3, exhaust: 4, widebody: 1, skirt: 1, wing: 2, canard: 1, diffuser: 1, underglow: 1,
      desc: 'افسانه. فقط چهار نفر در دنیا سوارش شده‌اند.'
    },
    {
      id: 'volt', name: 'ولت', latin: 'VOLT', tag: 'برقی شهری', kind: 'sedan', tier: 2, price: 7200,
      color: 0xe8f2f6, accent: 0x1b7fd6, glass: 0x12202c,
      len: 4.60, wid: 1.86, ht: 1.44, wr: 0.33, ww: 0.22, fOffset: 0.90, rOffset: 0.84,
      power: 70, grip: 72, aero: 60, weight: 1700, brake: 74, drift: 30, offroad: 22,
      wheels: 'turbine', spoiler: 0, scoop: 0, exhaust: 0, widebody: 0, skirt: 1, underglow: 1,
      desc: 'سدان برقی بی‌صدا. گشتاور آنی، بدون دنده.'
    },
    {
      id: 'tokyo', name: 'توکیو', latin: 'TOKYO', tag: 'JDM ژاپنی', kind: 'coupe', tier: 1, price: 5600,
      color: 0x18b7e8, accent: 0xf5f8fa, glass: 0x101a24,
      len: 4.30, wid: 1.80, ht: 1.28, wr: 0.32, ww: 0.23, fOffset: 0.82, rOffset: 0.78,
      power: 66, grip: 68, aero: 62, weight: 1250, brake: 66, drift: 68, offroad: 24,
      wheels: 'spoke10', spoiler: 2, scoop: 1, exhaust: 2, widebody: 1, skirt: 1, wing: 1, stripe: 1,
      desc: 'کوپه‌ی ژاپنی با قلب توربو. سلطان دریفت خیابانی.'
    },
    {
      id: 'berlin', name: 'برلین', latin: 'BERLIN', tag: 'جی‌تی آلمانی', kind: 'gt', tier: 2, price: 10500,
      color: 0x23303c, accent: 0xc9ccd2, glass: 0x0e161e,
      len: 4.70, wid: 1.94, ht: 1.30, wr: 0.34, ww: 0.26, fOffset: 0.92, rOffset: 0.88,
      power: 82, grip: 80, aero: 78, weight: 1500, brake: 80, drift: 30, offroad: 16,
      wheels: 'mesh', spoiler: 1, scoop: 2, exhaust: 2, widebody: 0, skirt: 1, wing: 1, diffuser: 1,
      desc: 'جی‌تی مهندسی‌شده؛ اتوبان را با ۲۸۰ طی می‌کند.'
    },
    {
      id: 'bavaria', name: 'باواریا', latin: 'BAVARIA', tag: 'سدان پرقدرت', kind: 'muscle', tier: 2, price: 9800,
      color: 0x20407a, accent: 0xd8dce2, glass: 0x101820,
      len: 4.80, wid: 1.90, ht: 1.40, wr: 0.34, ww: 0.25, fOffset: 0.94, rOffset: 0.86,
      power: 78, grip: 62, aero: 58, weight: 1680, brake: 64, drift: 60, offroad: 24,
      wheels: 'spoke10', spoiler: 1, scoop: 2, exhaust: 4, widebody: 0, skirt: 1, stripe: 0,
      desc: 'سدان سنگین با V8 توئین‌توربو. مستقیم و بی‌رحم.'
    },
    {
      id: 'milan', name: 'میلان', latin: 'MILAN', tag: 'اگزوتیک ایتالیایی', kind: 'hyper', tier: 3, price: 26000,
      color: 0xd8331e, accent: 0x101010, glass: 0x0d141c,
      len: 4.66, wid: 2.02, ht: 1.12, wr: 0.34, ww: 0.28, fOffset: 0.94, rOffset: 0.92,
      power: 94, grip: 86, aero: 94, weight: 1380, brake: 86, drift: 28, offroad: 14,
      wheels: 'mesh', spoiler: 2, scoop: 3, exhaust: 4, widebody: 1, skirt: 1, wing: 2, canard: 1, diffuser: 1,
      desc: 'اگزوتیک قرمز ایتالیایی. صدای V12 خیابان را می‌لرزاند.'
    },
    {
      id: 'plasma', name: 'پلاسما', latin: 'PLASMA', tag: 'هایپر برقی', kind: 'hyper', tier: 3, price: 34000,
      color: 0x0ae0c8, accent: 0x08131a, glass: 0x06121a,
      len: 4.76, wid: 2.06, ht: 1.06, wr: 0.34, ww: 0.29, fOffset: 0.98, rOffset: 0.96,
      power: 99, grip: 90, aero: 98, weight: 1450, brake: 92, drift: 26, offroad: 14,
      wheels: 'turbine', spoiler: 3, scoop: 3, exhaust: 0, widebody: 1, skirt: 1, wing: 2, canard: 1, diffuser: 1, underglow: 1,
      desc: 'چهار موتور برقی. سکوت مطلق، شتاب وحشی.'
    }
  ];

  /* ============================================================ حالت داستانی
     هر فصل: یک مسابقه با هدف و دیالوگ‌های دارک/طنز. هدف‌ها:
       win     : اول شو
       podium  : روی سکو (<=3)
       posN    : جایگاه <= n
       drift   : امتیاز دریفت >= x
       clean   : با آسیب < m تمام کن
     ======================================================================== */
  var STORY = [
    { id: 'c1', title: 'شب اول: بوی بنزین', track: 'tehran', laps: 2, ai: 5, dif: 0, car: null,
      obj: { type: 'posN', n: 3 }, reward: 1200,
      intro: ['عموت گفت اگه امشب تو مسابقه‌ی تهران سوم نشی، ماشینت رو می‌فروشه.', 'عموت از سه سال پیش دنبال بهونه‌ست. بهونه بهش نده.', '— فقط گاز بده. فکر نکن. فکر که کنی می‌بازی.'] },
    { id: 'c2', title: 'کیش و قمار', track: 'kish', laps: 3, ai: 6, dif: 1, car: null,
      obj: { type: 'podium' }, reward: 1600,
      intro: ['یه آقای مهندس تو ساحل کیش شرط بست تو نمی‌تونی روی سکو بری.', 'اگه ببازی، باید با لباس شنا برگردی تهران. جلوِ همه.', 'مهندس الان داره لبخند می‌زنه. لبخندش رو بشکن.'] },
    { id: 'c3', title: 'دریفت یا مرگ', track: 'tabriz', laps: 2, ai: 6, dif: 1, car: 'rakhsh',
      obj: { type: 'drift', x: 2600 }, reward: 2000,
      intro: ['دایی‌ات می‌گه دریفت یعنی بی‌احترامی به لاستیک.', 'امشب باید ثابت کنی دریفت یعنی احترام به تماشاچی.', 'هدف: ۲۶۰۰ امتیاز دریفت. دایی تماشات می‌کنه.'] },
    { id: 'c4', title: 'باران، برف، بدبختی', track: 'rasht', laps: 3, ai: 7, dif: 2, car: null,
      obj: { type: 'clean', m: 25 }, reward: 2400,
      intro: ['رشت بارون می‌باره. نه کم. زیاد. خیلی زیاد.', 'بیمه‌ات تموم شده. پس نگذار ماشینی بهت بخوره.', 'با آسیب کمتر از ۲۵٪ تموم کن وگرنه مادرت می‌فهمه.'] },
    { id: 'c5', title: 'کویر و جن', track: 'lut', laps: 2, ai: 6, dif: 2, car: 'kavir',
      obj: { type: 'win' }, reward: 3000,
      intro: ['می‌گن تو کویر لوت، نصف‌شب صدای موتور می‌اد ولی ماشینی نیست.', 'امشب تو هم اون‌جایی. فقط تو باید اول بشی.', 'اگه صدایی شنیدی، گاز بده. نگاه نکن.'] },
    { id: 'c6', title: 'اتوبان اتوبان', track: 'kerman', laps: 2, ai: 7, dif: 2, car: 'berlin',
      obj: { type: 'win' }, reward: 3400,
      intro: ['یه برلینِ آلمانی اومده و می‌گه ماشین ایرانی ترمزش دیره.', 'ترمز که هیچ؛ امشب نشون بده گازت هم دیر نمی‌افته.', 'خط مستقیمه. فقط سرعت. فقط اول.'] },
    { id: 'c7', title: 'سنگ و ستاره', track: 'qeshm', laps: 2, ai: 6, dif: 3, car: null,
      obj: { type: 'posN', n: 2 }, reward: 4000,
      intro: ['دره‌ی ستاره‌ها تنگه. یه اشتباه و به دیواره می‌خوری.', 'ستاره‌ها امشب تماشات می‌کنن. خجالتشون نده.', 'دومی قابل قبوله. اولی افسانه‌ست.'] },
    { id: 'c8', title: 'برف و غرور', track: 'damavand', laps: 3, ai: 7, dif: 3, car: null,
      obj: { type: 'podium' }, reward: 4600,
      intro: ['رقیبت گفته تو برف فقط بلد نیستی زنجیر چرخ ببندی.', 'امشب زنجیر نداریم. فقط لاستیک و غیرت.', 'روی سکو برو تا زنجیر رو خودش ببنده.'] },
    { id: 'c9', title: 'نئون و تنهایی', track: 'neon', laps: 3, ai: 8, dif: 3, car: null,
      obj: { type: 'win' }, reward: 5200,
      intro: ['تهرانِ ۲۰۷۷. هیچ‌کس خواب نیست، هیچ‌کس زنده نیست.', 'تنها چیزی که این‌جا واقعیه، خطِ نئونِ پیسته.', 'اول بشو. شاید شهر یادت بمونه.'] },
    { id: 'c10', title: 'سیمرغ', track: 'persepolis', laps: 3, ai: 8, dif: 3, car: 'simorgh',
      obj: { type: 'win' }, reward: 8000,
      intro: ['بهت می‌گن سیمرغ رو فقط کسایی سوار شدن که دیگه برنگشتن.', 'تو برمی‌گردی. با جام.', 'این آخرین فصله. بعدش فقط افسانه‌ای.'] }
  ];

  /* کانال‌های رادیوی داخل ماشین (حالت خودران/مسافرت) */
  var RADIO = [
    { id: 'pop', name: 'رادیو جاده — پاپ', mood: 'menu' },
    { id: 'race', name: 'رادیو توربو — بیس', mood: 'race' },
    { id: 'synth', name: 'رادیو نئون — سینث', mood: 'neon' }
  ];

  /* --------------------------------------------------------------- تم‌ها
     هر تم رنگ آسمان، نور، مه، زمین و مجموعه‌ی اشیاء کنار پیست را تعیین
     می‌کند.                                                              */
  var THEMES = {
    nightCity: {
      sunEl: 0.55, sunAz: 2.4,
      ground: 0x2a2f38, road: 0x33373d, curbA: 0xd8dee6, curbB: 0xc8342a,
      skyTop: 0x05070f, skyBot: 0x1b2540, sun: 0x9fb6ff, sunIntensity: 0.35,
      fog: 0x101a2e, fogNear: 60, fogFar: 340, ambientTop: 0x4a5a86, ambientBot: 0x1a1f2c,
      night: true, stars: true, streetLights: 1.0, buildings: 1.0, trees: 0.15,
      grassTint: 0x2b3a2a, rockTint: 0x4a4a52, weather: 'clear'
    },
    mountain: {
      sunEl: 0.85, sunAz: 1.0,
      ground: 0x3f5232, road: 0x4a4a4e, curbA: 0xe8e8e8, curbB: 0xcc3b2f,
      skyTop: 0x4b7fc4, skyBot: 0xcfe0ee, sun: 0xfff2d8, sunIntensity: 1.15,
      fog: 0xa9c0d6, fogNear: 90, fogFar: 520, ambientTop: 0x9fb8d8, ambientBot: 0x4a5640,
      night: false, stars: false, streetLights: 0.0, buildings: 0.0, trees: 1.0,
      grassTint: 0x4a6b34, rockTint: 0x7d7a72, weather: 'clear', mountains: 1.0
    },
    coast: {
      sunEl: 1.05, sunAz: 0.8,
      ground: 0xe8d9a8, road: 0x585b60, curbA: 0xffffff, curbB: 0x1e90c8,
      skyTop: 0x2f8fd8, skyBot: 0xbfe8f5, sun: 0xfff6e0, sunIntensity: 1.25,
      fog: 0xbfe0ee, fogNear: 120, fogFar: 700, ambientTop: 0xa9d4f0, ambientBot: 0x6a6248,
      night: false, stars: false, streetLights: 0.0, buildings: 0.25, trees: 0.8,
      grassTint: 0xd9c98e, rockTint: 0xc9b789, weather: 'clear', water: 1.0, palms: 1.0
    },
    desert: {
      sunEl: 0.22, sunAz: 2.9,
      ground: 0xc9a25e, road: 0x6b6257, curbA: 0xf0e6d0, curbB: 0xa83a1e,
      skyTop: 0xe0a35a, skyBot: 0xffd9a0, sun: 0xffb35c, sunIntensity: 1.35,
      fog: 0xe8b878, fogNear: 70, fogFar: 420, ambientTop: 0xffc98a, ambientBot: 0x8a6a3a,
      night: false, stars: false, streetLights: 0.0, buildings: 0.0, trees: 0.1,
      grassTint: 0xb89a5c, rockTint: 0xa8834a, weather: 'sand', dunes: 1.0
    },
    snow: {
      sunEl: 0.62, sunAz: 1.4,
      ground: 0xe8eef5, road: 0x6e757c, curbA: 0xffffff, curbB: 0x2f6fbf,
      skyTop: 0x8fa9c4, skyBot: 0xdde8f2, sun: 0xeaf2ff, sunIntensity: 1.0,
      fog: 0xd5e2ee, fogNear: 60, fogFar: 380, ambientTop: 0xbcd2ea, ambientBot: 0x6a7684,
      night: false, stars: false, streetLights: 0.2, buildings: 0.1, trees: 0.9,
      grassTint: 0xeef4fa, rockTint: 0x8f98a4, weather: 'snow', mountains: 1.0, pine: 1.0
    },
    garden: {
      sunEl: 0.75, sunAz: 1.1,
      ground: 0x57803a, road: 0x54545a, curbA: 0xf4f4f0, curbB: 0xd8542f,
      skyTop: 0x5f9ede, skyBot: 0xd6ecf7, sun: 0xfff0d0, sunIntensity: 1.2,
      fog: 0xc2dae8, fogNear: 110, fogFar: 600, ambientTop: 0xa6ccea, ambientBot: 0x4e6636,
      night: false, stars: false, streetLights: 0.0, buildings: 0.4, trees: 1.0,
      grassTint: 0x5f9140, rockTint: 0x9a8f78, weather: 'petals', flowers: 1.0
    },
    persianCity: {
      sunEl: 0.24, sunAz: 2.7,
      ground: 0x9c8a63, road: 0x4e4c50, curbA: 0x2ec4b6, curbB: 0xf2e9d8,
      skyTop: 0xf0a860, skyBot: 0xffdcae, sun: 0xffb066, sunIntensity: 1.15,
      fog: 0xe2b98a, fogNear: 90, fogFar: 480, ambientTop: 0xffc896, ambientBot: 0x6a5636,
      night: false, stars: false, streetLights: 0.3, buildings: 1.0, trees: 0.5,
      grassTint: 0x8a9a4a, rockTint: 0xb09a72, weather: 'clear', domes: 1.0
    },
    autumn: {
      sunEl: 0.42, sunAz: 2.0,
      ground: 0x8a6a34, road: 0x4c4a4c, curbA: 0xf0ece0, curbB: 0xd07a22,
      skyTop: 0x7c8fa6, skyBot: 0xd8d2c4, sun: 0xffe8c0, sunIntensity: 0.85,
      fog: 0xc4c2b8, fogNear: 70, fogFar: 400, ambientTop: 0x9fb0c0, ambientBot: 0x5a4a30,
      night: false, stars: false, streetLights: 0.2, buildings: 0.2, trees: 1.0,
      grassTint: 0xa87830, rockTint: 0x8a8378, weather: 'leaves', pine: 0.4
    },
    rainforest: {
      sunEl: 0.9, sunAz: 1.6,
      ground: 0x2e4a2a, road: 0x3c3e42, curbA: 0xdfe6e0, curbB: 0x2a7a4a,
      skyTop: 0x4a5560, skyBot: 0x8a9aa0, sun: 0xcfd8de, sunIntensity: 0.55,
      fog: 0x7f8f96, fogNear: 45, fogFar: 260, ambientTop: 0x7a8f96, ambientBot: 0x2a382a,
      night: false, stars: false, streetLights: 0.4, buildings: 0.0, trees: 1.2,
      grassTint: 0x3a6636, rockTint: 0x5e6658, weather: 'rain', mountains: 0.6
    },
    adobe: {
      sunEl: 1.2, sunAz: 1.2,
      ground: 0xc0a074, road: 0x7a7068, curbA: 0xf5ead4, curbB: 0x3a8fa8,
      skyTop: 0x4a90d8, skyBot: 0xe8f0f4, sun: 0xfff8e8, sunIntensity: 1.45,
      fog: 0xdcd0b8, fogNear: 120, fogFar: 700, ambientTop: 0xbfd8ea, ambientBot: 0x7a6a4a,
      night: false, stars: false, streetLights: 0.0, buildings: 0.8, trees: 0.15,
      grassTint: 0xa89460, rockTint: 0xc0a878, weather: 'clear', windcatcher: 1.0
    },
    harbor: {
      sunEl: 0.14, sunAz: 3.0,
      ground: 0x6a7076, road: 0x4a4d52, curbA: 0xf0c020, curbB: 0x20242a,
      skyTop: 0x2b4a72, skyBot: 0xe08a52, sun: 0xff9a4a, sunIntensity: 0.95,
      fog: 0x9a7a68, fogNear: 80, fogFar: 460, ambientTop: 0x9a8fa8, ambientBot: 0x3a3a44,
      night: false, stars: false, streetLights: 0.5, buildings: 0.5, trees: 0.1,
      grassTint: 0x5a6a52, rockTint: 0x70767c, weather: 'clear', containers: 1.0, water: 0.6
    },
    canyon: {
      sunEl: 0.7, sunAz: 0.9,
      ground: 0xb0603a, road: 0x5e4c44, curbA: 0xf0d8b8, curbB: 0x8a3a22,
      skyTop: 0x3a78c8, skyBot: 0xc8d8e8, sun: 0xfff0d0, sunIntensity: 1.3,
      fog: 0xc8a890, fogNear: 80, fogFar: 480, ambientTop: 0xa8c0d8, ambientBot: 0x6a4a34,
      night: false, stars: false, streetLights: 0.0, buildings: 0.0, trees: 0.1,
      grassTint: 0x9a6a44, rockTint: 0xb8643c, weather: 'clear', canyon: 1.0
    },
    plains: {
      sunEl: 0.95, sunAz: 1.3,
      ground: 0x9a9c4a, road: 0x565a56, curbA: 0xf2f2ea, curbB: 0x6aa84a,
      skyTop: 0x4a8ad8, skyBot: 0xcfe4f0, sun: 0xfff4dc, sunIntensity: 1.2,
      fog: 0xc0d4e0, fogNear: 130, fogFar: 800, ambientTop: 0xa8ccea, ambientBot: 0x6a6c3a,
      night: false, stars: false, streetLights: 0.0, buildings: 0.1, trees: 0.3,
      grassTint: 0xa8a850, rockTint: 0x9a9488, weather: 'clear'
    },
    redIsland: {
      sunEl: 0.8, sunAz: 1.5,
      ground: 0xa83a2a, road: 0x4a4048, curbA: 0xffe0a0, curbB: 0xffffff,
      skyTop: 0x2f86d0, skyBot: 0xa8dcf0, sun: 0xfff2d8, sunIntensity: 1.4,
      fog: 0xc08a7a, fogNear: 90, fogFar: 520, ambientTop: 0xa8c8e8, ambientBot: 0x6a3a2a,
      night: false, stars: false, streetLights: 0.0, buildings: 0.0, trees: 0.05,
      grassTint: 0x9a3428, rockTint: 0xb0422e, weather: 'clear', water: 0.8
    },
    neonGrid: {
      sunEl: 0.7, sunAz: 2.2,
      ground: 0x12121e, road: 0x1c1c28, curbA: 0xff2fb0, curbB: 0x00e5ff,
      skyTop: 0x05030f, skyBot: 0x2a0a48, sun: 0xff4fd0, sunIntensity: 0.3,
      fog: 0x180832, fogNear: 50, fogFar: 300, ambientTop: 0x5a2a8a, ambientBot: 0x120a24,
      night: true, stars: true, streetLights: 1.0, buildings: 1.0, trees: 0.0,
      grassTint: 0x181828, rockTint: 0x242438, weather: 'rain', neon: 1.0
    },
    ruins: {
      sunEl: 0.16, sunAz: 2.8,
      ground: 0xb89c68, road: 0x8a7c66, curbA: 0xf5eed8, curbB: 0x3a7a8a,
      skyTop: 0xf2a860, skyBot: 0xffe0b0, sun: 0xffc070, sunIntensity: 1.25,
      fog: 0xe8c898, fogNear: 100, fogFar: 560, ambientTop: 0xffcfa0, ambientBot: 0x7a6848,
      night: false, stars: false, streetLights: 0.0, buildings: 0.2, trees: 0.15,
      grassTint: 0xa89258, rockTint: 0xc4ac7e, weather: 'clear', columns: 1.0
    },
    hotNight: {
      sunEl: 0.5, sunAz: 2.5,
      ground: 0x3a3630, road: 0x3e4044, curbA: 0xf0e0c0, curbB: 0xc8402a,
      skyTop: 0x0a0e18, skyBot: 0x3a2a30, sun: 0xffb070, sunIntensity: 0.3,
      fog: 0x241c22, fogNear: 55, fogFar: 320, ambientTop: 0x5a4050, ambientBot: 0x1a1618,
      night: true, stars: true, streetLights: 0.8, buildings: 0.8, trees: 0.3,
      grassTint: 0x3a4a32, rockTint: 0x4a4440, weather: 'clear', river: 1.0
    }
  };

  /* --------------------------------------------------------------- پیست‌ها
     laps     : تعداد دور
     len      : طول تقریبی یک دور (متر)
     width    : عرض جاده
     curve    : شدت پیچ‌ها 0..1
     elev     : ناهمواری عمودی
     tech     : فنی‌بودن (پیچ‌های تند)
     ai       : تعداد رقیب
     dif      : سختی 0..3
     ======================================================================= */
  var TRACKS = [
    {
      id: 'tehran', name: 'چراغ‌های تهران', latin: 'TEHRAN LIGHTS', region: 'تهران', theme: 'nightCity',
      laps: 3, len: 1800, width: 13, curve: 0.55, elev: 0.15, tech: 0.5, ai: 7, dif: 1, cost: 0,
      seed: 'Tehran-1403', holder: 'آرین م.', best: '1:38.42',
      desc: 'اتوبان‌های مرکز شهر، نیمه‌شب. ترافیک نیست، ولی چراغ‌ها چشم را می‌زنند.'
    },
    {
      id: 'chalus', name: 'پیچ‌وهم چالوس', latin: 'CHALUS PASS', region: 'مازندران', theme: 'mountain',
      laps: 2, len: 2600, width: 10, curve: 0.85, elev: 0.75, tech: 0.8, ai: 6, dif: 2, cost: 1500,
      seed: 'Chalus-Jadeh', holder: 'سینا ر.', best: '2:41.09',
      desc: 'جاده‌ی کوهستانی با پرتگاه. یک اشتباه و به دره می‌روی.'
    },
    {
      id: 'kish', name: 'ساحل کیش', latin: 'KISH SHORELINE', region: 'کیش', theme: 'coast',
      laps: 3, len: 1600, width: 15, curve: 0.4, elev: 0.08, tech: 0.35, ai: 7, dif: 1, cost: 1500,
      seed: 'Kish-Darya', holder: 'مهسا ک.', best: '1:22.77',
      desc: 'کنار دریا، آفتاب وسط روز. سریع‌ترین پیست برای مبتدی‌ها.'
    },
    {
      id: 'lut', name: 'کویر لوت', latin: 'LUT DESERT', region: 'کرمان', theme: 'desert',
      laps: 2, len: 3000, width: 16, curve: 0.45, elev: 0.25, tech: 0.4, ai: 6, dif: 2, cost: 3000,
      seed: 'Lut-GandomBeryan', holder: 'بهرام د.', best: '3:12.55',
      desc: 'گرم‌ترین نقطه‌ی زمین. طوفان شن دید را تا ده متر کم می‌کند.'
    },
    {
      id: 'damavand', name: 'دامنه‌ی دماوند', latin: 'DAMAVAND SLOPE', region: 'مازندران', theme: 'snow',
      laps: 3, len: 1900, width: 12, curve: 0.6, elev: 0.55, tech: 0.55, ai: 7, dif: 2, cost: 3500,
      seed: 'Damavand-5610', holder: 'الناز ف.', best: '2:05.31',
      desc: 'برف تازه و چسبندگی صفر. کنترل گاز مهم‌تر از فرمان است.'
    },
    {
      id: 'shiraz', name: 'بهارنارنج', latin: 'BAHARNARENJ', region: 'شیراز', theme: 'garden',
      laps: 3, len: 1700, width: 12, curve: 0.65, elev: 0.2, tech: 0.6, ai: 7, dif: 1, cost: 3500,
      seed: 'Shiraz-Eram', holder: 'نگار ت.', best: '1:44.18',
      desc: 'میان باغ‌های نارنج. گلبردها روی شیشه می‌نشینند.'
    },
    {
      id: 'isfahan', name: 'سی‌وسه‌پل', latin: 'SIOSEPOL', region: 'اصفهان', theme: 'persianCity',
      laps: 3, len: 1750, width: 13, curve: 0.6, elev: 0.12, tech: 0.55, ai: 7, dif: 1, cost: 4500,
      seed: 'Isfahan-Zayandeh', holder: 'رضا ص.', best: '1:47.60',
      desc: 'گنبدهای فیروزه‌ای در ساعت طلایی.'
    },
    {
      id: 'tabriz', name: 'تپه‌های تبریز', latin: 'TABRIZ HILLS', region: 'تبریز', theme: 'autumn',
      laps: 2, len: 2300, width: 12, curve: 0.7, elev: 0.45, tech: 0.65, ai: 6, dif: 2, cost: 5000,
      seed: 'Tabriz-Sahand', holder: 'یوسف ا.', best: '2:28.94',
      desc: 'برگ‌های پاییزی جاده را لغزنده می‌کنند.'
    },
    {
      id: 'ahvaz', name: 'ساحل کارون', latin: 'KARUN BANK', region: 'اهواز', theme: 'hotNight',
      laps: 3, len: 1850, width: 13, curve: 0.55, elev: 0.1, tech: 0.5, ai: 7, dif: 2, cost: 5500,
      seed: 'Ahvaz-Karun', holder: 'حسام ن.', best: '1:51.03',
      desc: 'گرمای ۵۰ درجه، آسفالت نرم شده.'
    },
    {
      id: 'rasht', name: 'باران گیلان', latin: 'GILAN RAIN', region: 'رشت', theme: 'rainforest',
      laps: 3, len: 1650, width: 11, curve: 0.7, elev: 0.3, tech: 0.7, ai: 7, dif: 2, cost: 6000,
      seed: 'Rasht-Baran', holder: 'سارا و.', best: '1:56.44',
      desc: 'باران بی‌امان. ترمز گرفتن یعنی دعا کردن.'
    },
    {
      id: 'yazd', name: 'خشت و بادگیر', latin: 'ADOBE & WINDCATCHER', region: 'یزد', theme: 'adobe',
      laps: 3, len: 1700, width: 12, curve: 0.6, elev: 0.15, tech: 0.55, ai: 7, dif: 2, cost: 6500,
      seed: 'Yazd-Fahadan', holder: 'مریم ه.', best: '1:49.72',
      desc: 'کوچه‌های خشتی و نور بی‌رحم ظهر.'
    },
    {
      id: 'bandar', name: 'لنگرگاه بندرعباس', latin: 'BANDAR DOCKYARD', region: 'بندرعباس', theme: 'harbor',
      laps: 3, len: 1900, width: 14, curve: 0.65, elev: 0.12, tech: 0.7, ai: 7, dif: 2, cost: 7500,
      seed: 'Bandar-Langar', holder: 'امید ج.', best: '1:58.20',
      desc: 'میان کانتینرها. دید کم، برخورد زیاد.'
    },
    {
      id: 'qeshm', name: 'دره‌ی ستارگان', latin: 'VALLEY OF STARS', region: 'قشم', theme: 'canyon',
      laps: 2, len: 2400, width: 11, curve: 0.8, elev: 0.5, tech: 0.85, ai: 6, dif: 3, cost: 8500,
      seed: 'Qeshm-Setareh', holder: 'کیان ب.', best: '2:34.88',
      desc: 'تنگه‌ی باریک با دیواره‌های سنگی. جای اشتباه ندارد.'
    },
    {
      id: 'kerman', name: 'دشت پسته', latin: 'PISTACHIO PLAINS', region: 'کرمان', theme: 'plains',
      laps: 2, len: 2800, width: 16, curve: 0.4, elev: 0.12, tech: 0.35, ai: 7, dif: 1, cost: 9000,
      seed: 'Kerman-Pesteh', holder: 'فاطمه ز.', best: '2:58.16',
      desc: 'خطوط مستقیم طولانی. جنگ سرعت نهایی.'
    },
    {
      id: 'mashhad', name: 'بینالود', latin: 'BINALOOD', region: 'مشهد', theme: 'mountain',
      laps: 3, len: 2000, width: 12, curve: 0.65, elev: 0.5, tech: 0.6, ai: 7, dif: 2, cost: 10000,
      seed: 'Mashhad-Binalood', holder: 'وحید پ.', best: '2:12.65',
      desc: 'دامنه‌ی کوه با باد شدید جانبی.'
    },
    {
      id: 'abrar', name: 'جنگل ابر', latin: 'CLOUD FOREST', region: 'شاهرود', theme: 'rainforest',
      laps: 3, len: 1750, width: 10, curve: 0.8, elev: 0.35, tech: 0.85, ai: 7, dif: 3, cost: 11000,
      seed: 'Abr-Jangal', holder: 'پریا ش.', best: '2:03.47',
      desc: 'مه غلیظ و پیچ‌های کور. با حافظه رانندگی کن.'
    },
    {
      id: 'hormoz', name: 'خاک سرخ هرمز', latin: 'HORMUZ RED SOIL', region: 'هرمز', theme: 'redIsland',
      laps: 3, len: 1800, width: 14, curve: 0.6, elev: 0.2, tech: 0.55, ai: 7, dif: 2, cost: 12000,
      seed: 'Hormoz-Sorkh', holder: 'دنیا ق.', best: '1:52.90',
      desc: 'جزیره‌ی رنگ‌ها. خاک سرخ زیر نور تند.'
    },
    {
      id: 'alamut', name: 'دژ الموت', latin: 'ALAMUT FORTRESS', region: 'قزوین', theme: 'canyon',
      laps: 2, len: 2500, width: 11, curve: 0.85, elev: 0.7, tech: 0.9, ai: 6, dif: 3, cost: 14000,
      seed: 'Alamut-Dej', holder: 'شاهین ل.', best: '2:47.33',
      desc: 'صعود به قلعه. پیچ‌های سنجاق‌سر پشت سر هم.'
    },
    {
      id: 'persepolis', name: 'تخت جمشید', latin: 'PERSEPOLIS', region: 'فارس', theme: 'ruins',
      laps: 3, len: 1950, width: 13, curve: 0.6, elev: 0.18, tech: 0.6, ai: 7, dif: 2, cost: 16000,
      seed: 'Persepolis-Takht', holder: 'کوروش آ.', best: '2:01.85',
      desc: 'میان ستون‌های ۲۵۰۰ ساله، هنگام طلوع.'
    },
    {
      id: 'neon', name: 'شبکه‌ی نئون ۲۰۷۷', latin: 'NEON GRID 2077', region: 'تهران', theme: 'neonGrid',
      laps: 4, len: 2100, width: 15, curve: 0.7, elev: 0.3, tech: 0.7, ai: 8, dif: 3, cost: 20000,
      seed: 'Neon-Grid-2077', holder: '??', best: '--:--.--',
      desc: 'تهرانِ سی سال بعد. باران اسیدی، نئون، و هیچ قانونی.'
    }
  ];

  /* ------------------------------------------------------- رانندگان هوش مصنوعی */
  var DRIVERS = [
    { name: 'آرین', skill: 0.94, aggr: 0.7, colors: [0xd81f2a, 0x111111] },
    { name: 'سینا', skill: 0.90, aggr: 0.85, colors: [0x1b4fd8, 0xf0f0f0] },
    { name: 'مهسا', skill: 0.92, aggr: 0.55, colors: [0xf0c020, 0x222222] },
    { name: 'بهرام', skill: 0.88, aggr: 0.9, colors: [0x2a2a2a, 0xff6a00] },
    { name: 'الناز', skill: 0.93, aggr: 0.6, colors: [0x9a2fd8, 0xffffff] },
    { name: 'نگار', skill: 0.89, aggr: 0.65, colors: [0x12b886, 0x0b1a14] },
    { name: 'رضا', skill: 0.91, aggr: 0.75, colors: [0xe85d04, 0x141414] },
    { name: 'یوسف', skill: 0.87, aggr: 0.8, colors: [0x3a86ff, 0x0d1b2a] },
    { name: 'حسام', skill: 0.86, aggr: 0.95, colors: [0xff006e, 0x1a0010] },
    { name: 'سارا', skill: 0.95, aggr: 0.5, colors: [0x00d4ff, 0x001824] },
    { name: 'کیان', skill: 0.96, aggr: 0.7, colors: [0xffffff, 0xd81f2a] },
    { name: 'پریا', skill: 0.9, aggr: 0.6, colors: [0x8ac926, 0x111a08] },
    { name: 'کوروش', skill: 0.97, aggr: 0.55, colors: [0xffd60a, 0x14100a] },
    { name: 'دنیا', skill: 0.88, aggr: 0.7, colors: [0xf72585, 0x16020c] },
    { name: 'شاهین', skill: 0.93, aggr: 0.88, colors: [0x4cc9f0, 0x04121c] },
    { name: 'وحید', skill: 0.85, aggr: 0.75, colors: [0x8338ec, 0x0d0418] }
  ];

  /* ------------------------------------------------------- ارتقاء قطعات */
  var UPGRADES = [
    { id: 'engine', name: 'موتور', icon: '⚙', max: 5, cost: [900, 1600, 2600, 4200, 6800], effect: 'power', step: 6, desc: '+۶ قدرت در هر سطح' },
    { id: 'tires', name: 'لاستیک', icon: '◉', max: 5, cost: [700, 1300, 2200, 3600, 5800], effect: 'grip', step: 6, desc: '+۶ چسبندگی در هر سطح' },
    { id: 'brakes', name: 'ترمز', icon: '◐', max: 5, cost: [600, 1100, 1900, 3100, 5000], effect: 'brake', step: 6, desc: '+۶ ترمز در هر سطح' },
    { id: 'nitro', name: 'نیترو', icon: '»', max: 5, cost: [800, 1500, 2400, 3900, 6200], effect: 'nitro', step: 8, desc: '+۸ شارژ نیترو در هر سطح' },
    { id: 'aero', name: 'آیرودینامیک', icon: '≋', max: 5, cost: [750, 1400, 2300, 3700, 6000], effect: 'aero', step: 5, desc: '+۵ سرعت نهایی در هر سطح' },
    { id: 'chassis', name: 'شاسی', icon: '⊞', max: 5, cost: [850, 1550, 2500, 4000, 6400], effect: 'weight', step: -40, desc: '−۴۰ کیلوگرم در هر سطح' }
  ];

  /* رنگ‌های قابل انتخاب برای بدنه */
  var PAINTS = [
    0xd81f2a, 0x1b4fd8, 0x0f9b58, 0xffd24a, 0x9a2fd8, 0xff6a00,
    0x111111, 0xf2f2f2, 0x00b3ff, 0xff2fb0, 0x00e5a0, 0x8a6a3a
  ];

  root.KK = root.KK || {};
  root.KK.CARS = CARS;
  root.KK.TRACKS = TRACKS;
  root.KK.THEMES = THEMES;
  root.KK.DRIVERS = DRIVERS;
  root.KK.UPGRADES = UPGRADES;
  root.KK.PAINTS = PAINTS;
  root.KK.STORY = STORY;
  root.KK.RADIO = RADIO;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CARS: CARS, TRACKS: TRACKS, THEMES: THEMES, DRIVERS: DRIVERS, UPGRADES: UPGRADES, PAINTS: PAINTS, STORY: STORY, RADIO: RADIO };
  }
})(typeof window !== 'undefined' ? window : globalThis);
