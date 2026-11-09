/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Collect the licences of every runtime npm package that ends up in the app
 * (non-dev entries of package-lock.json) into public/THIRD-PARTY-NOTICES.txt,
 * which is served with the web app and bundled into the desktop app.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: on Windows .pathname gives "/D:/...", which is not a valid path.
const root = fileURLToPath(new URL('..', import.meta.url));
try {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const out = [];
  const seen = new Set();
  for (const [path, info] of Object.entries(lock.packages ?? {})) {
    if (!path || info.dev || info.devOptional || info.optional) continue;
    const dir = join(root, path);
    if (!existsSync(join(dir, 'package.json'))) continue;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f));
    const text = file ? readFileSync(join(dir, file), 'utf8').trim() : '';
    const lic = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'see package';
    out.push({ key, lic, text, repo: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '' });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  const header = [
    'FlatForm — third-party notices',
    'FlatForm is © 2026 Roy Borkin, all rights reserved. It includes the',
    'open-source components below, each under its own licence. The Hershey',
    'single-stroke font data is in the public domain.',
    '',
    `${out.length} packages`,
    '',
  ].join('\n');
  const body = out
    .map((p) => `${'='.repeat(78)}\n${p.key}  (${p.lic})${p.repo ? `\n${p.repo}` : ''}\n${'-'.repeat(78)}\n${p.text || `Licensed under ${p.lic}.`}\n`)
    .join('\n');
  writeFileSync(join(root, 'public', 'THIRD-PARTY-NOTICES.txt'), `${header}\n${body}`);
  console.log(`third-party notices: ${out.length} packages`);
} catch (e) {
  // Never block a build over the notices file; the last committed copy stays in place.
  console.warn(`third-party notices: skipped (${e instanceof Error ? e.message : e})`);
}
