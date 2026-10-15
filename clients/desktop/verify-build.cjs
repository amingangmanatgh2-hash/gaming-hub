// Check the ACTUAL packaged ASAR, not only the generated file next to the sources.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { listPackage, extractFile } = require('@electron/asar');
const { safeOrigin } = require('./endpoint.cjs');

const archive = join(__dirname, 'release', 'win-unpacked', 'resources', 'app.asar');
const files = listPackage(archive);
for (const name of ['main.cjs', 'endpoint.cjs', 'build-config.json', 'setup.html', 'setup.js', 'preload.cjs']) {
  assert.ok(files.some((file) => file.endsWith(`/${name}`) || file.endsWith(`\\${name}`)), `Missing packaged ${name}`);
}
const config = JSON.parse(extractFile(archive, 'build-config.json').toString('utf8'));
assert.deepEqual(Object.keys(config), ['workerOrigin']); // never package credentials
assert.equal(config.workerOrigin, safeOrigin(process.env.MADAR_WORKER_ORIGIN || '') || '');
console.log(config.workerOrigin ? `Verified public origin in Windows installer: ${config.workerOrigin}` : 'Verified generic Windows installer: first-run URL prompt.');
