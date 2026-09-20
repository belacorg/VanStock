// Boots the real app (data.cjs + app.js as classic scripts) inside JSDOM, so a
// test can drive it with genuine click events. The app is a string-template
// renderer with no module boundary, so this is the only way to cover render,
// listeners and state writes together.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const dataSrc = readFileSync(join(APP, 'data.cjs'), 'utf8');
const appSrc = readFileSync(join(APP, 'app.js'), 'utf8');

function runScript(window, src) {
  // Appended as <script> elements, the way index.html loads them — window.eval
  // would give each file its own lexical scope, and app.js reads data.cjs's
  // top-level consts.
  const el = window.document.createElement('script');
  el.textContent = src;
  window.document.body.appendChild(el);
}

// Pins `new Date()` and Date.now() while leaving explicit `new Date('...')`
// alone. Anything keyed on how long a part has been lent out is otherwise a
// different test every day.
function freezeDate(window, iso) {
  const RealDate = window.Date;
  const fixed = new RealDate(iso).getTime();
  function FakeDate(...args) {
    return args.length === 0 ? new RealDate(fixed) : new RealDate(...args);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => fixed;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;
}

export function bootApp({ now = '2026-09-20T09:00:00', storage = null } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost:3838/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  // JSDOM has no layout, so scrollTo() logs "not implemented" on every
  // re-render. The app's scroll restoration is not what these tests pin.
  window.scrollTo = () => {};
  if (now) freezeDate(window, now);
  if (storage) for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);

  runScript(window, dataSrc);
  runScript(window, appSrc);

  if (!window.document.querySelector('.bottom-nav')) {
    throw new Error('app did not render on load — boot path broken');
  }

  const $  = s => window.document.querySelector(s);
  const $$ = s => [...window.document.querySelectorAll(s)];
  const click = sel => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) throw new Error(`no element for ${sel}`);
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  };
  const setValue = (sel, value, event = 'input') => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) throw new Error(`no element for ${sel}`);
    el.value = value;
    el.dispatchEvent(new window.Event(event, { bubbles: true }));
  };
  const text = () => window.document.querySelector('#app').textContent;

  return { window, doc: window.document, $, $$, click, setValue, text, state: () => window.__vsGetState() };
}

// The van as it actually gets used: a few makes, a lent part, a part that has
// run out. Saved into localStorage before boot, the way a returning engineer's
// phone already holds it.
export function seedState(over = {}) {
  return JSON.stringify({
    version: 1,
    boxes: [
      { id: 'b1', label: 'Box 1' },
      { id: 'b2', label: 'Box 2' },
    ],
    parts: [
      { id: 'p1', number: '248733', name: 'Fan assembly', make: 'Worcester', boxId: 'b1', qty: 2, alt: [], addedOn: '2026-01-10', usedCount: 3, lastUsedOn: '2026-09-15', dateCode: '', notes: 'Fits 24i and 28i' },
      { id: 'p2', number: '178985', name: 'Diverter cartridge', make: 'Worcester', boxId: 'b1', qty: 0, alt: [], addedOn: '2026-02-01', usedCount: 1, lastUsedOn: '2026-08-01', dateCode: '', notes: '' },
      { id: 'p3', number: '0020014172', name: 'Expansion vessel', make: 'Vaillant', boxId: 'b2', qty: 1, alt: [], addedOn: '2026-03-03', usedCount: 0, lastUsedOn: null, dateCode: '', notes: '' },
    ],
    loans: [
      { id: 'l1', partId: 'p2', qty: 1, to: 'Dave', on: '2026-09-14', returnedOn: null },
    ],
    engineers: [{ name: 'Dave', phone: '07700900000' }],
    settings: { remindAfter: 4, theme: 'dark' },
    ...over,
  });
}
