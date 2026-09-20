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

  it('is optional — scanning still has a fallback without it', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    expect(app.state().settings.staffId).toBe('');
    expect(data.gcFromBarcode('6123400000001')).toBe('612340');
  });

  // Somebody else's label is not this engineer's stock.
  it('refuses a label picked for another engineer once it is set', () => {
    expect(data.gcFromBarcode('6123400000001', '0000002')).toBe(null);
    expect(data.gcFromBarcode('6123400000001', '0000001')).toBe('612340');
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
