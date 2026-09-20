# ADR-0006: Local-only, no accounts

## Status
Accepted

## Context
The stock list is a record of what is in one engineer's own van. There is nobody else who needs to read it, and an account would be a sign-up screen standing between the engineer and the first useful lookup.

CTAP Tracker reached the same conclusion for different reasons (its ADR-0015) and is the better for it.

## Decision
Everything lives in `localStorage` on the device. No account, no server, no third-party request — the typeface is self-hosted for the same reason. Backup is an explicit JSON export from Settings.

## Consequences
The app opens straight onto the Find screen and works in a cellar with no signal.

Losing the phone loses the list, which is why the export exists and why the Find screen says so in its footer.

"Who else on the patch has one?" is not expressible without reversing this decision. That is the feature most likely to justify reversing it.
