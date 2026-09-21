import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { bootApp, seedState } from './helpers/app-harness.js';

// ADR-0010. A dispatch label carries the GC number, the description, and a lot
// that is none of this app's business: engineers' names and pay IDs, customer
// names and addresses, order, parcel and tote references. The app keeps the
// first two and nothing else.

describe('nothing off a label is kept but the code and the description', () => {
  // Earlier builds stored the staff ID off every barcode they read — other
  // engineers' pay numbers — plus the engineer's own. Ignoring them is not
  // enough; they have to be gone from the phone.
  it('deletes stored staff IDs from a phone that has them', () => {
    const old = JSON.parse(seedState());
    old.knownIds = ['0000001', '0000003'];
    old.settings.staffId = '0000002';
    const app = bootApp({ storage: { vs_state: JSON.stringify(old) } });

    const stored = JSON.parse(app.window.localStorage.getItem('vs_state'));
    expect(stored.knownIds).toBeUndefined();
    expect(stored.settings.staffId).toBeUndefined();
    expect(app.state().knownIds).toBeUndefined();
  });

  it('leaves the rest of the van alone while it does', () => {
    const old = JSON.parse(seedState());
    old.knownIds = ['0000001'];
    const app = bootApp({ storage: { vs_state: JSON.stringify(old) } });
    expect(app.state().parts).toHaveLength(3);
    expect(app.state().loans).toHaveLength(1);
  });

  it('does not rewrite storage on a phone that never had them', () => {
    const clean = seedState();
    const app = bootApp({ storage: { vs_state: clean } });
    expect(app.window.localStorage.getItem('vs_state')).toBe(clean);
  });

  it('keeps only the code and the description from a scan', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    app.window.finishScan({ printGc: '619900', printDesc: 'Hive plug' }, '');
    app.click('[data-save-part]');
    const added = app.state().parts.find(p => p.number === '619900');
    expect(added.name).toBe('Hive plug');
    const keys = Object.keys(added).sort();
    // The same fields a hand-typed part has — nothing extra that came off a label.
    expect(keys).toEqual(['addedOn', 'alt', 'boxId', 'dateCode', 'id', 'lastUsedOn', 'make', 'name', 'notes', 'number', 'qty', 'usedCount']);
  });

  it('does not ask for a staff ID anywhere', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    app.click('[data-tab="settings"]');
    expect(app.$('#staff-id')).toBe(null);
    expect(app.text()).not.toMatch(/staff ID/i);
  });

  // The barcode on the label carries a pay ID; the reader for it is gone.
  it('ships no barcode reader', () => {
    expect(existsSync('app/vendor/zxing.min.js')).toBe(false);
    expect(readFileSync('app/app.js', 'utf8')).not.toMatch(/zxing/i);
    expect(readFileSync('app/sw.js', 'utf8')).not.toMatch(/zxing/i);
  });
});
