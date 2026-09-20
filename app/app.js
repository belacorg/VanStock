// ── Van Stock ───────────────────────────────────────────────────────────────
//
// One question, answered in the time it takes to type six digits: have I got
// this part on the van, and which box is it in? Everything else on the screen
// exists to keep that answer true.
//
// Same shape as CTAP Tracker: a string-template renderer with no module
// boundary, state in localStorage, listeners reattached on every render. The
// pure lookup rules live in data.cjs, where the tests can reach them.

// ── State ───────────────────────────────────────────────────────────────────
const STORE_KEY = 'vs_state';

let state = loadState();
let activeTab = 'find';     // find | stock | loans | settings
let query = '';
let openGroups = {};        // make -> true, on the Stock tab
let partSheet = null;       // { mode: 'add'|'edit', draft: {...} } | null
let lendSheet = null;       // { partId, to, phone, qty, on } | null
let boxSheet = null;        // { mode: 'add'|'edit', id, label } | null
let eraseStep = 'idle';
let showReturned = false;

function blankState() {
  return {
    version: 1,
    // Boxes come pre-named because an empty list is a decision to make before
    // the app has done anything useful. Labelling them is optional — the whole
    // point is that "box 3" already means something once the stock is in it.
    boxes: [
      { id: 'b1', label: 'Box 1' },
      { id: 'b2', label: 'Box 2' },
      { id: 'b3', label: 'Box 3' },
    ],
    parts: [],
    loans: [],
    engineers: [],          // { name, phone } — so a lent part can be rung for
    settings: { remindAfter: 4, theme: 'dark' },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return blankState();
    const parsed = JSON.parse(raw);
    const base = blankState();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      boxes: Array.isArray(parsed.boxes) ? parsed.boxes : base.boxes,
      parts: Array.isArray(parsed.parts) ? parsed.parts : [],
      loans: Array.isArray(parsed.loans) ? parsed.loans : [],
      engineers: Array.isArray(parsed.engineers) ? parsed.engineers : [],
    };
  } catch {
    return blankState();
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

// ── Small helpers ───────────────────────────────────────────────────────────

function todayKey(d) {
  const t = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function findPart(id) { return state.parts.find(p => p.id === id) || null; }
function findBox(id)  { return state.boxes.find(b => b.id === id) || null; }

function boxName(boxId) {
  const box = findBox(boxId);
  if (!box) return 'Not boxed';
  return box.label || 'Unlabelled box';
}

function dayPhrase(key, today) {
  const n = daysBetween(key, today);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return n + ' days ago';
  if (n < 60) return Math.round(n / 7) + ' weeks ago';
  return Math.round(n / 30) + ' months ago';
}

function prettyDate(key) {
  const d = new Date(String(key) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return String(key);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── Render ──────────────────────────────────────────────────────────────────

function render() {
  try {
    document.getElementById('app').innerHTML = buildApp();
    attachListeners();
  } catch (e) {
    document.getElementById('app').innerHTML =
      '<div style="padding:20px;color:#ff7060;background:#1c1c1e;margin:16px;border-radius:8px;font-family:monospace;font-size:12px"><b>Render error</b><br>' +
      esc(e.message) + '<br>' + esc(e.stack || '') + '</div>';
  }
}

// Re-render without throwing the engineer back to the top of a long stock list.
function renderKeepingScroll() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

function buildApp() {
  return `
    ${buildTopBar()}
    <main class="main" id="main">${buildMain()}</main>
    ${buildBottomNav()}
    ${buildPartSheet()}
    ${buildLendSheet()}
    ${buildBoxSheet()}
    <div class="toast" id="toast"></div>
  `;
}

function buildTopBar() {
  const onVan = state.parts.reduce((n, p) => n + (p.qty || 0), 0);
  const lines = state.parts.length;
  return `
    <header class="top-bar">
      <div class="top-left">
        <svg class="brand-mark" width="30" height="30" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect class="brand-mark-box" x="6.5" y="9.5" width="27" height="23" rx="4" stroke-width="3.4"/>
          <path class="brand-mark-box" d="M6.5 16.5H33.5" stroke-width="3.4" stroke-linecap="round"/>
          <path class="brand-mark-tick" d="M14.5 24.5l4 4 7-8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="top-title">
          <div class="top-title-main">Van Stock</div>
          <div class="top-title-sub">What's on board, and where</div>
        </div>
      </div>
      <div class="top-count"><b>${onVan}</b> on van<br>${lines} line${lines === 1 ? '' : 's'}</div>
    </header>
  `;
}

function buildBottomNav() {
  const chase = loansNeedingChase(state.loans, todayKey(), state.settings.remindAfter).length;
  const tabs = [
    { id: 'find',     label: 'Find',     icon: ICON_SEARCH },
    { id: 'stock',    label: 'Stock',    icon: ICON_BOX },
    { id: 'loans',    label: 'Lent out', icon: ICON_HAND, dot: chase > 0 },
    { id: 'settings', label: 'Settings', icon: ICON_COG },
  ];
  return `
    <nav class="bottom-nav">
      ${tabs.map(t => `
        <button data-tab="${t.id}" class="${activeTab === t.id ? 'active' : ''}" aria-label="${t.label}">
          ${t.icon}
          <span>${t.label}</span>
          ${t.dot ? '<span class="nav-dot"></span>' : ''}
        </button>
      `).join('')}
    </nav>
  `;
}

function buildMain() {
  if (activeTab === 'find')     return buildFind();
  if (activeTab === 'stock')    return buildStock();
  if (activeTab === 'loans')    return buildLoans();
  if (activeTab === 'settings') return buildSettings();
  return '';
}

// ── Find ────────────────────────────────────────────────────────────────────

function buildFind() {
  const results = searchParts(state.parts, query);
  const typed = query.trim();

  return `
    <div class="find-wrap">
      <div class="find-field">
        <input class="find-input" id="find-input" type="search" inputmode="search"
               autocomplete="off" autocorrect="off" spellcheck="false"
               enterkeyhint="search"
               placeholder="Part number, or what it is"
               value="${esc(query)}">
        ${typed ? '<button class="find-clear" id="find-clear" aria-label="Clear">&times;</button>' : ''}
      </div>
      ${typed ? '' : '<div class="find-hint">Six digits off the box, or type what it is — &ldquo;worcester fan&rdquo;.</div>'}
    </div>
    ${typed ? buildFindResults(results, typed) : buildFindHome()}
  `;
}

function buildFindResults(results, typed) {
  if (!results.length) return buildNoMatch(typed);
  const [top, ...rest] = results;
  return `
    ${buildAnswer(top)}
    ${rest.length ? `
      <div class="section-label">Also matching</div>
      <div class="card flush">${rest.map(partRow).join('')}</div>
    ` : ''}
  `;
}

// The answer card. An engineer reads this stood at the back doors with the
// phone in one hand, so the verdict is the biggest thing on it and the box is
// the second — everything else can wait until they have walked to the van.
function buildAnswer(part) {
  const today = todayKey();
  const st = partStatus(part, state.loans, today);
  const meta = `<div class="answer-part"><b>${esc(part.number)}</b> &middot; ${esc(part.name || 'Unnamed part')}${part.make ? ' &middot; ' + esc(part.make) : ''}</div>`;

  if (st.kind === 'on-van') {
    return `
      <div class="answer on-van">
        <div class="answer-verdict">Yes — it's on the van</div>
        <div class="answer-where">
          <span class="box-chip">${esc(boxName(part.boxId))}</span>
          <span class="qty-chip">${st.qty} on board</span>
          ${st.out > 0 ? `<span class="status-badge amber">${st.out} lent out</span>` : ''}
        </div>
        ${meta}
        <div class="answer-actions">
          <button class="btn btn-primary" data-use="${part.id}">Used one</button>
          <button class="btn btn-quiet" data-lend="${part.id}">Lend it out</button>
          <button class="btn btn-quiet" data-edit="${part.id}">Edit</button>
        </div>
      </div>
    `;
  }

  if (st.kind === 'lent-out') {
    const l = st.oldest;
    const eng = state.engineers.find(e => e.name === l.to);
    return `
      <div class="answer lent-out">
        <div class="answer-verdict">Lent out — ${esc(l.to)} has it</div>
        <div class="answer-where">
          <span class="status-badge amber">Gone ${dayPhrase(l.on, today)}</span>
          <span class="qty-chip">${st.out} out</span>
          <span class="box-chip plain">Normally ${esc(boxName(part.boxId))}</span>
        </div>
        ${meta}
        <div class="answer-actions">
          ${eng && eng.phone ? `<a class="btn btn-primary" href="tel:${esc(eng.phone)}">Ring ${esc(firstName(l.to))}</a>` : ''}
          <button class="btn btn-quiet" data-return="${l.id}">Got it back</button>
          <button class="btn btn-quiet" data-restock="${part.id}">Restocked one</button>
          <button class="btn btn-quiet" data-edit="${part.id}">Edit</button>
        </div>
      </div>
    `;
  }

  // On the list, none in the box, nobody holding one.
  return `
    <div class="answer none">
      <div class="answer-verdict">None left</div>
      <div class="answer-where">
        <span class="box-chip plain">Normally ${esc(boxName(part.boxId))}</span>
        ${part.lastUsedOn ? `<span class="status-badge neutral">Last used ${dayPhrase(part.lastUsedOn, today)}</span>` : ''}
      </div>
      ${meta}
      <div class="answer-actions">
        <button class="btn btn-primary" data-restock="${part.id}">Restocked one</button>
        <button class="btn btn-quiet" data-edit="${part.id}">Edit</button>
      </div>
    </div>
  `;
}

function buildNoMatch(typed) {
  return `
    <div class="answer none">
      <div class="answer-verdict">Not on the van</div>
      <div class="answer-part">Nothing on your list matches <b>${esc(typed)}</b>. If it turns out you do carry it, put it on now and the next lookup will find it.</div>
      <div class="answer-actions">
        <button class="btn btn-primary" data-add-number="${esc(typed)}">Add this part</button>
      </div>
    </div>
  `;
}

// The landing screen with nothing typed. Two jobs: get anything that needs
// chasing in front of the engineer without them going looking for it, and make
// the empty van obvious on day one.
function buildFindHome() {
  if (!state.parts.length) {
    return `
      <div class="empty">
        <div class="empty-title">Nothing on the van yet</div>
        <div class="empty-body">Put the van stock in once — number, what it is, which box — and from then on it's six digits and an answer.</div>
        <button class="btn btn-primary" data-add-part="1">Add the first part</button>
      </div>
    `;
  }

  const today = todayKey();
  const chase = loansNeedingChase(state.loans, today, state.settings.remindAfter);
  const recent = [...state.parts]
    .filter(p => p.lastUsedOn)
    .sort((a, b) => String(b.lastUsedOn).localeCompare(String(a.lastUsedOn)))
    .slice(0, 5);

  return `
    ${chase.length ? `
      <div class="section-label">Worth a phone call</div>
      <div class="card flush">
        ${chase.map(l => loanRow(l, today)).join('')}
      </div>
    ` : ''}
    ${recent.length ? `
      <div class="section-label">Last used</div>
      <div class="card flush">${recent.map(partRow).join('')}</div>
    ` : ''}
    <div class="footer-note">Everything here stays on this phone.<br>Back it up from Settings before you change device.</div>
  `;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || name;
}

// ── Stock ───────────────────────────────────────────────────────────────────

function buildStock() {
  if (!state.parts.length) {
    return `
      <div class="empty">
        <div class="empty-title">The list is empty</div>
        <div class="empty-body">Start with one box. Number, what it is, how many — the rest can wait.</div>
        <button class="btn btn-primary" data-add-part="1">Add a part</button>
      </div>
    `;
  }

  const today = todayKey();
  const groups = groupByMake(state.parts, state.boxes);
  const dead = state.parts.filter(p => {
    const u = usageState(p, today);
    return (u === 'never' || u === 'stale') && (p.qty || 0) > 0;
  });

  return `
    <button class="btn btn-primary btn-block" data-add-part="1" style="margin-bottom:12px">Add a part</button>
    <div class="card flush">
      ${groups.map(g => buildGroup(g)).join('')}
    </div>
    ${dead.length ? `
      <div class="section-label">Not moving</div>
      <div class="card flush">
        ${dead.slice(0, 12).map(partRow).join('')}
      </div>
      <div class="field-hint" style="margin:6px 2px 0">Carried for six months or more without being used. Worth asking whether it earns its shelf.</div>
    ` : ''}
    <div class="footer-note">${state.parts.length} lines &middot; ${state.parts.reduce((n, p) => n + (p.qty || 0), 0)} items on board</div>
  `;
}

function buildGroup(g) {
  const open = !!openGroups[g.make];
  const onBoard = g.parts.reduce((n, p) => n + (p.qty || 0), 0);
  return `
    <div class="group ${open ? 'open' : ''}">
      <button class="group-head" data-group="${esc(g.make)}">
        <span class="group-name">${esc(g.make)}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="group-count">${g.parts.length} line${g.parts.length === 1 ? '' : 's'} &middot; ${onBoard} on board</span>
          <span class="chevron ${open ? 'open' : ''}">&#8250;</span>
        </span>
      </button>
      <div class="group-body">${g.parts.map(partRow).join('')}</div>
    </div>
  `;
}

function partRow(part) {
  const today = todayKey();
  const st = partStatus(part, state.loans, today);
  const badge =
    st.kind === 'on-van'   ? `<span class="qty-chip">${st.qty}</span>`
  : st.kind === 'lent-out' ? `<span class="status-badge amber">Lent</span>`
  :                          `<span class="status-badge red">0</span>`;
  return `
    <button class="row" data-open-part="${part.id}">
      <span class="row-main">
        <span class="row-title">${esc(part.name || 'Unnamed part')}</span>
        <span class="row-sub">
          <span class="row-num">${esc(part.number)}</span>
          <span class="box-chip plain">${esc(boxName(part.boxId))}</span>
        </span>
      </span>
      <span class="row-right">${badge}<span class="chevron">&#8250;</span></span>
    </button>
  `;
}

// ── Lent out ────────────────────────────────────────────────────────────────

function buildLoans() {
  const today = todayKey();
  const open = state.loans.filter(l => !l.returnedOn)
    .sort((a, b) => String(a.on).localeCompare(String(b.on)));
  const back = state.loans.filter(l => l.returnedOn)
    .sort((a, b) => String(b.returnedOn).localeCompare(String(a.returnedOn)));

  if (!open.length && !back.length) {
    return `
      <div class="empty">
        <div class="empty-title">Nothing lent out</div>
        <div class="empty-body">When you pass a part to another engineer, put it on here. In a few days the app reminds you who has it — so you ring them instead of driving to the merchant.</div>
      </div>
    `;
  }

  return `
    ${open.length ? `
      <div class="section-label">Out with someone</div>
      <div class="card flush">${open.map(l => loanRow(l, today)).join('')}</div>
    ` : `
      <div class="card"><div style="font-size:0.86rem;color:var(--muted)">Nothing out at the minute.</div></div>
    `}
    ${back.length ? `
      <button class="btn btn-link" data-toggle-returned="1" style="margin:18px 2px 6px">
        ${showReturned ? 'Hide' : 'Show'} what's come back (${back.length})
      </button>
      ${showReturned ? `<div class="card flush">${back.slice(0, 30).map(l => loanRow(l, today)).join('')}</div>` : ''}
    ` : ''}
  `;
}

function loanRow(loan, today) {
  const part = findPart(loan.partId);
  const eng = state.engineers.find(e => e.name === loan.to);
  const done = !!loan.returnedOn;
  const st = done ? 'back' : loanState(loan, today, state.settings.remindAfter);
  const badge = {
    out:   `<span class="status-badge neutral">${dayPhrase(loan.on, today)}</span>`,
    due:   `<span class="status-badge amber">Out ${daysBetween(loan.on, today)} days</span>`,
    chase: `<span class="status-badge red">Out ${daysBetween(loan.on, today)} days</span>`,
    back:  `<span class="status-badge green">Back ${prettyDate(loan.returnedOn)}</span>`,
  }[st];

  return `
    <div class="loan-row">
      <div class="loan-top">
        <div style="min-width:0">
          <div class="loan-who">${esc(loan.to)}</div>
          <div class="loan-what">
            ${loan.qty > 1 ? loan.qty + ' &times; ' : ''}${esc(part ? (part.name || part.number) : 'Part removed')}
            ${part ? ' &middot; <span class="row-num">' + esc(part.number) + '</span>' : ''}
            <br>Lent ${prettyDate(loan.on)}
          </div>
        </div>
        ${badge}
      </div>
      ${done ? '' : `
        <div class="loan-actions">
          <button class="btn btn-primary" data-return="${loan.id}">Got it back</button>
          ${eng && eng.phone ? `<a class="btn btn-quiet" href="tel:${esc(eng.phone)}">Ring ${esc(firstName(loan.to))}</a>` : ''}
          <button class="btn btn-danger" data-drop-loan="${loan.id}">Written off</button>
        </div>
      `}
    </div>
  `;
}

// ── Settings ────────────────────────────────────────────────────────────────

function buildSettings() {
  const s = state.settings;
  return `
    <div class="section-label">Boxes</div>
    <div class="card flush">
      ${state.boxes.map(b => {
        const n = state.parts.filter(p => p.boxId === b.id).length;
        return `
          <button class="row" data-edit-box="${b.id}">
            <span class="row-main">
              <span class="row-title">${esc(b.label || 'Unlabelled box')}</span>
              <span class="row-sub">${n} line${n === 1 ? '' : 's'}</span>
            </span>
            <span class="row-right"><span class="chevron">&#8250;</span></span>
          </button>
        `;
      }).join('')}
      <button class="row" data-add-box="1">
        <span class="row-main"><span class="row-title" style="color:var(--accent)">Add a box</span></span>
      </button>
    </div>
    <div class="field-hint" style="margin:6px 2px 0">Labels are optional. &ldquo;Box 3&rdquo; is a fine name if that's what's written on the lid.</div>

    <div class="section-label">Reminders</div>
    <div class="card">
      <div class="field">
        <label class="field-label" for="remind-after">Chase a lent part after</label>
        <div class="stepper">
          <button data-remind="-1" aria-label="Fewer days">&minus;</button>
          <span class="stepper-val">${s.remindAfter} day${s.remindAfter === 1 ? '' : 's'}</span>
          <button data-remind="1" aria-label="More days">+</button>
        </div>
      </div>
      <div class="field-hint">Past this, the part shows up on the Find screen and gets a dot on the Lent out tab. It's a reminder waiting for you when you open the app, not a notification — nothing here talks to a server, so nothing can buzz your phone while the app is shut.</div>
    </div>

    <div class="section-label">Appearance</div>
    <div class="card">
      <div class="row" style="padding:0">
        <span class="row-main"><span class="row-title">Theme</span></span>
        <span class="row-right">
          <button class="btn ${s.theme === 'dark' ? 'btn-primary' : 'btn-quiet'}" data-theme="dark">Dark</button>
          <button class="btn ${s.theme === 'light' ? 'btn-primary' : 'btn-quiet'}" data-theme="light">Light</button>
        </span>
      </div>
    </div>

    <div class="section-label">Your list</div>
    <div class="card">
      <button class="btn btn-quiet btn-block" data-export="1">Back up to a file</button>
      <div class="field-hint" style="margin-bottom:14px">Saves the whole list as a file you can keep or send to yourself. Do this before you change phone — there is no account holding a copy.</div>
      <button class="btn btn-quiet btn-block" data-import="1">Restore from a file</button>
      <input type="file" id="import-file" accept="application/json,.json" style="display:none">
      <div class="field-hint">Replaces everything currently on the list.</div>
    </div>

    <div class="section-label">Danger</div>
    <div class="card">
      ${eraseStep === 'idle' ? `
        <button class="btn btn-danger btn-block" data-erase="ask">Erase everything</button>
      ` : `
        <div class="field-hint" style="margin:0 0 12px">This wipes the stock list, the boxes and the loan history on this phone. It cannot be undone.</div>
        <div class="modal-btns" style="margin:0">
          <button class="btn-cancel" data-erase="cancel">Keep it</button>
          <button class="btn-confirm" style="background:var(--red)" data-erase="do">Erase</button>
        </div>
      `}
    </div>

    <div class="footer-note">
      Van Stock &middot; v0.1.0<br>
      Built alongside CTAP Tracker. Nothing leaves this device.
    </div>
  `;
}

// ── Part sheet ──────────────────────────────────────────────────────────────

function buildPartSheet() {
  if (!partSheet) return '<div class="modal-overlay hidden"></div>';
  const d = partSheet.draft;
  const editing = partSheet.mode === 'edit';
  const part = editing ? findPart(d.id) : null;
  const today = todayKey();

  return `
    <div class="modal-overlay" data-close-sheet="part">
      <div class="modal" data-stop="1">
        <h3>${editing ? 'Edit part' : 'Add a part'}</h3>
        <div class="modal-note">${editing ? 'Change what the van actually holds.' : 'The number and the box are what the lookup needs. The rest helps you find it when you can’t remember the number.'}</div>

        <div class="field">
          <label class="field-label" for="ps-number">Part number</label>
          <input class="field-input num" id="ps-number" inputmode="numeric" autocomplete="off"
                 placeholder="248733" value="${esc(d.number)}">
        </div>

        <div class="field">
          <label class="field-label" for="ps-name">What is it</label>
          <input class="field-input" id="ps-name" autocomplete="off"
                 placeholder="Fan assembly" value="${esc(d.name)}">
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="ps-make">Make</label>
            <select class="field-input" id="ps-make">
              ${MAKES.map(m => `<option value="${esc(m)}" ${d.make === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="ps-box">Box</label>
            <select class="field-input" id="ps-box">
              ${state.boxes.map(b => `<option value="${b.id}" ${d.boxId === b.id ? 'selected' : ''}>${esc(b.label || 'Unlabelled box')}</option>`).join('')}
              <option value="">Not boxed</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label">How many on the van</label>
          <div class="stepper">
            <button data-qty="-1" aria-label="One fewer">&minus;</button>
            <span class="stepper-val">${d.qty}</span>
            <button data-qty="1" aria-label="One more">+</button>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="ps-date">Date off the sticker <span style="text-transform:none;letter-spacing:0;font-weight:400">(optional)</span></label>
          <input class="field-input" id="ps-date" autocomplete="off" placeholder="03/24" value="${esc(d.dateCode)}">
        </div>

        <div class="field">
          <label class="field-label" for="ps-notes">Notes <span style="text-transform:none;letter-spacing:0;font-weight:400">(optional)</span></label>
          <input class="field-input" id="ps-notes" autocomplete="off" placeholder="Fits 24i and 28i junior" value="${esc(d.notes)}">
        </div>

        ${editing && part ? `
          <div class="field-hint" style="margin-top:14px">
            Used ${part.usedCount || 0} time${(part.usedCount || 0) === 1 ? '' : 's'}${part.lastUsedOn ? ', last ' + dayPhrase(part.lastUsedOn, today) : ''}.
            ${part.addedOn ? 'On the list since ' + prettyDate(part.addedOn) + '.' : ''}
          </div>
        ` : ''}

        <div class="modal-btns">
          <button class="btn-cancel" data-close-sheet="part">Cancel</button>
          <button class="btn-confirm" data-save-part="1">${editing ? 'Save' : 'Add to van'}</button>
        </div>
        ${editing ? `<button class="btn btn-danger btn-block" data-delete-part="${d.id}" style="margin-top:10px">Take off the list</button>` : ''}
      </div>
    </div>
  `;
}

// ── Lend sheet ──────────────────────────────────────────────────────────────

function buildLendSheet() {
  if (!lendSheet) return '';
  const part = findPart(lendSheet.partId);
  if (!part) return '';
  const known = state.engineers.map(e => e.name);

  return `
    <div class="modal-overlay" data-close-sheet="lend">
      <div class="modal" data-stop="1">
        <h3>Lend it out</h3>
        <div class="modal-note">${esc(part.name || part.number)} &middot; <span class="row-num">${esc(part.number)}</span></div>

        <div class="field">
          <label class="field-label" for="ls-to">Who's having it</label>
          <input class="field-input" id="ls-to" autocomplete="off" list="ls-known"
                 placeholder="Dave" value="${esc(lendSheet.to)}">
          <datalist id="ls-known">${known.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
        </div>

        <div class="field">
          <label class="field-label" for="ls-phone">Their number <span style="text-transform:none;letter-spacing:0;font-weight:400">(optional)</span></label>
          <input class="field-input" id="ls-phone" type="tel" inputmode="tel" autocomplete="off"
                 placeholder="07700 900000" value="${esc(lendSheet.phone)}">
          <div class="field-hint">Saved against their name, so next time the app can offer to ring them for you.</div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">How many</label>
            <div class="stepper">
              <button data-lend-qty="-1" aria-label="One fewer">&minus;</button>
              <span class="stepper-val">${lendSheet.qty}</span>
              <button data-lend-qty="1" aria-label="One more">+</button>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="ls-on">When</label>
            <input class="field-input" id="ls-on" type="date" value="${esc(lendSheet.on)}">
          </div>
        </div>

        <div class="modal-btns">
          <button class="btn-cancel" data-close-sheet="lend">Cancel</button>
          <button class="btn-confirm" data-save-lend="1">Lend it</button>
        </div>
      </div>
    </div>
  `;
}

// ── Box sheet ───────────────────────────────────────────────────────────────

function buildBoxSheet() {
  if (!boxSheet) return '';
  const editing = boxSheet.mode === 'edit';
  const inUse = editing ? state.parts.filter(p => p.boxId === boxSheet.id).length : 0;
  return `
    <div class="modal-overlay" data-close-sheet="box">
      <div class="modal" data-stop="1">
        <h3>${editing ? 'Rename box' : 'Add a box'}</h3>
        <div class="modal-note">Call it whatever is written on the lid.</div>
        <div class="field">
          <label class="field-label" for="bs-label">Label</label>
          <input class="field-input" id="bs-label" autocomplete="off" placeholder="Box 4" value="${esc(boxSheet.label)}">
        </div>
        <div class="modal-btns">
          <button class="btn-cancel" data-close-sheet="box">Cancel</button>
          <button class="btn-confirm" data-save-box="1">Save</button>
        </div>
        ${editing ? `
          <button class="btn btn-danger btn-block" data-delete-box="${boxSheet.id}" style="margin-top:10px">Delete box</button>
          ${inUse ? `<div class="field-hint" style="margin-top:8px">${inUse} line${inUse === 1 ? '' : 's'} sit in this box. Deleting it leaves them unboxed — the parts stay on the list.</div>` : ''}
        ` : ''}
      </div>
    </div>
  `;
}

// ── Actions ─────────────────────────────────────────────────────────────────

function openPartSheet(mode, part) {
  partSheet = {
    mode,
    draft: part
      ? { ...part }
      : { id: null, number: '', name: '', make: MAKES[0], boxId: (state.boxes[0] || {}).id || '', qty: 1, dateCode: '', notes: '' },
  };
  render();
}

function savePartFromSheet() {
  const d = partSheet.draft;
  d.number = (document.getElementById('ps-number') || {}).value || '';
  d.name   = (document.getElementById('ps-name')   || {}).value || '';
  d.make   = (document.getElementById('ps-make')   || {}).value || '';
  d.boxId  = (document.getElementById('ps-box')    || {}).value || '';
  d.dateCode = (document.getElementById('ps-date') || {}).value || '';
  d.notes  = (document.getElementById('ps-notes')  || {}).value || '';

  if (!normaliseNumber(d.number) && !d.name.trim()) {
    toast('Needs a number or a name');
    return;
  }

  if (partSheet.mode === 'add') {
    // A part number already on the list is nearly always a restock, not a
    // second line. Two lines for one part is how a stock list starts lying.
    const existing = state.parts.find(p => normaliseNumber(p.number) === normaliseNumber(d.number) && normaliseNumber(d.number));
    if (existing) {
      existing.qty = (existing.qty || 0) + (d.qty || 0);
      save();
      partSheet = null;
      toast('Already on the list — added to it');
      render();
      return;
    }
    state.parts.push({
      id: uid('p'),
      number: d.number.trim(),
      name: d.name.trim(),
      make: d.make,
      boxId: d.boxId,
      qty: d.qty,
      dateCode: d.dateCode.trim(),
      notes: d.notes.trim(),
      alt: [],
      addedOn: todayKey(),
      usedCount: 0,
      lastUsedOn: null,
    });
    toast('On the van');
  } else {
    const p = findPart(d.id);
    if (p) Object.assign(p, {
      number: d.number.trim(),
      name: d.name.trim(),
      make: d.make,
      boxId: d.boxId,
      qty: d.qty,
      dateCode: d.dateCode.trim(),
      notes: d.notes.trim(),
    });
    toast('Saved');
  }
  save();
  partSheet = null;
  render();
}

function useOne(partId) {
  const p = findPart(partId);
  if (!p || (p.qty || 0) <= 0) return;
  p.qty -= 1;
  p.usedCount = (p.usedCount || 0) + 1;
  p.lastUsedOn = todayKey();
  save();
  toast(p.qty > 0 ? `${p.qty} left in ${boxName(p.boxId)}` : 'That was the last one');
  renderKeepingScroll();
}

function restockOne(partId) {
  const p = findPart(partId);
  if (!p) return;
  p.qty = (p.qty || 0) + 1;
  save();
  toast(`${p.qty} in ${boxName(p.boxId)}`);
  renderKeepingScroll();
}

function saveLendFromSheet() {
  const part = findPart(lendSheet.partId);
  if (!part) return;
  const to    = ((document.getElementById('ls-to') || {}).value || '').trim();
  const phone = ((document.getElementById('ls-phone') || {}).value || '').trim();
  const on    = ((document.getElementById('ls-on') || {}).value || '') || todayKey();
  if (!to) { toast('Who has it?'); return; }

  const qty = Math.min(lendSheet.qty, part.qty || 0);
  if (qty <= 0) { toast('None on the van to lend'); return; }

  part.qty -= qty;
  state.loans.push({ id: uid('l'), partId: part.id, qty, to, on, returnedOn: null });

  // The phone number belongs to the engineer, not to this loan — remember it
  // so the next time they have something of yours the app can offer to ring.
  const eng = state.engineers.find(e => e.name === to);
  if (eng) { if (phone) eng.phone = phone; }
  else state.engineers.push({ name: to, phone });

  save();
  lendSheet = null;
  toast(`${to} has it — you'll get a nudge in ${state.settings.remindAfter} days`);
  render();
}

function returnLoan(loanId) {
  const l = state.loans.find(x => x.id === loanId);
  if (!l || l.returnedOn) return;
  l.returnedOn = todayKey();
  const p = findPart(l.partId);
  if (p) p.qty = (p.qty || 0) + (l.qty || 1);
  save();
  toast(p ? `Back in ${boxName(p.boxId)}` : 'Marked as back');
  renderKeepingScroll();
}

// Closing a loan without the part coming back: it was fitted, binned, or is
// simply gone. The stock count must not pretend otherwise, so nothing is added
// back to the box — but it counts as a use, because that is what happened to it.
function writeOffLoan(loanId) {
  const l = state.loans.find(x => x.id === loanId);
  if (!l || l.returnedOn) return;
  l.returnedOn = todayKey();
  l.writtenOff = true;
  const p = findPart(l.partId);
  if (p) {
    p.usedCount = (p.usedCount || 0) + (l.qty || 1);
    p.lastUsedOn = todayKey();
  }
  save();
  toast('Written off — not coming back');
  renderKeepingScroll();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `van-stock-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backed up');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || !Array.isArray(parsed.parts)) throw new Error('not a Van Stock backup');
      localStorage.setItem(STORE_KEY, JSON.stringify(parsed));
      state = loadState();
      toast('Restored');
      render();
    } catch (e) {
      toast("That file isn't a Van Stock backup");
    }
  };
  reader.readAsText(file);
}

function applyTheme() {
  document.body.classList.toggle('light', state.settings.theme === 'light');
  try { localStorage.setItem('vs_theme', state.settings.theme); } catch {}
}

// ── Listeners ───────────────────────────────────────────────────────────────

function attachListeners() {
  const on = (sel, ev, fn) => document.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));

  on('[data-tab]', 'click', e => {
    activeTab = e.currentTarget.dataset.tab;
    eraseStep = 'idle';
    render();
    if (activeTab === 'find') {
      const input = document.getElementById('find-input');
      // Deliberately not auto-focused: the keyboard springing up every time the
      // tab is touched hides the answer the engineer just came back to read.
      if (input && query) input.setSelectionRange(query.length, query.length);
    }
  });

  const findInput = document.getElementById('find-input');
  if (findInput) {
    findInput.addEventListener('input', e => {
      query = e.target.value;
      const pos = e.target.selectionStart;
      renderKeepingScroll();
      const fresh = document.getElementById('find-input');
      if (fresh) { fresh.focus(); try { fresh.setSelectionRange(pos, pos); } catch {} }
    });
  }
  on('#find-clear', 'click', () => { query = ''; render(); });

  on('[data-group]', 'click', e => {
    const make = e.currentTarget.dataset.group;
    openGroups[make] = !openGroups[make];
    renderKeepingScroll();
  });

  on('[data-open-part]', 'click', e => openPartSheet('edit', findPart(e.currentTarget.dataset.openPart)));
  on('[data-edit]', 'click', e => openPartSheet('edit', findPart(e.currentTarget.dataset.edit)));
  on('[data-add-part]', 'click', () => openPartSheet('add', null));
  on('[data-add-number]', 'click', e => {
    openPartSheet('add', null);
    partSheet.draft.number = e.currentTarget.dataset.addNumber;
    render();
  });

  on('[data-use]', 'click', e => useOne(e.currentTarget.dataset.use));
  on('[data-restock]', 'click', e => restockOne(e.currentTarget.dataset.restock));
  on('[data-return]', 'click', e => returnLoan(e.currentTarget.dataset.return));
  on('[data-drop-loan]', 'click', e => writeOffLoan(e.currentTarget.dataset.dropLoan));
  on('[data-toggle-returned]', 'click', () => { showReturned = !showReturned; renderKeepingScroll(); });

  on('[data-lend]', 'click', e => {
    lendSheet = { partId: e.currentTarget.dataset.lend, to: '', phone: '', qty: 1, on: todayKey() };
    render();
  });

  // Sheets
  on('[data-close-sheet]', 'click', e => {
    if (e.target !== e.currentTarget) return;   // ignore clicks bubbling from inside
    const which = e.currentTarget.dataset.closeSheet;
    if (which === 'part') partSheet = null;
    if (which === 'lend') lendSheet = null;
    if (which === 'box')  boxSheet = null;
    render();
  });
  on('[data-stop]', 'click', e => e.stopPropagation());

  on('[data-qty]', 'click', e => {
    const step = Number(e.currentTarget.dataset.qty);
    stashPartSheetFields();
    partSheet.draft.qty = Math.max(0, (partSheet.draft.qty || 0) + step);
    render();
  });
  on('[data-save-part]', 'click', savePartFromSheet);
  on('[data-delete-part]', 'click', e => {
    const id = e.currentTarget.dataset.deletePart;
    state.parts = state.parts.filter(p => p.id !== id);
    state.loans = state.loans.filter(l => l.partId !== id);
    save();
    partSheet = null;
    toast('Off the list');
    render();
  });

  on('[data-lend-qty]', 'click', e => {
    const part = findPart(lendSheet.partId);
    const max = part ? (part.qty || 0) : 1;
    stashLendSheetFields();
    lendSheet.qty = Math.min(max, Math.max(1, lendSheet.qty + Number(e.currentTarget.dataset.lendQty)));
    render();
  });
  on('[data-save-lend]', 'click', saveLendFromSheet);

  on('[data-add-box]', 'click', () => { boxSheet = { mode: 'add', id: null, label: '' }; render(); });
  on('[data-edit-box]', 'click', e => {
    const b = findBox(e.currentTarget.dataset.editBox);
    boxSheet = { mode: 'edit', id: b.id, label: b.label || '' };
    render();
  });
  on('[data-save-box]', 'click', () => {
    const label = ((document.getElementById('bs-label') || {}).value || '').trim();
    if (boxSheet.mode === 'add') state.boxes.push({ id: uid('b'), label });
    else {
      const b = findBox(boxSheet.id);
      if (b) b.label = label;
    }
    save();
    boxSheet = null;
    render();
  });
  on('[data-delete-box]', 'click', e => {
    const id = e.currentTarget.dataset.deleteBox;
    state.boxes = state.boxes.filter(b => b.id !== id);
    state.parts.forEach(p => { if (p.boxId === id) p.boxId = ''; });
    save();
    boxSheet = null;
    toast('Box gone — the parts stayed');
    render();
  });

  on('[data-remind]', 'click', e => {
    const next = state.settings.remindAfter + Number(e.currentTarget.dataset.remind);
    state.settings.remindAfter = Math.min(30, Math.max(1, next));
    save();
    renderKeepingScroll();
  });

  on('[data-theme]', 'click', e => {
    state.settings.theme = e.currentTarget.dataset.theme;
    save();
    applyTheme();
    renderKeepingScroll();
  });

  on('[data-export]', 'click', exportBackup);
  on('[data-import]', 'click', () => {
    const input = document.getElementById('import-file');
    if (input) input.click();
  });
  const fileInput = document.getElementById('import-file');
  if (fileInput) fileInput.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) importBackup(f);
  });

  on('[data-erase]', 'click', e => {
    const step = e.currentTarget.dataset.erase;
    if (step === 'ask') eraseStep = 'confirm';
    if (step === 'cancel') eraseStep = 'idle';
    if (step === 'do') {
      try { localStorage.removeItem(STORE_KEY); } catch {}
      state = blankState();
      eraseStep = 'idle';
      query = '';
      toast('Wiped');
    }
    render();
  });
}

// A re-render wipes the DOM, and with it anything typed into the sheet but not
// yet saved. Every control that re-renders mid-edit reads the fields back into
// the draft first, so stepping the quantity never costs the engineer the part
// number they just typed in.
function stashPartSheetFields() {
  if (!partSheet) return;
  const d = partSheet.draft;
  const get = id => (document.getElementById(id) || {}).value;
  if (get('ps-number') !== undefined) d.number = get('ps-number');
  if (get('ps-name')   !== undefined) d.name   = get('ps-name');
  if (get('ps-make')   !== undefined) d.make   = get('ps-make');
  if (get('ps-box')    !== undefined) d.boxId  = get('ps-box');
  if (get('ps-date')   !== undefined) d.dateCode = get('ps-date');
  if (get('ps-notes')  !== undefined) d.notes  = get('ps-notes');
}

function stashLendSheetFields() {
  if (!lendSheet) return;
  const get = id => (document.getElementById(id) || {}).value;
  if (get('ls-to')    !== undefined) lendSheet.to = get('ls-to');
  if (get('ls-phone') !== undefined) lendSheet.phone = get('ls-phone');
  if (get('ls-on')    !== undefined) lendSheet.on = get('ls-on');
}

// ── Icons ───────────────────────────────────────────────────────────────────
const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const ICON_BOX    = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>';
const ICON_HAND   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12V7a2 2 0 0 1 4 0v4"/><path d="M8 11V5a2 2 0 0 1 4 0v6"/><path d="M12 11V6a2 2 0 0 1 4 0v6"/><path d="M16 9a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-1a8 8 0 0 1-8-8"/></svg>';
const ICON_COG    = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.76 1 1.4 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// ── Boot ────────────────────────────────────────────────────────────────────
applyTheme();
render();

// Not on localhost. The worker is network-first, but its cache still answers
// when the dev server 304s, so an edit to the stylesheet lands in the file and
// not on the screen — half an hour lost to a bug that was never in the code.
// Everywhere it actually matters (the deployed app, and the LAN address used
// to test on a phone) it registers as normal.
const SW_OFF = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !SW_OFF) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Read-only handle for the tests. The alternative is parsing localStorage back
// in every assertion, which tests the serialiser rather than the app.
if (typeof window !== 'undefined') window.__vsGetState = () => state;
