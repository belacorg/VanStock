import { describe, it, expect } from 'vitest';
import { loadData } from './helpers/load-data.js';

const data = loadData();
const VAN = [{ number: '612387', name: 'Altecnic filling loop' }];
const r = (gc, desc) => ({ gc, desc });

describe('when a live scan acts', () => {
  it('takes a part on the van on the first read', () => {
    expect(data.liveVerdict([r('612387', 'Altecnic Filling Loop')], VAN)).toMatchObject({ accept: true, gc: '612387' });
  });

  // One read of something not on the van is exactly the read that was wrong
  // in the field — a 7 as a 1, fine on the retake. Wait for another.
  it('waits for a second read of anything else', () => {
    expect(data.liveVerdict([r('619900')], VAN)).toMatchObject({ accept: false, tentative: '619900' });
    expect(data.liveVerdict([r('619900'), r('619900')], VAN)).toMatchObject({ accept: true, gc: '619900' });
  });

  // The field failure, replayed: the first frame reads the 7 as a 1, the next
  // two read it right. The misread never reaches the engineer.
  it('lets a one-off misread be outvoted', () => {
    const reads = [r('112387'), r('612387')];
    expect(data.liveVerdict(reads, VAN)).toMatchObject({ accept: true, gc: '612387' });
  });

  it('does not act on two reads that disagree', () => {
    expect(data.liveVerdict([r('619900'), r('119900')], VAN).accept).toBe(false);
  });

  it('only counts agreement among the last three reads', () => {
    const reads = [r('619900'), r('111111'), r('222222'), r('619900')];
    expect(data.liveVerdict(reads, VAN).accept).toBe(false);
  });

  it('ignores frames that read no code at all', () => {
    const reads = [r('619900'), r(null), r('619900')];
    expect(data.liveVerdict(reads, VAN)).toMatchObject({ accept: true, gc: '619900' });
  });

  it('has nothing to say before anything is read', () => {
    expect(data.liveVerdict([], VAN)).toEqual({ accept: false, tentative: null });
    expect(data.liveVerdict([r(null)], VAN).accept).toBe(false);
  });
});

describe('the description a live scan settles on', () => {
  it('is the one the agreeing reads gave most often', () => {
    const reads = [r('619900', 'Hive Active Plug'), r('619900', 'Hive Actlve Plug'), r('619900', 'Hive Active Plug')];
    expect(data.liveVerdict(reads, VAN).desc).toBe('Hive Active Plug');
  });

  it('prefers the fuller one when two are tied', () => {
    expect(data.bestDesc([r('x', 'Hive Plug'), r('x', 'Hive Active Plug')])).toBe('Hive Active Plug');
  });

  it('is nothing rather than an empty string', () => {
    expect(data.bestDesc([r('x', ''), r('x', null)])).toBe(null);
  });
});
