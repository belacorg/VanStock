# ADR-0010: A label gives up two things

## Status
Accepted

## Context
A British Gas dispatch label carries the GC number and the part description — the two things this app needs — and a great deal it does not: the name and pay ID of the engineer the part was picked for, the customer's name and address, the site, and order, parcel, tote and warehouse-picker references.

Two ways that other data was being kept:

- **In the app.** The barcode cross-check (ADR-0008) stored the staff ID off every barcode it read, to tell the GC barcode from the tracking barcode beside it next time. That meant a growing list of colleagues' pay numbers on the phone, plus the engineer's own.
- **In this public repo.** Values photographed off real labels made their way into test fixtures, code comments and commit messages: pay IDs, a parcel tracking number, a tote number, order and location references, a depot name. Each was caught by hand, some only after being pushed.

## Decision
The app reads the GC number and the description off a label and nothing else, and keeps nothing else.

- The barcode reader is removed. It read nothing in the field (ADR-0009), and its only means of choosing the right barcode was remembering pay IDs.
- Any phone that stored staff IDs has them deleted at boot — removed from storage, not merely ignored.
- The photograph is never stored. It is held in memory while it is read and dropped when the scan ends; a picture taken through the app's camera does not go into the phone's photo library.
- The repo's history was rewritten to remove every real label value that had reached it, on every branch, and force-pushed.
- `tests/no-real-labels.test.js` fails on anything in the repo *shaped* like label data — a seven-digit ID starting with 0, a tracking number, a location or order code, a tote or WMIS number, an engineer's name line — unless it is one of a short list of visibly invented fixtures. It first worked from a list of the real values, kept out of git; that list was itself a record of exactly what this ADR says not to keep, and it could only catch values already seen. A shape catches the next engineer's pay ID too.

## Consequences
A misread GC number can no longer be corrected by a barcode. The "is it this one?" check against parts already on the van, and the note on the Add sheet to check the number, carry that job alone.

A rewritten history does not reach copies made before it. At the time of the rewrite the repo had no forks, stars or watchers, but GitHub can keep unreferenced commits reachable by their hash for a while; only GitHub Support can purge those outright.

Real GC codes and descriptions are not sensitive and may appear where they are useful, but fixtures still use invented codes of the same shape, so there is only one rule to remember.
