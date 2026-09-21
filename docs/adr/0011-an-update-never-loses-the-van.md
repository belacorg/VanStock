# ADR-0011: An update never loses the van

## Status
Accepted

## Context
An engineer types a hundred-odd parts in once. Jake, on shipping updates during a trial: "I don't want to be providing updates and then it wipes everything."

An update does not touch the stored van — it lives in the browser's storage under a fixed key, and a new version of the app reads what is there. But an audit found four ways it could still be lost:

1. **A save that would not parse came back as an empty van**, and the next thing the engineer did wrote that empty van over the only copy. Silent and total.
2. **No version on the stored shape**, so a future change to it had no safe way to bring old data forward.
3. **Restoring a file replaced the van with no undo** — the wrong file, or an old one, and weeks of entries went.
4. **Nothing off the phone.** A lost or reset phone takes everything with it, and the export was a download link, which goes nowhere much inside an iPhone home-screen app.

And one that is not data loss but was breaking things: Van Stock and CTAP Tracker are served from the same address, so they share one cache list, and each app's service worker deleted every cache that was not its own — knocking the other off offline mode on every update.

## Decision
- **A damaged save is set aside, never overwritten**, and the newest automatic backup that reads is loaded in its place, with a notice saying so.
- **The stored shape is versioned** (`DATA_VERSION`). Every change is a migration, run in order from any version ever shipped, with a snapshot of the old shape taken first. Each shipped shape gets a fixture in `tests/fixtures/`, and a test that loads it with nothing entered missing. Fields the app does not recognise are carried through, so an older cached copy of the app cannot strip what a newer one wrote.
- **Automatic backups** are kept on the phone: one a day as the app opens, and one before every migration and every restore, up to six. Storage is shared with CTAP Tracker, so a full quota costs the oldest backups rather than the save.
- **Every restore is undoable** — the list it replaces is backed up first — and restoring an automatic backup takes two taps.
- **Saving a copy off the phone uses the share sheet** (iCloud Drive, Files, email), falls back to a download, and Settings says when it was last done, in amber when it never has been.
- The app asks the browser to keep its storage (`navigator.storage.persist()`).
- Each service worker clears only its own caches.

## Consequences
The automatic backups protect against the app going wrong. They live in the same storage as the van, so they do not protect against the phone going — only a copy off it does, and the app now says so plainly rather than implying the backups cover it.

Erasing everything takes the automatic backups with it, and says so before it does. A copy saved off the phone is untouched.

CTAP Tracker's service worker still clears every cache but its own, including Van Stock's. That is its repo's to fix.

A login and a server-side copy would cover a lost phone and a second device too. That is a separate decision — it reverses ADR-0006 — and is not taken here.
