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

// ── Reading the label's print ───────────────────────────────────────────────
//
// The description exists only as print, and in the field the print turned
// out to be the dependable way to the GC code too (ADR-0009). Nothing else on
// the label is read or kept (ADR-0010).
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
      const anchored = ti > 0 && GC_CAPTION.test(toks[ti - 1]);

      // OCR sometimes reads the gap after the caption's colon as a 0 and glues
      // it to the code: "Gc: 0612387". So seven characters straight after a GC
      // caption, starting with a 0 or an O, are read as the last six.
      //
      // Only that. Dropping whichever end made six would turn a stray at the
      // far end — 6123870 — into 123870, a confident wrong code, and because
      // OCR is deterministic it would say so on every frame, so two reads
      // would agree on it. And only after a caption: a bare seven-digit number
      // starting with 0 on this label is a staff ID, and must never be
      // trimmed into something that looks like a code.
      const strayZero = anchored && clean.length === GC_LENGTH + 1 && /^[0O]/.test(clean);
      const forms = GC_PATTERN.test(clean) ? [[clean, 0]]
        : strayZero ? [[clean.slice(1), -1]]
        : [];

      for (const [code, penalty] of forms) {
        if (!GC_PATTERN.test(code)) continue;
        if ((code.match(/\d/g) || []).length < 4) continue;
        score(code, raw, anchored, penalty);
      }
    });

    function score(clean, raw, anchored, penalty) {
      let score = penalty;
      if (anchored) score += 3;
      if (/\d{1,2}:\d{2}/.test(raw)) score -= 5;                  // 08:27:24
      if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) score -= 2;     // the date line
      const next = lines[li + 1] || '';
      if ((next.match(/[A-Za-z]{3,}/g) || []).length >= 2) score += 1;   // a Desc follows

      cands.push({ gc: clean, li, score });
    }
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

// ── Reading live ────────────────────────────────────────────────────────────
//
// Scanning off the camera feed reads frame after frame, so it can wait for
// the reads to agree before it acts. That is the retake an engineer does by
// hand when a 7 comes back as a 1 — done for them, before they see anything.
//
// A code that matches a part already on the van exactly is taken on one read:
// for a misread to land precisely on a different code the engineer also
// carries is vanishingly unlikely. Anything else waits for two of the last
// three reads to agree. A near miss of a part on the van is not special-cased
// here — it either firms up into the right code on the next frame, or two
// frames agree on it and "is it this one?" asks as usual.
const LIVE_WINDOW = 3;

function liveVerdict(reads, parts) {
  const recent = (reads || []).slice(-LIVE_WINDOW).filter(r => r && r.gc);
  const last = recent[recent.length - 1];
  if (!last) return { accept: false, tentative: null };

  const gc = normaliseNumber(last.gc);
  const onVan = (parts || []).some(p => normaliseNumber(p.number) === gc);
  const agreeing = recent.filter(r => normaliseNumber(r.gc) === gc);

  if (onVan || agreeing.length >= 2) {
    return { accept: true, gc, desc: bestDesc(agreeing), tentative: gc };
  }
  return { accept: false, tentative: gc };
}

// The description the agreeing reads most often gave, longest breaking a tie —
// a read that dropped a word is more likely than one that invented one.
function bestDesc(reads) {
  const counts = new Map();
  for (const r of reads || []) {
    const d = (r && r.desc || '').trim();
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  }
  let best = null;
  for (const [d, n] of counts) {
    if (!best || n > best.n || (n === best.n && d.length > best.d.length)) best = { d, n };
  }
  return best ? best.d : null;
}

// Where a scan lands. The code comes off the print, so it can be a misread —
// one character off a part already on the van is asked about rather than
// taken on trust or thrown away.
function resolveScan(read, parts) {
  const r = read || {};
  const gc = normaliseNumber(r.printGc);
  if (!gc) return { kind: 'unreadable' };

  const exact = (parts || []).find(p => normaliseNumber(p.number) === gc);
  if (exact) return { kind: 'found', part: exact, gc };

  const near = nearestPartByGc(gc, parts);
  if (near) return { kind: 'maybe', part: near, gc, desc: r.printDesc || null };

  return { kind: 'new', gc, desc: r.printDesc || null };
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
    parseLabelText,
    descFromLine,
    nearestPartByGc,
    resolveScan,
    liveVerdict,
    bestDesc,
    LIVE_WINDOW,
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
