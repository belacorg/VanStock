# Van Stock

A mobile-first PWA for gas engineers to answer one question without opening the back doors: **have I got this part on the van, and which box is it in?**

Built to save the ten minutes an engineer loses rummaging through a hundred-odd parts to find out they never carried it in the first place — and the second ten minutes driving to the merchant for something another engineer is holding.

Shares its design system with **CTAP Tracker** on purpose (ADR-0005): same tokens, same typeface, same surfaces, same bottom nav. They are two tools used by the same engineer on the same phone in the same working day.

## Language

**Part**:
One thing the van carries, identified by its **part number**. Holds what it is, the make, which **box** it lives in, and how many are **on board**.

**Part number**:
The number printed on the box or the sticker. Usually six digits, but Worcester run eleven and Vaillant ten, and the same number is punctuated three different ways between the sticker, the catalogue and the merchant's invoice — so it is normalised to letters and digits only before anything is compared (ADR-0001).
_Avoid_: "SKU", "product code"

**Line**:
One entry on the stock list. A line is a part number, not a physical item: three inhibitors are one line with three **on board**. One part number is always one line (ADR-0004).

**On board**:
How many of a part are physically in the box right now. Lending takes one off; a return puts it back; using one on a job takes it off for good. "Have I got it" is exactly `on board > 0` (ADR-0002).
_Avoid_: "in stock" (ambiguous about what is lent out), "quantity"

**Box**:
Where on the van a part lives. Labelling is optional — "Box 3" is a perfectly good name if that is what is written on the lid. The van is usually arranged by manufacturer, which is why the stock list groups by **make**.

**Lent out**:
A part passed to another engineer, recorded against their name and the date. The part comes off **on board** the moment it is lent, because it is no longer on the van — so the lookup tells the truth about what can be fitted today.
_Avoid_: "borrowed", "loaned" (use **lent out**)

**Chase**:
What the app asks an engineer to do once a **lent out** part has been gone longer than their reminder setting (default four days). Shown on the Find screen and as a dot on the Lent out tab. It is a reminder waiting when the app opens, never a push notification (ADR-0003).

**Written off**:
Closing a loan without the part coming back — it was fitted, binned, or is simply gone. Does not restore **on board**, but does count as a use, because that is what happened to it.

**Not moving**:
A part carried six months or more without being used. The app reports the tally; whether it earns its shelf is the engineer's call.

## Shape

- `app/data.cjs` — the lookup layer. Pure functions, no DOM, no clock: `today` is always passed in. Loaded as a classic script in the browser and `require`d by the tests.
- `app/app.js` — state, render, listeners. A string-template renderer, no framework.
- `app/style.css` — CTAP Tracker's tokens and components (ADR-0005).
- `build.mjs` — copies an allowlist of `app/` into `dist/`. No bundler (ADR-0007).
- `tests/` — `lookup.test.js` pins the rules, `flows.test.js` drives the real app in JSDOM, `shipped-build.test.js` guards the allowlist.

## Not built yet

- **Scanning a label.** The obvious next step, and the one that would make putting the stock in bearable. Barcodes on parts boxes are inconsistent between manufacturers, so the first version is likely OCR of the printed number rather than a barcode read.
- **Sharing stock between engineers.** "Who on the patch has one?" is the natural sequel to "have I got one", but it needs a server and accounts, which this app deliberately has none of (ADR-0006).
