// Rebuild installable-app icons from the source favicon.svg (npm run icons).
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const source = await readFile('public/favicon.svg');
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
  await sharp(source).resize(size, size).png().toFile(`public/${name}`);
  console.log(`✓ ${name}`);
}
