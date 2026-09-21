import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadData } from './helpers/load-data.js';
import { bootApp, seedState } from './helpers/app-harness.js';

const data = loadData();

const STOCK = [
  { id: 'p1', number: '612340', name: 'Powerhead for V4073A valves' },
  { id: 'p2', number: 'C00090', name: 'Primus gas cap' },
];

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

