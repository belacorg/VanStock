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
    expect(app.$('.scan-btn[data-live-scan]')).toBeTruthy();
  });

  // The photo route stays as the fallback for a phone that will not share its
  // camera feed, and capture="environment" is what makes it open the back
  // camera rather than the photo library.
  it('keeps a photo route that opens the back camera', () => {
    const app = bootApp({ storage: { vs_state: seedState() } });
    const input = app.$('#scan-file');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.getAttribute('accept')).toBe('image/*');
  });
});
