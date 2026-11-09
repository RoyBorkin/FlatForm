/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Set the app version everywhere it lives: package.json, the Tauri config and
 * Cargo.toml. Usage: npm run version:set 1.1.0
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? '')) {
  console.error('Usage: npm run version:set <major.minor.patch>, e.g. 1.1.0');
  process.exit(1);
}
// fileURLToPath, not URL.pathname: on Windows .pathname gives "/D:/...", which is not a valid path.
const root = fileURLToPath(new URL('..', import.meta.url));
const json = (f, fn) => {
  const p = join(root, f);
  const d = JSON.parse(readFileSync(p, 'utf8'));
  fn(d);
  writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
};
json('package.json', (d) => (d.version = v));
json('src-tauri/tauri.conf.json', (d) => (d.version = v));
const cargo = join(root, 'src-tauri/Cargo.toml');
writeFileSync(cargo, readFileSync(cargo, 'utf8').replace(/^version = ".*"$/m, `version = "${v}"`));
console.log(`FlatForm version set to ${v}. Commit, push, then tag: git tag v${v} && git push origin v${v}`);
json('package-lock.json', (d) => {
  d.version = v;
  if (d.packages?.['']) d.packages[''].version = v;
});
