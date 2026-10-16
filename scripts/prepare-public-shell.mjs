import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, '.open-next/assets/__egp-shell/homepage.bin');
fs.rmSync(target, { force: true });
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.next/prerender-manifest.json'), 'utf8'));
// Fail open to Next if someone later makes the root page dynamic or adds ISR.
if (manifest.routes['/']?.initialRevalidateSeconds !== false) {
  console.log('Public home shell skipped: root is not permanently static.');
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, '.next/server/app/index.html'), target);
  console.log('Prepared verified static public home shell.');
}
