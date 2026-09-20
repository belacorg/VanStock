// The shipped app is the files in app/, copied verbatim — no bundler.
//
// Same reasoning as CTAP Tracker (its ADR-0016): the only thing a bundle bought
// there was a hashed stylesheet, and it cost a blank PWA icon and a service
// worker precaching a filename that no longer existed. Dev and production serve
// byte-identical files here, so what is tested is what ships. Cache-busting is
// the manual ?v= query in index.html.
//
// SHIP is an allowlist, not a denylist. Anything new that needs to ship gets
// named here.
import { cp, rm, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SRC = 'app';
const OUT = 'dist';

const SHIP = [
  'index.html',
  'app.js',
  'data.cjs',
  'style.css',
  'fonts.css',
  'fonts',
  'vendor',
  'sw.js',
  'manifest.json',
  'icons',
];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const name of SHIP) {
  const from = join(SRC, name);
  await stat(from);   // a renamed or deleted file fails the build, not the van
  await cp(from, join(OUT, name), { recursive: true });
}

console.log(`built ${OUT}/ from ${SRC}/ — ${SHIP.length} entries`);
