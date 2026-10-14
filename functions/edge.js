// Pages must forward WebSocket upgrades to the Worker which owns the MARKET DO.
export function onRequest({ request, env }) {
  if (!env.CORE) return new Response('CORE service binding missing', { status: 503 });
  return env.CORE.fetch(request);
}
