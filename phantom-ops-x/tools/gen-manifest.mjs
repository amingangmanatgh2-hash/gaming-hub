// Generates app/update-manifest.json with a SHA-256 for every bundle file.
// The in-app launcher and the Android launcher verify downloads against it.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../app', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const files = {};
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else {
      const rel = relative(appDir, full).split('\\').join('/');
      if (rel === 'update-manifest.json') continue;
      files[rel] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  }
}
walk(appDir);
const manifest = { app: 'phantom-ops-x', version: pkg.version, generatedAt: new Date().toISOString(), files };
writeFileSync(join(appDir, 'update-manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`update-manifest.json: v${manifest.version}, ${Object.keys(files).length} files hashed`);
