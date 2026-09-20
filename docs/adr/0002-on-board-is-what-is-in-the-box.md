# ADR-0002: "On board" is what is physically in the box

## Status
Accepted

## Context
A part can be in three places: in its box, out with another engineer, or gone. The stock count has to answer "can I fit this today", and the two obvious models disagree about a lent part:

1. Count everything owned, and show what is lent as a note.
2. Count only what is in the box, and track loans separately.

## Decision
`on board` is what is in the box right now. Lending decrements it and opens a loan; a return increments it and closes the loan; using one on a job decrements it and increments the usage tally.

"Have I got it" is therefore exactly `on board > 0`.

## Consequences
The Find screen can answer with colour alone: green means walk to the box, amber means ring somebody, red means order it. None of those three requires reading a number.

An engineer who lends their only one and then needs it gets "lent out", not "you have one" — which is the honest answer and the one that leads to a phone call rather than a wasted walk.

The write-off path exists because of this decision: a part that was fitted by the engineer who borrowed it must not come back to `on board`, but it did get used, so the usage tally still counts it.
