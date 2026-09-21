import { describe, it, expect } from 'vitest';
import { loadData } from './helpers/load-data.js';
import { bootApp, seedState } from './helpers/app-harness.js';

const data = loadData();

// Read off real British Gas dispatch labels. Three are all digits and two
// start with a letter, which is the whole point of this file.
const REAL_CODES = ['612340', 'C00090', 'J61230', '612387', '619900'];

describe('GC codes', () => {
  it('accepts every shape a real label carries', () => {
    for (const code of REAL_CODES) expect(data.isGcCode(code), code).toBe(true);
  });

  it('is six characters, not six digits', () => {
    expect(data.isGcCode('C00090')).toBe(true);
    expect(data.isGcCode('74425')).toBe(false);
    expect(data.isGcCode('6123401')).toBe(false);
  });

  it('does not care how the engineer capitalises it', () => {
    expect(data.isGcCode('j61230')).toBe(true);
    expect(data.normaliseNumber('j61230')).toBe('J61230');
  });
});

describe('typing a code that starts with a letter', () => {
  // On a phone, inputmode="numeric" is a numeric keypad with no letters on it.
  // The field carried one, so C00090 and J61230 could not be entered at all —
  // silently, with no error, on the screen where stock goes in.
  it('does not force a numeric keypad on the GC field', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    app.click('[data-tab="stock"]');
    app.click('[data-add-part]');
    expect(app.$('#ps-number').getAttribute('inputmode')).toBe(null);
  });

  it('stores and finds a letter-prefixed code', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    app.click('[data-tab="stock"]');
    app.click('[data-add-part]');
    app.setValue('#ps-number', 'C00090', 'change');
    app.setValue('#ps-name', 'Primus gas cap', 'change');
    app.click('[data-save-part]');

    app.click('[data-tab="find"]');
    app.setValue('#find-input', 'c00090');
    expect(app.text()).toContain('Primus gas cap');
    expect(app.$('.answer').className).toContain('on-van');
  });
});
