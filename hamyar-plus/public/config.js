// تنظیمات زمان اجرا — در حالت وب خالی بگذارید (همان دامنهٔ سایت).
// در APK و EXE این فایل هنگام بیلد با آدرس سایت شما جایگزین می‌شود
// (tools/sync-assets.mjs + متغیر HAMYAR_SITE_ORIGIN) — ولی اپ بدون آن هم
// کاملاً لوکال و آفلاین کار می‌کند و از تنظیمات داخل اپ هم قابل تغییر است.
window.HAMYAR_CONFIG = {
  siteOrigin: '', // مثال: 'https://hamyar-plus.pages.dev'
  appMode: 'web', // در اپ‌های بومی: 'android' یا 'desktop'
  version: '1.0.0',
};
