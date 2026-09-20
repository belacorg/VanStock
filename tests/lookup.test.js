import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const data = require('../app/data.cjs');

const part = (over = {}) => ({
  id: 'p', number: '248733', name: 'Fan assembly', make: 'Worcester',
  boxId: 'b1', qty: 1, alt: [], addedOn: '2026-01-01', usedCount: 0,
  lastUsedOn: null, notes: '', ...over,
});

describe('part numbers', () => {
  // The same number is punctuated three ways between the sticker, the
  // catalogue and the merchant's invoice. All three have to find the part.
  it('normalises spacing and dashes to one key', () => {
    expect(data.normaliseNumber('87 16 143 106 0')).toBe('87161431060');
    expect(data.normaliseNumber('8716-143-1060')).toBe('87161431060');
    expect(data.normaliseNumber('87161431060')).toBe('87161431060');
  });

  it('keeps letters, because not every part number is only digits', () => {
    expect(data.normaliseNumber('s1071500')).toBe('S1071500');
  });

  // Six digits is the common case, but Worcester run eleven and Vaillant ten.
  // A lookup that silently rejects those is worse than no lookup.
  it('does not care how long the number is', () => {
    const parts = [part({ id: 'a', number: '0020014172' })];
    expect(data.searchParts(parts, '0020014172').map(p => p.id)).toEqual(['a']);
  });
});

describe('search ranking', () => {
  const stock = [
    part({ id: 'exact',  number: '248733', name: 'Fan assembly' }),
    part({ id: 'prefix', number: '2487339', name: 'Fan grommet' }),
    part({ id: 'inside', number: '99248733', name: 'Gasket' }),
    part({ id: 'text',   number: '555000', name: 'Fan capacitor', notes: 'sits behind 248733' }),
  ];

  // The engineer typed a part number. The part with that number goes first —
  // anything else at the top is the app second-guessing them.
  it('puts the exact number first', () => {
    expect(data.searchParts(stock, '248733')[0].id).toBe('exact');
  });

  it('answers while the number is still being typed', () => {
    const hits = data.searchParts(stock, '2487');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe('exact');
  });

  it('ranks a prefix above a number that merely contains it', () => {
    const ids = data.searchParts(stock, '248733').map(p => p.id);
    expect(ids.indexOf('prefix')).toBeLessThan(ids.indexOf('inside'));
  });

  it('finds the half-remembered part by words', () => {
    expect(data.searchParts(stock, 'fan capacitor').map(p => p.id)).toContain('text');
  });

  // Adding words has to narrow the answer. The opposite behaviour would make
  // any guess longer than one word useless.
  it('requires every word typed to appear', () => {
    expect(data.searchParts(stock, 'fan assembly')).toHaveLength(1);
    expect(data.searchParts(stock, 'fan assembly vaillant')).toHaveLength(0);
  });

  it('floats what is actually on the van above what is not', () => {
    const tied = [
      part({ id: 'empty', number: '300100', qty: 0 }),
      part({ id: 'held',  number: '300101', qty: 2 }),
    ];
    expect(data.searchParts(tied, '3001')[0].id).toBe('held');
  });

  it('returns nothing for an empty query rather than the whole van', () => {
    expect(data.searchParts(stock, '')).toEqual([]);
    expect(data.searchParts(stock, '   ')).toEqual([]);
  });

  it('matches an alternate number the same as the printed one', () => {
    const superseded = [part({ id: 'new', number: '87161431060', alt: ['248733'] })];
    expect(data.searchParts(superseded, '248733')[0].id).toBe('new');
  });
});

describe('have I got it', () => {
  const today = '2026-09-20';

  it('says yes when there is one in the box', () => {
    const st = data.partStatus(part({ qty: 2 }), [], today);
    expect(st.kind).toBe('on-van');
    expect(st.qty).toBe(2);
  });

  // The difference that matters at the back doors: none in the box but
  // somebody is holding one means a phone call, not a drive to the merchant.
  it('distinguishes lent out from run out', () => {
    const p = part({ id: 'p1', qty: 0 });
    const lent = data.partStatus(p, [{ id: 'l1', partId: 'p1', qty: 1, to: 'Dave', on: today, returnedOn: null }], today);
    expect(lent.kind).toBe('lent-out');
    expect(lent.oldest.to).toBe('Dave');

    const gone = data.partStatus(p, [{ id: 'l1', partId: 'p1', qty: 1, to: 'Dave', on: '2026-09-01', returnedOn: '2026-09-05' }], today);
    expect(gone.kind).toBe('none-left');
  });

  // Holding one and having lent another is still "yes" — the engineer can
  // fit it today, which is the question being asked.
  it('says yes even when another one is out with someone', () => {
    const st = data.partStatus(part({ id: 'p1', qty: 1 }), [{ id: 'l1', partId: 'p1', qty: 1, to: 'Dave', on: today, returnedOn: null }], today);
    expect(st.kind).toBe('on-van');
    expect(st.out).toBe(1);
  });
});

describe('lent parts', () => {
  const today = '2026-09-20';

  it('stays quiet until the reminder point, then asks to be chased', () => {
    expect(data.loanState({ on: '2026-09-18' }, today, 4)).toBe('out');
    expect(data.loanState({ on: '2026-09-16' }, today, 4)).toBe('due');
    expect(data.loanState({ on: '2026-09-01' }, today, 4)).toBe('chase');
  });

  it('honours the engineer’s own reminder setting', () => {
    expect(data.loanState({ on: '2026-09-18' }, today, 2)).toBe('due');
    expect(data.loanState({ on: '2026-09-18' }, today, 10)).toBe('out');
  });

  it('surfaces the oldest first and leaves returned parts alone', () => {
    const loans = [
      { id: 'a', on: '2026-09-16', returnedOn: null },
      { id: 'b', on: '2026-09-02', returnedOn: null },
      { id: 'c', on: '2026-08-01', returnedOn: '2026-08-10' },
      { id: 'd', on: '2026-09-19', returnedOn: null },
    ];
    expect(data.loansNeedingChase(loans, today, 4).map(l => l.id)).toEqual(['b', 'a']);
  });
});

describe('what is not moving', () => {
  const today = '2026-09-20';

  it('leaves recently used stock alone', () => {
    expect(data.usageState(part({ lastUsedOn: '2026-09-01' }), today)).toBe('moving');
  });

  it('flags stock that has sat six months unused', () => {
    expect(data.usageState(part({ lastUsedOn: '2026-01-01' }), today)).toBe('stale');
    expect(data.usageState(part({ addedOn: '2025-01-01' }), today)).toBe('never');
  });

  // A part put on the van last week has not earned a verdict yet.
  it('does not judge a part that has only just gone on', () => {
    expect(data.usageState(part({ addedOn: '2026-09-14' }), today)).toBe('new');
  });
});

describe('grouping', () => {
  it('orders makes the way the van is packed, not alphabetically', () => {
    const stock = [
      part({ id: 'v', make: 'Vaillant' }),
      part({ id: 'a', make: 'Alpha' }),
      part({ id: 'w', make: 'Worcester' }),
    ];
    expect(data.groupByMake(stock, []).map(g => g.make)).toEqual(['Worcester', 'Vaillant', 'Alpha']);
  });

  it('puts an unrecognised make last rather than dropping it', () => {
    const stock = [part({ id: 'x', make: 'Some Merchant Own Brand' }), part({ id: 'w', make: 'Worcester' })];
    const makes = data.groupByMake(stock, []).map(g => g.make);
    expect(makes[makes.length - 1]).toBe('Some Merchant Own Brand');
  });

  it('walks the parts in box order inside a make', () => {
    const boxes = [{ id: 'b1' }, { id: 'b2' }];
    const stock = [part({ id: 'second', boxId: 'b2' }), part({ id: 'first', boxId: 'b1' })];
    expect(data.groupByMake(stock, boxes)[0].parts.map(p => p.id)).toEqual(['first', 'second']);
  });
});
