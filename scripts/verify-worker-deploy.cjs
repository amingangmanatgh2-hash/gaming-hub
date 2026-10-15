// Used after Wrangler deployment, before baking its PUBLIC origin into installers.
const { safeOrigin } = require('../clients/desktop/endpoint.cjs');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function verify(origin) {
  const options = { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { accept: 'application/json', 'cache-control': 'no-cache' } };
  const health = await fetch(`${origin}/api/v1/health`, options);
  if (!health.ok || !health.headers.get('content-type')?.startsWith('application/json')) throw new Error('Deployed Worker health check failed.');
  const result = await health.json();
  if (result.ok !== true || result.app !== 'madar' || result.runtime !== 'cloudflare-worker') throw new Error('Deployment URL does not serve this Madar Worker.');
  const bootstrap = await fetch(`${origin}/api/v1/client/bootstrap`, { ...options, signal: AbortSignal.timeout(8000) });
  if (!bootstrap.headers.get('content-type')?.startsWith('application/json')) throw new Error('Worker bootstrap is not available.');
  const data = await bootstrap.json();
  if (bootstrap.status === 409 && data.code === 'setup_required') return;
  if (bootstrap.status !== 200 || data.ok !== true || data.version !== 1 || data.origin !== origin || data.appUrl !== `${origin}/app`) {
    throw new Error('Worker bootstrap has not reached the deployed version yet.');
  }
}
(async () => {
  const origin = safeOrigin(process.env.MADAR_WORKER_ORIGIN || '');
  if (!origin) throw new Error('Wrangler did not return a valid public HTTPS deployment URL.');
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await verify(origin);
      console.log(`Madar Worker verified at ${origin}. Clients will get live public configuration after admin setup.`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await pause(1500 * (attempt + 1));
    }
  }
  throw lastError;
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
