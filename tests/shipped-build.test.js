import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const index = readFileSync('app/index.html', 'utf8');
const build = readFileSync('build.mjs', 'utf8');
const sw    = readFileSync('app/sw.js', 'utf8');

// The build is an allowlist (ADR-0007). An allowlist is one forgotten entry
// away from shipping an app that 404s on its own stylesheet, and the file that
// gets forgotten is always the one just added. These tests are the reminder.
describe('what actually ships', () => {
  const referenced = [...index.matchAll(/(?:src|href)="([^"?#]+)/g)]
    .map(m => m[1])
    .filter(p => !p.startsWith('http') && !p.startsWith('data:'));

  it('ships every file index.html asks for', () => {
    const ship = [...build.matchAll(/^\s*'([^']+)',/gm)].map(m => m[1]);
    for (const ref of referenced) {
      const top = ref.split('/')[0];
      expect(ship, `${ref} is referenced by index.html but not in SHIP`).toContain(top);
    }
  });

  it('precaches every file index.html asks for', () => {
    for (const ref of referenced) {
      // The manifest's icons are precached by name; the rest match directly.
      expect(sw, `${ref} is referenced by index.html but not precached`).toContain('/' + ref);
    }
  });

  // Every asset carries the same ?v=, bumped by hand on deploy. One left behind
  // is a phone running yesterday's stylesheet against today's markup.
  it('cache-busts every asset with the same version', () => {
    const versions = [...index.matchAll(/\?v=(\d+)/g)].map(m => m[1]);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions).size).toBe(1);
  });
});
