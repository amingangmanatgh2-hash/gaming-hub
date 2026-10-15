// Used after Wrangler deployment, before baking its PUBLIC origin into installers.
const { safeOrigin } = require('../clients/desktop/endpoint.cjs');
(async () => {
  const origin = safeOrigin(process.env.MADAR_WORKER_ORIGIN || '');
  if (!origin) throw new Error('Wrangler did not return a valid public HTTPS deployment URL.');
  const response = await fetch(`${origin}/api/v1/health`, {
    redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) throw new Error('Deployed Worker health check failed.');
  const result = await response.json();
  if (result.ok !== true || result.app !== 'madar' || result.runtime !== 'cloudflare-worker') throw new Error('Deployment URL does not serve this Madar Worker.');
  console.log(`Madar Worker verified at ${origin}. Clients will get live public configuration after admin setup.`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
