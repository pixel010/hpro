/**
 * PDF import, second half (P9): the structure blocks a conversion service found in a PDF become an
 * hpro document. The service (Docling in `dienst/`) guesses structure from the page image; this
 * module writes it the way the format wants it, so the rules live in the core:
 *
 * - one content document `content/index.xhtml`, sections with stable addresses (HP-ADR-001,
 *   kennung from the heading text, unique, deterministic for the same input);
 * - headings h1–h6 from the detected levels (title → h1), lists with nesting and `start`,
 *   tables with `thead`/`th` only where the service marked header cells, figures with image,
 *   caption and alternative text, footnotes as `aside role="doc-footnote"`;
 * - the source PDF under `original/` and `manifest.json#source` (HP-META-005, GoBD Rz. 135);
 * - nothing invented: a figure without caption gets a placeholder alternative text and a warning,
 *   a table without detected header cells stays without `th`.
 */
import type { DocumentInput, ResourceInput } from '../container.js';
import { escapeXml } from '../ocf.js';
import type { TocEntry } from '../ocf.js';
import type { PdfImportWarning } from '../adapters/pdf.js';

export interface DienstSpan {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly script?: 'sub' | 'super';
  readonly href?: string;
}

export interface DienstListItem {
  readonly text: string;
  readonly marker?: string;
  readonly children: readonly DienstList[];
  readonly page?: number | null;
}

export interface DienstList {
  readonly type: 'list';
  readonly ordered: boolean;
  readonly items: readonly DienstListItem[];
  readonly page?: number | null;
}

export interface DienstTableCell {
  readonly row: number;
  readonly col: number;
  readonly text: string;
  readonly rowSpan: number;
  readonly colSpan: number;
  readonly columnHeader: boolean;
  readonly rowHeader: boolean;
}

export type DienstBlock =
  | { readonly type: 'heading'; readonly level: number; readonly text: string; readonly page?: number | null }
  | { readonly type: 'paragraph' | 'caption' | 'reference' | 'formula' | 'footnote'; readonly text: string; readonly spans?: readonly DienstSpan[]; readonly page?: number | null }
  | { readonly type: 'checkbox'; readonly text: string; readonly checked: boolean; readonly page?: number | null }
  | { readonly type: 'code'; readonly text: string; readonly page?: number | null }
  | DienstList
  | { readonly type: 'table'; readonly rows: number; readonly cols: number; readonly cells: readonly DienstTableCell[]; readonly caption: string; readonly page?: number | null }
  | {
      readonly type: 'figure';
      readonly caption: string;
      readonly image?: string;
      readonly mediaType?: string;
      readonly width?: number;
      readonly height?: number;
      readonly page?: number | null;
    };

/** Answer of `POST /v1/import` (dienst/hpro_dienst/pdfimport.py). */
export interface DienstImportResult {
  readonly engine: { readonly name: string; readonly version: string; readonly core?: string; readonly models?: string };
  readonly ocrEngine?: { readonly name: string; readonly languages: string } | null;
  readonly fileName: string;
  readonly pdf: { readonly pages: number; readonly tagged: boolean; readonly lang: string | null; readonly title: string | null };
  readonly title: string | null;
  readonly language: string | null;
  readonly blocks: readonly DienstBlock[];
  readonly warnings: readonly PdfImportWarning[];
  readonly seconds?: number;
}

export interface ImportToDocumentOptions {
  /** The source PDF; stored as `original/<fileName>`. */
  readonly pdf: Uint8Array;
  readonly fileName: string;
  /** Default: now, whole seconds. */
  readonly modified?: string;
  /** Default: UUID derived from the SHA-256 of the PDF (same PDF → same id). */
  readonly id?: string;
  /** BCP 47; default: `/Lang` of the PDF, else `de`. */
  readonly language?: string;
  /** Keep the source PDF (HP-META-005, Soll). Default true. */
  readonly keepOriginal?: boolean;
}

export interface ImportedDocument {
  readonly document: DocumentInput;
  readonly warnings: readonly PdfImportWarning[];
  /** Counts per block type that were written (tables, figures, …). */
  readonly counts: Readonly<Record<string, number>>;
}

export const IMPORT_TOOL = 'hpro-dienst/Docling';

/** Stylesheet of imported documents: reading-system variables (HP-INH-004), keep-together rules. */
export const IMPORT_CSS = `/* hpro: aus PDF übernommen. Darstellung kommt aus den Lesesystem-Variablen --hp-* (HP-INH-004). */
body {
  font-family: serif;
  font-size: var(--hp-font-size, 1rem);
  line-height: var(--hp-line-height, 1.5);
  letter-spacing: var(--hp-letter-spacing, normal);
  word-spacing: var(--hp-word-spacing, normal);
  color: var(--hp-foreground, #111);
  background: var(--hp-background, #fff);
  margin: 0 auto;
  max-width: 40em;
  padding: 1em;
}
p, ul, ol, table, pre, figure, aside {
  margin-top: var(--hp-paragraph-spacing, 1em);
  margin-bottom: var(--hp-paragraph-spacing, 1em);
}
h1, h2, h3, h4, h5, h6 { break-after: avoid; line-height: 1.25; }
table, figure, pre { break-inside: avoid; }
table { border-collapse: collapse; }
th, td { border: 1px solid currentColor; padding: 0.25em 0.5em; text-align: left; vertical-align: top; }
figure img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; }
aside[role="doc-footnote"] { font-size: 0.9em; border-top: 1px solid currentColor; }
p.hp-formel { text-align: center; }
p.hp-import-luecke { font-style: italic; }
`;

const ID_MAX = 48;

/** Kennung from text (HP-ADR-001 pattern `^[A-Za-z][A-Za-z0-9_.-]*$`). */
export function slugify(text: string, fallback = 'abschnitt'): string {
  let t = text.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!t) t = fallback;
  if (!/^[a-z]/.test(t)) t = 's-' + t;
  return t.slice(0, ID_MAX).replace(/[-.]+$/, '');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function uuidFromBytes(bytes: Uint8Array): Promise<string> {
  // RFC 9562 UUIDv8 from SHA-256 of the source: the same PDF gives the same id (HP-CONT-014).
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  h[6] = (h[6]! & 0x0f) | 0x80;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = [...h.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `urn:uuid:${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

function nowUtc(): string {
  return new Date().toISOString().slice(0, 19) + 'Z';
}

/** File name usable as OCF path segment. */
export function safeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').normalize('NFC').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').replace(/\.+$/, '');
  const withExt = /\.pdf$/i.test(base) ? base : `${base || 'dokument'}.pdf`;
  return withExt.slice(-120);
}

const SAFE_LINK = /^(https?:|mailto:)/i;

function inline(block: { readonly text: string; readonly spans?: readonly DienstSpan[] }): string {
  const spans = block.spans && block.spans.length > 0 ? block.spans : [{ text: block.text }];
  return spans
    .map((s) => {
      let h = escapeXml(s.text);
      if (!h) return '';
      if (s.script === 'sub') h = `<sub>${h}</sub>`;
      if (s.script === 'super') h = `<sup>${h}</sup>`;
      if (s.italic) h = `<em>${h}</em>`;
      if (s.bold) h = `<strong>${h}</strong>`;
      if (s.href && SAFE_LINK.test(s.href)) h = `<a href="${escapeXml(s.href)}">${h}</a>`;
      return h;
    })
    .filter(Boolean)
    .join(' ');
}

class Ids {
  private readonly used = new Set<string>();
  take(base: string): string {
    let id = base;
    for (let n = 2; this.used.has(id); n++) id = `${base.slice(0, ID_MAX - String(n).length - 1)}-${n}`;
    this.used.add(id);
    return id;
  }
}

/** Turns the service's blocks into a `DocumentInput` (call `createContainer` with it). */
export async function importToDocument(result: DienstImportResult, options: ImportToDocumentOptions): Promise<ImportedDocument> {
  const warnings: PdfImportWarning[] = [...result.warnings];
  const counts: Record<string, number> = {};
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const ids = new Ids();
  const language = options.language ?? result.language ?? 'de';
  const modified = options.modified ?? nowUtc();
  const fileName = safeFileName(options.fileName);
  const id = options.id ?? (await uuidFromBytes(options.pdf));
  const media: ResourceInput[] = [];

  const blocks = [...result.blocks];
  const hasTitle = blocks.some((b) => b.type === 'heading' && b.level === 0);
  const firstHeading = blocks.find((b) => b.type === 'heading');
  const title = (result.title ?? (firstHeading?.type === 'heading' ? firstHeading.text : null) ?? fileName.replace(/\.pdf$/i, '')).trim() || 'Aus PDF übernommen';

  // Heading levels: title → 1, section header level n → n + 1 when a title exists, else n.
  const levelOf = (b: { level: number }) => Math.min(6, Math.max(1, b.level === 0 ? 1 : hasTitle ? b.level + 1 : b.level));

  const out: string[] = [];
  const toc: Array<{ level: number; entry: { title: string; href: string; children: TocEntry[] } }> = [];
  const open: number[] = [];
  const indent = () => '  '.repeat(open.length + 2);
  let figures = 0;
  let tables = 0;
  let footnotes = 0;
  let h1Seen = false;

  const closeTo = (level: number) => {
    while (open.length > 0 && open[open.length - 1]! >= level) {
      open.pop();
      out.push(`${'  '.repeat(open.length + 2)}</section>\n`);
    }
  };

  const listHtml = (list: DienstList, pad: string): string => {
    const tag = list.ordered ? 'ol' : 'ul';
    const first = list.items[0]?.marker?.match(/^\(?(\d+)/)?.[1];
    const start = list.ordered && first && first !== '1' ? ` start="${Number(first)}"` : '';
    let h = `${pad}<${tag}${start}>\n`;
    for (const item of list.items) {
      const text = escapeXml(item.text);
      if (item.children.length === 0) h += `${pad}  <li>${text}</li>\n`;
      else h += `${pad}  <li>${text}\n${item.children.map((c) => listHtml(c, pad + '    ')).join('')}${pad}  </li>\n`;
    }
    return h + `${pad}</${tag}>\n`;
  };

  for (const b of blocks) {
    switch (b.type) {
      case 'heading': {
        const level = levelOf(b);
        if (level === 1 && !h1Seen && (b.level === 0 || !hasTitle)) {
          h1Seen = true;
          const hid = ids.take(slugify(b.text, 'titel'));
          out.push(`    <h1 id="${hid}">${escapeXml(b.text)}</h1>\n`);
          toc.push({ level: 1, entry: { title: b.text, href: `content/index.xhtml#${hid}`, children: [] } });
          count('heading');
          break;
        }
        closeTo(level);
        const sid = ids.take(slugify(b.text));
        out.push(`${indent()}<section id="${sid}">\n`);
        open.push(level);
        // The section carries the address; the heading its own id (HP-ADR-001: every heading is addressable).
        out.push(`${indent()}<h${level} id="${ids.take(`${sid}-titel`)}">${escapeXml(b.text)}</h${level}>\n`);
        toc.push({ level, entry: { title: b.text, href: `content/index.xhtml#${sid}`, children: [] } });
        count('heading');
        break;
      }
      case 'paragraph':
      case 'caption':
      case 'reference': {
        const h = inline(b);
        if (h) out.push(`${indent()}<p>${h}</p>\n`), count('paragraph');
        break;
      }
      case 'formula':
        if (b.text.trim()) out.push(`${indent()}<p class="hp-formel">${escapeXml(b.text)}</p>\n`);
        else {
          // Never an empty paragraph: the reader learns that something is missing and where it is.
          const where = `${options.keepOriginal ?? true ? `original/${fileName}` : 'Original-PDF'}${b.page ? `, Seite ${b.page}` : ''}`;
          out.push(`${indent()}<p class="hp-formel hp-import-luecke">[Formel nicht als Text übernommen; siehe ${escapeXml(where)}]</p>\n`);
          if (!warnings.some((w) => w.code === 'formula-not-recognized')) {
            warnings.push({ code: 'formula-not-recognized', message: `Formel ohne Text${b.page ? ` auf Seite ${b.page}` : ''}; Hinweis auf das Original eingesetzt.`, ...(b.page ? { page: b.page } : {}) });
          }
        }
        count('formula');
        break;
      case 'checkbox':
        out.push(`${indent()}<p>${b.checked ? '☒' : '☐'} ${escapeXml(b.text)}</p>\n`), count('checkbox');
        break;
      case 'footnote': {
        footnotes++;
        out.push(`${indent()}<aside id="${ids.take(`fn-${footnotes}`)}" role="doc-footnote" epub:type="footnote"><p>${inline(b)}</p></aside>\n`);
        count('footnote');
        break;
      }
      case 'code':
        out.push(`${indent()}<pre id="${ids.take(`code-${(counts['code'] ?? 0) + 1}`)}"><code>${escapeXml(b.text)}</code></pre>\n`), count('code');
        break;
      case 'list':
        out.push(listHtml(b, indent())), count('list');
        break;
      case 'table': {
        tables++;
        const tid = ids.take(`tabelle-${tables}`);
        const grid: Array<Array<DienstTableCell | null>> = Array.from({ length: b.rows }, () => Array.from({ length: b.cols }, () => null));
        for (const c of b.cells) for (let r = c.row; r < Math.min(b.rows, c.row + c.rowSpan); r++) for (let k = c.col; k < Math.min(b.cols, c.col + c.colSpan); k++) grid[r]![k] = c;
        // Header rows: leading rows whose every cell is a column header.
        let headRows = 0;
        while (headRows < b.rows && grid[headRows]!.every((c) => c !== null && c.columnHeader)) headRows++;
        if (headRows === b.rows) headRows = 0;
        const row = (r: number, inHead: boolean) => {
          let h = `${indent()}    <tr>`;
          // Walk the grid, not the cell list: a position without a detected cell becomes an empty td,
          // so later cells keep their column (Docling leaves gaps, e.g. a sum row with one value).
          for (let k = 0; k < b.cols; k++) {
            const c = grid[r]![k];
            if (!c) {
              h += '<td></td>';
              continue;
            }
            if (c.row !== r || c.col !== k) continue; // covered by the span of another cell
            const th = inHead || c.columnHeader || c.rowHeader;
            const scope = inHead || c.columnHeader ? (c.colSpan > 1 ? 'colgroup' : 'col') : 'row';
            const span = `${c.colSpan > 1 ? ` colspan="${c.colSpan}"` : ''}${c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : ''}`;
            h += th ? `<th scope="${scope}"${span}>${escapeXml(c.text)}</th>` : `<td${span}>${escapeXml(c.text)}</td>`;
          }
          return h + '</tr>\n';
        };
        let h = `${indent()}<table id="${tid}" data-hp-table="scroll">\n`;
        if (b.caption) h += `${indent()}  <caption>${escapeXml(b.caption)}</caption>\n`;
        if (headRows > 0) h += `${indent()}  <thead>\n${Array.from({ length: headRows }, (_, r) => row(r, true)).join('')}${indent()}  </thead>\n`;
        h += `${indent()}  <tbody>\n${Array.from({ length: b.rows - headRows }, (_, r) => row(r + headRows, false)).join('')}${indent()}  </tbody>\n${indent()}</table>\n`;
        if (headRows === 0 && !b.cells.some((c) => c.rowHeader)) {
          warnings.push({ code: 'table-without-header', message: `Tabelle ${tid}: keine Kopfzellen erkannt; ohne th übernommen, Kopfzeile bitte prüfen.`, ...(b.page ? { page: b.page } : {}) });
        }
        if (b.cells.length === 0) break;
        out.push(h);
        count('table');
        break;
      }
      case 'figure': {
        figures++;
        const fid = ids.take(`abbildung-${figures}`);
        if (!b.image) {
          warnings.push({ code: 'figure-without-image', message: `Abbildung ${fid}: kein Bild geliefert; nur die Bildunterschrift übernommen.`, ...(b.page ? { page: b.page } : {}) });
          if (b.caption) out.push(`${indent()}<p>${escapeXml(b.caption)}</p>\n`);
          break;
        }
        const ext = b.mediaType === 'image/jpeg' ? 'jpg' : 'png';
        const path = `content/images/${fid}.${ext}`;
        media.push({ path, mediaType: b.mediaType ?? 'image/png', data: base64ToBytes(b.image) });
        const alt = b.caption ? b.caption : `Abbildung ${figures} aus dem PDF${b.page ? `, Seite ${b.page}` : ''}, ohne Beschreibung im Original`;
        const size = b.width && b.height ? ` width="${Math.round(b.width / 2)}" height="${Math.round(b.height / 2)}"` : '';
        out.push(`${indent()}<figure id="${fid}">\n${indent()}  <img src="images/${fid}.${ext}" alt="${escapeXml(alt)}"${size}/>\n${b.caption ? `${indent()}  <figcaption>${escapeXml(b.caption)}</figcaption>\n` : ''}${indent()}</figure>\n`);
        count('figure');
        break;
      }
    }
  }
  closeTo(1);
  if (!h1Seen) {
    const hid = ids.take(slugify(title, 'titel'));
    out.unshift(`    <h1 id="${hid}">${escapeXml(title)}</h1>\n`);
    toc.unshift({ level: 1, entry: { title, href: `content/index.xhtml#${hid}`, children: [] } });
  }

  // Nested table of contents from the heading levels.
  const roots: TocEntry[] = [];
  const stack: Array<{ level: number; children: TocEntry[] }> = [{ level: 0, children: roots }];
  for (const t of toc) {
    while (stack.length > 1 && stack[stack.length - 1]!.level >= t.level) stack.pop();
    stack[stack.length - 1]!.children.push(t.entry);
    stack.push({ level: t.level, children: t.entry.children });
  }
  const strip = (e: { title: string; href: string; children: TocEntry[] }): TocEntry => (e.children.length > 0 ? { title: e.title, href: e.href, children: e.children.map((c) => strip(c as never)) } : { title: e.title, href: e.href });

  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles/import.css"/>
</head>
<body>
  <main id="inhalt">
${out.join('')}  </main>
</body>
</html>
`;
  const keep = options.keepOriginal ?? true;
  const resources: ResourceInput[] = [
    { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: xhtml },
    { path: 'content/styles/import.css', mediaType: 'text/css', data: IMPORT_CSS },
    ...media,
    ...(keep ? [{ path: `original/${fileName}`, mediaType: 'application/pdf', data: options.pdf }] : []),
  ];
  const ocr = result.warnings.some((w) => w.code === 'ocr-used');
  const document: DocumentInput = {
    id,
    title,
    language,
    modified,
    profile: 'static',
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: roots.map((e) => strip(e as never)) },
    resources,
    description: `Aus PDF übernommen (${result.engine.name} ${result.engine.version}${ocr ? ', mit Texterkennung' : ''}); Struktur aus dem Seitenbild erschlossen.${keep ? ` Original: original/${fileName}.` : ''}`,
    accessibility: {
      accessMode: media.length > 0 ? ['textual', 'visual'] : ['textual'],
      accessModeSufficient: ['textual'],
      accessibilityFeature: ['structuralNavigation', 'tableOfContents', ...(media.length > 0 ? ['alternativeText'] : [])],
      accessibilityHazard: ['none'],
      accessibilitySummary: `Aus einem PDF umgewandelt (${IMPORT_TOOL}): Überschriften, Listen und Tabellen vom Layoutmodell erkannt${media.length > 0 ? '; Abbildungen mit Alternativtext aus der Bildunterschrift oder einem Platzhalter' : ''}.`,
    },
    ...(keep ? { source: { url: `original/${fileName}`, type: 'application/pdf', tool: { name: IMPORT_TOOL, version: result.engine.version }, date: modified } } : {}),
  };
  return { document, warnings, counts };
}
