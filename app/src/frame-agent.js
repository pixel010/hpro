// @ts-check
/**
 * Frame agent: the only script that runs in the document frame.
 *
 * The frame is a `srcdoc` iframe with `sandbox="allow-scripts"` and an opaque origin
 * (HP-SBX-005), so the reader cannot touch its DOM. This script is inserted by the reader
 * (render.ts) and allowed by its CSP hash; the document's own scripts are removed and blocked.
 * It talks to the reader only through a private `MessagePort` (P15): at start it posts the port
 * with the load token from `data-hp-init` to the reader and removes the token, before any
 * component script runs. Components share this window but never see the port, so they cannot
 * send messages in the agent's name (links, keys, cell entries) or read the reader's messages;
 * their own messages go through `window.parent` to the document data channel.
 *
 *   reader → frame  { hp: 'reader', type: 'goto', id?, hit?, focus? }
 *                   { hp: 'reader', type: 'state', mode, zoom, vars, scheme, motion, paused }
 *                   { hp: 'reader', type: 'calc', cells, checks, refs, entry? }   (P19)
 *                   { hp: 'reader', type: 'form', forms, entry?, focusSummary? }   (P6)
 *   frame → reader  { hp: 'frame', type: 'ready' | 'position' | 'link' | 'key', … }
 *                   { hp: 'frame', type: 'cell-input', address, value, final }    (P19)
 *                   { hp: 'frame', type: 'form-input', field, value, final }      (P6)
 *                   { hp: 'frame', type: 'form-action', form, action }           (P6)
 *
 * Tables (P19): the reader marks formula, input and check cells with `data-hp-cell` and puts an
 * `input` element into each input cell of the live version. Entries go to the reader, which
 * calculates with the core and answers with the changed values; they are written as text
 * (HPF-SEC-003), so the document is never reloaded (HPF-STO-011, HPF-CALC-007).
 *
 * Forms (P6): the reader marks every control with `data-hp-field="<form>.<name>"` and adds a
 * message element per field, a summary and the action buttons (`data-hp-reader`). Entries and
 * button presses go to the reader, which calculates, evaluates conditions and validates with the
 * core; the agent only shows what comes back (texts of calculated fields, sections that apply,
 * messages). The sandbox has no `allow-forms`: nothing is ever submitted from the frame.
 *
 * The fixed page view is derived from the print profile (HP-PRINT-002, HP-PRINT-014): A4 page,
 * 15 mm margins, header with the title and footer "Seite n von N". Breaks are made between
 * blocks; a heading stays with what follows, a block that fits on a page is not split, table
 * rows are not split and the table head repeats (HP-PRINT-006). The document DOM is only
 * touched through inline margins and reader elements marked `data-hp-reader`, all of which
 * are removed again when the view returns to flowing text.
 *
 * Motion (P15, HP-INH-014, HP-SBX-014, HPL-SBX-011): `data-hp-motion` on the root is `reduce`
 * when the system asks for reduced motion or the reader setting says so, `paused` when the user
 * stopped motion, else `run`. The reader CSS removes CSS animations and transitions under
 * `reduce` and pauses them under `paused`; the agent ends script animations (Web Animations),
 * starts muted autoplay media (`data-hp-autoplay`) only under `run`, and stops media that start
 * without a user action when they would make sound or motion is not allowed.
 *
 * Plain JavaScript without imports: the reader inserts this file verbatim as an inline
 * script, and the CSP hash is computed over exactly these bytes (vite.config.ts).
 */
(() => {
  'use strict';

  const MM = 96 / 25.4;
  const PAGE_W = 210 * MM;
  const PAGE_H = 297 * MM;
  const MARGIN = 15 * MM;
  const GAP = 8 * MM;
  const CONTENT_H = PAGE_H - 2 * MARGIN;
  const STRIDE = PAGE_H + GAP;
  const READER = 'data-hp-reader';
  const BREAK = 'data-hp-break';
  const ORIGINAL_STYLE = 'data-hp-style';
  /** Elements whose children are paginated one by one. */
  const CONTAINERS = new Set(['body', 'main', 'section', 'article', 'div', 'header', 'footer', 'aside', 'nav', 'form', 'fieldset']);
  const HEADINGS = 'h1, h2, h3, h4, h5, h6';

  const root = document.documentElement;
  /** @type {{ mode: 'flow' | 'page', zoom: number, title: string, vars: Record<string, string>, scheme: string, motion: 'system' | 'reduce', paused: boolean }} */
  const state = { mode: 'flow', zoom: 1, title: '', vars: {}, scheme: 'light', motion: 'system', paused: false };
  let pages = 0;
  let lastPosition = '';
  let paginating = false;
  let started = false;

  // Private channel to the reader (see the header): created and handed over before any
  // component script runs. The token proves to the reader that the port belongs to this load.
  const channel = new MessageChannel();
  const port = channel.port1;
  /** @type {Partial<typeof state> & { token?: string }} */
  let initial = {};
  try {
    initial = JSON.parse(root.getAttribute('data-hp-init') ?? '{}');
  } catch {
    initial = {};
  }
  root.removeAttribute('data-hp-init');
  window.parent.postMessage({ hp: 'frame', type: 'port', token: String(initial.token ?? '') }, '*', [channel.port2]);
  delete initial.token;

  /** @param {Record<string, unknown>} message */
  function post(message) {
    port.postMessage({ hp: 'frame', ...message });
  }

  // ---------------------------------------------------------------- state and appearance

  /** @param {Partial<typeof state>} next */
  function applyState(next) {
    const before = JSON.stringify([state.mode, state.vars, state.scheme, state.title]);
    const anchor = readingAnchor();
    Object.assign(state, next);
    applyMotion();
    for (const name of Array.from(root.style)) if (name.startsWith('--hp-')) root.style.removeProperty(name);
    for (const [name, value] of Object.entries(state.vars)) {
      if (name === 'font-size') root.style.fontSize = value;
      else root.style.setProperty(name, value);
    }
    root.setAttribute('data-hp-scheme', state.scheme);
    root.classList.toggle('hp-page', state.mode === 'page');
    const layoutChanged = before !== JSON.stringify([state.mode, state.vars, state.scheme, state.title]);
    if (state.mode === 'page') {
      if (layoutChanged || pages === 0) paginate();
      else applyZoom();
    } else {
      if (pages > 0) unpaginate();
      root.style.removeProperty('zoom');
    }
    updateScrollers();
    // Keep the reading position when the layout changed (view, text size, spacing).
    if (layoutChanged && anchor && started) anchor.scrollIntoView({ block: 'start' });
    reportPosition(true);
  }

  /** The first heading at or below the top of the viewport, if the reader has scrolled. */
  function readingAnchor() {
    if (window.scrollY < 1) return null;
    for (const h of Array.from(document.querySelectorAll(HEADINGS))) {
      if (h.closest(`[${READER}]`)) continue;
      const r = h.getBoundingClientRect();
      if (r.height > 0 && r.bottom > 0) return h;
    }
    return null;
  }

  function fitFactor() {
    const available = Math.max(160, window.innerWidth - 16);
    return Math.min(1, available / PAGE_W);
  }

  function applyZoom() {
    root.style.setProperty('zoom', String(Math.round(fitFactor() * state.zoom * 1000) / 1000));
  }

  // ---------------------------------------------------------------- pagination

  function unpaginate() {
    for (const el of Array.from(document.querySelectorAll(`[${READER}="page"], [${READER}="pages"], [${READER}="spacer"], [${READER}="repeat"]`))) el.remove();
    for (const el of Array.from(document.querySelectorAll(`[${BREAK}]`))) {
      const original = el.getAttribute(ORIGINAL_STYLE);
      if (original === null) el.removeAttribute('style');
      else el.setAttribute('style', original);
      el.removeAttribute(BREAK);
      el.removeAttribute(ORIGINAL_STYLE);
    }
    document.body.style.removeProperty('min-height');
    pages = 0;
  }

  /** @param {Element} el */
  function hidden(el) {
    const style = getComputedStyle(el);
    return style.display === 'none' || (style.position === 'absolute' || style.position === 'fixed');
  }

  /**
   * Flow blocks in document order. Containers are descended; table scroll wrappers too.
   * @param {Element} parent
   * @param {Element[]} out
   */
  function collect(parent, out) {
    for (const child of Array.from(parent.children)) {
      if (child.hasAttribute(READER) || child.localName === 'script' || child.localName === 'style') continue;
      if (hidden(child)) continue;
      if (CONTAINERS.has(child.localName) || child.hasAttribute('data-hp-wrap')) collect(child, out);
      else out.push(child);
    }
    return out;
  }

  /**
   * Position in content coordinates (0 = top of the first page's text area). The origin is
   * measured anew each time: inserting breaks may scroll the frame (scroll anchoring), and a
   * cached origin would then shift every following break.
   * @param {Element} el
   */
  function box(el) {
    const origin = document.body.getBoundingClientRect().top + MARGIN;
    const r = el.getBoundingClientRect();
    return { top: r.top - origin, bottom: r.bottom - origin, height: r.height };
  }

  /** @param {number} y content coordinate */
  function pageEnd(y) {
    const k = Math.max(0, Math.floor(y / STRIDE));
    return k * STRIDE + CONTENT_H;
  }

  /** @param {number} y */
  function nextPageStart(y) {
    return (Math.max(0, Math.floor(y / STRIDE)) + 1) * STRIDE;
  }

  /**
   * Moves a block down until its top lies at `target` by enlarging its top margin.
   * Margin collapsing makes the first guess inexact, so the margin is corrected by measuring.
   * @param {HTMLElement} el
   * @param {number} target
   */
  function pushTo(el, target) {
    if (!el.hasAttribute(BREAK)) {
      const original = el.getAttribute('style');
      if (original !== null) el.setAttribute(ORIGINAL_STYLE, original);
      el.setAttribute(BREAK, '');
    }
    let margin = parseFloat(getComputedStyle(el).marginTop) || 0;
    for (let i = 0; i < 4; i++) {
      const delta = target - box(el).top;
      if (Math.abs(delta) < 0.5) break;
      margin = Math.max(0, margin + delta);
      el.style.setProperty('margin-top', `${margin}px`, 'important');
    }
  }

  /**
   * Moves a table row to `target`, preceded by a copy of the table head (HP-PRINT-006).
   * @param {HTMLTableRowElement} row
   * @param {number} target
   */
  function pushRow(row, target) {
    const table = row.closest('table');
    const columns = Math.max(1, ...Array.from(table?.rows ?? []).map((r) => r.cells.length));
    const spacer = document.createElement('tr');
    spacer.setAttribute(READER, 'spacer');
    spacer.setAttribute('aria-hidden', 'true');
    const cell = document.createElement('td');
    cell.colSpan = columns;
    cell.style.cssText = 'padding:0!important;border:0!important;height:0;background:transparent!important';
    spacer.append(cell);
    row.before(spacer);
    const headRows = table?.tHead ? Array.from(table.tHead.rows) : [];
    for (const head of headRows) {
      const copy = /** @type {HTMLTableRowElement} */ (head.cloneNode(true));
      copy.setAttribute(READER, 'repeat');
      copy.setAttribute('aria-hidden', 'true');
      for (const el of Array.from(copy.querySelectorAll('[id]'))) el.removeAttribute('id');
      row.before(copy);
    }
    const first = /** @type {HTMLElement} */ (spacer.nextElementSibling ?? row);
    for (let i = 0; i < 4; i++) {
      const delta = target - box(first).top;
      if (Math.abs(delta) < 0.5) break;
      const height = Math.max(0, (parseFloat(cell.style.height) || 0) + delta);
      cell.style.height = `${height}px`;
    }
  }

  /** @param {Element} el */
  function splittable(el) {
    return el.localName === 'table' || el.localName === 'ul' || el.localName === 'ol' || el.localName === 'dl';
  }

  /** Parts of an oversized block that may go to different pages. */
  /** @param {Element} el */
  function parts(el) {
    if (el.localName === 'table') {
      const table = /** @type {HTMLTableElement} */ (el);
      return Array.from(table.tBodies).flatMap((b) => Array.from(b.rows)).concat(table.tFoot ? Array.from(table.tFoot.rows) : []);
    }
    return Array.from(el.children).filter((c) => !c.hasAttribute(READER));
  }

  /**
   * @param {Element[]} units
   */
  function place(units) {
    for (let i = 0; i < units.length; i++) {
      const el = /** @type {HTMLElement} */ (units[i]);
      const b = box(el);
      if (b.height === 0) continue;
      const end = pageEnd(b.top);
      if (b.top >= end - 0.5) {
        // Starts in the bottom margin or the gap: begin on the next page.
        if (el.localName === 'tr') pushRow(/** @type {HTMLTableRowElement} */ (el), nextPageStart(b.top));
        else pushTo(el, nextPageStart(b.top));
        continue;
      }
      if (el.matches(HEADINGS)) {
        // Keep a heading with at least the start of the next block.
        const next = units[i + 1];
        const follow = next ? Math.min(box(next).height, 3 * parseFloat(getComputedStyle(el).fontSize)) : 0;
        if (b.bottom + follow > end && b.top > pageEnd(b.top) - CONTENT_H + 1) {
          pushTo(el, nextPageStart(b.top));
          continue;
        }
      }
      if (b.bottom <= end + 0.5) continue;
      if (b.height <= CONTENT_H && b.top > end - CONTENT_H + 1) {
        if (el.localName === 'tr') pushRow(/** @type {HTMLTableRowElement} */ (el), nextPageStart(b.top));
        else pushTo(el, nextPageStart(b.top));
        continue;
      }
      if (splittable(el)) {
        // Too tall for one page: split between rows or items, but do not start the block in
        // the last fifth of a page, where only its caption or first line would remain.
        if (end - b.top < CONTENT_H / 5 && b.top > end - CONTENT_H + 1) pushTo(el, nextPageStart(b.top));
        place(parts(el));
      }
      // Anything else taller than a page keeps its height; it runs over the page bottom.
    }
  }

  function drawPages() {
    for (const el of Array.from(document.querySelectorAll(`[${READER}="pages"]`))) el.remove();
    const body = document.body.getBoundingClientRect();
    const bottom = body.bottom - body.top - 2 * MARGIN;
    pages = Math.max(1, Math.floor(Math.max(0, bottom - 1) / STRIDE) + 1);
    document.body.style.setProperty('min-height', `${pages * STRIDE - GAP - 2 * MARGIN}px`, 'important');
    const layer = document.createElement('div');
    layer.setAttribute(READER, 'pages');
    layer.setAttribute('aria-hidden', 'true');
    for (let k = 0; k < pages; k++) {
      const page = document.createElement('div');
      page.setAttribute(READER, 'page');
      page.style.top = `${k * STRIDE}px`;
      const head = document.createElement('div');
      head.className = 'hp-page-head';
      head.textContent = state.title;
      const foot = document.createElement('div');
      foot.className = 'hp-page-foot';
      foot.textContent = `Seite ${k + 1} von ${pages}`;
      page.append(head, foot);
      layer.append(page);
    }
    document.body.append(layer);
  }

  function paginate() {
    if (paginating) return;
    paginating = true;
    try {
      unpaginate();
      root.classList.add('hp-page');
      root.style.setProperty('zoom', '1');
      place(collect(document.body, []));
      drawPages();
      applyZoom();
    } finally {
      paginating = false;
    }
  }

  // ---------------------------------------------------------------- position and navigation

  /** The page that contains the given viewport y coordinate (1-based). */
  /** @param {number} y */
  function pageAt(y) {
    const list = Array.from(document.querySelectorAll(`[${READER}="page"]`));
    let found = 1;
    for (const [k, page] of list.entries()) if (page.getBoundingClientRect().top <= y) found = k + 1;
    return found;
  }

  /** @param {boolean} force */
  function reportPosition(force) {
    const threshold = window.innerHeight * 0.25;
    let current = /** @type {Element | null} */ (null);
    for (const h of Array.from(document.querySelectorAll(HEADINGS))) {
      if (h.closest(`[${READER}]`)) continue;
      const r = h.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      if (r.top <= threshold) current = h;
      else break;
    }
    current ??= document.querySelector(HEADINGS);
    /** Ids from the heading outwards; `address` prefers the enclosing section or article. */
    const ids = [];
    let address = '';
    for (let el = current; el && el !== document.body; el = el.parentElement) {
      if (!el.id) continue;
      ids.push(el.id);
      if (!address && (el.localName === 'section' || el.localName === 'article')) address = el.id;
    }
    address ||= ids[0] ?? '';
    const label = (current?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const page = state.mode === 'page' ? pageAt(threshold) : 0;
    const key = JSON.stringify([ids, page, pages]);
    if (!force && key === lastPosition) return;
    lastPosition = key;
    post({ type: 'position', ids, address, label, page, pages: state.mode === 'page' ? pages : 0 });
  }

  let scheduled = false;
  function schedulePosition() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      reportPosition(false);
    });
  }

  /** Opens collapsed `details` around an element (HP-ADR-005, HP-RS-003). */
  /** @param {Element} el */
  function reveal(el) {
    let opened = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p instanceof HTMLDetailsElement && !p.open) {
        p.open = true;
        opened = true;
      }
    }
    if (opened && state.mode === 'page') paginate();
  }

  /**
   * @param {{ id?: string, hit?: number, focus?: boolean }} target
   */
  function goto(target) {
    for (const el of Array.from(document.querySelectorAll('.hp-hit-current'))) el.classList.remove('hp-hit-current');
    let el = /** @type {HTMLElement | null} */ (null);
    if (typeof target.hit === 'number') {
      const marks = Array.from(document.querySelectorAll(`mark[data-hp-hit="${target.hit}"]`));
      for (const m of marks) m.classList.add('hp-hit-current');
      el = /** @type {HTMLElement | null} */ (marks[0] ?? null);
    } else if (target.id) {
      el = document.getElementById(target.id);
    }
    if (!el) {
      if (!target.id && typeof target.hit !== 'number') window.scrollTo(0, 0);
      post({ type: 'goto', found: !target.id && typeof target.hit !== 'number' });
      reportPosition(true);
      return;
    }
    reveal(el);
    el.scrollIntoView({ block: typeof target.hit === 'number' ? 'center' : 'start', inline: 'nearest' });
    if (target.focus) {
      // A section is announced by its heading; focusing the heading also keeps the focus
      // ring small instead of drawing it around the whole section.
      const heading = /^(section|article|aside|nav)$/.test(el.localName) ? el.querySelector(HEADINGS) : null;
      // Form controls (P6: links of the form summary) are focusable as they are.
      const FOCUSABLE = 'a[href], button, summary, input, select, textarea, [tabindex]';
      const focusable = heading ?? el.closest(FOCUSABLE) ?? el;
      if (!(focusable instanceof HTMLElement)) return;
      if (!focusable.matches(FOCUSABLE)) focusable.setAttribute('tabindex', '-1');
      focusable.focus({ preventScroll: true });
    }
    post({ type: 'goto', found: true });
    reportPosition(true);
  }

  /**
   * Scroll regions (tables, code) are keyboard-reachable only while they actually scroll,
   * so narrow screens get a tab stop and wide ones do not (HP-RS-004).
   */
  function updateScrollers() {
    for (const el of Array.from(document.querySelectorAll('[data-hp-wrap], pre'))) {
      const scrolls = el.scrollWidth > el.clientWidth + 1;
      const owned = el.hasAttribute('data-hp-tabstop');
      if (scrolls && !el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '0');
        el.setAttribute('data-hp-tabstop', '');
      } else if (!scrolls && owned) {
        el.removeAttribute('tabindex');
        el.removeAttribute('data-hp-tabstop');
      }
    }
  }


  // ---------------------------------------------------------------- tables (P19)

  /**
   * Address → first table cell with that address in document order (as querySelector would find
   * it). Built once per update: a lookup per changed cell would scan the document each time, which
   * is quadratic for large tables (HPF-CALC-007, 10 000 formula cells).
   * @returns {Map<string, Element>}
   */
  function cellIndex() {
    const index = new Map();
    for (const el of Array.from(document.querySelectorAll('td[data-hp-cell], th[data-hp-cell]'))) {
      const address = el.getAttribute('data-hp-cell');
      if (address !== null && !index.has(address)) index.set(address, el);
    }
    return index;
  }

  /**
   * Shows a calculated value as text (HPF-SEC-003); the cell keeps its check message. Returns
   * whether the cell was changed (the caller restarts the highlight for all changed cells at once).
   * @param {Element} cell
   * @param {{ text: string, type: string, value: string, datetime?: string, description?: string }} patch
   * @returns {boolean}
   */
  function showValue(cell, patch) {
    if (cell.querySelector('input')) return false; // an input cell keeps what the user typed
    const keep = Array.from(cell.querySelectorAll('[data-hp-reader="check"]'));
    cell.replaceChildren();
    if (patch.datetime) {
      const time = document.createElement('time');
      time.setAttribute('datetime', patch.datetime);
      time.textContent = patch.text;
      cell.append(time);
    } else {
      cell.append(document.createTextNode(patch.text));
    }
    if (patch.type === 'error') {
      const sr = document.createElement('span');
      sr.className = 'hp-sr';
      sr.setAttribute(READER, 'error');
      sr.textContent = ` (Fehler: ${patch.description ?? patch.value})`;
      cell.append(sr);
    }
    cell.append(...keep);
    cell.setAttribute('data-hp-type', patch.type);
    cell.setAttribute('data-hp-value', patch.value);
    cell.classList.remove('hp-changed');
    return true;
  }

  /**
   * Marks an input or check cell as valid or invalid (HPF-STO-012: marked, never blocked).
   * @param {Element} cell
   */
  function markValidity(cell) {
    const input = cell.querySelector('input');
    const entryError = input?.hasAttribute('data-hp-entry-error') ?? false;
    const checkError = cell.hasAttribute('data-hp-check-failed');
    const target = input ?? cell;
    if (entryError || checkError) target.setAttribute('aria-invalid', 'true');
    else target.removeAttribute('aria-invalid');
    cell.classList.toggle('hp-invalid', entryError || checkError);
  }

  /** @param {any} data */
  function applyCalc(data) {
    const cells = cellIndex();
    /** @type {Element[]} */
    const changed = [];
    for (const patch of Array.isArray(data.cells) ? data.cells : []) {
      const cell = cells.get(String(patch.address));
      if (cell && showValue(cell, patch)) changed.push(cell);
    }
    if (changed.length > 0) {
      // One layout pass, then the highlight restarts on the changed cells in view; animating
      // cells outside the viewport would cost style work on every frame without being seen.
      // Reads first, writes after, so the layout is computed only once.
      const bottom = window.innerHeight;
      const inView = changed.filter((cell) => {
        const r = cell.getBoundingClientRect();
        return r.bottom >= 0 && r.top <= bottom;
      });
      for (const cell of inView) cell.classList.add('hp-changed');
    }
    for (const check of Array.isArray(data.checks) ? data.checks : []) {
      const cell = cells.get(String(check.address));
      if (!cell) continue;
      if (check.ok) cell.removeAttribute('data-hp-check-failed');
      else cell.setAttribute('data-hp-check-failed', '');
      const msg = /** @type {HTMLElement | null} */ (cell.querySelector('[data-hp-reader="check"]'));
      if (msg) {
        msg.hidden = check.ok === true;
        msg.textContent = String(check.message ?? '');
      }
      markValidity(cell);
    }
    for (const ref of Array.isArray(data.refs) ? data.refs : []) {
      for (const a of Array.from(document.querySelectorAll(`a[data-hp-ref-cell="${CSS.escape(String(ref.address))}"]`))) a.textContent = String(ref.text);
    }
    if (data.entry) {
      const input = document.querySelector(`input[data-hp-cell="${CSS.escape(String(data.entry.address))}"]`);
      const cell = input?.closest('td, th');
      if (input && cell) {
        let note = /** @type {HTMLElement | null} */ (cell.querySelector('[data-hp-reader="entry"]'));
        if (data.entry.ok) {
          input.removeAttribute('data-hp-entry-error');
          if (note) note.hidden = true;
        } else {
          input.setAttribute('data-hp-entry-error', '');
          if (!note) {
            note = document.createElement('span');
            note.className = 'hp-check-msg';
            note.setAttribute(READER, 'entry');
            note.id = `${input.getAttribute('data-hp-cell')}-eingabe`.replace(/[^A-Za-z0-9_-]/g, '_');
            cell.append(note);
            input.setAttribute('aria-describedby', `${input.getAttribute('aria-describedby') ?? ''} ${note.id}`.trim());
          }
          note.hidden = false;
          note.textContent = String(data.entry.message ?? 'Eingabe ungültig');
        }
        markValidity(cell);
      }
    }
    if (state.mode === 'page' && !paginating) paginate();
  }

  /**
   * @param {Event} event
   * @param {boolean} final
   */
  function onCellInput(event, final) {
    const t = event.target;
    if (!(t instanceof HTMLInputElement) || !t.hasAttribute('data-hp-cell')) return;
    post({ type: 'cell-input', address: t.getAttribute('data-hp-cell'), value: t.type === 'checkbox' ? (t.checked ? 'true' : 'false') : t.value, final });
  }
  document.addEventListener('input', (event) => onCellInput(event, false));
  document.addEventListener('change', (event) => onCellInput(event, true));

  // ---------------------------------------------------------------- forms (P6)

  /**
   * Value of a form control as the user entered it; null for elements that are not fields.
   * @param {Element} el
   * @returns {string | null}
   */
  function fieldValue(el) {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox') return el.checked ? 'true' : 'false';
      if (el.type === 'radio') {
        const scope = el.closest('form') ?? document;
        const checked = /** @type {HTMLInputElement | null} */ (scope.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`));
        return checked ? checked.value : '';
      }
      return el.value;
    }
    if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return el.value;
    return null;
  }

  /**
   * @param {Event} event
   * @param {boolean} final
   */
  function onFormInput(event, final) {
    const t = event.target;
    if (!(t instanceof Element) || !t.hasAttribute('data-hp-field') || t.localName === 'output') return;
    const value = fieldValue(t);
    if (value === null) return;
    // A choice (box, button, list) is complete at once; typed text when the field is left.
    const choice = t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && (t.type === 'checkbox' || t.type === 'radio'));
    post({ type: 'form-input', field: t.getAttribute('data-hp-field'), value, final: final || choice });
  }
  document.addEventListener('input', (event) => onFormInput(event, false));
  document.addEventListener('change', (event) => onFormInput(event, true));
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-hp-form-action]') : null;
    if (!button) return;
    event.preventDefault();
    post({ type: 'form-action', form: button.getAttribute('data-hp-form'), action: button.getAttribute('data-hp-form-action') });
  });

  /**
   * Summary of the problems of a form, each a link to its field (HP-SBX-017: only reader elements change).
   * @param {Element} summary
   * @param {Array<{ message: string, target: string }>} list
   */
  function showSummary(summary, list) {
    summary.replaceChildren();
    summary.classList.toggle('hp-form-ok', list.length === 0);
    const p = document.createElement('p');
    p.className = 'hp-form-summary-title';
    if (list.length === 0) {
      p.textContent = 'Alle Angaben sind vollständig und gültig.';
      summary.append(p);
      return;
    }
    p.textContent = `Das Formular kann noch nicht abgesendet werden: ${list.length} ${list.length === 1 ? 'Angabe fehlt oder stimmt nicht' : 'Angaben fehlen oder stimmen nicht'}.`;
    const ul = document.createElement('ul');
    for (const m of list) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${m.target}`;
      a.textContent = m.message;
      li.append(a);
      ul.append(li);
    }
    summary.append(p, ul);
  }

  /** @param {any} data */
  function applyForm(data) {
    for (const f of Array.isArray(data.forms) ? data.forms : []) {
      const formEl = document.querySelector(`form[data-hp-form-id="${CSS.escape(String(f.id))}"]`);
      if (!formEl) continue;
      const prefix = `${f.id}.`;
      /** @type {Element[]} */
      const changed = [];
      for (const p of Array.isArray(f.fields) ? f.fields : []) {
        const out = formEl.querySelector(`output[data-hp-field="${CSS.escape(prefix + p.name)}"]`);
        if (!out || out.textContent === String(p.text)) continue;
        out.textContent = String(p.text);
        out.setAttribute('data-hp-value', String(p.value));
        out.classList.remove('hp-changed');
        changed.push(out);
      }
      if (changed.length > 0) {
        void document.body.offsetWidth; // restart the highlight
        for (const out of changed) out.classList.add('hp-changed');
      }
      for (const s of Array.isArray(f.sections) ? f.sections : []) {
        const el = /** @type {HTMLElement | null} */ (formEl.querySelector(`#${CSS.escape(String(s.id))}`));
        if (el) el.hidden = s.relevant !== true;
      }
      /** @type {Map<string, string>} */
      const shown = new Map();
      const failing = new Set();
      for (const m of Array.isArray(f.messages) ? f.messages : []) {
        if (m.field && !shown.has(m.field)) shown.set(String(m.field), String(m.message));
        if (m.check) failing.add(String(m.check));
      }
      for (const msg of Array.from(formEl.querySelectorAll('[data-hp-reader="form-msg"]'))) {
        const key = msg.getAttribute('data-hp-msg-for') ?? '';
        const text = shown.get(key.slice(prefix.length));
        /** @type {HTMLElement} */ (msg).hidden = !text;
        msg.textContent = text ?? '';
        for (const c of Array.from(formEl.querySelectorAll(`[data-hp-field="${CSS.escape(key)}"]`))) {
          if (text) c.setAttribute('aria-invalid', 'true');
          else c.removeAttribute('aria-invalid');
        }
      }
      for (const rule of Array.from(formEl.querySelectorAll('[data-hp-check][id]'))) {
        const bad = failing.has(rule.id);
        rule.classList.toggle('hp-check-failed', bad);
        const msg = /** @type {HTMLElement | null} */ (rule.querySelector('[data-hp-reader="form-check"]'));
        if (msg) msg.hidden = !bad;
      }
      const summary = /** @type {HTMLElement | null} */ (formEl.querySelector('[data-hp-reader="form-summary"]'));
      if (summary) {
        if (Array.isArray(f.summary)) {
          showSummary(summary, f.summary.map((/** @type {any} */ m) => ({ message: String(m.message), target: String(m.target) })));
          summary.hidden = false;
        } else summary.hidden = true;
      }
      const stateEl = formEl.querySelector('[data-hp-state-for]');
      if (stateEl && typeof f.status === 'string') stateEl.textContent = `Status: ${f.status}`;
    }
    if (typeof data.focusSummary === 'string') {
      const s = /** @type {HTMLElement | null} */ (document.querySelector(`[data-hp-summary-for="${CSS.escape(data.focusSummary)}"]`));
      if (s && !s.hidden) {
        s.scrollIntoView({ block: 'start' });
        s.focus({ preventScroll: true });
      }
    }
    if (state.mode === 'page' && !paginating) paginate();
  }

  // ---------------------------------------------------------------- motion (P15)

  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** Animations the agent paused for the user, resumed when the user lets motion run again. */
  const pausedByAgent = new Set();
  let startingMedia = false;
  let lastUserAction = -Infinity;
  let lastMotion = '';

  function motionMode() {
    if (state.motion === 'reduce' || REDUCE.matches) return 'reduce';
    return state.paused ? 'paused' : 'run';
  }

  /** @param {Animation} a */
  function isOwn(a) {
    const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
    return target instanceof Element && target.classList.contains('hp-changed');
  }

  /** Ends, pauses or resumes script animations and media according to the motion mode. */
  function enforceMotion() {
    const mode = motionMode();
    for (const a of document.getAnimations()) {
      if (isOwn(a)) continue;
      if (mode === 'reduce' && a.playState === 'running') {
        // A finite animation jumps to its end state; an endless one is removed.
        try {
          a.finish();
        } catch {
          a.cancel();
        }
      } else if (mode === 'paused' && a.playState === 'running') {
        a.pause();
        pausedByAgent.add(a);
      }
    }
    if (mode === 'run') {
      for (const a of pausedByAgent) if (a.playState === 'paused') a.play();
      pausedByAgent.clear();
    }
    for (const el of Array.from(document.querySelectorAll('video, audio'))) {
      const media = /** @type {HTMLMediaElement} */ (el);
      if (mode !== 'run' && !media.paused && media.hasAttribute('data-hp-autoplay') && !media.hasAttribute('data-hp-user-started')) media.pause();
      if (mode === 'run' && media.paused && media.hasAttribute('data-hp-autoplay') && !media.hasAttribute('data-hp-user-paused') && media.readyState >= 0) {
        media.muted = true;
        startingMedia = true;
        media.play().catch(() => undefined).finally(() => (startingMedia = false));
      }
    }
    reportMotion();
  }

  function applyMotion() {
    root.setAttribute('data-hp-motion', motionMode());
    enforceMotion();
  }

  function reportMotion() {
    const running = document.getAnimations().filter((a) => a.playState === 'running' && !isOwn(a)).length;
    const playing = Array.from(document.querySelectorAll('video, audio')).filter((m) => !(/** @type {HTMLMediaElement} */ (m).paused)).length;
    const key = JSON.stringify([running + playing, motionMode()]);
    if (key === lastMotion) return;
    lastMotion = key;
    post({ type: 'motion', moving: running + playing, reduced: motionMode() === 'reduce', paused: motionMode() === 'paused' });
  }

  // A medium that starts without a user action: allowed only muted and while motion may run
  // (HP-SBX-014: no sound without user action; HP-INH-014).
  document.addEventListener('play', (event) => {
    const media = event.target;
    if (!(media instanceof HTMLMediaElement)) return;
    const byUser = performance.now() - lastUserAction < 1500;
    if (byUser) {
      media.setAttribute('data-hp-user-started', '');
      media.removeAttribute('data-hp-user-paused');
    } else if (!startingMedia && (!media.muted || motionMode() !== 'run')) {
      media.pause();
    }
    reportMotion();
  }, true);
  document.addEventListener('pause', (event) => {
    const media = event.target;
    if (media instanceof HTMLMediaElement && performance.now() - lastUserAction < 1500) {
      media.setAttribute('data-hp-user-paused', '');
      media.removeAttribute('data-hp-user-started');
    }
    reportMotion();
  }, true);
  document.addEventListener('volumechange', (event) => {
    const media = event.target;
    // Unmuting without a user action would be sound without user action.
    if (media instanceof HTMLMediaElement && !media.muted && !media.paused && performance.now() - lastUserAction >= 1500) media.pause();
  }, true);
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => (lastUserAction = performance.now()), true);
  REDUCE.addEventListener('change', applyMotion);
  // Components may start new animations at any time; check twice a second.
  setInterval(enforceMotion, 500);

  // ---------------------------------------------------------------- events

  port.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.hp !== 'reader') return;
    if (data.type === 'state') {
      applyState({ mode: data.mode === 'page' ? 'page' : 'flow', zoom: Number(data.zoom) || 1, title: String(data.title ?? ''), vars: data.vars ?? {}, scheme: String(data.scheme ?? 'light'), motion: data.motion === 'reduce' ? 'reduce' : 'system', paused: data.paused === true });
    } else if (data.type === 'goto') {
      goto({ id: typeof data.id === 'string' ? data.id : undefined, hit: typeof data.hit === 'number' ? data.hit : undefined, focus: data.focus === true });
    } else if (data.type === 'focus') {
      window.focus();
    } else if (data.type === 'calc') {
      applyCalc(data);
    } else if (data.type === 'form') {
      applyForm(data);
    }
  });
  port.start();

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!target) return;
    const href = target.getAttribute('href') ?? '';
    event.preventDefault();
    if (href.startsWith('#')) {
      let id = href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* keep the raw fragment */
      }
      goto({ id, focus: true });
      return;
    }
    // Links into other content documents and external links are decided by the reader
    // (HP-RS-009: external targets only after showing the URL, outside the frame).
    post({ type: 'link', href });
  });

  document.addEventListener('keydown', (event) => {
    const t = event.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(input|textarea|select|button)$/.test(t.localName))) return;
    if (event.defaultPrevented) return;
    // Ctrl+P / Cmd+P: the reader prints the derived copy (P18), the browser must not print the frame.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === 'p' || event.key === 'P')) event.preventDefault();
    post({ type: 'key', key: event.key, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
  });

  document.addEventListener('toggle', () => {
    if (state.mode === 'page' && !paginating) paginate();
    schedulePosition();
  }, true);

  window.addEventListener('scroll', schedulePosition, { passive: true });
  window.addEventListener('resize', () => {
    if (state.mode === 'page') applyZoom();
    updateScrollers();
    schedulePosition();
  });

  // ---------------------------------------------------------------- start

  // Motion rules apply from the first frame, before the load event (autoplay, CSS animations).
  Object.assign(state, { motion: initial.motion === 'reduce' ? 'reduce' : 'system', paused: initial.paused === true });
  root.setAttribute('data-hp-motion', motionMode());

  function start() {
    applyState(initial);
    started = true;
    updateScrollers();
    post({ type: 'ready', pages });
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
