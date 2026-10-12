// @ts-check
/**
 * Frame agent: the only script that runs in the document frame.
 *
 * The frame is a `srcdoc` iframe with `sandbox="allow-scripts"` and an opaque origin
 * (HP-SBX-005), so the reader cannot touch its DOM. This script is inserted by the reader
 * (render.ts) and allowed by its CSP hash; the document's own scripts are removed and blocked.
 * It talks to the reader only through `postMessage`:
 *
 *   reader → frame  { hp: 'reader', type: 'goto', id?, hit?, focus? }
 *                   { hp: 'reader', type: 'state', mode, zoom, vars, scheme }
 *   frame → reader  { hp: 'frame', type: 'ready' | 'position' | 'link' | 'key', … }
 *
 * The fixed page view is derived from the print profile (HP-PRINT-002, HP-PRINT-014): A4 page,
 * 15 mm margins, header with the title and footer "Seite n von N". Breaks are made between
 * blocks; a heading stays with what follows, a block that fits on a page is not split, table
 * rows are not split and the table head repeats (HP-PRINT-006). The document DOM is only
 * touched through inline margins and reader elements marked `data-hp-reader`, all of which
 * are removed again when the view returns to flowing text.
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
  /** @type {{ mode: 'flow' | 'page', zoom: number, title: string, vars: Record<string, string>, scheme: string }} */
  const state = { mode: 'flow', zoom: 1, title: '', vars: {}, scheme: 'light' };
  let pages = 0;
  let lastPosition = '';
  let paginating = false;
  let started = false;

  /** @param {Record<string, unknown>} message */
  function post(message) {
    window.parent.postMessage({ hp: 'frame', ...message }, '*');
  }

  // ---------------------------------------------------------------- state and appearance

  /** @param {Partial<typeof state>} next */
  function applyState(next) {
    const before = JSON.stringify([state.mode, state.vars, state.scheme, state.title]);
    const anchor = readingAnchor();
    Object.assign(state, next);
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
      const focusable = heading ?? el.closest('a[href], button, summary, [tabindex]') ?? el;
      if (!(focusable instanceof HTMLElement)) return;
      if (!focusable.matches('a[href], button, summary, [tabindex]')) focusable.setAttribute('tabindex', '-1');
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

  // ---------------------------------------------------------------- events

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.hp !== 'reader') return;
    if (data.type === 'state') {
      applyState({ mode: data.mode === 'page' ? 'page' : 'flow', zoom: Number(data.zoom) || 1, title: String(data.title ?? ''), vars: data.vars ?? {}, scheme: String(data.scheme ?? 'light') });
    } else if (data.type === 'goto') {
      goto({ id: typeof data.id === 'string' ? data.id : undefined, hit: typeof data.hit === 'number' ? data.hit : undefined, focus: data.focus === true });
    } else if (data.type === 'focus') {
      window.focus();
    }
  });

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
    if (t instanceof HTMLElement && (t.isContentEditable || /^(input|textarea|select)$/.test(t.localName))) return;
    if (event.defaultPrevented) return;
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

  /** @type {Partial<typeof state>} */
  let initial = {};
  try {
    initial = JSON.parse(root.getAttribute('data-hp-init') ?? '{}');
  } catch {
    initial = {};
  }
  root.removeAttribute('data-hp-init');

  function start() {
    applyState(initial);
    started = true;
    updateScrollers();
    post({ type: 'ready', pages });
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
