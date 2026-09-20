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
  const MINE = '0000002';

  // The bottom-right barcode is the GC code followed by the staff ID of the
  // engineer the part was picked for: 612340 + 0000001.
  it('takes the code off the front and the engineer off the back', () => {
    expect(data.gcCandidate('6123400000001')).toMatchObject({ gc: '612340', pickedFor: '0000001' });
    expect(data.gcCandidate('J612300000002')).toMatchObject({ gc: 'J61230', pickedFor: '0000002' });
  });

  it('ignores anything that is not the right shape', () => {
    for (const junk of ['', null, undefined, 'hello', '12', '1200000000000000000000000001', '21000002']) {
      expect(data.gcCandidate(junk)).toBe(null);
    }
  });

  // THE ONE THAT MATTERS. A part another engineer lends you arrives on THEIR
  // label, carrying THEIR pay ID. An earlier version required the trailing ID
  // to be the engineer's own and so refused every borrowed part — precisely
  // the parts the lending half of this app exists for.
  it('reads a label picked for another engineer', () => {
    const pick = data.pickGcCandidate(['6123400000001'], { knownIds: [MINE], parts: [] });
    expect(pick.kind).toBe('one');
    expect(pick.candidate.gc).toBe('612340');
    expect(pick.candidate.pickedFor).toBe('0000001');
  });

  // But the shape alone cannot be trusted: a ByBox tracking number runs to
  // thirteen digits too, and then "six of code, seven of ID" fits it perfectly
  // and yields a stock code that never existed.
  it('prefers a real GC barcode over a tracking number of the same shape', () => {
    const both = ['1616009876543', '6199000000002'];
    const pick = data.pickGcCandidate(both, { knownIds: [MINE], parts: [] });
    expect(pick.kind).toBe('one');
    expect(pick.candidate.gc).toBe('619900');
  });

  it('still separates them when the code is already on the van', () => {
    const pick = data.pickGcCandidate(['1616009876543', '6123400000001'], {
      knownIds: [], parts: [{ number: '612340' }],
    });
    expect(pick.candidate.gc).toBe('612340');
  });

  it('asks rather than guesses when it genuinely cannot tell', () => {
    const pick = data.pickGcCandidate(['1616009876543', '1234567654321'], { knownIds: [], parts: [] });
    expect(pick.kind).toBe('ambiguous');
    expect(pick.candidates).toHaveLength(2);
  });

  it('reads nothing as nothing', () => {
    expect(data.pickGcCandidate([], { knownIds: [MINE] }).kind).toBe('none');
    expect(data.pickGcCandidate(['21000002'], {}).kind).toBe('none');
  });

  it('survives whatever punctuation the reader hands back', () => {
    expect(data.gcCandidate(' 612340-0000001 ').gc).toBe('612340');
  });
});

describe('learning the staff IDs it meets', () => {
  // The second label from an engineer you borrow from should not have to be
  // asked about. One confirmed scan is the app being told.
  it('remembers an ID, newest first, without duplicating it', () => {
    let known = [];
    known = data.rememberStaffId(known, '0000001');
    known = data.rememberStaffId(known, '0000003');
    known = data.rememberStaffId(known, '0000001');
    expect(known).toEqual(['0000001', '0000003']);
  });

  it('turns an ambiguous label into a clear one once the ID is known', () => {
    const both = ['1616009876543', '6123400000001'];
    expect(data.pickGcCandidate(both, { knownIds: [], parts: [] }).candidate.gc).toBe('612340');

    const learned = data.rememberStaffId([], '9876543');   // suppose it went the other way
    const pick = data.pickGcCandidate(both, { knownIds: learned, parts: [] });
    expect(pick.candidate.gc).toBe('161600');
  });

  it('does not grow without bound', () => {
    let known = [];
    for (let i = 0; i < data.MAX_KNOWN_IDS + 15; i++) known = data.rememberStaffId(known, String(1000000 + i));
    expect(known).toHaveLength(data.MAX_KNOWN_IDS);
  });

  it('ignores an empty ID rather than storing a blank', () => {
    expect(data.rememberStaffId(['0000001'], '')).toEqual(['0000001']);
    expect(data.rememberStaffId(['0000001'], null)).toEqual(['0000001']);
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
