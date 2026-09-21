import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// ADR-0010: nothing off a real label but the GC number and the description.
//
// This repo is public, and the labels the app reads carry engineers' pay IDs,
// customer names and addresses, and order, parcel and tote references. Real
// values off those labels leaked into it more than once — as test fixtures, in
// comments, in a commit message — and were each found by hand.
//
// The guard works on the SHAPE of label data, not a list of known values. A
// list of real values would itself be the record ADR-0010 says not to keep,
// and it could only ever catch values somebody had already seen — the next
// engineer's pay ID would walk straight past it. A shape catches that too.
//
// Fixtures need values of these shapes, so the ones in use are listed below.
// Every one of them is invented, and visibly so: mostly zeros. Adding a new
// fixture of one of these shapes means adding it here, deliberately.
const SHAPES = [
  ['a pay ID',                   /\b0\d{6}\b/g],
  ['a tracking or barcode number', /\b\d{12,}\b/g],
  ['a location code',            /\b[A-Z]{2}\d{7,9}[A-Z]?\b/g],
  ['a sales-order number',       /\b[A-Z]{1,3}\d{9,11}\b/g],
  ['a tote number',              /\b2\d{7}\b/g],
  ['a WMIS number',              /\b1\d{9}\b/g],
  ["an engineer's name line",    /BG\/D\/S/g],
];

const INVENTED = new Set([
  '0000001', '0000002', '0000003',
  '0612387',   // the demo code 612387 with the stray 0 OCR glues to its front
  'FL0000001R', 'VN000000001', 'Y90000000001',
  '21000001', '1700000001',
]);

function trackedText() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\n')
    .filter(f => f && existsSync(f))
    .filter(f => !f.startsWith('app/vendor/') && f !== 'package-lock.json')
    .filter(f => !/\.(png|jpe?g|woff2?|gz|ico)$/i.test(f));
}

describe('nothing from a real label is in the repo', () => {
  it('has no value shaped like label data that is not a known invention', () => {
    const hits = [];
    for (const f of trackedText()) {
      const text = readFileSync(f, 'utf8');
      for (const [what, re] of SHAPES) {
        for (const m of text.matchAll(re)) {
          // Only the first three characters, so a failure message does not
          // itself republish the value it caught.
          if (!INVENTED.has(m[0])) hits.push(`${f}: ${what} (${m[0].slice(0, 3)}…)`);
        }
      }
    }
    expect(hits, 'use an invented value (mostly zeros) and add it to INVENTED').toEqual([]);
  });

  // The guard is only worth having if it fails. Checked against shapes of the
  // real thing — built from pieces here so no real value is spelled out.
  it('catches the shapes it is for', () => {
    const digits = ['48273', '65918', '27364'].join('');
    const fake = (n, lead) => lead + digits.slice(0, n - lead.length);
    const samples = [fake(7, '0'), fake(13, '1'), 'FL' + fake(7, '4') + 'R', fake(8, '2'), fake(10, '1'), ['SMITH, JO BG', 'D', 'S'].join('/')];
    for (const s of samples) {
      expect(SHAPES.some(([, re]) => new RegExp(re.source).test(s)), s.slice(0, 3)).toBe(true);
    }
  });
});
