import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadData } from './helpers/load-data.js';
import { bootApp, seedState } from './helpers/app-harness.js';

const data = loadData();

const STOCK = [
  { id: 'p1', number: '612340', name: 'Powerhead for V4073A valves' },
  { id: 'p2', number: 'C00090', name: 'Primus gas cap' },
];

describe('what happens to a code once it is read', () => {
  it('goes to the part when it is already on the list', () => {
    const route = data.scanRoute('612340', STOCK);
    expect(route.kind).toBe('found');
    expect(route.part.id).toBe('p1');
  });

  it('offers to add it when it is not', () => {
    expect(data.scanRoute('619900', STOCK)).toEqual({ kind: 'new', gc: '619900' });
  });

  it('matches a letter-prefixed code the same as any other', () => {
    expect(data.scanRoute('c00090', STOCK).kind).toBe('found');
  });

  // Reading nothing must not look like reading something. An unreadable scan
  // that silently opened an empty Add sheet would put blank lines on the list.
  it('says so rather than guessing when nothing was read', () => {
    expect(data.scanRoute(null, STOCK)).toEqual({ kind: 'unreadable' });
    expect(data.scanRoute('', STOCK).kind).toBe('unreadable');
  });
});

describe('the scan button', () => {
  it('sits on the Find screen, where the lookup happens', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    const btn = app.$('.scan-btn');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('for')).toBe('scan-file');
  });

  // capture="environment" is what makes a phone open the back camera instead
  // of the photo library. Without it this is a file picker, not a scanner.
  it('opens the back camera rather than the photo library', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    const input = app.$('#scan-file');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.getAttribute('accept')).toBe('image/*');
  });
});

describe('the staff ID', () => {
  it('is remembered, and normalised the way a barcode payload is', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    app.click('[data-tab="settings"]');
    app.setValue('#staff-id', ' 0000002 ', 'change');
    expect(app.state().settings.staffId).toBe('0000002');
  });

  it('is optional — the ranking still separates the barcodes without it', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    expect(app.state().settings.staffId).toBe('');
    const pick = data.pickGcCandidate(['1616009876543', '6199000000002'], { knownIds: [], parts: [] });
    expect(pick.candidate.gc).toBe('619900');
  });

  // A part lent to you arrives on the lender's label with the lender's pay ID
  // on it. Treating the engineer's own ID as a filter refused exactly those.
  it('never refuses a label just because it was picked for someone else', () => {
    const mine = '0000002';
    const theirs = data.pickGcCandidate(['6123400000001'], { knownIds: [mine], parts: [] });
    expect(theirs.kind).toBe('one');
    expect(theirs.candidate.gc).toBe('612340');
  });

  // Settings is where the old rule was written down in plain English, so it is
  // where the wrong idea would survive a correct implementation.
  it('says in Settings that a borrowed part carries the other engineer\u2019s ID', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    app.click('[data-tab="settings"]');
    expect(app.text()).toContain('lends you carries');
    expect(app.text()).not.toContain('the only one ending in your own staff ID');
  });
});

describe('the reader ships with the app', () => {
  it('is in the build allowlist and the offline precache', () => {
    const build = readFileSync('build.mjs', 'utf8');
    const sw = readFileSync('app/sw.js', 'utf8');
    expect(build).toContain("'vendor'");
    expect(sw).toContain('/vendor/zxing.min.js');
  });

  // Local-only means local-only (ADR-0006). A reader pulled from a CDN at the
  // moment of use is a third-party request and a dependency on signal.
  it('is served from this origin, not a CDN', () => {
    const app = readFileSync('app/app.js', 'utf8');
    expect(app).toContain("ZXING_SRC = 'vendor/zxing.min.js'");
    expect(app).not.toMatch(/https?:\/\/cdn/);
  });

  // The library ships with raw control bytes inside its Aztec character table.
  // They are legal JavaScript and they parse fine, but they travel badly: the
  // artifact host refuses a text file carrying an ESC outright. They are
  // rewritten to \xNN escapes on the way in, which is the same value to the
  // engine — this test is what will notice if a future version brings them
  // back, rather than a publish failing with no obvious cause.
  it('carries no raw control bytes', () => {
    const buf = readFileSync('app/vendor/zxing.min.js');
    const bad = [...buf].filter(b => (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) || b === 0x7f);
    expect(bad).toEqual([]);
  });
});
