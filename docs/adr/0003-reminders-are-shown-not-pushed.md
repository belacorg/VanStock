# ADR-0003: Reminders are shown, not pushed

## Status
Accepted

## Context
The brief asked for a reminder three or four days after a part is lent out, so it can be chased before it is forgotten.

A web app cannot raise a notification while it is closed without a push service and a server holding a subscription. This app has neither, by choice (ADR-0006), and adding one for a reminder would mean an account, a backend and an engineer's loan history leaving their phone.

## Decision
The reminder is state the app shows, not an event it sends. Past the engineer's reminder setting (default four days), a lent part appears under "Worth a phone call" on the Find screen — the screen opened most — and the Lent out tab carries a dot.

The setting is the engineer's own: four days by default, adjustable from one to thirty.

## Consequences
The reminder arrives when the app is next opened rather than at a fixed hour. In practice that is most working days, because the Find screen is the reason the app exists.

The copy in Settings says this plainly rather than implying a notification that will never come.

If push is ever wanted badly enough to justify a server, this decision is what to revisit — the loan records already carry everything a reminder would need.
