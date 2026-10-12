/**
 * Print document (P18, Zusage 6; part 0 section 13, HP-PRINT-001 … 011): a standalone HTML
 * document derived from the flowing view of every content document in reading order. Paper is an
 * output here, not the model — nothing in the container knows pages.
 *
 * What the derivation does:
 *
 * - title block on page 1 with title, `id`, `dateModified` and version (HP-PRINT-003);
 * - table of contents from the navigation document with address and page number of every entry
 *   (HP-PRINT-004, HP-PRINT-005; the numbers come from paginate.ts);
 * - each content document as `article`, the second and later ones on a new page;
 * - the visible section address `#kennung` after every heading of levels 1–3 (HP-PRINT-004);
 * - internal links with "S. n, #kennung", external links with their URL (HP-PRINT-011);
 * - video, sound, animations and components as still image or static equivalent with caption and
 *   the sentence "Lebendige Fassung: <pfad>#<kennung>" (HP-PRINT-009); animations are frozen in
 *   the state the document defines for reduced motion;
 * - `details` open, blocks of every priority shown (HP-PRINT-010); locks: `no-print` and `hidden`
 *   sections removed, the notice of the core in their place (HP-LOCK-003, HPL-PRINT-005);
 * - tables with their stored values (a frozen copy, no calculator), no scroll region;
 * - forms (P6) as text with the values entered, sections whose condition is false as a note;
 * - the document's stylesheets with media queries resolved for paper: `print` applies, `screen`
 *   does not, `prefers-reduced-motion: reduce` applies.
 *
 * Like the document frame (render.ts) the print document carries everything inline as `data:`
 * URLs under its own CSP without any network source, and contains no script at all.
 */
import printCss from './print.css?raw';
import { form } from '@hpro/kern';
import { annotateTables } from './calcview.js';
import type { LoadedDocument } from './document.js';
import { applyLocks, type LockState } from './locks.js';
import { isAbsoluteUrl, resolvePath } from './paths.js';
import { inlineCss, ResourceResolver, rewriteResources, sanitize } from './render.js';
import type { TocItem } from './toc.js';

/** Page geometry of print.css (`@page`), in millimetres; paginate.ts measures with it. */
export const PRINT_PAGE = { width: 210, height: 297, top: 22, bottom: 20, side: 20 } as const;
export const TYPE_AREA = { width: PRINT_PAGE.width - 2 * PRINT_PAGE.side, height: PRINT_PAGE.height - PRINT_PAGE.top - PRINT_PAGE.bottom } as const;
/**
 * The type area as Chromium lays out a printed page: rounded to whole CSS pixels (170 mm =
 * 642.52 px → 643, 255 mm = 963.78 px → 964; measured in P18 with 1/32 px probes and named
 * destinations). The measuring frame and the measuring columns use exactly these sizes.
 */
export const TYPE_AREA_PX = { width: Math.round((TYPE_AREA.width * 96) / 25.4), height: Math.round((TYPE_AREA.height * 96) / 25.4) } as const;

/** Policy of the print document: images, media and fonts inline only, no script, no network. */
export const PRINT_CSP = "default-src 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export type LiveKind = 'video' | 'audio' | 'animation' | 'component';

export interface LiveItem {
  readonly kind: LiveKind;
  /** Address of the live element, `pfad#kennung`. */
  readonly address: string;
  /** A still image is printed (poster, fallback image or static equivalent with an image). */
  readonly still: boolean;
}

export interface PrintOptions {
  readonly locks: LockState;
  /** Time of the print, shown in the title block. */
  readonly now?: Date;
  /** Entries in the live version that are not saved: stored values are printed, the title block says so. */
  readonly unsavedEntries?: number;
  /**
   * Forms (P6): data object per data path (status and submission time for the line under the form
   * heading) and its schema. Fields are printed with the values of the shell's copy, i.e. as entered.
   */
  readonly forms?: { readonly data: (path: string) => form.FormData | undefined; readonly schema: (path: string) => unknown };
}

export interface PrintBuild {
  readonly html: string;
  readonly live: readonly LiveItem[];
  /** Headings h1–h3 and their printed address. */
  readonly headings: ReadonlyArray<{ readonly level: number; readonly text: string; readonly kennung: string | null }>;
  /** Sections left out by a lock (`no-print`, `hidden`). */
  readonly omitted: readonly string[];
  readonly tocEntries: number;
}

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const SMIL = ['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set'];

/** Escapes text for a CSS string. */
export function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]+/g, ' ')}"`;
}

/**
 * Resolves one media query list for paper: `print` matches, `screen` does not, reduced motion
 * and light colour scheme match. Width queries stay (the measuring frame has the print width).
 */
export function printMediaQuery(list: string): string {
  return list
    .split(',')
    .map((raw) => {
      let q = raw.trim();
      q = q.replace(/\(\s*prefers-reduced-motion\s*(:\s*reduce\s*)?\)/gi, '(min-width: 0px)');
      q = q.replace(/\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/gi, '(max-width: -1px)');
      q = q.replace(/\(\s*prefers-color-scheme\s*:\s*light\s*\)/gi, '(min-width: 0px)');
      q = q.replace(/\(\s*prefers-color-scheme\s*:\s*dark\s*\)/gi, '(max-width: -1px)');
      if (/^(only\s+)?screen\b/i.test(q)) return 'not all';
      if (/^not\s+screen\b/i.test(q)) return 'all';
      if (/^(only\s+)?print\b/i.test(q)) return q.replace(/^(only\s+)?print\b/i, 'all');
      if (/^not\s+print\b/i.test(q)) return q.replace(/^not\s+print\b/i, 'not all');
      return q;
    })
    .join(', ');
}

/** Applies `printMediaQuery` to every `@media` rule of a stylesheet. */
export function printMediaCss(css: string): string {
  return css.replace(/@media\s+([^{;]+)\{/g, (_m, list: string) => `@media ${printMediaQuery(list)} {`);
}

/** Selectors of style rules that start a CSS animation (any media, any nesting). */
export function animatedSelectors(css: string): string[] {
  const out: string[] = [];
  let sheet: CSSStyleSheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
  } catch {
    // No CSSOM (jsdom): a plain scan of `selector { … animation … }` without nesting.
    for (const m of css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
      const body = m[2] ?? '';
      const name = /animation(?:-name)?\s*:\s*([^;]+)/i.exec(body)?.[1]?.trim() ?? '';
      if (name && !/^none\b/i.test(name)) out.push((m[1] ?? '').trim());
    }
    return out;
  }
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        // Browsers expand the shorthand into animation-name; jsdom does not, so the shorthand is the fallback.
        const name = rule.style.getPropertyValue('animation-name').trim();
        const shorthand = name ? '' : rule.style.getPropertyValue('animation').trim();
        const moving = name ? !name.split(',').every((n) => n.trim() === 'none') : shorthand !== '' && !/^none\b/i.test(shorthand);
        if (moving) out.push(rule.selectorText);
        const nested = (rule as unknown as { cssRules?: CSSRuleList }).cssRules;
        if (nested?.length) walk(nested);
      } else if ('cssRules' in rule && !(rule instanceof CSSKeyframesRule)) {
        walk((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  walk(sheet.cssRules);
  return out;
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

/** Address of an element: its own `id`, else that of the nearest ancestor with one. */
function idOf(el: Element): string | null {
  for (let e: Element | null = el; e; e = e.parentElement) if (e.id) return e.id;
  return null;
}

/**
 * Printed section address of a heading: the `id` of the section it heads (first heading of a
 * `section` or `article` with id — the address the table of contents and links use), else its own.
 */
export function headingKennung(h: Element): string | null {
  const parent = h.parentElement;
  if (parent && (parent.localName === 'section' || parent.localName === 'article') && parent.id) {
    const first = Array.from(parent.children).find((c) => /^h[1-6]$/.test(c.localName));
    if (first === h) return parent.id;
  }
  return h.id || null;
}

class LiveMarker {
  readonly items: LiveItem[] = [];
  private readonly done = new Set<Element>();
  constructor(private readonly path: string) {}

  address(el: Element): string {
    const id = idOf(el);
    return id ? `${this.path}#${id}` : this.path;
  }

  /** Adds the caption note to `figure` (creating a figcaption if needed). */
  private note(doc: Document, host: Element, sentence: string): void {
    const p = doc.createElement('span');
    p.className = 'hp-print-live';
    p.setAttribute('data-hp-print-live', '');
    p.textContent = sentence;
    if (host.localName === 'figure') {
      let caption = Array.from(host.children).find((c) => c.localName === 'figcaption');
      if (!caption) {
        caption = doc.createElement('figcaption');
        host.append(caption);
      }
      caption.append(p);
    } else {
      host.append(p);
    }
  }

  /** Wraps `el` in a figure with caption, unless it already sits in one. */
  private figureFor(doc: Document, el: Element, description: string): Element {
    const existing = el.parentElement?.closest('figure');
    if (existing) return existing;
    const figure = doc.createElement('figure');
    figure.className = 'hp-print-still';
    el.replaceWith(figure);
    figure.append(el);
    const caption = doc.createElement('figcaption');
    if (description) caption.textContent = description;
    figure.append(caption);
    return figure;
  }

  private describedBy(el: Element): string {
    const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    const parts = ids.map((id) => text(el.ownerDocument.getElementById(id))).filter(Boolean);
    return parts.join(' ') || el.getAttribute('aria-label') || el.getAttribute('title') || '';
  }

  media(doc: Document, el: HTMLMediaElement): void {
    const kind: LiveKind = el.localName === 'video' ? 'video' : 'audio';
    const address = this.address(el);
    const description = this.describedBy(el);
    const fallback = Array.from(el.childNodes).filter((n) => !(n instanceof Element && (n.localName === 'source' || n.localName === 'track')));
    let replacement: Element;
    let still = false;
    if (kind === 'video') {
      const fallbackImg = fallback.find((n): n is Element => n instanceof Element && (n.localName === 'img' || n.querySelector('img') !== null));
      const poster = el.getAttribute('poster');
      if (fallbackImg) {
        const img = (fallbackImg.localName === 'img' ? fallbackImg : fallbackImg.querySelector('img'))!;
        if (poster && !img.getAttribute('src')) img.setAttribute('src', poster);
        replacement = img;
        still = true;
      } else if (poster) {
        const img = doc.createElement('img');
        img.setAttribute('src', poster);
        img.setAttribute('alt', description || 'Standbild des Videos');
        for (const a of ['width', 'height']) if (el.getAttribute(a)) img.setAttribute(a, el.getAttribute(a)!);
        replacement = img;
        still = true;
      } else {
        replacement = doc.createElement('p');
        replacement.className = 'hp-print-audio';
        replacement.textContent = 'Video ohne Standbild (kein poster und kein Ersatzbild im Dokument).';
      }
      replacement.classList.add('hp-print-still-img');
    } else {
      replacement = doc.createElement('div');
      replacement.className = 'hp-print-audio';
      const lead = doc.createElement('p');
      lead.textContent = 'Tonaufnahme – im Ausdruck nicht abspielbar.';
      replacement.append(lead, ...fallback.filter((n) => n instanceof Element || (n.textContent ?? '').trim() !== ''));
    }
    if (el.id && !replacement.id) replacement.id = el.id;
    el.replaceWith(replacement);
    const figure = this.figureFor(doc, replacement, description);
    const label = kind === 'video' ? 'Video, im Ausdruck als Standbild.' : 'Tonaufnahme.';
    this.note(doc, figure, `${label} Lebendige Fassung: ${address}`);
    figure.setAttribute('data-hp-print-live', kind);
    this.done.add(figure);
    this.items.push({ kind, address, still });
  }

  component(doc: Document, el: Element, name: string): void {
    const address = this.address(el);
    const div = doc.createElement('div');
    div.className = 'hp-print-component';
    div.setAttribute('data-hp-print-live', 'component');
    div.setAttribute('data-hp-component-name', name);
    if (el.id) div.id = el.id;
    div.append(...Array.from(el.childNodes));
    el.replaceWith(div);
    const p = doc.createElement('p');
    p.className = 'hp-print-live';
    p.textContent = `Interaktive Komponente ${name}, im Ausdruck in der statischen Fassung. Lebendige Fassung: ${address}`;
    div.append(p);
    this.done.add(div);
    this.items.push({ kind: 'component', address, still: div.querySelector('img, svg, picture, canvas') !== null });
  }

  animation(doc: Document, el: Element): void {
    const host = el.closest('figure') ?? el.closest('[id]') ?? el;
    if (this.done.has(host)) return;
    for (const d of this.done) if (d.contains(host)) return;
    this.done.add(host);
    const address = this.address(host.localName === 'figure' && !host.id ? el : host);
    const sentence = `Animation, im Ausdruck als Standbild (Zustand bei reduzierter Bewegung). Lebendige Fassung: ${address}`;
    if (host.localName === 'figure') {
      this.note(doc, host, sentence);
    } else {
      const p = doc.createElement('p');
      p.className = 'hp-print-live';
      p.textContent = sentence;
      host.after(p);
    }
    host.setAttribute('data-hp-print-live', 'animation');
    this.items.push({ kind: 'animation', address, still: true });
  }
}

interface Part {
  readonly path: string;
  readonly article: HTMLElement;
  readonly css: string[];
}

function documentStyles(source: Document, path: string, resolver: ResourceResolver): Array<{ css: string; media: string | null }> {
  const out: Array<{ css: string; media: string | null }> = [];
  for (const el of Array.from(source.querySelectorAll('head > link, head > style'))) {
    let css: string | undefined;
    if (el.localName === 'style') {
      css = inlineCss(path, el.textContent ?? '', resolver);
    } else if (/(^|\s)stylesheet(\s|$)/i.test(el.getAttribute('rel') ?? '') && !/(^|\s)alternate(\s|$)/i.test(el.getAttribute('rel') ?? '')) {
      const href = el.getAttribute('href');
      const target = href && !isAbsoluteUrl(href) ? resolver.text(path, href) : undefined;
      if (target) css = inlineCss(target.path, target.text, resolver);
    }
    if (css !== undefined) out.push({ css, media: el.getAttribute('media') });
  }
  return out;
}

/** Builds the print document of `doc` (all content documents in reading order). */
export function buildPrintHtml(doc: LoadedDocument, options: PrintOptions): PrintBuild {
  const out = document.implementation.createHTMLDocument(doc.title);
  const resolver = new ResourceResolver(doc);
  const html = out.documentElement;
  html.setAttribute('lang', doc.language);
  html.setAttribute('data-hp-print', 'hpro');

  const head = out.head;
  head.replaceChildren();
  const meta = (attrs: Record<string, string>) => {
    const m = out.createElement('meta');
    for (const [k, v] of Object.entries(attrs)) m.setAttribute(k, v);
    head.append(m);
  };
  meta({ charset: 'utf-8' });
  meta({ 'http-equiv': 'Content-Security-Policy', content: PRINT_CSP });
  const title = out.createElement('title');
  title.textContent = doc.title;
  head.append(title);
  meta({ name: 'dcterms.identifier', content: doc.id });
  meta({ name: 'dcterms.modified', content: doc.modified });
  if (doc.authors.length) meta({ name: 'author', content: doc.authors.join(', ') });

  // Document styles (deduplicated: content documents usually share one stylesheet), resolved for paper.
  const seen = new Set<string>();
  const animated: string[] = [];
  const parts: Part[] = [];
  const omitted: string[] = [];
  const headings: Array<{ level: number; text: string; kennung: string | null }> = [];
  for (const [i, content] of doc.content.entries()) {
    const css: string[] = [];
    for (const s of documentStyles(content.dom, content.path, resolver)) {
      const key = `${s.media ?? ''}\n${s.css}`;
      css.push(s.css);
      if (seen.has(key)) continue;
      seen.add(key);
      const style = out.createElement('style');
      style.setAttribute('data-hp-source', content.path);
      if (s.media) style.setAttribute('media', printMediaQuery(s.media));
      style.textContent = printMediaCss(s.css);
      head.append(style);
    }
    const srcBody = content.dom.body ?? content.dom.documentElement;
    const article = out.createElement('article');
    article.setAttribute('data-hp-doc', content.path);
    article.id = `hp-dok-${i + 1}`;
    if (i > 0) article.setAttribute('data-hp-neue-seite', '');
    article.append(...Array.from(srcBody.childNodes).map((n) => out.importNode(n, true)));
    for (const el of Array.from(article.querySelectorAll('style'))) el.textContent = printMediaCss(inlineCss(content.path, el.textContent ?? '', resolver));
    parts.push({ path: content.path, article, css });
  }
  // Reader print profile last, so that it wins over document rules of the same weight.
  const readerStyle = out.createElement('style');
  readerStyle.setAttribute('data-hp-reader', 'print');
  readerStyle.textContent = `${printCss}\n@page {\n  @top-left { content: ${cssString(doc.title)}; }\n  @top-right { content: ${cssString(`Stand ${formatDate(doc.modified)}`)}; }\n}\n`;
  head.append(readerStyle);

  const body = out.body;
  body.replaceChildren();
  body.append(titleBlock(out, doc, options));
  const toc = out.createElement('nav');
  toc.className = 'hp-print-toc';
  toc.setAttribute('data-hp-print', 'verzeichnis');
  toc.setAttribute('aria-labelledby', 'hp-print-toc-titel');
  body.append(toc);
  for (const p of parts) body.append(p.article);

  const live: LiveItem[] = [];
  for (const part of parts) {
    const { article, path } = part;
    sanitize(article);
    rewriteResources(article, path, resolver);
    // Locks: the core's notice replaces every section that must not be printed.
    applyLocks(article, path, { ...options.locks, showHidden: false });
    for (const el of Array.from(article.querySelectorAll('[data-hp-noprint], [data-hp-lock~="hidden"]'))) {
      omitted.push(`${path}#${el.id}`);
      el.remove();
    }
    for (const el of Array.from(article.querySelectorAll('.hp-lock-hidden'))) el.remove();
    if (lockedWhole(options.locks, path)) {
      omitted.push(path);
      const notes = Array.from(article.querySelectorAll('[data-hp-print-only]'));
      article.replaceChildren(...notes);
      const p = out.createElement('p');
      p.className = 'hp-lock-note';
      p.textContent = `Inhaltsdokument ${path} nicht zum Druck freigegeben.`;
      article.append(p);
    }
    for (const d of Array.from(article.querySelectorAll('details'))) d.setAttribute('open', '');
    for (const el of Array.from(article.querySelectorAll('[hidden][data-hp-priority]'))) el.removeAttribute('hidden');

    const marker = new LiveMarker(path);
    for (const el of Array.from(article.querySelectorAll('video, audio'))) marker.media(out, el as HTMLMediaElement);
    for (const el of Array.from(article.getElementsByTagName('*'))) {
      if (!el.isConnected || !el.localName.includes('-') || (el.namespaceURI !== null && el.namespaceURI !== XHTML_NS)) continue;
      marker.component(out, el, el.localName);
    }
    const selectors = part.css.flatMap((c) => animatedSelectors(c));
    for (const style of Array.from(article.querySelectorAll('style'))) selectors.push(...animatedSelectors(style.textContent ?? ''));
    animated.push(...selectors);
    const moving = new Set<Element>();
    for (const sel of selectors) {
      const clean = sel.replace(/::?(before|after|marker|first-line|first-letter|placeholder|selection)\b/g, '').trim();
      if (!clean) continue;
      try {
        for (const el of Array.from(article.querySelectorAll(clean))) moving.add(el);
      } catch {
        /* selector the DOM cannot evaluate: ignored */
      }
    }
    for (const el of Array.from(article.querySelectorAll('[style]'))) {
      const m = /animation(?:-name)?\s*:\s*([^;]+)/i.exec(el.getAttribute('style') ?? '');
      if (m && !/^none\b/i.test(m[1]!.trim())) moving.add(el);
    }
    for (const name of SMIL) {
      for (const el of Array.from(article.getElementsByTagName(name))) {
        if (el.parentElement) moving.add(el.parentElement);
        el.remove();
      }
    }
    for (const el of moving) if (el.isConnected) marker.animation(out, el);
    live.push(...marker.items);

    for (const h of Array.from(article.querySelectorAll('h1, h2, h3'))) {
      const kennung = headingKennung(h);
      headings.push({ level: Number(h.localName.slice(1)), text: text(h), kennung });
      // Generated content, not text: bookmarks and tags keep the plain heading, the page shows the address.
      if (kennung) h.setAttribute('data-hp-kennung', kennung);
    }
  }

  // Forms (P6): fields as text, sections that do not apply as a note, status and checks under the
  // form heading — the same static form as a frozen rendition (kern form.freezeForms).
  const frozenForms = form.freezeForms(out as unknown as Parameters<typeof form.freezeForms>[0], {
    purpose: 'print',
    language: doc.language,
    ...(options.forms ? { data: options.forms.data, schema: options.forms.schema } : {}),
  });
  for (const f of frozenForms) for (const id of f.omitted) omitted.push(`#${id} (Bedingung nicht erfüllt)`);

  // Ids: kept as in the source; a clash between content documents gets a prefix in print only.
  const printIds = new Map<string, string>();
  const used = new Set<string>(['hp-print-toc-titel']);
  for (const [i, part] of parts.entries()) {
    used.add(part.article.id);
    printIds.set(part.path, part.article.id);
    for (const el of Array.from(part.article.querySelectorAll('[id]'))) {
      const id = el.id;
      let printId = id;
      if (used.has(printId)) printId = `d${i + 1}-${id}`;
      used.add(printId);
      if (printId !== id) el.id = printId;
      if (!printIds.has(`${part.path}#${id}`)) printIds.set(`${part.path}#${id}`, printId);
    }
  }
  for (const part of parts) linkTargets(out, part, doc, printIds);

  const tocEntries = fillToc(out, toc, doc.toc, printIds);
  annotateTables(out, 'frozen');
  const end = out.createElement('div');
  end.setAttribute('data-hp-ende', '');
  body.append(end);
  return { html: `<!DOCTYPE html>\n${html.outerHTML}`, live, headings, omitted, tocEntries };
}

function lockedWhole(locks: LockState, path: string): boolean {
  return locks.access.some((a) => a.target === path && a.rules.some((r) => r === 'no-print' || r === 'hidden'));
}

function titleBlock(out: Document, doc: LoadedDocument, options: PrintOptions): HTMLElement {
  const header = out.createElement('header');
  header.className = 'hp-print-titel';
  header.setAttribute('data-hp-print', 'titel');
  const t = out.createElement('p');
  t.className = 'hp-print-dokumenttitel';
  t.textContent = doc.title;
  const dl = out.createElement('dl');
  const row = (label: string, value: string) => {
    const dt = out.createElement('dt');
    dt.textContent = label;
    const dd = out.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  };
  row('Kennung', doc.id);
  row('Stand', `${formatDate(doc.modified)} (dateModified ${doc.modified})`);
  row('Fassung', doc.version.id === null ? `Hauptfassung, Profil ${doc.profile}` : `${doc.version.label} (Profil ${doc.version.profile})`);
  row('Datei', doc.fileName);
  if (doc.authors.length) row('Verfasst von', doc.authors.join(', '));
  const now = options.now ?? new Date();
  row('Ausdruck', `${formatDate(now.toISOString())}, ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`);
  const p = out.createElement('p');
  p.textContent =
    'Abgeleiteter Ausdruck der fließenden Fassung. Bewegte und interaktive Inhalte erscheinen als Standbild oder statische Fassung mit der Adresse der lebendigen Fassung; Adressen (#kennung) bleiben gültig, Seitenzahlen gelten nur für diesen Ausdruck.';
  header.append(t, dl, p);
  if (options.unsavedEntries) {
    const w = out.createElement('p');
    w.textContent = `Hinweis: ${options.unsavedEntries} nicht gespeicherte Eingabe(n) in Tabellen sind nicht enthalten; gedruckt werden die im Dokument gespeicherten Werte.`;
    header.append(w);
  }
  return header;
}

/** Internal links: target id in print, then " (S. n, #kennung)"; links out of the print stay text. */
function linkTargets(out: Document, part: Part, doc: LoadedDocument, printIds: ReadonlyMap<string, string>): void {
  for (const a of Array.from(part.article.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (/^(https?|mailto):/i.test(href)) {
      if (text(a) === href.replace(/^mailto:/i, '')) a.classList.add('hp-url-sichtbar');
      continue;
    }
    if (isAbsoluteUrl(href)) {
      a.removeAttribute('href');
      continue;
    }
    const resolved = resolvePath(part.path, href);
    const isContent = resolved && doc.content.some((c) => c.path === resolved.path);
    const key = resolved ? (resolved.fragment ? `${resolved.path}#${resolved.fragment}` : resolved.path) : '';
    const target = isContent ? printIds.get(key) : undefined;
    if (!resolved || !target) {
      a.removeAttribute('href');
      continue;
    }
    a.setAttribute('href', `#${target}`);
    const ref = out.createElement('span');
    ref.className = 'hp-verweis';
    ref.setAttribute('data-hp-print', 'verweis');
    const num = out.createElement('span');
    num.className = 'hp-seitenzahl';
    num.setAttribute('data-hp-seite-von', target);
    num.textContent = '000';
    const kennung = resolved.fragment ? `#${resolved.fragment}` : resolved.path;
    ref.append(' (S.\u00a0', num, `, ${resolved.path === part.path ? kennung : `${resolved.path}${resolved.fragment ? `#${resolved.fragment}` : ''}`})`);
    a.after(ref);
  }
}

function fillToc(out: Document, nav: HTMLElement, items: readonly TocItem[], printIds: ReadonlyMap<string, string>): number {
  // h1: the first heading of the print document must be of level 1 (PDF/UA-1 7.4.2, measured with veraPDF).
  const h = out.createElement('h1');
  h.id = 'hp-print-toc-titel';
  h.textContent = 'Inhalt';
  nav.append(h);
  let count = 0;
  const list = (entries: readonly TocItem[]): HTMLOListElement => {
    const ol = out.createElement('ol');
    for (const item of entries) {
      const key = item.target.id ? `${item.target.path}#${item.target.id}` : item.target.path;
      const target = printIds.get(key);
      const li = out.createElement('li');
      const a = out.createElement(target ? 'a' : 'span');
      if (target) a.setAttribute('href', `#${target}`);
      const label = out.createElement('span');
      label.className = 'hp-toc-text';
      label.textContent = item.label;
      const kennung = out.createElement('span');
      kennung.className = 'hp-kennung';
      kennung.textContent = item.target.id ? `#${item.target.id}` : item.target.path;
      const fill = out.createElement('span');
      fill.className = 'hp-toc-fuell';
      fill.setAttribute('aria-hidden', 'true');
      const page = out.createElement('span');
      page.className = 'hp-toc-seite';
      if (target) {
        page.append('S.\u00a0');
        const num = out.createElement('span');
        num.className = 'hp-seitenzahl';
        num.setAttribute('data-hp-seite-von', target);
        num.textContent = '000';
        page.append(num);
      } else {
        page.textContent = 'nicht im Ausdruck (Sperre)';
      }
      a.append(label, kennung, fill, page);
      li.append(a);
      if (item.children.length) li.append(list(item.children));
      ol.append(li);
      count++;
    }
    return ol;
  };
  nav.append(list(items));
  return count;
}
