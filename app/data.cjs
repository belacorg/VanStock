// ── The lookup layer ────────────────────────────────────────────────────────
//
// Pure functions only: no DOM, no localStorage, no dates read from the clock —
// `today` is always passed in. Loaded by the browser as a classic <script>
// (so everything below is a global) and by the Node tests through require().
//
// This file answers the one question the app exists for: "have I got it, and
// where is it?" Anything that has to be right when an engineer is stood at the
// back doors deciding whether to drive to the merchant lives here, where a test
// can pin it.

// ── Manufacturers ───────────────────────────────────────────────────────────
// The van is arranged by make — that is how a box gets packed and how a part
// gets looked for, so it is how the stock list groups. The list is the order
// they appear in, not alphabetical: the makes an engineer meets most often sit
// at the top of the picker.
const MAKES = [
  'Worcester',
  'Vaillant',
  'Ideal',
  'Baxi',
  'Potterton',
  'Glow-worm',
  'Viessmann',
  'Alpha',
  'Main',
  'Ferroli',
  'Vokera',
  'Biasi',
  'Ravenheat',
  'Halstead',
  'Keston',
  'Saunier Duval',
  'Intergas',
  'ATAG',
  'Hive',
  'Honeywell',
  'Drayton',
  'Danfoss',
  'Grundfos',
  'Controls',
  'Sundries',
  'Other',
];

// ── Part numbers ────────────────────────────────────────────────────────────

// Stickers, catalogues and merchants all punctuate the same number differently:
// 87161431060, 87 16 143 106 0, 8716-143-106. Strip everything that is not a
// letter or a digit and upper-case what is left, so all three land on one key.
// Kept deliberately loose on length — six digits is the common case on the van,
// but Worcester run eleven and Vaillant ten, and a lookup that quietly rejects
// them is worse than useless.
function normaliseNumber(raw) {
  return String(raw == null ? '' : raw).replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

// True when the typed string could still grow into this part's number. Used to
// decide whether to answer while the engineer is mid-way through typing.
function numberMatches(partNumber, typed) {
  const a = normaliseNumber(partNumber);
  const b = normaliseNumber(typed);
  if (!b) return false;
  return a.startsWith(b) || a.includes(b);
}

// ── Search ──────────────────────────────────────────────────────────────────

// Ranked, lowest first. The ordering is the whole point: an engineer who typed
// six digits wants the part with that number at the top, not a fan assembly
// whose description happens to contain them.
const RANK_EXACT      = 0;
const RANK_ALT_EXACT  = 1;
const RANK_PREFIX     = 2;
const RANK_CONTAINS   = 3;
const RANK_TEXT       = 4;

function scorePart(part, query) {
  const q = normaliseNumber(query);
  if (!q) return null;

  const num = normaliseNumber(part.number);
  if (num && num === q) return RANK_EXACT;

  const alts = (part.alt || []).map(normaliseNumber);
  if (alts.includes(q)) return RANK_ALT_EXACT;

  if (num && num.startsWith(q)) return RANK_PREFIX;
  if (alts.some(a => a.startsWith(q))) return RANK_PREFIX;
  if (num && num.includes(q)) return RANK_CONTAINS;

  // Text search is the half-remembered case: "worcester fan", "diverter 28i".
  // Every word typed has to appear somewhere, so adding words narrows rather
  // than widens — the opposite behaviour would make a long guess useless.
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const hay = [part.name, part.make, part.notes].filter(Boolean).join(' ').toLowerCase();
  if (words.every(w => hay.includes(w))) return RANK_TEXT;

  return null;
}

function searchParts(parts, query) {
  if (!query || !String(query).trim()) return [];
  const hits = [];
  for (const p of parts) {
    const rank = scorePart(p, query);
    if (rank !== null) hits.push({ part: p, rank });
  }
  hits.sort((a, b) =>
    a.rank - b.rank ||
    // Within a rank, what is actually on the van beats what is lent out or
    // used up. The answer an engineer can act on goes first.
    (b.part.qty > 0) - (a.part.qty > 0) ||
    String(a.part.number).localeCompare(String(b.part.number))
  );
  return hits.map(h => h.part);
}

// ── Status ──────────────────────────────────────────────────────────────────
//
// The four answers the Find screen can give. `qty` is always what is physically
// in the box right now: lending decrements it and opens a loan, returning puts
// it back. So "have I got it" is simply qty > 0, and the difference between
// "none left" and "lent out" is whether there is somebody to ring.

function openLoansFor(loans, partId) {
  return (loans || []).filter(l => l.partId === partId && !l.returnedOn);
}

function partStatus(part, loans, today) {
  if (!part) return { kind: 'unknown', qty: 0, out: 0, loans: [] };
  const open = openLoansFor(loans, part.id);
  const out = open.reduce((n, l) => n + (l.qty || 1), 0);
  const qty = part.qty || 0;
  if (qty > 0) return { kind: 'on-van', qty, out, loans: open };
  if (out > 0) return { kind: 'lent-out', qty, out, loans: open, oldest: oldestLoan(open, today) };
  return { kind: 'none-left', qty, out: 0, loans: [] };
}

function oldestLoan(open, today) {
  let best = null;
  for (const l of open) {
    if (!best || String(l.on) < String(best.on)) best = l;
  }
  return best;
}

// ── Loans ───────────────────────────────────────────────────────────────────

function daysBetween(fromKey, toKey) {
  const a = new Date(String(fromKey) + 'T00:00:00').getTime();
  const b = new Date(String(toKey) + 'T00:00:00').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

// A lent part is not a problem until it has been gone a while, and it is a real
// problem well before it is forgotten. Three bands, because two would make the
// list either nag from day one or say nothing until it was too late.
//
// `remindAfter` is the engineer's own setting — the point at which a part stops
// being "just lent" and starts being something to chase. Default four days:
// long enough for the engineer who borrowed it to have fitted it, short enough
// that it is still fresh in both memories.
const CHASE_AFTER_DAYS = 14;

function loanState(loan, today, remindAfter) {
  const days = daysBetween(loan.on, today);
  const due = Number.isFinite(remindAfter) ? remindAfter : 4;
  if (days >= CHASE_AFTER_DAYS) return 'chase';
  if (days >= due) return 'due';
  return 'out';
}

// The loans worth putting in front of the engineer when the app opens: anything
// past the reminder point, oldest first. This is the app's version of the
// "reminder in three or four days" — it is shown, not pushed, because a page
// that is closed cannot raise a notification without a server behind it and
// this app deliberately has none.
function loansNeedingChase(loans, today, remindAfter) {
  return (loans || [])
    .filter(l => !l.returnedOn && loanState(l, today, remindAfter) !== 'out')
    .sort((a, b) => String(a.on).localeCompare(String(b.on)));
}

// ── Usage ───────────────────────────────────────────────────────────────────
//
// What moves and what does not. A part that has sat unused for six months is
// van weight and shelf space; a part that goes out three times a month wants
// two on board. Neither judgement is made for the engineer — the app reports
// the tally and lets them decide.
const STALE_AFTER_DAYS = 180;

function usageState(part, today) {
  const last = part.lastUsedOn;
  if (!last) {
    const added = part.addedOn;
    if (added && daysBetween(added, today) >= STALE_AFTER_DAYS) return 'never';
    return 'new';
  }
  return daysBetween(last, today) >= STALE_AFTER_DAYS ? 'stale' : 'moving';
}

// ── Grouping ────────────────────────────────────────────────────────────────

// Sorted by the MAKES running order, with anything unrecognised after it.
// Parts inside a make sit in box order, because that is the order the engineer
// walks the van in.
function groupByMake(parts, boxes) {
  const boxPos = new Map((boxes || []).map((b, i) => [b.id, i]));
  const groups = new Map();
  for (const p of parts) {
    const make = p.make || 'Other';
    if (!groups.has(make)) groups.set(make, []);
    groups.get(make).push(p);
  }
  const order = m => {
    const i = MAKES.indexOf(m);
    return i === -1 ? MAKES.length : i;
  };
  return [...groups.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([make, list]) => ({
      make,
      parts: list.sort((x, y) =>
        (boxPos.has(x.boxId) ? boxPos.get(x.boxId) : 999) - (boxPos.has(y.boxId) ? boxPos.get(y.boxId) : 999) ||
        String(x.name || '').localeCompare(String(y.name || ''))
      ),
    }));
}

function boxLabel(boxes, boxId) {
  const box = (boxes || []).find(b => b.id === boxId);
  if (!box) return '';
  return box.label || '';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAKES,
    CHASE_AFTER_DAYS,
    STALE_AFTER_DAYS,
    normaliseNumber,
    numberMatches,
    scorePart,
    searchParts,
    openLoansFor,
    partStatus,
    daysBetween,
    loanState,
    loansNeedingChase,
    usageState,
    groupByMake,
    boxLabel,
  };
}
