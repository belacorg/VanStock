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

// ── GC codes ────────────────────────────────────────────────────────────────
//
// The number an engineer reads off a van part is the GC code on the British
// Gas dispatch label — printed next to the literal text "GC:", with the part
// description on the line under it.
//
// It is SIX CHARACTERS, not six digits: 612340 and 619900, but also C00090 and
// J61230. A digit-only assumption locks an engineer out of every part whose
// code starts with a letter, and on a phone it does so silently by handing
// them a numeric keypad with no way to type the C.
const GC_LENGTH = 6;
const GC_PATTERN = /^[0-9A-Z]{6}$/;

function isGcCode(raw) {
  return GC_PATTERN.test(normaliseNumber(raw));
}

// The bottom-right barcode on the label carries the GC code followed by the
// seven-digit staff ID of the engineer the part was picked FOR — 612340 +
// 0000001. Reading it is exact where reading print is a guess.
//
// That trailing ID is NOT necessarily this engineer's. A part lent by another
// engineer arrives on their label, with their pay ID on it, and refusing those
// would refuse exactly the parts the lending half of this app exists for.
//
// But the shape alone is not enough either: a ByBox tracking number can be
// thirteen digits too, and then "six characters of code, seven of ID" fits it
// perfectly and yields a stock code that never existed. So candidates are
// ranked rather than filtered, and where the ranking cannot separate them the
// engineer is asked — and the answer is remembered, so the next label from the
// same engineer is unambiguous.
const GC_BARCODE = /^[0-9A-Z]{6}[0-9]{7}$/;

function gcCandidate(payload) {
  const clean = normaliseNumber(payload);
  if (!GC_BARCODE.test(clean)) return null;
  return { gc: clean.slice(0, GC_LENGTH), pickedFor: clean.slice(GC_LENGTH), payload: clean };
}

// Every staff ID the app has met scores highest, because a tracking number's
// last seven digits will not be one. A GC already on the van scores next: the
// engineer is usually looking at a part they carry. Leading zero is the weakest
// signal and is only ever a tie-breaker — it is a pattern observed across the
// pay IDs seen so far, not a rule anybody published.
function rankGcCandidates(payloads, opts) {
  const o = opts || {};
  const ids = new Set((o.knownIds || []).map(normaliseNumber).filter(Boolean));
  const stock = new Set((o.parts || []).map(p => normaliseNumber(p.number)));
  const seen = new Set();

  return (payloads || [])
    .map(gcCandidate)
    .filter(Boolean)
    .filter(c => (seen.has(c.payload) ? false : seen.add(c.payload)))
    .map(c => {
      let score = 0;
      if (ids.has(c.pickedFor)) score += 4;
      if (stock.has(c.gc)) score += 2;
      if (c.pickedFor.charAt(0) === '0') score += 1;
      return Object.assign({ score }, c);
    })
    .sort((a, b) => b.score - a.score || a.payload.localeCompare(b.payload));
}

// One candidate, or a clear winner, is an answer. Two that the ranking cannot
// separate is a question — and guessing there would put a tracking number on
// the stock list as though it were a part.
function pickGcCandidate(payloads, opts) {
  const ranked = rankGcCandidates(payloads, opts);
  if (!ranked.length) return { kind: 'none', candidates: [] };
  if (ranked.length === 1 || ranked[0].score > ranked[1].score) {
    return { kind: 'one', candidate: ranked[0], candidates: ranked };
  }
  return { kind: 'ambiguous', candidates: ranked };
}

// Every ID confirmed by a scan the engineer accepted, newest first. This is how
// the app comes to know the pay IDs of the engineers it borrows from: it is
// told once, by a scan going through, and never has to ask about them again.
const MAX_KNOWN_IDS = 40;

function rememberStaffId(known, id) {
  const clean = normaliseNumber(id);
  if (!clean) return known || [];
  return [clean].concat((known || []).filter(k => k !== clean)).slice(0, MAX_KNOWN_IDS);
}

// ── Reading the label's print ───────────────────────────────────────────────
//
// The barcode carries only the GC code and a staff ID. The description exists
// only as print, so reading the label means reading text — and it turns out
// the print is the more dependable of the two anyway.
//
// Measured against real labels, OCR reads the big bold GC code and the Desc
// line well and reads their small grey captions badly: "GC:" came back as cc,
// oc:, and "Desc:" as +:, c:, pesc:. Matching on the caption threw away
// correct reads. So the anchor is the SHAPE of a GC code — six characters, at
// least four of them digits — and a GC-looking caption is only a preference.
// Nothing else on the label is six long: the location code is ten, the staff
// ID seven, the tote eight, the WMIS number ten.
//
// Except a time. The pick date line carries 08:27:24, which strips to a
// perfect 082724 and sits ABOVE the GC code. Hence the scoring.
const GC_CAPTION = /^(gc|oc|cc|6c|ge|gg|go|c|g)[:;.,]*$/i;

function parseLabelText(text) {
  const lines = String(text == null ? '' : text).split('\n').map(l => l.trim()).filter(Boolean);
  const cands = [];

  lines.forEach((line, li) => {
    const toks = line.split(/\s+/);
    toks.forEach((raw, ti) => {
      const clean = raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      if (!GC_PATTERN.test(clean)) return;
      if ((clean.match(/\d/g) || []).length < 4) return;

      let score = 0;
      if (ti > 0 && GC_CAPTION.test(toks[ti - 1])) score += 3;
      if (/\d{1,2}:\d{2}/.test(raw)) score -= 5;                  // 08:27:24
      if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) score -= 2;     // the date line
      const next = lines[li + 1] || '';
      if ((next.match(/[A-Za-z]{3,}/g) || []).length >= 2) score += 1;   // a Desc follows

      cands.push({ gc: clean, li, score });
    });
  });

  cands.sort((a, b) => b.score - a.score || a.li - b.li);
  const best = cands[0] || null;
  return {
    gc: best ? best.gc : null,
    desc: best ? descFromLine(lines[best.li + 1]) : null,
    candidates: cands.map(c => c.gc),
  };
}

// The Desc line, less whatever its caption came out as and the table rule OCR
// reads down the right-hand edge as | or \.
function descFromLine(line) {
  if (!line) return null;
  const d = String(line)
    .replace(/^.{0,8}?(desc|esc|sc|c|\+)\s*[:;.]\s*/i, '')
    .replace(/^[^A-Za-z0-9(\[]+/, '')
    .replace(/[\s|\\/]+$/, '')
    .trim();
  return d || null;
}

// A misread is almost always one character — 7 read as 1, C read as 0. If the
// code off the label is one substitution from exactly one part on the van,
// that part is very probably the one in hand. Two candidates is not a guess
// worth making.
function nearestPartByGc(gc, parts) {
  const g = normaliseNumber(gc);
  if (!g) return null;
  const close = (parts || []).filter(p => {
    const n = normaliseNumber(p.number);
    if (n.length !== g.length || n === g) return false;
    let diff = 0;
    for (let i = 0; i < n.length; i++) if (n[i] !== g[i] && ++diff > 1) return false;
    return diff === 1;
  });
  return close.length === 1 ? close[0] : null;
}

// Where a scan lands. A barcode read is exact and a print read is a good
// guess, so the barcode's code wins when both came back — the print still
// supplies the description, which the barcode never carries.
function resolveScan(read, parts) {
  const r = read || {};
  const gc = normaliseNumber(r.barcodeGc || r.printGc);
  if (!gc) return { kind: 'unreadable' };
  const fromPrint = !r.barcodeGc;

  const exact = (parts || []).find(p => normaliseNumber(p.number) === gc);
  if (exact) return { kind: 'found', part: exact, gc, fromPrint };

  // Only a print read can be a misread; a barcode that decoded is right.
  if (fromPrint) {
    const near = nearestPartByGc(gc, parts);
    if (near) return { kind: 'maybe', part: near, gc, desc: r.printDesc || null };
  }

  return { kind: 'new', gc, desc: r.printDesc || null, fromPrint };
}

// What to do with a code once it has been read off a label. Kept here, away
// from the camera plumbing, because this is the part with a decision in it.
function scanRoute(gc, parts) {
  if (!gc) return { kind: 'unreadable' };
  const norm = normaliseNumber(gc);
  const part = (parts || []).find(p => normaliseNumber(p.number) === norm);
  return part ? { kind: 'found', part } : { kind: 'new', gc: norm };
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

// ── Demo van ────────────────────────────────────────────────────────────────
//
// A van with something in it, for looking at the app before there is any real
// stock on the list — which is the only way to judge it from an armchair.
//
// EVERY GC CODE BELOW IS INVENTED, but they are the right shape: six
// characters, mostly digits, some starting with a letter — the way real ones
// come. A couple of lines carry a manufacturer number in `alt` as well, for
// the case where the label has come off and the only number left is the one on
// the part itself.
//
// They are wrong on purpose so nobody fits one.
//
// Dates are computed from `today` rather than written down: a fixture with
// fixed dates reads "lent 8 months ago" by the spring, and the whole point of
// the demo is the chase list looking the way it will in use.
function shiftDays(key, n) {
  const d = new Date(String(key) + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function demoVan(today) {
  const ago = n => shiftDays(today, -n);
  const part = (id, number, name, make, boxId, qty, extra) => Object.assign({
    id, number, name, make, boxId, qty,
    alt: [], addedOn: ago(220), usedCount: 0, lastUsedOn: null, dateCode: '', notes: '',
  }, extra || {});

  return {
    version: 1,
    demo: true,
    boxes: [
      { id: 'b1', label: 'Box 1 — Worcester' },
      { id: 'b2', label: 'Box 2 — Vaillant' },
      { id: 'b3', label: 'Box 3 — Controls' },
      { id: 'b4', label: 'Door pocket' },
    ],
    parts: [
      part('p1',  '612340', 'Powerhead for V4073A valves', 'Honeywell', 'b3', 2, { usedCount: 3, lastUsedOn: ago(5) }),
      part('p2',  '248741', 'Diverter cartridge',      'Worcester', 'b1', 0, { usedCount: 2, lastUsedOn: ago(23) }),
      part('p3',  '251190', 'Pressure sensor',         'Worcester', 'b1', 1, { usedCount: 1, lastUsedOn: ago(18), alt: ['87161431060'] }),
      part('p4',  '248902', 'Flow turbine',            'Worcester', 'b1', 1),
      part('p5',  '612387', 'Altecnic filling loop',   'Sundries',  'b4', 1, { usedCount: 1, lastUsedOn: ago(2) }),
      part('p6',  'J61230', 'Heat exchanger',          'Worcester', 'b1', 1, { addedOn: ago(300) }),
      part('p7',  '310118', 'Auto air vent',           'Vaillant',  'b2', 3, { usedCount: 4, lastUsedOn: ago(1) }),
      part('p8',  '402317', 'Fan — Logic 24',          'Ideal',     'b1', 0),
      part('p9',  'C00090', 'Primus gas cap',          'Sundries',  'b4', 2, { usedCount: 1, lastUsedOn: ago(102) }),
      part('p10', '433960', 'Ignition electrode',      'Glow-worm', 'b1', 2),
      part('p11', '619900', '(H) Hive Active Plug SLP3', 'Hive',    'b3', 1, { usedCount: 2, lastUsedOn: ago(4) }),
      part('p12', '536201', '2-port valve head',       'Drayton',   'b3', 1, { addedOn: ago(400) }),
      part('p13', '310465', 'Expansion vessel 8L',     'Vaillant',  'b2', 1, { usedCount: 1, lastUsedOn: ago(10), alt: ['0020098765'] }),
      part('p14', '990112', 'Inhibitor 500ml',         'Sundries',  'b4', 4, { usedCount: 9, lastUsedOn: ago(1) }),
      part('p15', '990147', 'Magnetic filter',         'Sundries',  'b4', 1, { usedCount: 2, lastUsedOn: ago(8) }),
      part('p16', '990203', '15mm service valve',      'Sundries',  'b4', 6, { usedCount: 5, lastUsedOn: ago(3) }),
    ],
    // p2 and p8 are at zero on the van because these two are out — the counts
    // and the loans have to agree or the demo teaches the wrong thing.
    loans: [
      { id: 'l1', partId: 'p2', qty: 1, to: 'Dave', on: ago(6), returnedOn: null },
      { id: 'l2', partId: 'p8', qty: 1, to: 'Marc',   on: ago(1), returnedOn: null },
    ],
    engineers: [
      { name: 'Dave', phone: '' },
      { name: 'Marc',   phone: '' },
    ],
    settings: { remindAfter: 4, theme: 'dark' },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAKES,
    GC_LENGTH,
    GC_PATTERN,
    isGcCode,
    gcCandidate,
    rankGcCandidates,
    pickGcCandidate,
    rememberStaffId,
    GC_BARCODE,
    MAX_KNOWN_IDS,
    scanRoute,
    parseLabelText,
    descFromLine,
    nearestPartByGc,
    resolveScan,
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
    shiftDays,
    demoVan,
  };
}
