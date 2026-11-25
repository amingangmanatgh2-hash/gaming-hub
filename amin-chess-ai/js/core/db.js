/* AMIN CHESS AI — لایه ذخیره‌سازی دائمی (IndexedDB) */
(function (global) {
  'use strict';

  var DB_NAME = 'amin-chess-ai';
  var DB_VERSION = 1;

  var STORES = [
    'kv',                /* تنظیمات و وضعیت‌های عمومی (key → value) */
    'transactions',      /* تراکنش‌های سکه (id, ts, amount, reason, reasonKey?) */
    'profile',           /* پروفایل و آمار */
    'games',             /* تاریخچه مسابقات */
    'purchases',         /* محصولات خریداری‌شده (productId → ts) */
    'mission_progress',  /* پیشرفت مأموریت‌ها: periodKey+id → value */
    'lesson_progress',   /* پیشرفت درس‌ها */
    'puzzle_stats',      /* آمار معماهای روزانه/دسته‌ها */
    'credentials',       /* اطلاعات API کاربر — فقط روی همین دستگاه */
    'achievements'       /* دستاوردهای گرفته‌شده */
  ];

  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) {
            if (s === 'transactions') {
              var tx = db.createObjectStore(s, { keyPath: 'id' });
              tx.createIndex('reasonKey', 'reasonKey', { unique: true });
              tx.createIndex('ts', 'ts');
            } else {
              db.createObjectStore(s);
            }
          }
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  /* کلون JSON هنگام نوشتن: داده‌ها را ساختار امن می‌کند (معادل structured clone
   * برای داده‌های این برنامه) و از مشکلات بین‌realm در محیط‌های تست جلوگیری می‌کند */
  function cloneVal(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
  function wStore(st) {
    var wrap = Object.create(st);
    wrap.put = function (v, k) { return st.put(cloneVal(v), k); };
    wrap.add = function (v, k) { return st.add(cloneVal(v), k); };
    return wrap;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var st = wStore(t.objectStore(store));
        var out;
        try { out = fn(st); } catch (err) { reject(err); return; }
        t.oncomplete = function () {
          /* اگر خروجی یک IDBRequest است، نتیجه واقعی‌اش را برگردان
             (کلید ناموجود → undefined → fallback در kvGet) */
          if (out && typeof out === 'object' && typeof out.addEventListener === 'function' && 'result' in out) {
            resolve(out.result);
          } else {
            resolve(out);
          }
        };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('transaction aborted')); };
      });
    });
  }

  /* خواندن/نوشتن کلید-مقدار */
  function kvGet(key, fallback) {
    return tx('kv', 'readonly', function (st) { return st.get(key); })
      .then(function (v) { return v === undefined ? fallback : v; });
  }
  function kvSet(key, value) {
    return tx('kv', 'readwrite', function (st) { return st.put(value, key); }).then(function () { return value; });
  }
  function kvDel(key) { return tx('kv', 'readwrite', function (st) { return st['delete'](key); }); }

  /* اجرای یک تراکنش چندمرحله‌ای روی چند store به‌صورت اتمیک */
  function atomic(stores, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(stores, mode);
        var handles = {};
        stores.forEach(function (s) { handles[s] = wStore(t.objectStore(s)); });
        var result;
        try { result = fn(handles, t); } catch (err) { reject(err); return; }
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('transaction aborted')); };
        return result;
      });
    });
  }

  function getAll(store) {
    return tx(store, 'readonly', function (st) { return st.getAll(); });
  }

  function dbInit() { return open(); }

  global.AMIN = global.AMIN || {};
  global.AMIN.db = {
    open: open, tx: tx, atomic: atomic, getAll: getAll,
    kvGet: kvGet, kvSet: kvSet, kvDel: kvDel, init: dbInit
  };
})(window);
