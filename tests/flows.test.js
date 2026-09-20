import { describe, it, expect } from 'vitest';
import { bootApp, seedState } from './helpers/app-harness.js';

const boot = (over) => bootApp({ storage: { vs_state: seedState(over) } });

describe('the lookup, end to end', () => {
  // The whole app in one test: type six digits, read the answer, walk to the
  // box. If this breaks, nothing else matters.
  it('answers with the box when the part is on the van', () => {
    const app = boot();
    app.setValue('#find-input', '248733');
    expect(app.$('.answer').className).toContain('on-van');
    expect(app.text()).toContain("Yes — it's on the van");
    expect(app.text()).toContain('Box 1');
    expect(app.text()).toContain('2 on board');
  });

  it('names who has it when it is lent out, and offers to ring them', () => {
    const app = boot();
    app.setValue('#find-input', '178985');
    expect(app.$('.answer').className).toContain('lent-out');
    expect(app.text()).toContain('Dave has it');
    expect(app.$('a[href="tel:07700900000"]')).toBeTruthy();
  });

  it('offers to add a part it has never heard of', () => {
    const app = boot();
    app.setValue('#find-input', '999111');
    expect(app.text()).toContain('Not on the van');
    expect(app.$('[data-add-number="999111"]')).toBeTruthy();
  });

  it('finds the part by words when the number has gone', () => {
    const app = boot();
    app.setValue('#find-input', 'expansion vessel');
    expect(app.text()).toContain('Box 2');
  });

  it('shows nothing until something is typed', () => {
    const app = boot();
    expect(app.$('.answer')).toBeFalsy();
  });
});

describe('using a part', () => {
  it('takes one off the van and remembers when', () => {
    const app = boot();
    app.setValue('#find-input', '248733');
    app.click('[data-use="p1"]');
    const p = app.state().parts.find(x => x.id === 'p1');
    expect(p.qty).toBe(1);
    expect(p.usedCount).toBe(4);
    expect(p.lastUsedOn).toBe('2026-09-20');
  });

  it('flips the answer to none left once the last one goes', () => {
    const app = boot();
    app.setValue('#find-input', '0020014172');
    app.click('[data-use="p3"]');
    expect(app.$('.answer').className).toContain('none');
    expect(app.text()).toContain('None left');
  });

  // Restocking is the other half. Without it the count only ever goes down and
  // the list stops matching the van within a fortnight.
  it('puts one back when the van is restocked', () => {
    const app = boot();
    app.setValue('#find-input', '178985');
    app.click('[data-restock="p2"]');
    expect(app.state().parts.find(x => x.id === 'p2').qty).toBe(1);
  });
});

describe('lending', () => {
  it('moves the part off the van and records who and when', () => {
    const app = boot();
    app.setValue('#find-input', '248733');
    app.click('[data-lend="p1"]');
    app.setValue('#ls-to', 'Marc', 'change');
    app.setValue('#ls-phone', '07700900111', 'change');
    app.click('[data-save-lend]');

    const s = app.state();
    expect(s.parts.find(p => p.id === 'p1').qty).toBe(1);
    const loan = s.loans.find(l => l.to === 'Marc');
    expect(loan.on).toBe('2026-09-20');
    expect(loan.returnedOn).toBe(null);
    // The number belongs to the engineer, not the loan — next time it is
    // already there.
    expect(s.engineers.find(e => e.name === 'Marc').phone).toBe('07700900111');
  });

  it('will not lend what is not there', () => {
    const app = boot();
    app.setValue('#find-input', '178985');   // p2, none on the van
    expect(app.$('[data-lend="p2"]')).toBeFalsy();
  });

  it('puts the part back in the box when it comes home', () => {
    const app = boot();
    app.click('[data-tab="loans"]');
    app.click('[data-return="l1"]');
    const s = app.state();
    expect(s.parts.find(p => p.id === 'p2').qty).toBe(1);
    expect(s.loans.find(l => l.id === 'l1').returnedOn).toBe('2026-09-20');
  });

  // A part that was fitted or binned is not coming back. The box count must
  // not pretend otherwise — but it did get used, so the tally should say so.
  it('writes a part off without putting it back on the van', () => {
    const app = boot();
    app.click('[data-tab="loans"]');
    app.click('[data-drop-loan="l1"]');
    const s = app.state();
    expect(s.parts.find(p => p.id === 'p2').qty).toBe(0);
    expect(s.parts.find(p => p.id === 'p2').usedCount).toBe(2);
    expect(s.loans.find(l => l.id === 'l1').writtenOff).toBe(true);
  });
});

describe('chasing', () => {
  it('raises a lent part on the Find screen once it is overdue', () => {
    const app = boot();   // Dave has had p2 since the 14th; reminder is 4 days
    expect(app.text()).toContain('Worth a phone call');
    expect(app.text()).toContain('Dave');
  });

  it('says nothing about a part lent this morning', () => {
    const app = boot({ loans: [{ id: 'l1', partId: 'p2', qty: 1, to: 'Dave', on: '2026-09-20', returnedOn: null }] });
    expect(app.text()).not.toContain('Worth a phone call');
  });

  it('marks the Lent out tab when something needs chasing', () => {
    const app = boot();
    expect(app.$('[data-tab="loans"] .nav-dot')).toBeTruthy();
  });
});

describe('adding stock', () => {
  it('adds a part and finds it straight away', () => {
    const app = boot();
    app.click('[data-tab="stock"]');
    app.click('[data-add-part]');
    app.setValue('#ps-number', '313042', 'change');
    app.setValue('#ps-name', 'Pressure sensor', 'change');
    app.click('[data-save-part]');

    app.click('[data-tab="find"]');
    app.setValue('#find-input', '313042');
    expect(app.text()).toContain('Pressure sensor');
    expect(app.$('.answer').className).toContain('on-van');
  });

  // Two lines for one part number is how a stock list starts lying about what
  // is on the van.
  it('treats a number already on the list as a restock, not a second line', () => {
    const app = boot();
    app.click('[data-tab="stock"]');
    app.click('[data-add-part]');
    app.setValue('#ps-number', '248733', 'change');
    app.click('[data-save-part]');

    const s = app.state();
    expect(s.parts.filter(p => p.number === '248733')).toHaveLength(1);
    expect(s.parts.find(p => p.id === 'p1').qty).toBe(3);
  });

  // Every control in the sheet re-renders it. If the draft is not read back
  // first, stepping the quantity throws away the number just typed.
  it('keeps what has been typed when the quantity is stepped', () => {
    const app = boot();
    app.click('[data-tab="stock"]');
    app.click('[data-add-part]');
    app.setValue('#ps-number', '313042', 'change');
    app.setValue('#ps-name', 'Pressure sensor', 'change');
    app.click('[data-qty="1"]');
    expect(app.$('#ps-number').value).toBe('313042');
    expect(app.$('#ps-name').value).toBe('Pressure sensor');
    expect(app.$('.stepper-val').textContent.trim()).toBe('2');
  });
});

describe('boxes', () => {
  it('leaves the parts on the list when a box is deleted', () => {
    const app = boot();
    app.click('[data-tab="settings"]');
    app.click('[data-edit-box="b1"]');
    app.click('[data-delete-box="b1"]');
    const s = app.state();
    expect(s.parts).toHaveLength(3);
    expect(s.parts.find(p => p.id === 'p1').boxId).toBe('');
  });

  it('renames a box and the answer follows', () => {
    const app = boot();
    app.click('[data-tab="settings"]');
    app.click('[data-edit-box="b1"]');
    app.setValue('#bs-label', 'Worcester shelf', 'change');
    app.click('[data-save-box]');
    app.click('[data-tab="find"]');
    app.setValue('#find-input', '248733');
    expect(app.text()).toContain('Worcester shelf');
  });
});

describe('a van with nothing on it', () => {
  it('opens on an invitation rather than an empty list', () => {
    const app = bootApp();
    expect(app.text()).toContain('Nothing on the van yet');
    expect(app.$('[data-add-part]')).toBeTruthy();
  });

  it('still renders every tab', () => {
    const app = bootApp();
    for (const tab of ['stock', 'loans', 'settings', 'find']) {
      app.click(`[data-tab="${tab}"]`);
      expect(app.$('.bottom-nav')).toBeTruthy();
    }
  });
});
