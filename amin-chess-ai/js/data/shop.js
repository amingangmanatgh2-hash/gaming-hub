/* AMIN CHESS AI — کاتالوگ فروشگاه (خرید فقط با سکه مجازی) */
(function (global) {
  'use strict';

  /*
   * cat: pieces | board | background | avatar | sound | master | effect
   * default: true → مالکیت اولیه (رایگان)
   */
  var PRODUCTS = [
    /* پوسته مهره‌ها */
    { id: 'ps-classic', cat: 'pieces', name: 'مهره‌های کلاسیک', desc: 'شکل استاندارد و خوانای مهره‌ها', price: 0, default: true, preview: { type: 'pieces', set: 'classic' } },
    { id: 'ps-outline', cat: 'pieces', name: 'مهره‌های خطی', desc: 'سبک ظریف و مدرن با خطوط توخالی', price: 120, preview: { type: 'pieces', set: 'outline' } },
    { id: 'ps-minimal', cat: 'pieces', name: 'مهره‌های مینیمال', desc: 'مهره‌های ساده دو رنگ خنثی', price: 200, preview: { type: 'pieces', set: 'minimal' } },
    { id: 'ps-neo', cat: 'pieces', name: 'مهره‌های نئون', desc: 'درخشش نئونی بنفش و فیروزه‌ای', price: 250, preview: { type: 'pieces', set: 'neo' } },
    { id: 'ps-gold', cat: 'pieces', name: 'مهره‌های طلایی', desc: 'جلوه لوکس طلایی برای قهرمانان', price: 400, preview: { type: 'pieces', set: 'gold' } },

    /* طرح صفحه شطرنج */
    { id: 'bt-nebula', cat: 'board', name: 'صفحه سحابی', desc: 'بنفش و نیلی — تم پیش‌فرض AMIN', price: 0, default: true, preview: { type: 'board', theme: 'nebula' } },
    { id: 'bt-ocean', cat: 'board', name: 'صفحه اقیانوس', desc: 'آبی و فیروزه‌ای آرامش‌بخش', price: 150, preview: { type: 'board', theme: 'ocean' } },
    { id: 'bt-forest', cat: 'board', name: 'صفحه جنگل', desc: 'سبز تیره و روشن طبیعی', price: 150, preview: { type: 'board', theme: 'forest' } },
    { id: 'bt-wood', cat: 'board', name: 'صفحه چوب کلاسیک', desc: 'حس تخته واقعی باشگاه', price: 180, preview: { type: 'board', theme: 'wood' } },
    { id: 'bt-mono', cat: 'board', name: 'صفحه مونوکروم', desc: 'خاکستری خالص و بی‌حاشیه', price: 120, preview: { type: 'board', theme: 'mono' } },

    /* پس‌زمینه */
    { id: 'bg-aurora', cat: 'background', name: 'شفق قطبی', desc: 'گرادیان بنفش و آبی پیش‌فرض', price: 0, default: true, preview: { type: 'swatch', cls: 'bgp-aurora' } },
    { id: 'bg-midnight', cat: 'background', name: 'نیمه‌شب', desc: 'سرمه‌ای عمیق با ستاره‌های آرام', price: 100, preview: { type: 'swatch', cls: 'bgp-midnight' } },
    { id: 'bg-sunset', cat: 'background', name: 'غروب', desc: 'گرمای بنفش و نارنجی', price: 120, preview: { type: 'swatch', cls: 'bgp-sunset' } },
    { id: 'bg-matrix', cat: 'background', name: 'ماتریکس', desc: 'سبز نئونی تیره برای گیک‌ها', price: 150, preview: { type: 'swatch', cls: 'bgp-matrix' } },

    /* آواتار */
    { id: 'av-basic', cat: 'avatar', name: 'آواتار پایه', desc: 'سرباز سیاه کلاسیک', price: 0, default: true, preview: { type: 'avatar', glyph: '♟' } },
    { id: 'av-premium', cat: 'avatar', name: 'بسته آواتارهای ویژه', desc: '۶ آواتار ویژه: 👑 🦉 🤖 🦁 🦊 🐉 — پس از خرید در شخصی‌سازی انتخاب می‌شوند', price: 200, preview: { type: 'avatar', glyph: '👑' }, unlock: { type: 'avatar-pack', avatars: ['👑', '🦉', '🤖', '🦁', '🦊', '🐉'] } },

    /* صدا */
    { id: 'snd-classic', cat: 'sound', name: 'صدای کلاسیک', desc: 'نوت‌های ملایم دیجیتال', price: 0, default: true, preview: { type: 'sound', pack: 'classic' } },
    { id: 'snd-wood', cat: 'sound', name: 'صدای چوب', desc: 'صوت برخورد مهره روی تخته چوبی', price: 180, preview: { type: 'sound', pack: 'wood' } },
    { id: 'snd-digital', cat: 'sound', name: 'صدای رترو', desc: 'بوق‌های ناستالژیک بازی‌های قدیمی', price: 220, preview: { type: 'sound', pack: 'digital' } },

    /* پوسته دستیار */
    { id: 'ms-sage', cat: 'master', name: 'پوسته استاد «حکیم»', desc: 'ظاهر پیش‌فرض استاد شطرنج', price: 0, default: true, preview: { type: 'master', cls: 'msp-sage' } },
    { id: 'ms-nova', cat: 'master', name: 'پوسته استاد «نوا»', desc: 'استاد فضایی با هالهٔ آبی', price: 250, preview: { type: 'master', cls: 'msp-nova' } },
    { id: 'ms-royal', cat: 'master', name: 'پوسته استاد «سلطان»', desc: 'استاد با ردای طلایی', price: 350, preview: { type: 'master', cls: 'msp-royal' } },

    /* افکت حرکت */
    { id: 'fx-none', cat: 'effect', name: 'بدون افکت', desc: 'حرکت ساده و سبک', price: 0, default: true, preview: { type: 'swatch', cls: 'bgp-none' } },
    { id: 'fx-trail', cat: 'effect', name: 'افکت رد نور', desc: 'مهره هنگام حرکت رد نوری می‌گذارد', price: 150, preview: { type: 'swatch', cls: 'bgp-trail' } }
  ];

  var CAT_FA = {
    pieces: 'پوسته مهره‌ها',
    board: 'طرح صفحه شطرنج',
    background: 'پس‌زمینه',
    avatar: 'آواتار',
    sound: 'صداها',
    master: 'پوسته دستیار',
    effect: 'افکت حرکت'
  };

  function get(id) { return PRODUCTS.filter(function (p) { return p.id === id; })[0] || null; }
  function byCat(cat) { return PRODUCTS.filter(function (p) { return p.cat === cat; }); }
  function cats() { return Object.keys(CAT_FA); }

  global.AMIN = global.AMIN || {};
  global.AMIN.shop = { PRODUCTS: PRODUCTS, CAT_FA: CAT_FA, get: get, byCat: byCat, cats: cats };
})(window);
