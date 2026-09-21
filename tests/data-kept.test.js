import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { bootApp, seedState } from './helpers/app-harness.js';
import { loadData } from './helpers/load-data.js';

// An engineer types a hundred parts in once. An update that loses them ends
// the app's use on the spot — Jake: "I don't want to be providing updates and
// then it wipes everything." Every way this app could lose a van is here.
const data = loadData();
const V1 = readFileSync('tests/fixtures/state-v1.json', 'utf8');
const boot = (storage) => bootApp({ storage });
const stored = (app) => JSON.parse(app.window.localStorage.getItem('vs_state'));
const snaps = (app) => JSON.parse(app.window.localStorage.getItem('vs_backups') || '[]');

describe('an update never loses the van', () => {
  // Every shape ever shipped gets a fixture here, and every one of them must
  // load into the current app with nothing the engineer entered missing.
  it('loads a van saved by the first builds, with every part, loan, box and contact', () => {
    const app = boot({ vs_state: V1 });
    const s = app.state();
    expect(s.parts.map(p => p.number)).toEqual(['612340', 'C00090']);
    expect(s.parts[1]).toMatchObject({ name: 'Primus gas cap', dateCode: '03/24', notes: 'keep two', qty: 0 });
    expect(s.loans).toEqual(JSON.parse(V1).loans);
    expect(s.boxes).toEqual(JSON.parse(V1).boxes);
    expect(s.engineers).toEqual(JSON.parse(V1).engineers);
    expect(s.settings).toMatchObject({ remindAfter: 5, theme: 'light' });
  });

  it('saves it forward at the current version', () => {
    const app = boot({ vs_state: V1 });
    expect(stored(app).version).toBe(data.DATA_VERSION);
  });

  // The one thing the v1 → v2 step is allowed to remove (ADR-0010).
  it('drops only the stored staff IDs on the way', () => {
    const app = boot({ vs_state: V1 });
    expect(stored(app).knownIds).toBeUndefined();
    expect(stored(app).settings.staffId).toBeUndefined();
  });

  // An update that gets a migration wrong must be undoable.
  it('keeps a copy of the old shape before changing it', () => {
    const app = boot({ vs_state: V1 });
    const before = snaps(app).find(s => s.reason === 'before-update');
    expect(before).toBeTruthy();
    expect(JSON.parse(before.json).parts).toHaveLength(2);
  });

  // An older copy of the app, served from cache after a newer one has run,
  // must not strip what it does not understand when it saves.
  it('carries fields it does not recognise straight through', () => {
    const newer = JSON.parse(seedState());
    newer.vanLayout = { racking: 'Vario', rows: 2 };
    newer.parts[0].photo = 'kept';
    const app = boot({ vs_state: JSON.stringify(newer) });
    app.click('[data-tab="stock"]');
    app.click('[data-tab="find"]');
    app.window.save();
    expect(stored(app).vanLayout).toEqual({ racking: 'Vario', rows: 2 });
    expect(stored(app).parts[0].photo).toBe('kept');
  });

  it('never migrates backwards from a newer version', () => {
    const r = data.migrateState({ version: 99, parts: [], somethingNew: 1 });
    expect(r.migrated).toBe(false);
    expect(r.state.version).toBe(99);
    expect(r.state.somethingNew).toBe(1);
  });

  it('does not touch storage on a phone already at the current version', () => {
    const clean = seedState();
    const app = boot({ vs_state: clean });
    expect(app.window.localStorage.getItem('vs_state')).toBe(clean);
  });
});

describe('a damaged save', () => {
  // The bug this replaced: a save that would not parse came back as an empty
  // van, and the next thing the engineer did wrote that empty van over the
  // only copy of what they had.
  it('is set aside exactly as it was, never written over', () => {
    const app = boot({ vs_state: '{"version":2,"parts":[{"id":"p1"' });
    expect(app.window.localStorage.getItem('vs_state_unreadable')).toBe('{"version":2,"parts":[{"id":"p1"');
    app.click('[data-add-part]');
    app.setValue('#ps-number', '612340', 'change');
    app.click('[data-save-part]');
    expect(app.window.localStorage.getItem('vs_state_unreadable')).toBe('{"version":2,"parts":[{"id":"p1"');
  });

  it('is replaced by the newest automatic backup that reads', () => {
    const good = JSON.parse(seedState());
    const backups = [
      { at: '2026-09-19T08:00:00.000Z', reason: 'daily', json: '{broken' },
      { at: '2026-09-18T08:00:00.000Z', reason: 'daily', json: JSON.stringify(good) },
    ];
    const app = boot({ vs_state: 'not json at all', vs_backups: JSON.stringify(backups) });
    expect(app.state().parts).toHaveLength(3);
    expect(app.text()).toContain('Recovered.');
    expect(app.text()).toContain('set aside, not deleted');
  });

  it('says so when there is no backup to fall back on', () => {
    const app = boot({ vs_state: 'not json at all' });
    expect(app.state().parts).toHaveLength(0);
    expect(app.text()).toContain('no automatic backup');
  });

  it('keeps the first damaged copy if a second one comes along', () => {
    const app = boot({ vs_state: 'second', vs_state_unreadable: 'first' });
    expect(app.window.localStorage.getItem('vs_state_unreadable')).toBe('first');
  });
});

describe('automatic backups', () => {
  it('takes one a day as the app opens', () => {
    const app = boot({ vs_state: seedState() });
    expect(snaps(app).filter(s => s.reason === 'daily')).toHaveLength(1);
  });

  it('does not take a second the same day', () => {
    const first = boot({ vs_state: seedState() });
    const again = boot({ vs_state: seedState(), vs_backups: first.window.localStorage.getItem('vs_backups') });
    expect(snaps(again)).toHaveLength(1);
  });

  it('does not bother with an empty van', () => {
    const app = boot({});
    expect(snaps(app)).toHaveLength(0);
  });

  it('keeps a handful, newest first, and skips an identical copy', () => {
    let list = [];
    for (let i = 0; i < data.MAX_SNAPSHOTS + 4; i++) list = data.addSnapshot(list, { parts: [{ n: i }] }, `t${i}`, 'daily');
    expect(list).toHaveLength(data.MAX_SNAPSHOTS);
    expect(list[0].at).toBe(`t${data.MAX_SNAPSHOTS + 3}`);
    expect(data.addSnapshot(list, { parts: [{ n: data.MAX_SNAPSHOTS + 3 }] }, 'later', 'daily')).toHaveLength(data.MAX_SNAPSHOTS);
    expect(data.addSnapshot(list, { parts: [{ n: data.MAX_SNAPSHOTS + 3 }] }, 'later', 'daily')[0].at).toBe(`t${data.MAX_SNAPSHOTS + 3}`);
  });

  // Storage is shared with CTAP Tracker. A full quota must cost old backups,
  // not the save.
  it('gives up the oldest backups when storage is full, rather than failing', () => {
    const app = boot({ vs_state: seedState() });
    const ls = app.window.localStorage;
    const real = ls.setItem.bind(ls);
    // Five older, different vans already stored, so the new one is not a
    // duplicate and really has to be written.
    const five = Array.from({ length: 5 }, (_, i) => {
      const v = JSON.parse(seedState()); v.parts[0].qty = 10 + i;
      return { at: `2026-09-1${i}T00:00:00Z`, reason: 'daily', json: JSON.stringify(v) };
    });
    real('vs_backups', JSON.stringify(five));
    vi.spyOn(ls, 'setItem').mockImplementation((k, v) => {
      if (k === 'vs_backups' && v.length > 3 * seedState().length) throw new Error('QuotaExceededError');
      return real(k, v);
    });
    app.window.snapshot('before-restore');
    const kept = JSON.parse(ls.getItem('vs_backups'));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept[0].reason).toBe('before-restore');
  });
});

describe('restoring', () => {
  it('takes two taps to restore an automatic backup', () => {
    const older = JSON.parse(seedState());
    older.parts = older.parts.slice(0, 1);
    const app = boot({ vs_state: seedState(), vs_backups: JSON.stringify([{ at: '2026-09-18T08:00:00Z', reason: 'daily', json: JSON.stringify(older) }]) });
    app.click('[data-tab="settings"]');
    app.click('[data-restore-snap="1"]');
    expect(app.state().parts).toHaveLength(3);
    app.click('[data-restore-snap="1"]');
    expect(app.state().parts).toHaveLength(1);
  });

  // A restore is undoable: what it replaced is the newest backup.
  it('backs up the list it replaces', () => {
    const older = JSON.parse(seedState());
    older.parts = older.parts.slice(0, 1);
    const app = boot({ vs_state: seedState(), vs_backups: JSON.stringify([{ at: '2026-09-18T08:00:00Z', reason: 'daily', json: JSON.stringify(older) }]) });
    app.window.restoreSnapshot(1);
    // What matters is that the replaced list can be got back. If the day's
    // backup already held it, an identical second copy is rightly skipped.
    const newest = snaps(app)[0];
    expect(JSON.parse(newest.json).parts).toHaveLength(3);
    expect(app.state().parts).toHaveLength(1);
  });

  it('brings an old-shaped backup file up to date', () => {
    const app = boot({ vs_state: seedState() });
    app.window.replaceVan(JSON.parse(V1), 'ok');
    expect(app.state().version).toBe(data.DATA_VERSION);
    expect(app.state().knownIds).toBeUndefined();
    expect(app.state().parts).toHaveLength(2);
  });

  it('refuses a file that is not a Van Stock backup', () => {
    expect(data.looksLikeBackup({ jct_state: 1 })).toBe(false);
    expect(data.looksLikeBackup(null)).toBe(false);
    expect(data.looksLikeBackup({ parts: [] })).toBe(true);
  });
});

describe('saving a copy off the phone', () => {
  it('uses the share sheet where the phone has one, and remembers when', async () => {
    const app = boot({ vs_state: seedState() });
    const share = vi.fn(() => Promise.resolve());
    app.window.navigator.canShare = () => true;
    app.window.navigator.share = share;
    app.click('[data-tab="settings"]');
    app.click('[data-export]');
    await new Promise(r => setTimeout(r, 0));
    expect(share).toHaveBeenCalled();
    expect(share.mock.calls[0][0].files[0].name).toBe('van-stock-2026-09-20.json');
    expect(app.state().settings.lastExportedOn).toBe('2026-09-20');
  });

  it('does not count a share the engineer cancelled', async () => {
    const app = boot({ vs_state: seedState() });
    app.window.navigator.canShare = () => true;
    app.window.navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));
    app.click('[data-tab="settings"]');
    app.click('[data-export]');
    await new Promise(r => setTimeout(r, 0));
    expect(app.state().settings.lastExportedOn).toBeUndefined();
  });

  it('warns when a van with stock on it has never been saved off the phone', () => {
    const app = boot({ vs_state: seedState() });
    app.click('[data-tab="settings"]');
    expect(app.$('.export-age.warn').textContent).toContain('Never saved off this phone');
  });
});

describe('erasing', () => {
  it('takes the backups with it, and says so first', () => {
    const app = boot({ vs_state: seedState(), vs_state_unreadable: 'x' });
    app.click('[data-tab="settings"]');
    app.click('[data-erase="ask"]');
    expect(app.text()).toContain('automatic backups');
    app.click('[data-erase="do"]');
    const ls = app.window.localStorage;
    expect(ls.getItem('vs_state')).toBe(null);
    expect(ls.getItem('vs_backups')).toBe(null);
    expect(ls.getItem('vs_state_unreadable')).toBe(null);
  });
});

describe('living next door to CTAP Tracker', () => {
  // Same address, so the same cache list. Van Stock used to delete every
  // cache that was not its own — CTAP Tracker's offline copy included.
  it('only ever clears its own caches', () => {
    const sw = readFileSync('app/sw.js', 'utf8');
    expect(sw).toMatch(/k\.startsWith\('vanstock-'\) && k !== CACHE/);
  });
});
