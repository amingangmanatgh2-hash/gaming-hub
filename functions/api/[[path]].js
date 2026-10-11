/**
 * Cloudflare Pages Functions — نسخهٔ Pages همان API
 * (روی Pages باید Durable Object را از داشبورد/تنظیمات بایند کنید:
 *  Settings → Functions → Durable Object bindings → Variable name: ROOMS → class: Room)
 */
import { handleApi } from '../../shared/api.js';

export function onRequest({ request, env, params }) {
  return handleApi({ request, env, rooms: env.ROOMS, params });
}
