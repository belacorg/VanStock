# ADR-0001: A part number is normalised, not matched literally

## Status
Accepted

## Context
The same part number is written three ways before it reaches the app: `87161431060` on the sticker, `87 16 143 106 0` in the catalogue, `8716-143-1060` on the merchant's invoice. An engineer types whichever one is in front of them.

The code that matters is the **GC number** off the British Gas dispatch label, and it is six *characters*, not six digits: `612340` and `619900` sit alongside `C00090` and `J61230`. Manufacturer numbers, held against a line as alternates, run longer still — eleven digits for Worcester, ten for Vaillant.

## Decision
Every number — stored and typed — is reduced to letters and digits only, upper-cased, before anything is compared. No length is assumed or enforced.

## Consequences
All three spellings of a number find the same part. A lookup never silently fails because of a space.

Upper-casing means the engineer never has to reach for the shift key: `c00090` finds `C00090`.

The rule that no length or alphabet is assumed is load-bearing, not defensive. The first build of the entry form carried `inputmode="numeric"`, which on a phone is a keypad with no letters on it — every part whose code begins with a letter was un-enterable, silently, on the one screen where stock goes in.

The cost is that two genuinely different parts whose numbers differ only in punctuation would collide. No such pair has been seen, and the alternative — a lookup that finds nothing because the engineer typed a dash — fails in the situation the app exists for.
