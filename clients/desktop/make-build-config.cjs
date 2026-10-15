const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { safeOrigin } = require('./endpoint.cjs');

const input = (process.env.MADAR_WORKER_ORIGIN || '').trim();
const origin = input ? safeOrigin(input) : '';
if (input && !origin) {
  console.error('MADAR_WORKER_ORIGIN must be a public HTTPS origin without a path, query or credentials.');
  process.exitCode = 1;
} else {
  // This is public metadata, not a secret. The app fetches live settings after /setup.
  writeFileSync(join(__dirname, 'build-config.json'), JSON.stringify({ workerOrigin: origin }) + '\n');
  console.log(origin ? `Embedding public Worker origin: ${origin}` : 'Building generic installer: Worker URL requested on first launch.');
}
