# ADR-0005: The design system is CTAP Tracker's

## Status
Accepted

## Context
Van Stock and CTAP Tracker are used by the same engineer, on the same phone, in the same working day — often within a minute of each other, in the same driveway.

A2E deliberately keeps its own identity separate from the work tools. These two are not that: they are both British Gas work tools, and switching between them should feel like changing tab.

## Decision
Van Stock uses CTAP Tracker's design system verbatim: the same iOS-dark palette and light-mode overrides, the same `#4a86d8` accent, DM Sans self-hosted, the same card radii, bottom nav, sheets and spacing. The tokens are renamed `--vs-*` but hold identical values.

The brand mark differs — a parts box with a tick, against CTAP's C-as-a-clock — because the two apps still need to be told apart on a home screen.

## Consequences
Anything learned about one app's interface transfers to the other. A fix to a shared pattern has to be made twice, which is accepted: the alternative is a shared package between two small static apps, which costs more than it saves.

The two apps stay separate builds, separate data, separate deploys. Nothing is shared at runtime.
