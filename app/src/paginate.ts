/**
 * Layout steps of the print document (P18) that need a laid-out page: runs in the reader shell on
 * the print frame (same origin, no script inside the frame), whose viewport has the width of the
 * type area as printed (print.ts TYPE_AREA_PX, 643 px).
 *
 * 1. Code blocks (HP-PRINT-007): lines longer than the type area are broken at the last column
 *    that fits, with "↩" at the end and an indent of two columns on the continuation.
 * 2. Wide tables (HP-PRINT-008): one or two steps smaller and with breakable cells.
 * 3. Overflow check: every element must lie inside the type area (HP-PRINT-008).
 * 4. Page numbers (HP-PRINT-004, -005, -011): Chromium does not render `target-counter()` in print
 *    (it parses the value but prints nothing; measured in P18). The body is therefore laid out as a
 *    multi-column box with the size of the type area; Chromium fragments columns with the same
 *    engine as pages, so the column of an element is its page (table heads, which only pages repeat,
 *    are copied in while measuring, see emulatePages). The numbers are written into the
 *    document; a second measurement checks that writing them changed no break. Whether the
 *    prediction matches the printed PDF is checked against the PDF's named destinations
 *    (e2e/druck.spec.ts, scripts/p18-pdf-pruefung.py).
 */
import { TYPE_AREA_PX } from './print.js';

export interface PaginationReport {
  /** Predicted number of printed pages. */
  readonly pages: number;
  /** The table of contents is printed (only when the document has more than one page). */
  readonly toc: boolean;
  /** Print id → predicted page, for every target of the table of contents and of internal links. */
  readonly targets: Readonly<Record<string, number>>;
  /** Measured place of every target: page and distance from the top of the type area in mm. */
  readonly positions: Readonly<Record<string, { page: number; topMm: number }>>;
  /** Headings that would stand last on a page, without what follows them. */
  readonly headingsAtPageEnd: readonly string[];
  /** Elements outside the type area (should be empty). */
  readonly overflow: readonly string[];
  readonly codeBlocks: number;
  /** Line breaks inserted and marked in code blocks. */
  readonly markedWraps: number;
  /** Visual lines in code blocks beyond the marked ones (should be 0). */
  readonly unmarkedWraps: number;
  /** Tables made smaller to fit, with the step taken. */
  readonly wideTables: readonly string[];
  /** Measuring passes until the numbers stayed the same. */
  readonly passes: number;
  readonly stable: boolean;
}

const MM = 96 / 25.4;
const WRAP_MARK = '↩';
const INDENT = 2;

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.getAttribute('class') ? `.${el.getAttribute('class')!.trim().split(/\s+/).join('.')}` : '';
  const owner = el.closest('[id]');
  return `${el.localName}${id}${cls}${!id && owner ? ` in #${owner.id}` : ''}`;
}

function isWide(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0x1f300 && c <= 0x1faff);
}

function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = root.ownerDocument!.createTreeWalker(root, 4 /* SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Columns of monospace text that fit into `pre`. */
function columnsOf(pre: HTMLElement): { cols: number; tab: number } {
  const doc = pre.ownerDocument;
  const host = textNodes(pre)[0]?.parentElement ?? pre;
  const probe = doc.createElement('span');
  probe.style.whiteSpace = 'pre';
  probe.textContent = '0'.repeat(100);
  host.append(probe);
  const charWidth = probe.getBoundingClientRect().width / 100;
  probe.remove();
  const style = doc.defaultView!.getComputedStyle(pre);
  const avail = pre.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const tab = parseInt(style.tabSize, 10) || 8;
  return { cols: Math.max(16, Math.floor(avail / charWidth + 0.001)), tab };
}

/** Breaks long code lines with a visible mark (HP-PRINT-007). Returns the number of marks. */
function markCodeWraps(pre: HTMLElement): number {
  const doc = pre.ownerDocument;
  const { cols, tab } = columnsOf(pre);
  const nodes = textNodes(pre);
  const breaks = new Map<Text, number[]>();
  let col = 0;
  for (const node of nodes) {
    const data = node.data;
    for (let i = 0; i < data.length; ) {
      const cp = data.codePointAt(i)!;
      const ch = String.fromCodePoint(cp);
      if (ch === '\n') {
        col = 0;
      } else {
        const w = ch === '\t' ? tab - (col % tab) : isWide(ch) ? 2 : 1;
        // One column stays free for the mark at the end of the broken line.
        if (col > INDENT && col + w > cols - 1) {
          const list = breaks.get(node) ?? [];
          list.push(i);
          breaks.set(node, list);
          col = INDENT;
        }
        col += w;
      }
      i += ch.length;
    }
  }
  let marks = 0;
  for (const [node, offsets] of breaks) {
    for (const offset of [...offsets].reverse()) {
      const rest = node.splitText(offset);
      const mark = doc.createElement('span');
      mark.className = 'hp-umbruch';
      mark.setAttribute('title', 'Zeile im Ausdruck umbrochen');
      mark.textContent = WRAP_MARK;
      const indent = doc.createElement('span');
      indent.className = 'hp-fortsetzung';
      indent.textContent = ' '.repeat(INDENT);
      rest.before(mark, doc.createTextNode('\n'), indent);
      marks++;
    }
  }
  pre.setAttribute('data-hp-umbrochen', String(marks));
  return marks;
}

/** Visual lines of a code block that are not explained by a hard line break. */
function unmarkedLines(pre: HTMLElement): number {
  const doc = pre.ownerDocument;
  const tops = new Set<number>();
  for (const node of textNodes(pre)) {
    const range = doc.createRange();
    range.selectNodeContents(node);
    for (const r of Array.from(range.getClientRects())) if (r.width > 0.5) tops.add(Math.round(r.top));
  }
  const lines = (pre.textContent ?? '').split('\n').filter((l) => l.trim() !== '').length;
  return Math.max(0, tops.size - lines);
}

function fitTables(doc: Document, width: number): string[] {
  const out: string[] = [];
  for (const table of Array.from(doc.body.querySelectorAll('table'))) {
    if (table.parentElement?.closest('table')) continue;
    for (const step of ['hp-breit', 'hp-sehr-breit']) {
      if (table.getBoundingClientRect().width <= width + 0.5) break;
      table.classList.add(step);
      out.push(`${describe(table)}: ${step}`);
    }
  }
  return out;
}

function overflowing(doc: Document): string[] {
  const body = doc.body.getBoundingClientRect();
  const out: string[] = [];
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (el.closest('svg') !== el && el.closest('svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const right = r.right - body.right;
    const left = body.left - r.left;
    if (right > 0.5 || left > 0.5) out.push(`${describe(el)} (${right > 0.5 ? `rechts ${(right / MM).toFixed(1)} mm` : `links ${(left / MM).toFixed(1)} mm`} außerhalb)`);
  }
  return out;
}

interface Measurement {
  readonly pages: number;
  readonly targets: Record<string, number>;
  readonly positions: Record<string, { page: number; topMm: number }>;
  readonly headingsAtPageEnd: string[];
}

function nextInFlow(el: Element): Element | null {
  for (let n: Element | null = el; n && n !== n.ownerDocument.body; n = n.parentElement) {
    if (n.nextElementSibling) return n.nextElementSibling;
  }
  return null;
}

/**
 * Chromium repeats the table head on every printed page, but not in a column of a multi-column box
 * (measured in P18: on the 200-row test table the measurement otherwise ran 46 mm ahead by page 8).
 * While measuring, a copy of the head rows with a forced column break is therefore put before every
 * row that starts a column, column by column in order, because each copy moves what follows.
 * (Top margins after an unforced break are truncated in both, measured in P18; nothing to imitate.)
 * Returns the function that removes the copies.
 */
function emulatePages(doc: Document, pageOf: (el: Element) => number): () => void {
  const copies: Element[] = [];
  const tables = Array.from(doc.body.querySelectorAll('table')).filter((t) => ((t as HTMLTableElement).tHead?.rows.length ?? 0) > 0) as HTMLTableElement[];
  for (const t of tables) {
    const rows = [...Array.from(t.tBodies).flatMap((b) => Array.from(b.rows)), ...(t.tFoot ? Array.from(t.tFoot.rows) : [])];
    let before = pageOf(t.tHead!);
    for (const row of rows) {
      const page = pageOf(row);
      if (page > before) {
        for (const [i, headRow] of Array.from(t.tHead!.rows).entries()) {
          const copy = headRow.cloneNode(true) as HTMLTableRowElement;
          copy.removeAttribute('id');
          for (const el of Array.from(copy.querySelectorAll('[id]'))) el.removeAttribute('id');
          copy.setAttribute('data-hp-mess-kopf', '');
          copy.setAttribute('aria-hidden', 'true');
          if (i === 0) copy.style.breakBefore = 'column';
          row.before(copy);
          copies.push(copy);
        }
      }
      // Read again: the copy may have moved this row.
      before = pageOf(row);
    }
  }
  return () => {
    for (const c of copies) c.remove();
  };
}

function measure(doc: Document): Measurement {
  const html = doc.documentElement;
  html.classList.add('hp-messen');
  let undo = () => undefined as void;
  try {
    const box = doc.body.getBoundingClientRect();
    const colWidth = TYPE_AREA_PX.width;
    const pageAt = (x: number) => Math.floor((x - box.left + 0.5) / colWidth) + 1;
    const first = (el: Element) => {
      const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
      return pageAt(r.left);
    };
    undo = emulatePages(doc, first);
    const last = (el: Element) => {
      const rects = el.getClientRects();
      const r = rects[rects.length - 1] ?? el.getBoundingClientRect();
      return pageAt(r.left);
    };
    let pages = 1;
    for (const el of Array.from(doc.body.querySelectorAll('*'))) {
      if (el.closest('svg') && el.localName !== 'svg') continue;
      const rects = el.getClientRects();
      const r = rects[rects.length - 1];
      if (r && (r.height > 0 || r.width > 0)) pages = Math.max(pages, pageAt(r.left));
    }
    const targets: Record<string, number> = {};
    const positions: Record<string, { page: number; topMm: number }> = {};
    for (const num of Array.from(doc.querySelectorAll('[data-hp-seite-von]'))) {
      const id = num.getAttribute('data-hp-seite-von')!;
      const el = doc.getElementById(id);
      if (!el) continue;
      targets[id] = first(el);
      const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
      positions[id] = { page: targets[id]!, topMm: Math.round(((r.top - box.top) / MM) * 10) / 10 };
    }
    const headingsAtPageEnd: string[] = [];
    // Headings, and the summary of an opened `details`, which reads like one.
    for (const h of Array.from(doc.querySelectorAll('article :is(h1, h2, h3, h4, h5, h6), article details > summary'))) {
      const next = nextInFlow(h);
      if (next && last(h) < first(next)) headingsAtPageEnd.push(`${describe(h)} (Seite ${last(h)})`);
    }
    return { pages, targets, positions, headingsAtPageEnd };
  } finally {
    undo();
    html.classList.remove('hp-messen');
  }
}

function writeNumbers(doc: Document, targets: Readonly<Record<string, number>>): void {
  for (const num of Array.from(doc.querySelectorAll('[data-hp-seite-von]'))) {
    const page = targets[num.getAttribute('data-hp-seite-von')!];
    num.textContent = page === undefined ? '–' : String(page);
  }
}

/** Prepares the laid-out print document for printing and fills in its page numbers. */
export function paginate(doc: Document): PaginationReport {
  const width = doc.body.getBoundingClientRect().width;
  let codeBlocks = 0;
  let markedWraps = 0;
  let unmarkedWraps = 0;
  for (const pre of Array.from(doc.body.querySelectorAll('pre'))) {
    codeBlocks++;
    if (!pre.hasAttribute('data-hp-umbrochen')) markedWraps += markCodeWraps(pre as HTMLElement);
    unmarkedWraps += unmarkedLines(pre as HTMLElement);
  }
  const wideTables = fitTables(doc, width);
  const overflow = overflowing(doc);

  // Table of contents only when the document needs more than one page (HP-PRINT-005).
  const toc = doc.querySelector<HTMLElement>('[data-hp-print="verzeichnis"]');
  let withToc = false;
  if (toc) {
    toc.hidden = true;
    const alone = measure(doc);
    toc.hidden = false;
    if (alone.pages > 1) withToc = true;
    else toc.remove();
  }

  let m = measure(doc);
  let passes = 1;
  let stable = false;
  while (passes < 4) {
    writeNumbers(doc, m.targets);
    const again = measure(doc);
    passes++;
    stable = again.pages === m.pages && Object.keys(m.targets).every((k) => again.targets[k] === m.targets[k]);
    m = again;
    if (stable) break;
  }
  writeNumbers(doc, m.targets);
  return {
    pages: m.pages,
    toc: withToc,
    targets: m.targets,
    positions: m.positions,
    headingsAtPageEnd: m.headingsAtPageEnd,
    overflow,
    codeBlocks,
    markedWraps,
    unmarkedWraps,
    wideTables,
    passes,
    stable,
  };
}
