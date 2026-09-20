import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { bootApp } from './helpers/app-harness.js';

const require = createRequire(import.meta.url);
const data = require('../app/data.cjs');

const TODAY = '2026-09-20';

describe('the demo van', () => {
  const van = data.demoVan(TODAY);

  // A demo that contradicts itself teaches the wrong thing. Lending takes the
  // part off the van (ADR-0002), so a part with an open loan against it cannot
  // also be sitting in its box in the fixture — the first hand-written seed
  // made exactly this mistake and showed "1 on board" for a part Marc had.
  it('agrees with itself about what is on the van', () => {
    for (const loan of van.loans.filter(l => !l.returnedOn)) {
      const part = van.parts.find(p => p.id === loan.partId);
      expect(part, `loan ${loan.id} points at a part that is not on the list`).toBeTruthy();
      const status = data.partStatus(part, van.loans, TODAY);
      expect(['on-van', 'lent-out']).toContain(status.kind);
    }
  });

  it('has something for every state the Find screen can show', () => {
    const kinds = van.parts.map(p => data.partStatus(p, van.loans, TODAY).kind);
    expect(kinds).toContain('on-van');
    expect(kinds).toContain('lent-out');
  });

  // The chase list is the part of the app hardest to picture from a
  // description, so the demo has to open with one on it and one not.
  it('opens with exactly one loan worth chasing', () => {
    expect(data.loansNeedingChase(van.loans, TODAY, 4)).toHaveLength(1);
  });

  it('moves with the calendar instead of ageing into nonsense', () => {
    const later = data.demoVan('2027-03-01');
    expect(data.loansNeedingChase(later.loans, '2027-03-01', 4)).toHaveLength(1);
  });

  // The GC code off the dispatch label, which is six CHARACTERS — 612340 and
  // 619900, but also C00090 and J61230. An earlier cut of this fixture was all
  // digits, which quietly hid the fact that a digits-only assumption locks an
  // engineer out of every part whose code starts with a letter.
  it('uses GC codes the shape real ones come in', () => {
    for (const part of van.parts) {
      expect(data.isGcCode(part.number), `${part.name}: ${part.number} is not a GC code`).toBe(true);
    }
  });

  it('includes codes that start with a letter, because real ones do', () => {
    expect(van.parts.some(p => /^[A-Z]/.test(p.number))).toBe(true);
  });

  // The label comes off, and the only number left is the one moulded into the
  // part. That has to find the line too.
  it('finds a part by the manufacturer number when the label has gone', () => {
    const hit = data.searchParts(van.parts, '87161431060');
    expect(hit).toHaveLength(1);
    expect(hit[0].number).toBe('251190');
  });

  it('every part sits in a box the demo actually defines', () => {
    const ids = new Set(van.boxes.map(b => b.id));
    for (const p of van.parts) expect(ids.has(p.boxId), `${p.number} is in no box`).toBe(true);
  });
});

describe('loading the demo from an empty van', () => {
  it('fills the list and says the numbers are invented', () => {
    const app = bootApp();
    app.click('[data-load-demo]');
    expect(app.state().parts.length).toBeGreaterThan(10);
    expect(app.text()).toContain('Every part number on this list is invented');
  });

  it('can be wiped back to nothing from Settings', () => {
    const app = bootApp();
    app.click('[data-load-demo]');
    app.click('[data-tab="settings"]');
    app.click('[data-erase="ask"]');
    app.click('[data-erase="do"]');
    expect(app.state().parts).toHaveLength(0);
    expect(app.state().demo).toBeFalsy();
  });
});
