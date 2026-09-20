// The lookup layer ships as a classic <script>, so it is not a module in
// either sense: no `import`, no `require`, just globals and a CommonJS-shaped
// export at the bottom for the tests.
//
// It used to be named .cjs so Node could require() it past this package's
// "type": "module". That name is what GitHub Pages serves as
// application/node, which browsers refuse to execute — the deployed app came
// up blank with no console error worth the name. The file is data.js now, and
// the tests reach it the way the browser does: run the source, take what it
// hangs off `module.exports`.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');

export function loadData() {
  const src = readFileSync(join(APP, 'data.js'), 'utf8');
  const mod = { exports: {} };
  runInContext(src, createContext({ module: mod, exports: mod.exports, console }));
  return mod.exports;
}
