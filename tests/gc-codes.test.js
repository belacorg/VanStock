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

describe('reading the GC off the label barcode', () => {
  // The bottom-right barcode is the GC code followed by the staff ID of the
  // engineer the part was picked for: 612340 + 0000001.
  it('takes the code off the front and the engineer off the back', () => {
    expect(data.gcFromBarcode('6123400000001', '0000001')).toBe('612340');
    expect(data.gcFromBarcode('J612300000002', '0000002')).toBe('J61230');
  });

  // A label carries four or five barcodes and a camera finds whichever it
  // sees first. The staff ID is what tells the right one from the rest.
  it('ignores the tracking and tote barcodes', () => {
    const myId = '0000002';
    expect(data.gcFromBarcode('1200000000000000000000000001', myId)).toBe(null);
    expect(data.gcFromBarcode('21000002', myId)).toBe(null);
    expect(data.gcFromBarcode('1616009876543', myId)).toBe(null);
  });

  // Somebody else's label is not this engineer's part. Better to read nothing
  // than to add a line for stock that was never on the van.
  it('refuses a label picked for another engineer', () => {
    expect(data.gcFromBarcode('6123400000001', '0000002')).toBe(null);
  });

  it('falls back on the shape of the payload when no staff ID is set', () => {
    expect(data.gcFromBarcode('6123400000001')).toBe('612340');
    expect(data.gcFromBarcode('1200000000000000000000000001')).toBe(null);
  });

  it('survives whatever punctuation the reader hands back', () => {
    expect(data.gcFromBarcode(' 612340-0000001 ', '0000001')).toBe('612340');
  });

  it('returns null rather than a guess for anything it cannot place', () => {
    for (const junk of ['', null, undefined, 'hello', '12']) {
      expect(data.gcFromBarcode(junk, '0000002')).toBe(null);
    }
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
