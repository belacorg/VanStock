# ADR-0007: The deployed folder is an allowlist of static files

## Status
Accepted

## Context
CTAP Tracker ran its PWA through Vite. The bundle existed to hash one stylesheet, and it cost a blank home-screen icon (the manifest's relative icon paths were rewritten under `assets/`) and a service worker precaching a filename that no longer existed in the output.

There is no reason to repeat that here. This app has no dependencies to bundle.

## Decision
`build.mjs` copies a named allowlist of files from `app/` to `dist/`. Dev and production serve byte-identical files. Cache-busting is a manual `?v=` bumped on deploy.

The list is an allowlist rather than a denylist so that nothing reaches the deployed origin without being named.

## Consequences
What is tested is what ships.

Serving files verbatim also means the static host's opinion about a file extension is the app's problem. GitHub Pages serves `.cjs` as `application/node`, which browsers refuse to execute — the first deploy came up blank because the lookup layer was named `data.cjs` so Node could `require()` it past this package's `"type": "module"`. It is `data.js` now and the tests read it directly instead. `tests/shipped-build.test.js` fails on any script the page loads that does not end `.js`.

A new file that needs to ship has to be added to `SHIP` by hand, and forgetting is the obvious failure mode — so `tests/shipped-build.test.js` fails when `index.html` references a file the build does not ship, the service worker does not precache, or when the `?v=` numbers drift apart.
