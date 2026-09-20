# ADR-0001: A part number is normalised, not matched literally

## Status
Accepted

## Context
The same part number is written three ways before it reaches the app: `87161431060` on the sticker, `87 16 143 106 0` in the catalogue, `8716-143-1060` on the merchant's invoice. An engineer types whichever one is in front of them.

Six digits is the common case on the van, but Worcester run eleven, Vaillant ten, and some numbers carry letters.

## Decision
Every number — stored and typed — is reduced to letters and digits only, upper-cased, before anything is compared. No length is assumed or enforced.

## Consequences
All three spellings of a number find the same part. A lookup never silently fails because of a space.

The cost is that two genuinely different parts whose numbers differ only in punctuation would collide. No such pair has been seen, and the alternative — a lookup that finds nothing because the engineer typed a dash — fails in the situation the app exists for.
