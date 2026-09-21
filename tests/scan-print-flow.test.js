import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bootApp, seedState } from './helpers/app-harness.js';

// The camera and the OCR engine cannot run in JSDOM, so these drive the app
// from the point a read comes back: finishScan is a top-level function in a
// classic script, which makes it a property of the window like everything else.
const boot = () => bootApp({ storage: { vs_state: seedState() } });

describe('scanning a part that is not on the van', () => {
  // What Jake asked for: point it at a label and get the GC number AND the
  // description filled in, rather than typing the description by hand.
  it('fills in both the GC number and the description', () => {
    const app = boot();
    app.window.finishScan({ printGc: '619900', printDesc: '[H] Hive Active Plug SLP3' }, '');
    expect(app.$('#ps-number').value).toBe('619900');
    expect(app.$('#ps-name').value).toBe('[H] Hive Active Plug SLP3');
  });

  it('says it was read off the print, and to check the number', () => {
    const app = boot();
    app.window.finishScan({ printGc: '619900', printDesc: 'Hive plug' }, '');
    expect(app.$('.read-note').textContent).toContain('Check the GC number');
  });

  it('does not carry the note into an Add opened by hand afterwards', () => {
    const app = boot();
    app.window.finishScan({ printGc: '619900', printDesc: 'x' }, '');
    app.click('[data-close-sheet="part"]');
    app.click('[data-tab="stock"]');
    app.click('[data-add-part]');
    expect(app.$('.read-note')).toBe(null);
  });
});

describe('scanning a part that is on the van', () => {
  it('goes straight to the answer', () => {
    const app = boot();
    app.window.finishScan({ printGc: '248733' }, '');
    expect(app.$('.answer').className).toContain('on-van');
  });

  // The label font's 7 reads as a 1. One character off a part you carry is
  // asked about, not guessed at and not thrown away.
  it('asks about a read one character off a part you carry', () => {
    const app = boot();
    app.window.finishScan({ printGc: '248133', printDesc: 'Fan assembly' }, '');
    expect(app.text()).toContain('Is it this one?');
    expect(app.text()).toContain('248733');
  });

  it('goes to the part when the engineer says yes', () => {
    const app = boot();
    app.window.finishScan({ printGc: '248133' }, '');
    app.click('[data-maybe="yes"]');
    expect(app.$('#find-input').value).toBe('248733');
    expect(app.$('.answer')).toBeTruthy();
  });

  it('treats it as a new part, description and all, when they say no', () => {
    const app = boot();
    app.window.finishScan({ printGc: '248133', printDesc: 'Something else entirely' }, '');
    app.click('[data-maybe="no"]');
    expect(app.$('#ps-number').value).toBe('248133');
    expect(app.$('#ps-name').value).toBe('Something else entirely');
  });
});

describe('a scan that reads nothing', () => {
  it('says how to frame it: the top of the label, not the whole thing', () => {
    const app = boot();
    app.window.finishScan({}, '');
    expect(app.text()).toContain('top of the label');
    expect(app.text()).toContain('not the whole label');
  });

  it('never opens an empty Add sheet', () => {
    const app = boot();
    app.window.finishScan({ printDesc: 'a description with no code' }, '');
    expect(app.$('#ps-number')).toBe(null);
  });
});

describe('the label reader ships with the app', () => {
  const app = readFileSync('app/app.js', 'utf8');
  const sw = readFileSync('app/sw.js', 'utf8');

  // The labels carry customer names and addresses. Read on the phone, or not
  // at all — and every one of tesseract.js's three fetch paths has to be
  // overridden, or it falls back to its own CDN without saying so.
  it('points every path the engine fetches at this origin', () => {
    for (const key of ['workerPath', 'corePath', 'langPath']) {
      expect(app, `${key} must be set, or tesseract.js fetches from its CDN`).toMatch(new RegExp(`${key}: ocrUrl\\(`));
    }
  });

  // Seven megabytes forced onto every install, for a feature used when
  // restocking, is the wrong trade. It loads on the first scan and is kept
  // from then on by the ordinary fetch cache.
  it('is not precached at install', () => {
    expect(sw).not.toContain('tesseract');
  });

  it('is in the build', () => {
    for (const f of ['tesseract.min.js', 'worker.min.js', 'core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js', 'lang/eng.traineddata.gz']) {
      expect(() => readFileSync(`app/vendor/tesseract/${f}`), f).not.toThrow();
    }
  });
});
