/** Pages frontend → the deployed Worker via a service binding called CORE.
 * Durable Object classes cannot be created by a standalone Pages Function.
 * Set CORE in Pages > Settings > Functions > Service bindings, then redeploy Pages.
 * Same-origin proxying keeps session cookies and the API on the site domain. */
export function onRequest({ request, env }) {
  if (!env.CORE) return new Response(JSON.stringify({ ok: false, error: 'Pages نیاز به Service binding با نام CORE به Worker مدار دارد.' }), {
    status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
  return env.CORE.fetch(request);
}
