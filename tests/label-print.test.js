import { describe, it, expect } from 'vitest';
import { loadData } from './helpers/load-data.js';

const data = loadData();

// Every fixture below is the SHAPE of what Tesseract actually produced on a
// real British Gas dispatch label — the stray marks, the mangled captions, the
// table rule read as a pipe — with the real codes swapped for invented ones.
// The repo is public; the labels carry colleagues' pay IDs.

describe('finding the GC code in what OCR read', () => {
  // "GC:" is small grey print and OCR reads it worst of anything on the label.
  // Requiring the caption threw away a correct read of the code beside it.
  it('reads the code when the caption came out as nonsense', () => {
    expect(data.parseLabelText('CFLOMBIL cc 712387\n+: Altecnic Filling Loop—WRAS TOTE').gc).toBe('712387');
    expect(data.parseLabelText('PSY NDP ————\noc: 712387\nFLO113310L\n.c: Altecnic Filling Loop').gc).toBe('712387');
  });

  it('reads a code that starts with a letter', () => {
    expect(data.parseLabelText('Loc: VN000000001 GC: J61230\nDesc: Heat Exchanger').gc).toBe('J61230');
  });

  // The pick time 08:27:24 strips to a perfect six digits and sits ABOVE the
  // GC code, so first-match would pick it every time.
  it('is not fooled by the pick time', () => {
    const r = data.parseLabelText('Pick Date: 20/11/2025 08:27:24 Qty: 1 of 1\nLoc: VN000000001 GC: J61230\nDesc: Heat Exchanger');
    expect(r.gc).toBe('J61230');
  });

  it('ignores the other numbers on the label, which are all the wrong length', () => {
    const label = [
      'Loc: FL0000001R GC: 712340',
      'Desc: Powerhead for V4073A Valves',
      'ID: 0000001',
      'WMIS No. 1700000001',
      'S/O: Y90000000001',
      'Tote No. 21000001',
    ].join('\n');
    expect(data.parseLabelText(label).gc).toBe('712340');
  });

  // V4073A is six characters with four digits: a perfect GC shape, sitting in
  // the description. The real code comes first and carries a caption.
  it('does not take a model number out of the description', () => {
    expect(data.parseLabelText('GC: 712340\nDesc: Powerhead for V4073A Valves').gc).toBe('712340');
  });

  // The gap after the caption's colon read as a 0 and glued to the code —
  // seen on the live camera path, in "single block" mode.
  it('drops a stray 0 or O read into the front of the code', () => {
    expect(data.parseLabelText('Loc: FL0000001R ~~ Gc: 0612387\nDesc: Altecnic Filling Loop').gc).toBe('612387');
    expect(data.parseLabelText('GC: O612387\nDesc: Altecnic Filling Loop').gc).toBe('612387');
  });

  // Dropping whichever end makes six would turn a stray at the far end into a
  // confident wrong code — and repeat it on every frame, so two reads would
  // "agree" on it. Better no read than that one.
  it('does not guess which end a different stray character is on', () => {
    expect(data.parseLabelText('GC: 6123870\nDesc: Altecnic Filling Loop').gc).toBe(null);
    expect(data.parseLabelText('GC: 7612387\nDesc: Altecnic Filling Loop').gc).toBe(null);
  });

  // A seven-digit number starting with 0 on this label is a staff ID. Trimming
  // is only ever for a code that sits right after a GC caption.
  it('never trims a staff ID into a code', () => {
    expect(data.parseLabelText('ID: 0000001\nName: SOMEONE').gc).toBe(null);
    expect(data.parseLabelText('0000001').gc).toBe(null);
  });

  it('finds nothing in text with no code in it', () => {
    expect(data.parseLabelText('Each\nSite: Depot').gc).toBe(null);
    expect(data.parseLabelText('').gc).toBe(null);
    expect(data.parseLabelText(null).gc).toBe(null);
  });
});

describe('the description', () => {
  it('is the line under the code, less its caption', () => {
    expect(data.parseLabelText('cc 712387\n+: Altecnic Filling Loop—WRAS TOTE').desc).toBe('Altecnic Filling Loop—WRAS TOTE');
  });

  it('loses the table rule OCR reads down the edge of the label', () => {
    expect(data.descFromLine('Desc: Heat Exchanger |')).toBe('Heat Exchanger');
    expect(data.descFromLine('pesc: [H] Hive Active Plug SLP3 \\')).toBe('[H] Hive Active Plug SLP3');
  });

  it('keeps a description that starts with a bracket', () => {
    expect(data.descFromLine('Desc: (H) Hive Active Plug')).toBe('(H) Hive Active Plug');
  });

  it('is nothing rather than an empty string', () => {
    expect(data.descFromLine('')).toBe(null);
    expect(data.descFromLine('Desc: |')).toBe(null);
  });
});

describe('a misread code', () => {
  const VAN = [
    { number: '712387', name: 'Altecnic filling loop' },
    { number: 'C00090', name: 'Primus gas cap' },
  ];

  // 7 read as 1 — the commonest miss in the trial, on the blurriest label.
  it('is recognised when it is one character off a part on the van', () => {
    expect(data.nearestPartByGc('112387', VAN).name).toBe('Altecnic filling loop');
    expect(data.nearestPartByGc('000090', VAN).name).toBe('Primus gas cap');
  });

  // The crumpled gas-cap label in the trial came back with TWO characters
  // wrong — the C as a 0 and a 0 as a 1. That is past what one substitution
  // can recover, and stretching to two would start matching strangers on a
  // hundred-line van. It goes to the Add sheet instead, where the engineer can
  // see it and fix it. Recorded here so nobody widens the rule to make a
  // number go up.
  it('does not recover a read that is two characters out', () => {
    expect(data.nearestPartByGc('010090', VAN)).toBe(null);
  });

  it('is not guessed at when two parts are equally close', () => {
    const twins = [{ number: '712387' }, { number: '712388' }];
    expect(data.nearestPartByGc('712389', twins)).toBe(null);
  });

  it('is not stretched to two characters', () => {
    expect(data.nearestPartByGc('112388', VAN)).toBe(null);
  });
});

describe('where a scan lands', () => {
  const VAN = [{ number: '712387', name: 'Altecnic filling loop' }];

  it('goes straight to a part that matches exactly', () => {
    expect(data.resolveScan({ printGc: '712387' }, VAN)).toMatchObject({ kind: 'found' });
  });

  // One tap to confirm beats either guessing or making the engineer type.
  it('asks "did you mean" about a near miss off the print', () => {
    const r = data.resolveScan({ printGc: '112387', printDesc: 'Altecnic Filling Loop' }, VAN);
    expect(r.kind).toBe('maybe');
    expect(r.part.number).toBe('712387');
  });

  // The thing Jake asked for: scan a part not on the van and get BOTH the
  // code and the description filled in.
  it('carries the description through for a part not on the van', () => {
    const r = data.resolveScan({ printGc: '619900', printDesc: '[H] Hive Active Plug SLP3' }, VAN);
    expect(r).toMatchObject({ kind: 'new', gc: '619900', desc: '[H] Hive Active Plug SLP3' });
  });

  it('says so when nothing was read at all', () => {
    expect(data.resolveScan({}, VAN).kind).toBe('unreadable');
    expect(data.resolveScan(null, VAN).kind).toBe('unreadable');
  });
});
