# Van Stock

A mobile-first PWA that answers one question without opening the back doors of the van: **have I got this part, and which box is it in?**

Type the GC number off the label — or scan its barcode — and get one of four answers: it's on the van and here's the box; it's lent out and here's who has it; there's none left; or it's not on your list at all.

**[Open it](https://belacorg.github.io/VanStock/)** · Add to Home Screen on a phone and it works offline.

## Why

A service van carries well over a hundred lines. Finding out whether one of them is the one you need means going outside and rummaging, and the worst case — ten minutes of rummaging to discover you never carried it — happens most days.

## What it does

- **Find** — type or scan, get the box. Colour carries the answer before a word is read.
- **Stock** — grouped by manufacturer, the way the van is packed. Flags anything carried six months without being used.
- **Lent out** — who has your part and since when, with a button to ring them. Past your own reminder setting it surfaces itself on the Find screen.
- **Scanning** — reads the barcode at the bottom right of a British Gas dispatch label, which carries the GC code. Aim at the barcode, not the label.

## Shape

No framework, no bundler, no accounts, no server. A string-template renderer over `localStorage`, and a static folder copied to `dist/` by an allowlist. Everything an engineer enters stays on their phone; backup is a JSON export.

```bash
npm install
npm run dev     # http://localhost:3838
npm test
npm run build   # -> dist/
```

The reasoning behind the shape is in [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/). Start with ADR-0002 (what "on board" means) and ADR-0008 (why the scanner reads a barcode rather than the print).

## Sample data

The app offers to fill itself with a demo van so there is something to look at before any real stock goes in. **Every GC code in it is invented** — the right shape, wrong on purpose — and a banner says so until it is wiped.

## Licence

MIT.
