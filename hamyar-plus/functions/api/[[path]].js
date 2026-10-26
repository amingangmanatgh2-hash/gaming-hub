// نسخهٔ Cloudflare Pages از همان API (اگر به جای Workers خواستید روی Pages دپلوی کنید):
//   npx wrangler pages deploy public --project-name hamyar-plus
// پوشهٔ functions باید کنار پوشهٔ public باشد و هنگام deploy پیجز از ریشهٔ hamyar-plus
// به صورت «wrangler pages deploy .» هم می‌توانید هر دو را با هم بفرستید (به README نگاه کنید).
import catalog from '../../public/data/catalog.json';
import { handleApi } from '../../worker/api.js';

export const onRequest = (context) => handleApi(context.request, catalog);
