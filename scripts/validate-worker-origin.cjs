// CI preflight: fail closed if an untrusted URL might be baked into signed installers.
const { safeOrigin } = require('../clients/desktop/endpoint.cjs');
const raw = (process.env.MADAR_WORKER_ORIGIN || '').trim();
const origin = raw ? safeOrigin(raw) : '';
if (raw && !origin) {
  console.error('Invalid MADAR_WORKER_ORIGIN: expected a public HTTPS origin (no path, credentials or query).');
  process.exitCode = 1;
} else {
  console.log(origin ? `Verified public Worker origin: ${origin}` : 'No origin configured: building generic companions with a first-run address prompt.');
}
