import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// This repo is public, and the labels the app reads carry colleagues' pay IDs,
// customer names and addresses, and order and parcel references. Real values
// off those labels leaked into it three times — as test fixtures, in code
// comments, and in a commit message — each caught by hand.
//
// The list of real values lives in .private/denylist.txt, which is gitignored,
// because a public test that spelled them out would be the leak it exists to
// prevent. Where the file is absent (a fresh clone, CI) this has nothing to
// check and passes; on the machine where labels actually get photographed, it
// is the thing that stops the next one.
const DENY = '.private/denylist.txt';

describe('nothing from a real label is in the repo', () => {
  const denied = existsSync(DENY)
    ? readFileSync(DENY, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    : [];

  it.skipIf(!denied.length)('in any tracked file', () => {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
      .split('\n')
      .filter(f => f && !f.startsWith('app/vendor/') && !f.startsWith('.private/') && !/\.(png|jpe?g|woff2?|gz|ico)$/i.test(f));

    const hits = [];
    for (const f of files) {
      if (!existsSync(f)) continue;
      const text = readFileSync(f, 'utf8');
      for (const d of denied) if (text.includes(d)) hits.push(`${f}: ${d.slice(0, 3)}…`);
    }
    expect(hits, 'real label values found — replace them with invented ones of the same shape').toEqual([]);
  });
});
