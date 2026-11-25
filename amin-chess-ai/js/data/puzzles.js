/* AMIN CHESS AI — بانک معماهای شطرنج (تأییدشده با تست خودکار) */
(function (global) {
  'use strict';

  /* cat: mate1 | mate2 | fork | hanging | queenfork — diff: 1..5 */
  var PUZZLES = [
    {
      id: 'm1-backrank', fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', san: 'Re8#', cat: 'mate1', diff: 1,
      hint: 'ردیف آخر شاه حریف بی‌حفاظ است. رخ را به ردیف هشتم ببر.', coins: 5,
      title: 'مات کور'
    },
    {
      id: 'm1-scholar', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4', san: 'Qxf7#', cat: 'mate1', diff: 2,
      hint: 'وزیر با حمایت فیل c4 به نقطه اریب ضعیف حریف حمله می‌کند.', coins: 8,
      title: 'مات اسکالر'
    },
    {
      id: 'm1-qk', fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', san: 'Qg7#', cat: 'mate1', diff: 1,
      hint: 'وزیر باید با حمایت شاه به کنار شاه حریف برود.', coins: 5,
      title: 'مات وزیر و شاه'
    },
    {
      id: 'm1-smothered', fen: '6rk/5ppp/8/6N1/8/8/8/6K1 w - - 0 1', san: 'Nxf7#', cat: 'mate1', diff: 2,
      hint: 'شاه حریف در قفس مهره‌های خودش است؛ اسب جای درست را پیدا می‌کند.', coins: 8,
      title: 'مات خفه‌کننده'
    },
    {
      id: 'm1-backrank-rook', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', san: 'Rd8#', cat: 'mate1', diff: 1,
      hint: 'ستون d باز است؛ ردیف آخر حریف را ببند.', coins: 5,
      title: 'مات ستون باز'
    },
    {
      id: 'm1-ladder', fen: '7k/R7/1R6/8/8/8/8/7K w - - 0 1', san: 'Rb8#', cat: 'mate1', diff: 1,
      hint: 'دو رخ مثل نردبان کار می‌کنند؛ یکی ردیف هفتم را بسته، دیگری باید مات دهد.', coins: 5,
      title: 'مات نردبان'
    },
    {
      id: 'm1-qxg7', fen: '3r2k1/5ppp/8/8/3Q4/8/1B4PP/6K1 w - - 0 1', san: 'Qxg7#', cat: 'mate1', diff: 2,
      hint: 'وزیر می‌تواند سرباز g7 را بگیرد؛ فیل b2 او را حمایت می‌کند.', coins: 8,
      title: 'حمله با حمایت فیل'
    },
    {
      id: 'm2-kq', fen: '7k/8/5K2/8/8/8/8/3Q4 w - - 0 1', san: 'Kg6', cat: 'mate2', diff: 3,
      hint: 'اول شاه را نزدیک کن! شاه حریف فقط یک خانه دارد.', coins: 12,
      title: 'مات در دو حرکت (وزیر و شاه)'
    },
    {
      id: 'm2-rooks', fen: '6k1/8/R7/8/8/8/8/1R5K w - - 0 1', san: 'Ra7', cat: 'mate2', diff: 3,
      hint: 'یک رخ ردیف هفتم را می‌بندد و شاه حریف محبوس می‌شود.', coins: 12,
      title: 'مات دو رخ در دو حرکت'
    },
    {
      id: 'm2-philidor', fen: '5r1k/6pp/7N/3Q4/8/8/8/7K w - - 0 1', san: 'Qg8+', cat: 'mate2', diff: 4,
      hint: 'قربانی معروف! وزیر را بده، بعد اسب مات می‌دهد. اسب حامی وزیر است.', coins: 18,
      title: 'میراث فیلیدور'
    },
    {
      id: 't-knightfork', fen: 'r3k3/p6p/8/1N6/8/8/8/6K1 w - - 0 1', san: 'Nc7+', cat: 'fork', diff: 2,
      hint: 'اسب دو هدف را هم‌زمان تهدید می‌کند: شاه و رخ گوشه.', coins: 8,
      title: 'چنگال اسب'
    },
    {
      id: 't-queenfork', fen: '4k2r/8/8/3Q4/8/8/8/3R2K1 w - - 0 1', san: 'Qd8+', cat: 'queenfork', diff: 3,
      hint: 'وزیر به ردیف هشتم می‌رود؛ شاه باید فرار کند و رخ می‌ماند.', coins: 12,
      title: 'چنگال وزیر'
    },
    {
      id: 't-hanging', fen: '4k3/8/8/8/3q4/4P3/8/4K3 w - - 0 1', san: 'exd4', cat: 'hanging', diff: 1,
      hint: 'اسکن کن! مهره‌ای بی‌حفاظ وسط صفحه ایستاده است.', coins: 5,
      title: 'مهره بی‌حفاظ'
    },
    {
      id: 't-fork-kg7', fen: '3r4/6k1/8/6N1/8/8/8/6K1 w - - 0 1', san: 'Ne6+', cat: 'fork', diff: 3,
      hint: 'خانه‌ای پیدا کن که هم شاه و هم رخ d8 را تهدید کند.', coins: 12,
      title: 'چنگال روی شاه و رخ'
    }
  ];

  var CAT_FA = {
    mate1: 'مات در یک حرکت',
    mate2: 'مات در دو حرکت',
    fork: 'چنگال اسب',
    queenfork: 'چنگال وزیر',
    hanging: 'مهره بی‌حفاظ'
  };

  function dailyPuzzle(dateKey) {
    var key = dateKey || global.AMIN.util.dayKey();
    var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return PUZZLES[h % PUZZLES.length];
  }

  function byCategory(cat) { return PUZZLES.filter(function (p) { return p.cat === cat; }); }
  function get(id) { return PUZZLES.filter(function (p) { return p.id === id; })[0] || null; }

  global.AMIN = global.AMIN || {};
  global.AMIN.puzzles = { PUZZLES: PUZZLES, CAT_FA: CAT_FA, dailyPuzzle: dailyPuzzle, byCategory: byCategory, get: get };
})(window);
