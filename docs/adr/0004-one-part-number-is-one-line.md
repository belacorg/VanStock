# ADR-0004: One part number is one line

## Status
Accepted

## Context
Restocking is the most common write after using a part, and the fastest way to record it is to add the part again — the same flow the engineer already knows.

Left alone, that produces two lines with the same number, each with its own count and its own box. The stock list then disagrees with itself, and the lookup has to pick one.

## Decision
Adding a part whose number is already on the list adds to that line's count instead of creating a second one, and says so.

## Consequences
The list cannot drift into two truths about one part. Restocking by re-adding works, which is what an engineer will do anyway.

A genuine second line for the same number — the same part in two boxes — is not expressible. If that turns out to matter, a part gains a list of locations rather than the list gaining a duplicate.
