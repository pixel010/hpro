/**
 * The check run (P8): seven categories, each with rules that map to WCAG 2.2 success criteria
 * and to the content requirements of the specification (HP-INH-002, -005, -006, -007, -008).
 * It works on the files of the main version (a container or the unsaved state of an editing
 * session), never on frozen renditions — those are not changed (part 1, 7.2). Every rule
 * either attaches a correction made of editing operations or says why there is none.
 *
 * What a static check cannot decide is listed in `notChecked` instead of being guessed.
 */
import type { Document, Element } from '@xmldom/xmldom';
import { fromUtf8 } from '../bytes.js';
import { readContainer } from '../container.js';
import { pointerOf } from '../edit/dom.js';
import type { EditOp } from '../edit/session.js';
import { childElements, descendants, parseXml, resolveHref, XHTML_NS } from '../lock/xml.js';
import { restingSpecificity, matches } from '../check/selector.js';
import { parseStyleAttribute } from '../check/css.js';
import { contrastRatio, nearestWithContrast, toHex, type Rgba } from './color.js';
import { foreignLanguage, langProblem, LANGUAGE_NAMES, suggestLang } from './lang.js';
import { CATEGORIES, CHECKER, READER_SCHEMES, VALUE, type A11yReport, type Category, type Finding, type FixSuggestion, type NotChecked, type Scheme } from './model.js';
import { Cascade, resolveColours, screenMedia, sheetsOf, type DeclSource, type SheetRule } from './style.js';

export interface AuditOptions {
  /** Colour schemes for the contrast rule; default: the three schemes of the hpro reader. */
  readonly schemes?: readonly Scheme[];
}

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_TYPE = 'application/xhtml+xml';
const HEADING = /^h[1-6]$/;
const FLOW_PARENTS = new Set(['body', 'main', 'section', 'article', 'div']);
const TEXT_BLOCKS = new Set(['p', 'li', 'blockquote', 'dd', 'dt', 'td', 'th', 'figcaption', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const NATIVE_FOCUSABLE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'iframe']);
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'slider', 'spinbutton', 'textbox', 'combobox', 'searchbox', 'treeitem', 'gridcell', 'region', 'group', 'dialog', 'application', 'scrollbar']);
const GENERIC_ALT = new Set(['bild', 'foto', 'grafik', 'abbildung', 'image', 'picture', 'photo', 'img', 'graphic', 'icon', 'symbol', 'logo', 'bild 1', 'abb.', 'platzhalter', 'placeholder']);
const READING_ORDER_PROPS = ['order', 'flex-direction', 'flex-flow', 'grid-row', 'grid-column', 'grid-row-start', 'grid-row-end', 'grid-column-start', 'grid-column-end', 'grid-area', 'position'];
const OUTLINE_PROPS = ['outline', 'outline-style', 'outline-width'];
const LIST_MARK = /^\s*([•●▪◦‣·*\-–—]|\d{1,3}[.)])\s+/;

const RULES: Record<Category, readonly string[]> = {
  struktur: ['h1-fehlt', 'h1-mehrfach', 'ueberschrift-sprung', 'ueberschrift-leer', 'pseudo-ueberschrift', 'pseudo-liste'],
  lesereihenfolge: ['css-reihenfolge', 'css-position'],
  alternativtexte: ['alt-fehlt', 'alt-dateiname', 'alt-nichtssagend', 'grafik-ohne-namen'],
  kontrast: ['kontrast-text'],
  sprache: ['sprache-fehlt', 'sprache-ungueltig', 'sprache-widerspruch', 'sprache-teil-ungueltig', 'sprachwechsel'],
  tabellenkoepfe: ['kopfzellen-fehlen', 'kopfzellen-ohne-bezug', 'tabelle-ohne-beschriftung'],
  fokus: ['tabindex-positiv', 'fokus-ohne-zweck', 'fokus-versteckt', 'fokus-unsichtbar', 'link-ohne-namen'],
};

interface DocInfo {
  readonly path: string;
  readonly doc: Document;
  readonly isNav: boolean;
  readonly cascade: Cascade;
  readonly rules: readonly SheetRule[];
}

class Ctx {
  readonly findings: Finding[] = [];
  private readonly ids = new Set<string>();
  readonly notChecked: NotChecked[] = [];
  readonly unevaluable = new Map<string, number>();
  sealed = 0;

  add(f: Omit<Finding, 'id'> & { id?: string }): void {
    let id = f.id ?? `${f.rule}@${f.target ?? f.path}`;
    if (this.ids.has(id)) {
      let k = 2;
      while (this.ids.has(`${id}~${k}`)) k++;
      id = `${id}~${k}`;
    }
    this.ids.add(id);
    this.findings.push({ ...f, id });
  }
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function short(s: string, n = 70): string {
  const t = norm(s);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function textContent(el: Element): string {
  return norm(el.textContent ?? '');
}

function lineOf(el: Element): number | undefined {
  return (el as unknown as { lineNumber?: number }).lineNumber;
}

function ancestors(el: Element): Element[] {
  const out: Element[] = [];
  for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) out.push(p as Element);
  return out;
}

function inSealed(el: Element): boolean {
  return el.hasAttribute('data-hp-sealed') || ancestors(el).some((a) => a.hasAttribute('data-hp-sealed'));
}

function inNav(el: Element): boolean {
  return ancestors(el).some((a) => a.localName === 'nav');
}

function bodyOf(doc: Document): Element | undefined {
  return descendants(doc).find((e) => e.localName === 'body' && e.namespaceURI === XHTML_NS);
}

function xmlLang(el: Element): string | null {
  return el.getAttributeNS(XML_NS, 'lang') ?? (el.hasAttribute('xml:lang') ? el.getAttribute('xml:lang') : null);
}

function attrOrNull(el: Element, name: string): string | null {
  return el.hasAttribute(name) ? el.getAttribute(name) : null;
}

/** Elements of the body that the check looks at: not in sealed sections. */
function contentElements(info: DocInfo): Element[] {
  const body = bodyOf(info.doc);
  if (!body) return [];
  return descendants(body).filter((e) => !inSealed(e));
}

function sourceLabel(s: DeclSource): string {
  return s.kind === 'sheet' ? `${s.path}, Regel „${s.selector}“${s.media.length ? ` in @media ${s.media.join(' / ')}` : ''} (Zeile ${s.line})` : `style-Attribut von ${s.pointer}`;
}

function cssOp(s: DeclSource, property: string, value: string | null): EditOp {
  return s.kind === 'sheet'
    ? { op: 'set-css', path: s.path, selector: s.selector, media: [...s.media], occurrence: s.occurrence, property, value }
    : { op: 'set-style', target: s.pointer, property, value };
}

function sourceKey(s: DeclSource): string {
  return s.kind === 'sheet' ? `${s.path}|${s.selector}|${s.media.join('/')}|${s.occurrence}` : `${s.pointer}|style`;
}

// ---------------------------------------------------------------------------------------------
// Struktur (WCAG 1.3.1, 2.4.6; HP-INH-007)

/** New levels when the headings from `i` on, deeper than their predecessor, move up under it. */
function skipFix(levels: readonly number[], i: number): number[] {
  const base = levels[i - 1]!;
  const delta = levels[i]! - (base + 1);
  const out = [...levels];
  let prev = base;
  for (let k = i; k < levels.length && levels[k]! > base; k++) {
    const nl = Math.min(Math.max(base + 1, levels[k]! - delta), prev + 1);
    out[k] = nl;
    prev = nl;
  }
  return out;
}

/** New levels when every h1 after the first becomes h2, with its subordinate headings. */
function extraH1Fix(levels: readonly number[]): number[] {
  const out = [...levels];
  const first = levels.indexOf(1);
  let prev = 0;
  for (let k = 0; k < levels.length; k++) {
    if (k <= first) {
      prev = out[k]!;
      continue;
    }
    // inside a run that started with a demoted h1, everything shifts by one
    const nl = Math.min(levels[k]! === 1 ? 2 : Math.min(levels[k]! + 1, 6), prev + 1);
    out[k] = nl;
    prev = nl;
  }
  return out;
}

/** Levels of the existing headings when an h1 is put before them: no level skipped below it. */
function underH1(levels: readonly number[]): number[] {
  let arr = [1, ...levels];
  for (let i = 1; i < arr.length; i++) if (arr[i]! > arr[i - 1]! + 1) arr = skipFix(arr, i);
  return arr.slice(1);
}

function levelOps(hs: readonly Element[], path: string, from: readonly number[], to: readonly number[]): EditOp[] {
  const levels = hs.map((h, k) => ({ target: pointerOf(h, path), level: to[k]! })).filter((_, k) => to[k] !== from[k]);
  return levels.length > 0 ? [{ op: 'set-heading-levels', levels }] : [];
}

function structureRules(ctx: Ctx, info: DocInfo, title: string): void {
  const { path } = info;
  const els = contentElements(info);
  const hs = els.filter((e) => HEADING.test(e.localName ?? '') && e.namespaceURI === XHTML_NS && !inNav(e));
  const levels = hs.map((h) => Number(h.localName![1]));
  for (const h of hs) {
    if (textContent(h) !== '' || descendants(h).some((d) => d.localName === 'img' && (d.getAttribute('alt') ?? '') !== '')) continue;
    const target = pointerOf(h, path);
    ctx.add({
      rule: 'ueberschrift-leer', category: 'struktur', severity: 'fehler', wcag: ['1.3.1', '2.4.6'], spec: 'HP-INH-007', path, target, ...(lineOf(h) ? { line: lineOf(h)! } : {}),
      message: `Überschrift <${h.localName}> ohne Text: Bildschirmleser kündigen eine leere Überschrift an, das Inhaltsverzeichnis zeigt nichts.`,
      fix: { label: 'Überschriftentext setzen', description: 'Setzt den Text der Überschrift.', ops: [{ op: 'set-text', target, text: VALUE }], input: { label: 'Text der Überschrift', kind: 'text' } },
    });
  }
  const h1 = levels.filter((l) => l === 1).length;
  const body = bodyOf(info.doc);
  if (hs.length > 0 && h1 === 0 && body) {
    const top = childElements(body).find((c) => !inSealed(c));
    // into <main>/<article> when the body is just that wrapper, so the heading belongs to the content
    const host = top && ['main', 'article'].includes(top.localName ?? '') ? top : undefined;
    const first = host ?? top;
    if (first) {
      ctx.add({
        rule: 'h1-fehlt', category: 'struktur', severity: 'fehler', wcag: ['1.3.1', '2.4.6'], spec: 'HP-INH-007', path, target: pointerOf(hs[0]!, path),
        message: `Das Dokument hat keine Hauptüberschrift h1; die erste Überschrift ist h${levels[0]} („${short(textContent(hs[0]!), 50)}“).`,
        fix: {
          label: 'Hauptüberschrift einfügen', description: 'Fügt am Anfang eine Überschrift h1 ein; vorhandene Überschriften rücken nur so weit, dass unter der h1 keine Ebene fehlt.',
          // first the existing headings under the coming h1 (no jump h1→h3), then the h1 itself
          ops: [...levelOps(hs, path, levels, underH1(levels)), { op: 'insert', ref: pointerOf(first, path), position: host ? 'start' : 'before', block: { type: 'heading', level: 1, text: VALUE } }],
          input: { label: 'Text der Hauptüberschrift', kind: 'text', ...(title ? { proposal: title, source: 'aus dem Titel des Dokuments' } : {}) },
        },
      });
    }
  }
  if (h1 > 1) {
    const second = hs[levels.indexOf(1, levels.indexOf(1) + 1)]!;
    ctx.add({
      rule: 'h1-mehrfach', category: 'struktur', severity: 'fehler', wcag: ['1.3.1'], spec: 'HP-INH-007', path, target: pointerOf(second, path), ...(lineOf(second) ? { line: lineOf(second)! } : {}),
      message: `${h1} Hauptüberschriften h1 in einem Inhaltsdokument; die Gliederung hat damit keinen eindeutigen Anfang.`, excerpt: short(textContent(second)),
      fix: { label: 'Weitere h1 zu h2 machen', description: `Stuft jede h1 nach der ersten zu h2 herab, die Überschriften darunter um eine Ebene mit.`, ops: levelOps(hs, path, levels, extraH1Fix(levels)) },
    });
  }
  for (let i = 1; i < levels.length; i++) {
    if (levels[i]! <= levels[i - 1]! + 1) continue;
    const h = hs[i]!;
    const to = skipFix(levels, i);
    ctx.add({
      rule: 'ueberschrift-sprung', category: 'struktur', severity: 'fehler', wcag: ['1.3.1'], spec: 'HP-INH-007', path, target: pointerOf(h, path), ...(lineOf(h) ? { line: lineOf(h)! } : {}),
      message: `Überschriftensprung von h${levels[i - 1]} auf h${levels[i]}: eine Gliederungsebene fehlt.`, excerpt: short(textContent(h)),
      fix: { label: `Zu h${to[i]} machen`, description: `Setzt die Überschrift auf h${to[i]}; folgende Unterüberschriften rücken mit.`, ops: levelOps(hs, path, levels, to) },
    });
  }
  // a short paragraph that is all bold, followed by more content: a heading drawn by hand
  const levelBefore = new Map<Element, number>();
  let lastLevel = 1;
  for (const e of els) {
    if (HEADING.test(e.localName ?? '') && !inNav(e)) lastLevel = Number(e.localName![1]);
    else if (e.localName === 'p') levelBefore.set(e, lastLevel);
  }
  for (const p of els.filter((e) => e.localName === 'p' && e.namespaceURI === XHTML_NS)) {
    const parent = p.parentNode as Element | null;
    if (!parent || !FLOW_PARENTS.has(parent.localName ?? '')) continue;
    const kids = childElements(p);
    const loose = [...Array.from({ length: p.childNodes.length }, (_, k) => p.childNodes.item(k)!)].filter((n) => (n.nodeType === 3 || n.nodeType === 4) && (n.nodeValue ?? '').trim() !== '');
    if (kids.length !== 1 || loose.length > 0 || !['strong', 'b'].includes(kids[0]!.localName ?? '') || childElements(kids[0]!).length > 0) continue;
    const text = textContent(p);
    if (text.length < 3 || text.length > 80 || /[.,;:!?…]$/.test(text)) continue;
    let next = p.nextSibling;
    while (next && next.nodeType !== 1) next = next.nextSibling;
    if (!next) continue;
    const target = pointerOf(p, path);
    const level = Math.min(6, (levelBefore.get(p) ?? 1) + 1);
    ctx.add({
      rule: 'pseudo-ueberschrift', category: 'struktur', severity: 'warnung', wcag: ['1.3.1'], spec: 'HP-INH-007', path, target, ...(lineOf(p) ? { line: lineOf(p)! } : {}),
      message: 'Fett gesetzter Absatz, der wie eine Überschrift aussieht, aber keine ist: Hilfstechnik und Inhaltsverzeichnis finden ihn nicht.', excerpt: short(text),
      fix: { label: `Als Überschrift h${level} auszeichnen`, description: `Macht den Absatz zur Überschrift h${level}, eine Ebene unter der vorangehenden Überschrift.`, ops: [{ op: 'change-type', target, to: 'heading', level }] },
    });
  }
  // consecutive paragraphs that start with a bullet or a number: a list typed by hand
  const done = new Set<Element>();
  for (const p of els.filter((e) => e.localName === 'p' && e.namespaceURI === XHTML_NS)) {
    if (done.has(p) || !LIST_MARK.test(p.textContent ?? '')) continue;
    const run = [p];
    for (let s = p.nextSibling; s; s = s.nextSibling) {
      if (s.nodeType === 3 && (s.nodeValue ?? '').trim() === '') continue;
      if (s.nodeType !== 1) break;
      const e = s as Element;
      if (e.localName !== 'p' || !LIST_MARK.test(e.textContent ?? '')) break;
      run.push(e);
    }
    for (const r of run) done.add(r);
    if (run.length < 2) continue;
    const ordered = /^\s*\d/.test(p.textContent ?? '');
    const items = run.map((r) => ({ text: norm(r.textContent ?? '').replace(LIST_MARK, '') }));
    const target = pointerOf(p, path);
    ctx.add({
      rule: 'pseudo-liste', category: 'struktur', severity: 'warnung', wcag: ['1.3.1'], path, target, ...(lineOf(p) ? { line: lineOf(p)! } : {}),
      message: `${run.length} Absätze mit vorangestelltem ${ordered ? 'Nummernzeichen' : 'Aufzählungszeichen'}: eine Liste von Hand, Hilfstechnik kündigt sie nicht als Liste an.`, excerpt: short(p.textContent ?? ''),
      fix: {
        label: ordered ? 'Als nummerierte Liste auszeichnen' : 'Als Aufzählung auszeichnen',
        description: `Ersetzt die ${run.length} Absätze durch eine ${ordered ? 'nummerierte Liste' : 'Aufzählung'}; die Zeichen am Anfang entfallen, die Nummerierung kommt aus der Liste.`,
        ops: [
          { op: 'insert', ref: pointerOf(run[run.length - 1]!, path), position: 'after', block: { type: 'list', ordered, items } },
          ...[...run].reverse().map((r): EditOp => ({ op: 'delete', target: pointerOf(r, path) })),
        ],
      },
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Lesereihenfolge (WCAG 1.3.2; HP-INH-005, HP-INH-011)

function readingOrderProblem(property: string, value: string): string | undefined {
  const v = value.trim().toLowerCase();
  if (property === 'order') return v !== '0' && v !== 'initial' && v !== 'unset' ? `order: ${value} stellt Elemente in eine andere Reihenfolge, als sie im Dokument stehen` : undefined;
  if (property === 'flex-direction' || property === 'flex-flow') return v.includes('reverse') ? `${property}: ${value} kehrt die Reihenfolge der Elemente um` : undefined;
  if (property.startsWith('grid-')) return v !== 'auto' && v !== 'initial' && v !== 'unset' && v !== '' ? `${property}: ${value} setzt Elemente an einen festen Platz im Raster, unabhängig von ihrer Reihenfolge` : undefined;
  if (property === 'position') return v === 'absolute' || v === 'fixed' ? `position: ${value} nimmt Text aus dem Lesefluss und stellt ihn an einen anderen Ort` : undefined;
  return undefined;
}

function readingOrderRules(ctx: Ctx, docs: readonly DocInfo[]): void {
  const reported = new Set<string>();
  for (const info of docs) {
    if (info.isNav) continue;
    const els = contentElements(info);
    for (const r of info.rules) {
      if (!screenMedia(r.media)) continue;
      for (const d of r.declarations) {
        if (!READING_ORDER_PROPS.includes(d.property)) continue;
        const why = readingOrderProblem(d.property, d.value);
        if (!why) continue;
        const hit = els.filter((e) => restingSpecificity(e, r.selector) !== null);
        const relevant = d.property === 'position' ? hit.filter((e) => textContent(e) !== '') : hit;
        if (relevant.length === 0) continue;
        const source: DeclSource = { kind: 'sheet', path: r.path, selector: r.selector, media: r.media, occurrence: r.occurrence, line: d.line };
        const key = `${sourceKey(source)}|${d.property}`;
        if (reported.has(key)) continue;
        reported.add(key);
        ctx.add({
          id: `${d.property === 'position' ? 'css-position' : 'css-reihenfolge'}@${key}`,
          rule: d.property === 'position' ? 'css-position' : 'css-reihenfolge', category: 'lesereihenfolge', severity: 'warnung', wcag: ['1.3.2'], spec: d.property === 'position' ? 'HP-INH-011' : 'HP-INH-005',
          path: r.path, line: d.line,
          message: `${why}; Bildschirmleser und Tastatur folgen aber der Reihenfolge im Dokument (${relevant.length} betroffene${relevant.length === 1 ? 's Element' : ' Elemente'}, z. B. <${relevant[0]!.localName}>).`,
          excerpt: `${r.selector} { ${d.property}: ${d.value} }`,
          fix: { label: 'Deklaration entfernen', description: `Entfernt „${d.property}: ${d.value}“ aus der Regel „${r.selector}“; die Elemente erscheinen in Dokumentreihenfolge.`, ops: [cssOp(source, d.property, null)] },
        });
      }
    }
    for (const e of els) {
      const style = e.getAttribute('style');
      if (!style) continue;
      for (const d of parseStyleAttribute(style, lineOf(e) ?? 1).declarations) {
        const why = readingOrderProblem(d.property, d.value);
        if (!why || (d.property === 'position' && textContent(e) === '')) continue;
        const target = pointerOf(e, info.path);
        ctx.add({
          id: `${d.property === 'position' ? 'css-position' : 'css-reihenfolge'}@${target}|${d.property}`,
          rule: d.property === 'position' ? 'css-position' : 'css-reihenfolge', category: 'lesereihenfolge', severity: 'warnung', wcag: ['1.3.2'], spec: d.property === 'position' ? 'HP-INH-011' : 'HP-INH-005',
          path: info.path, target, ...(lineOf(e) ? { line: lineOf(e)! } : {}),
          message: `${why} (style-Attribut).`, excerpt: short(textContent(e)),
          fix: { label: 'Deklaration entfernen', description: `Entfernt „${d.property}: ${d.value}“ aus dem style-Attribut.`, ops: [{ op: 'set-style', target, property: d.property, value: null }] },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Alternativtexte (WCAG 1.1.1; HP-INH-006)

function captionOf(el: Element): string | undefined {
  const fig = [el, ...ancestors(el)].find((a) => a.localName === 'figure');
  const cap = fig ? childElements(fig).find((c) => c.localName === 'figcaption') : undefined;
  const t = cap ? textContent(cap) : '';
  return t !== '' ? t : undefined;
}

function looksLikeFileName(alt: string, src: string): boolean {
  const a = alt.trim().toLowerCase();
  const file = (src.split('/').pop() ?? '').toLowerCase();
  return a === file || a === file.replace(/\.[a-z0-9]+$/, '') || /\.(png|jpe?g|gif|svg|webp|avif|bmp|tiff?)$/.test(a) || /^(img|dsc|dscn|image|scan|bild|foto)[-_ ]?\d+/.test(a);
}

function altFix(img: Element, path: string): FixSuggestion {
  const target = pointerOf(img, path);
  const caption = captionOf(img);
  const title = img.getAttribute('title')?.trim() || undefined;
  const proposal = caption ?? title;
  return {
    label: 'Alternativtext setzen',
    description: 'Setzt den Alternativtext des Bildes; leer lassen kennzeichnet ein rein dekoratives Bild (alt="").',
    ops: [{ op: 'set-image', target, alt: VALUE }],
    input: { label: 'Alternativtext', kind: 'text', ...(proposal ? { proposal, source: caption ? 'aus der Bildunterschrift – bitte prüfen, ob er das Bild beschreibt' : 'aus dem title-Attribut' } : {}) },
  };
}

function svgName(el: Element, doc: Document): string {
  const label = el.getAttribute('aria-label')?.trim();
  if (label) return label;
  const by = el.getAttribute('aria-labelledby')?.trim();
  if (by) return norm(by.split(/\s+/).map((id) => descendants(doc).find((d) => d.getAttribute('id') === id)?.textContent ?? '').join(' '));
  return '';
}

function altRules(ctx: Ctx, info: DocInfo): void {
  const { path, doc } = info;
  for (const el of contentElements(info)) {
    if (el.localName === 'img' && el.namespaceURI === XHTML_NS) {
      const alt = attrOrNull(el, 'alt');
      const src = el.getAttribute('src') ?? '';
      const target = pointerOf(el, path);
      const base = { category: 'alternativtexte' as const, wcag: ['1.1.1'], spec: 'HP-INH-006', path, target, ...(lineOf(el) ? { line: lineOf(el)! } : {}), excerpt: src };
      if (alt === null) ctx.add({ ...base, rule: 'alt-fehlt', severity: 'fehler', message: 'Bild ohne Alternativtext (alt): Bildschirmleser lesen stattdessen den Dateinamen vor oder gar nichts.', fix: altFix(el, path) });
      else if (alt.trim() !== '' && looksLikeFileName(alt, src)) ctx.add({ ...base, rule: 'alt-dateiname', severity: 'fehler', message: `Der Alternativtext „${alt}“ ist ein Dateiname und beschreibt das Bild nicht.`, fix: altFix(el, path) });
      else if (GENERIC_ALT.has(alt.trim().toLowerCase())) ctx.add({ ...base, rule: 'alt-nichtssagend', severity: 'warnung', message: `Der Alternativtext „${alt}“ sagt nur, dass hier ein Bild ist, nicht was es zeigt.`, fix: altFix(el, path) });
      continue;
    }
    const isSvg = el.localName === 'svg' && el.namespaceURI === SVG_NS && !ancestors(el).some((a) => a.localName === 'svg');
    const role = el.getAttribute('role')?.trim();
    if (!isSvg && role !== 'img') continue;
    if (el.getAttribute('aria-hidden') === 'true' || role === 'presentation' || role === 'none') continue;
    if (isSvg && !descendants(el).some((d) => ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use', 'g'].includes(d.localName ?? ''))) continue;
    const name = svgName(el, doc);
    if (role === 'img' && name !== '') continue;
    const target = pointerOf(el, path);
    const title = childElements(el).find((c) => c.localName === 'title');
    const proposal = (title ? textContent(title) : '') || captionOf(el);
    ctx.add({
      rule: 'grafik-ohne-namen', category: 'alternativtexte', severity: 'fehler', wcag: ['1.1.1', '4.1.2'], spec: 'HP-INH-006', path, target, ...(lineOf(el) ? { line: lineOf(el)! } : {}),
      message: `${isSvg ? 'Eingebettete SVG-Grafik' : 'Element mit role="img"'} ohne ${role === 'img' ? '' : 'role="img" und '}zugänglichen Namen: Hilfstechnik überspringt sie oder liest Einzelteile vor.`,
      fix: {
        label: 'Grafik benennen', description: 'Setzt role="img" und aria-label mit einer Beschreibung der Grafik.',
        ops: [...(role === 'img' ? [] : [{ op: 'set-attribute', target, name: 'role', value: 'img' } as EditOp]), { op: 'set-attribute', target, name: 'aria-label', value: VALUE }],
        input: { label: 'Beschreibung der Grafik', kind: 'text', ...(proposal ? { proposal, source: title ? 'aus dem title-Element der Grafik' : 'aus der Bildunterschrift – bitte prüfen' } : {}) },
      },
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Kontrast (WCAG 1.4.3)

function isLargeText(el: Element): boolean {
  return [el, ...ancestors(el)].some((a) => ['h1', 'h2', 'h3'].includes(a.localName ?? ''));
}

function hasOwnText(el: Element): boolean {
  for (let c = el.firstChild; c; c = c.nextSibling) if ((c.nodeType === 3 || c.nodeType === 4) && (c.nodeValue ?? '').trim() !== '') return true;
  return false;
}

interface ContrastGroup {
  readonly key: string;
  readonly examplePath: string;
  readonly examples: Element[];
  readonly fgSource?: DeclSource;
  readonly bgSource?: DeclSource;
  /** Depths of the deciding declarations in the first failing scheme. */
  readonly fgDepth: number;
  readonly bgDepth: number;
  /** Worst result per failing scheme. */
  readonly fails: Map<string, { ratio: number; fg: Rgba; bg: Rgba }>;
  /** Backgrounds of the examples in every scheme (failing or not). */
  readonly backgrounds: Map<string, Rgba>;
  need: number;
}

function contrastRules(ctx: Ctx, docs: readonly DocInfo[], schemes: readonly Scheme[]): void {
  const groups = new Map<string, ContrastGroup>();
  for (const info of docs) {
    if (info.isNav) continue;
    for (const el of contentElements(info)) {
      if (el.namespaceURI !== XHTML_NS || !hasOwnText(el) || info.cascade.isHidden(el)) continue;
      if (ancestors(el).some((a) => a.namespaceURI !== XHTML_NS)) continue;
      const need = isLargeText(el) ? 3 : 4.5;
      const results = schemes.map((scheme) => ({ scheme, r: resolveColours(info.cascade, el, scheme) }));
      const bad = results.filter((x): x is { scheme: Scheme; r: Exclude<typeof x.r, string> } => {
        if (typeof x.r === 'string') {
          ctx.unevaluable.set(x.r, (ctx.unevaluable.get(x.r) ?? 0) + 1);
          return false;
        }
        // both from the reading system: its responsibility, not the document's
        return !(x.r.fgOrigin.reader && x.r.bgOrigin.reader) && contrastRatio(x.r.fg, x.r.bg) < need;
      });
      if (bad.length === 0) continue;
      const first = bad[0]!.r;
      const key = `${first.fgOrigin.source ? sourceKey(first.fgOrigin.source) : 'leser'}#${first.bgOrigin.source ? sourceKey(first.bgOrigin.source) : 'leser'}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          key, examplePath: info.path, examples: [], fails: new Map(), backgrounds: new Map(), need,
          fgDepth: first.fgOrigin.depth, bgDepth: first.bgOrigin.depth,
          ...(first.fgOrigin.source ? { fgSource: first.fgOrigin.source } : {}), ...(first.bgOrigin.source ? { bgSource: first.bgOrigin.source } : {}),
        };
        groups.set(key, g);
      }
      g.need = Math.max(g.need, need);
      g.examples.push(el);
      for (const { scheme, r } of bad) {
        const ratio = contrastRatio(r.fg, r.bg);
        const prev = g.fails.get(scheme.name);
        if (!prev || ratio < prev.ratio) g.fails.set(scheme.name, { ratio, fg: r.fg, bg: r.bg });
      }
      for (const { r } of results) if (typeof r !== 'string') g.backgrounds.set(toHex(r.bg), r.bg);
    }
  }
  const fmt = (x: number) => x.toFixed(2).replace('.', ',');
  for (const g of groups.values()) {
    const first = g.examples[0]!;
    const schemesText = [...g.fails].map(([name, f]) => `${schemes.find((s) => s.name === name)?.label ?? name}: ${fmt(f.ratio)}:1 (${toHex(f.fg)} auf ${toHex(f.bg)})`).join('; ');
    const bgs = [...g.backgrounds.values()];
    const bgVaries = bgs.length > 1;
    const target = g.need + 0.1; // a little margin, so rounding never lands below the limit
    const failFg = [...g.fails.values()][0]!.fg;
    let fix: FixSuggestion | undefined;
    if (g.bgSource && !bgVaries && (!g.fgSource || g.bgDepth > g.fgDepth)) {
      // a box with a fixed background inside text whose colour comes from further out: give the box a text colour
      const c = toHex(nearestWithContrast(failFg, bgs, target));
      fix = { label: `Textfarbe ${c} zum Hintergrund setzen`, description: `Der Hintergrund aus ${sourceLabel(g.bgSource)} ist fest, die Schriftfarbe kommt von weiter außen; setzt dort color: ${c} (mindestens ${fmt(g.need)}:1 auf ${bgs.map(toHex).join(', ')}).`, ops: [cssOp(g.bgSource, 'color', c)] };
    } else if (g.fgSource && bgVaries) {
      fix = { label: 'Textfarbe dem Lesesystem überlassen', description: `Der Hintergrund wechselt mit dem Farbschema, die Schriftfarbe aus ${sourceLabel(g.fgSource)} nicht; setzt sie auf var(--hp-foreground), dann passt sie in jedem Schema (HP-INH-004).`, ops: [cssOp(g.fgSource, 'color', 'var(--hp-foreground)')] };
    } else if (g.fgSource) {
      const c = toHex(nearestWithContrast(failFg, bgs, target));
      fix = { label: `Textfarbe ${c} verwenden`, description: `Ersetzt die Textfarbe in ${sourceLabel(g.fgSource)} durch ${c}, die nächstliegende Farbe mit mindestens ${fmt(g.need)}:1 auf ${bgs.map(toHex).join(', ')}.`, ops: [cssOp(g.fgSource, 'color', c)] };
    }
    const where = g.fgSource && !(g.bgSource && g.bgDepth > g.fgDepth) ? g.fgSource : (g.bgSource ?? g.fgSource);
    ctx.add({
      id: `kontrast-text@${g.key}`,
      rule: 'kontrast-text', category: 'kontrast', severity: 'fehler', wcag: ['1.4.3'], spec: 'HP-INH-004',
      path: where?.path ?? g.examplePath, ...(where?.kind === 'sheet' ? { line: where.line } : {}), target: pointerOf(first, g.examplePath),
      message: `Zu wenig Kontrast für Text (nötig ${fmt(g.need)}:1${g.need === 3 ? ', große Schrift' : ''}): ${schemesText}. Betroffen: ${g.examples.length} Element${g.examples.length === 1 ? '' : 'e'}, z. B. <${first.localName}>.`,
      excerpt: short(textContent(first)),
      ...(fix ? { fix } : { blocked: 'Schrift- und Hintergrundfarbe wechseln beide mit dem Farbschema über eigene Rückfallwerte; bitte im Stylesheet von Hand angleichen' }),
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Sprache (WCAG 3.1.1, 3.1.2; HP-INH-002)

function languageRules(ctx: Ctx, info: DocInfo, packageLang: string | undefined): void {
  const { path, doc } = info;
  const html = doc.documentElement;
  if (!html) return;
  const lang = attrOrNull(html, 'lang');
  const xl = xmlLang(html);
  const pl = packageLang && !langProblem(packageLang) ? packageLang : undefined;
  const base = { category: 'sprache' as const, wcag: ['3.1.1'], spec: 'HP-INH-002', path, ...(lineOf(html) ? { line: lineOf(html)! } : {}) };
  const setLang = (proposal: string | undefined, source: string): FixSuggestion => ({
    label: 'Sprache setzen', description: 'Setzt lang und xml:lang des Dokuments auf dasselbe Sprachkennzeichen.',
    ops: [{ op: 'set-lang', target: path, lang: VALUE }],
    input: { label: 'Sprache (BCP 47, z. B. de-AT)', kind: 'lang', ...(proposal ? { proposal, source } : {}) },
  });
  if (lang === null && xl === null) {
    ctx.add({ ...base, rule: 'sprache-fehlt', severity: 'fehler', message: 'Das Dokument gibt seine Sprache nicht an (lang, xml:lang): Sprachausgabe und Silbentrennung raten.', fix: setLang(pl, 'aus den Metadaten des Containers') });
  } else {
    const bad = [lang, xl].filter((v): v is string => v !== null).find((v) => langProblem(v));
    if (lang === null || xl === null) {
      const have = (lang ?? xl)!;
      ctx.add({ ...base, rule: 'sprache-fehlt', severity: 'fehler', message: `Das Dokument setzt nur ${lang === null ? 'xml:lang' : 'lang'}="${have}"; HTML-Leser werten lang aus, XML-Leser xml:lang – beide gehören gesetzt.`, fix: setLang(langProblem(have) ? (suggestLang(have) ?? pl) : have, langProblem(have) ? 'korrigierte Schreibweise' : 'aus dem vorhandenen Attribut') });
    } else if (bad !== undefined) {
      const proposal = suggestLang(bad) ?? pl;
      ctx.add({ ...base, rule: 'sprache-ungueltig', severity: 'fehler', message: `Sprachangabe des Dokuments ${langProblem(bad)}.`, excerpt: `lang="${lang}" xml:lang="${xl}"`, fix: setLang(proposal, suggestLang(bad) ? 'korrigierte Schreibweise' : 'aus den Metadaten des Containers') });
    } else if (lang.toLowerCase() !== xl.toLowerCase()) {
      ctx.add({ ...base, rule: 'sprache-widerspruch', severity: 'fehler', message: `lang="${lang}" und xml:lang="${xl}" widersprechen sich.`, fix: setLang(pl && [lang, xl].some((v) => v.toLowerCase() === pl.toLowerCase()) ? pl : lang, pl ? 'passend zu den Metadaten des Containers' : 'aus lang') });
    }
  }
  if (info.isNav) return;
  const docLang = (lang && !langProblem(lang) ? lang : xl && !langProblem(xl) ? xl : pl) ?? '';
  for (const el of contentElements(info)) {
    const own = attrOrNull(el, 'lang') ?? xmlLang(el);
    if (own !== null && langProblem(own)) {
      const target = pointerOf(el, path);
      const proposal = suggestLang(own);
      ctx.add({
        rule: 'sprache-teil-ungueltig', category: 'sprache', severity: 'fehler', wcag: ['3.1.2'], spec: 'HP-INH-002', path, target, ...(lineOf(el) ? { line: lineOf(el)! } : {}),
        message: `Sprachangabe eines Textteils ${langProblem(own)}.`, excerpt: short(textContent(el)),
        fix: { label: 'Sprache korrigieren', description: 'Setzt lang und xml:lang dieses Textteils.', ops: [{ op: 'set-lang', target, lang: VALUE }], input: { label: 'Sprache (BCP 47)', kind: 'lang', ...(proposal ? { proposal, source: 'korrigierte Schreibweise' } : {}) } },
      });
      continue;
    }
    if (!TEXT_BLOCKS.has(el.localName ?? '') || el.namespaceURI !== XHTML_NS) continue;
    // innermost text blocks only: a list item that holds paragraphs is judged by them
    if (childElements(el).some((c) => TEXT_BLOCKS.has(c.localName ?? ''))) continue;
    const declared = [el, ...ancestors(el)].map((a) => attrOrNull(a, 'lang') ?? xmlLang(a)).find((v) => v !== null && !langProblem(v)) ?? docLang;
    if (!declared) continue;
    const found = foreignLanguage(el.textContent ?? '', declared);
    if (!found) continue;
    const target = pointerOf(el, path);
    ctx.add({
      rule: 'sprachwechsel', category: 'sprache', severity: 'warnung', wcag: ['3.1.2'], spec: 'HP-INH-002', path, target, ...(lineOf(el) ? { line: lineOf(el)! } : {}),
      message: `Der Text ist offenbar ${LANGUAGE_NAMES[found]}, ausgezeichnet ist ${LANGUAGE_NAMES[declared.split('-')[0]!.toLowerCase()] ?? declared}: die Sprachausgabe spricht ihn mit falscher Aussprache.`,
      excerpt: short(textContent(el)),
      fix: { label: `Als ${LANGUAGE_NAMES[found]} auszeichnen`, description: 'Setzt lang und xml:lang an diesem Textteil.', ops: [{ op: 'set-lang', target, lang: VALUE }], input: { label: 'Sprache (BCP 47)', kind: 'lang', proposal: found, source: 'erkannt an häufigen Wörtern – bitte prüfen' } },
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Tabellenköpfe (WCAG 1.3.1; HP-INH-008)

function rowsOf(table: Element): Element[] {
  return descendants(table).filter((e) => e.localName === 'tr' && ancestors(e).find((a) => a.localName === 'table') === table);
}

function cellsOf(tr: Element): Element[] {
  return childElements(tr).filter((c) => c.localName === 'td' || c.localName === 'th');
}

const NUMERIC = /^[-+−]?[\d.,'\s ]+\s*(%|€|eur|m²|m2|m³|m|cm|mm|kg|t|h|stk\.?)?$/i;

function tableRules(ctx: Ctx, info: DocInfo): void {
  const { path } = info;
  for (const table of contentElements(info).filter((e) => e.localName === 'table' && e.namespaceURI === XHTML_NS)) {
    const role = table.getAttribute('role');
    if (role === 'presentation' || role === 'none') continue;
    const rows = rowsOf(table);
    if (rows.length < 2) continue;
    const target = pointerOf(table, path);
    const calc = descendants(table).some((d) => d.hasAttribute('data-hp-formula') || d.hasAttribute('data-hp-input'));
    const blocked = calc ? 'Rechentabelle: Kopfzellen und Beschriftung ändert der Tabellenrechner (hpro calc, Teil 3), damit Formeln und Adressen stimmen' : undefined;
    const ths = descendants(table).filter((d) => d.localName === 'th');
    const caption = childElements(table).find((c) => c.localName === 'caption');
    const label = caption ? textContent(caption) : table.getAttribute('aria-label') ?? '';
    const base = { category: 'tabellenkoepfe' as const, wcag: ['1.3.1'], spec: 'HP-INH-008', path, target, ...(lineOf(table) ? { line: lineOf(table)! } : {}), ...(label ? { excerpt: short(label) } : {}) };
    if (ths.length === 0) {
      const body = rows.slice(1).map(cellsOf);
      const firstCol = body.map((r) => (r[0] ? textContent(r[0]) : ''));
      const numericElsewhere = body.flatMap((r) => r.slice(1)).filter((c) => NUMERIC.test(textContent(c))).length;
      const rowHeads = firstCol.every((t) => t !== '' && !NUMERIC.test(t)) && numericElsewhere > body.flatMap((r) => r.slice(1)).length / 2;
      ctx.add({
        ...base, rule: 'kopfzellen-fehlen', severity: 'fehler',
        message: 'Datentabelle ohne Kopfzellen (th): Bildschirmleser können Werte keiner Spalte zuordnen.',
        ...(blocked ? { blocked } : {
          fix: {
            label: rowHeads ? 'Erste Zeile und erste Spalte zu Kopfzellen machen' : 'Erste Zeile zu Kopfzellen machen',
            description: `Macht die erste Zeile zu Spaltenköpfen (th scope="col", in thead)${rowHeads ? ' und die erste Spalte zu Zeilenköpfen (th scope="row")' : ''}.`,
            ops: [{ op: 'set-table-headers', table: target, rows: 1, columns: rowHeads ? 1 : 0 }],
          },
        }),
      });
    } else {
      const usesHeaders = descendants(table).some((d) => d.hasAttribute('headers'));
      const loose = ths.filter((t) => !t.hasAttribute('scope'));
      const ambiguous = rows.length > 1 && cellsOf(rows[0]!).length > 1;
      if (!usesHeaders && loose.length > 0 && ambiguous) {
        ctx.add({
          ...base, rule: 'kopfzellen-ohne-bezug', severity: 'warnung',
          message: `${loose.length} Kopfzelle${loose.length === 1 ? '' : 'n'} ohne scope: ob sie für eine Spalte oder eine Zeile gelten, muss Hilfstechnik raten (HP-INH-008 verlangt scope oder headers).`,
          ...(blocked ? { blocked } : { fix: { label: 'scope ergänzen', description: 'Setzt scope="col" für Kopfzellen in Kopfzeilen und scope="row" für Kopfzellen am Zeilenanfang.', ops: [{ op: 'set-table-headers', table: target, rows: 0, columns: 0 }] } }),
        });
      }
    }
    if (!caption || textContent(caption) === '') {
      const proposal = captionProposal(table);
      ctx.add({
        ...base, rule: 'tabelle-ohne-beschriftung', severity: 'warnung',
        message: 'Tabelle ohne Beschriftung (caption): beim Springen von Tabelle zu Tabelle hört man nicht, worum es geht.',
        ...(blocked ? { blocked } : { fix: { label: 'Beschriftung setzen', description: 'Setzt eine Tabellenbeschriftung (caption) als erstes Element der Tabelle.', ops: [{ op: 'set-caption', table: target, text: VALUE }], input: { label: 'Beschriftung', kind: 'text', ...(proposal ? proposal : {}) } } }),
      });
    }
  }
}

function captionProposal(table: Element): { proposal: string; source: string } | undefined {
  const aria = table.getAttribute('aria-label')?.trim() || table.getAttribute('title')?.trim();
  if (aria) return { proposal: aria, source: 'aus aria-label/title der Tabelle' };
  let prev = table.previousSibling;
  while (prev && prev.nodeType !== 1) prev = prev.previousSibling;
  if (prev && (prev as Element).localName === 'p') {
    const t = textContent(prev as Element);
    if (t.endsWith(':') && t.length <= 120) return { proposal: t.slice(0, -1).trim(), source: 'aus dem einleitenden Absatz – bitte prüfen' };
  }
  const section = ancestors(table).find((a) => ['section', 'article'].includes(a.localName ?? ''));
  const h = section ? childElements(section).find((c) => HEADING.test(c.localName ?? '')) : undefined;
  if (h && textContent(h)) return { proposal: textContent(h), source: 'aus der Abschnittsüberschrift – bitte prüfen' };
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Fokusführung (WCAG 2.4.3, 2.4.4, 2.4.7, 4.1.2)

function isFocusable(el: Element): boolean {
  const name = el.localName ?? '';
  const ti = el.getAttribute('tabindex');
  if (ti !== null && ti.trim() !== '' && Number(ti) < 0) return false;
  if (ti !== null && ti.trim() !== '' && Number(ti) >= 0) return true;
  if (name === 'a' || name === 'area') return el.hasAttribute('href');
  if (name === 'summary') return true;
  if ((name === 'video' || name === 'audio') && el.hasAttribute('controls')) return true;
  return NATIVE_FOCUSABLE.has(name) && !el.hasAttribute('disabled');
}

function accessibleName(el: Element, doc: Document): string {
  const label = el.getAttribute('aria-label')?.trim();
  if (label) return label;
  const by = el.getAttribute('aria-labelledby')?.trim();
  if (by) {
    const t = norm(by.split(/\s+/).map((id) => descendants(doc).find((d) => d.getAttribute('id') === id)?.textContent ?? '').join(' '));
    if (t) return t;
  }
  const walk = (n: Element): string => {
    let out = '';
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 || c.nodeType === 4) out += c.nodeValue ?? '';
      else if (c.nodeType === 1) {
        const e = c as Element;
        if (e.getAttribute('aria-hidden') === 'true') continue;
        if (e.localName === 'img') out += ` ${e.getAttribute('alt') ?? ''} `;
        else if (e.localName === 'svg') out += ` ${svgName(e, doc)} `;
        else out += walk(e);
      }
    }
    return out;
  };
  return norm(walk(el)) || el.getAttribute('title')?.trim() || '';
}

/** A scrolling region (code block, `overflow: auto|scroll`) needs tabindex="0" for the keyboard (WCAG 2.1.1). */
function scrollable(el: Element, cascade: Cascade): boolean {
  if (el.localName === 'pre') return true;
  return ['overflow', 'overflow-x', 'overflow-y'].some((p) => /\b(auto|scroll)\b/i.test(cascade.winner(el, p)?.value ?? ''));
}

function focusRules(ctx: Ctx, docs: readonly DocInfo[]): void {
  const reported = new Set<string>();
  for (const info of docs) {
    if (info.isNav) continue;
    const { path, doc } = info;
    const els = contentElements(info);
    for (const el of els) {
      const target = pointerOf(el, path);
      const base = { category: 'fokus' as const, path, target, ...(lineOf(el) ? { line: lineOf(el)! } : {}) };
      const ti = el.getAttribute('tabindex');
      const role = el.getAttribute('role')?.trim() ?? '';
      const named = !!(el.getAttribute('aria-label')?.trim() || el.getAttribute('aria-labelledby')?.trim());
      const native = NATIVE_FOCUSABLE.has(el.localName ?? '') && (el.localName !== 'a' || el.hasAttribute('href'));
      if (ti !== null && /^\s*\d+\s*$/.test(ti) && Number(ti) > 0) {
        const keep = !native && INTERACTIVE_ROLES.has(role);
        ctx.add({
          ...base, rule: 'tabindex-positiv', severity: 'fehler', wcag: ['2.4.3'],
          message: `tabindex="${ti}" zieht das Element in der Tabulatorreihenfolge vor alle anderen: die Tastatur springt quer durch das Dokument.`, excerpt: short(textContent(el)) || `<${el.localName}>`,
          fix: keep
            ? { label: 'tabindex="0" setzen', description: 'Belässt das Element erreichbar, aber an seinem Platz in der Dokumentreihenfolge.', ops: [{ op: 'set-attribute', target, name: 'tabindex', value: '0' }] }
            : { label: 'tabindex entfernen', description: native ? 'Das Element ist ohnehin mit der Tastatur erreichbar, und zwar an seinem Platz in der Dokumentreihenfolge.' : 'Das Element ist nicht bedienbar und braucht keinen Tastaturfokus.', ops: [{ op: 'set-attribute', target, name: 'tabindex', value: null }] },
        });
      } else if (ti !== null && /^\s*0\s*$/.test(ti) && !native && !INTERACTIVE_ROLES.has(role) && !named && !scrollable(el, info.cascade)) {
        ctx.add({
          ...base, rule: 'fokus-ohne-zweck', severity: 'warnung', wcag: ['2.4.3', '4.1.2'],
          message: `<${el.localName}> ist mit tabindex="0" fokussierbar, aber weder bedienbar noch benannt: ein leerer Tabulatorhalt.`, excerpt: short(textContent(el)),
          fix: { label: 'tabindex entfernen', description: 'Nimmt das Element aus der Tabulatorreihenfolge.', ops: [{ op: 'set-attribute', target, name: 'tabindex', value: null }] },
        });
      }
      if (el.getAttribute('aria-hidden') === 'true' && (isFocusable(el) || descendants(el).some(isFocusable))) {
        ctx.add({
          ...base, rule: 'fokus-versteckt', severity: 'fehler', wcag: ['4.1.2', '2.4.3'],
          message: 'aria-hidden="true" verbirgt ein fokussierbares Element vor Hilfstechnik: die Tastatur landet dort, der Bildschirmleser sagt nichts.', excerpt: short(textContent(el)),
          fix: { label: 'aria-hidden entfernen', description: 'Macht den Bereich für Hilfstechnik wieder sichtbar.', ops: [{ op: 'set-attribute', target, name: 'aria-hidden', value: null }] },
        });
      }
      if (el.localName === 'a' && el.hasAttribute('href') && el.getAttribute('aria-hidden') !== 'true' && accessibleName(el, doc) === '') {
        if (descendants(el).some((d) => d.localName === 'img' && !d.hasAttribute('alt'))) continue; // reported as missing alt text
        const href = el.getAttribute('href') ?? '';
        const t = resolveHref(path, href);
        const targetDoc = t && t.path === path ? doc : undefined;
        const dest = targetDoc && t?.fragment ? descendants(targetDoc).find((d) => d.getAttribute('id') === decodeURIComponent(t.fragment)) : undefined;
        const heading = dest ? (HEADING.test(dest.localName ?? '') ? dest : childElements(dest).find((c) => HEADING.test(c.localName ?? ''))) : undefined;
        const proposal = heading ? textContent(heading) : undefined;
        ctx.add({
          ...base, rule: 'link-ohne-namen', severity: 'fehler', wcag: ['2.4.4', '4.1.2'], excerpt: href,
          message: 'Verweis ohne erkennbaren Text: beim Tabulator hört man nur „Link“, nicht wohin er führt.',
          fix: { label: 'Verweis benennen', description: 'Setzt aria-label mit dem Ziel des Verweises.', ops: [{ op: 'set-attribute', target, name: 'aria-label', value: VALUE }], input: { label: 'Name des Verweises', kind: 'text', ...(proposal ? { proposal, source: 'aus der Überschrift des Verweisziels' } : {}) } },
        });
      }
      const style = el.getAttribute('style');
      if (style && isFocusable(el)) {
        for (const d of parseStyleAttribute(style, lineOf(el) ?? 1).declarations) {
          if (!OUTLINE_PROPS.includes(d.property) || !/^(none|0|0px|hidden)$/i.test(d.value.trim())) continue;
          ctx.add({
            ...base, id: `fokus-unsichtbar@${target}|${d.property}`, rule: 'fokus-unsichtbar', severity: 'fehler', wcag: ['2.4.7'],
            message: `${d.property}: ${d.value} im style-Attribut entfernt die Fokusmarkierung: mit der Tastatur sieht man nicht, wo man ist.`, excerpt: short(textContent(el)),
            fix: { label: 'Deklaration entfernen', description: `Entfernt „${d.property}: ${d.value}“; die Fokusmarkierung des Lesesystems erscheint wieder.`, ops: [{ op: 'set-style', target, property: d.property, value: null }] },
          });
        }
      }
    }
    // stylesheet rules that remove the focus outline of focusable elements without replacement
    const focusable = els.filter(isFocusable);
    for (const r of info.rules) {
      if (!screenMedia(r.media)) continue;
      const off = r.declarations.filter((d) => OUTLINE_PROPS.includes(d.property) && /^(none|0|0px|hidden)(\s|$)/i.test(d.value.trim()));
      if (off.length === 0) continue;
      const replaced = r.declarations.some((d) => /^(box-shadow|border|border-(bottom|top|left|right)(-color|-style|-width)?|text-decoration|background(-color)?)$/.test(d.property) && !/^(none|0|transparent|inherit)$/i.test(d.value.trim()));
      if (replaced) continue;
      const hit = focusable.filter((e) => matches(e, r.selector));
      if (hit.length === 0) continue;
      for (const d of off) {
        const source: DeclSource = { kind: 'sheet', path: r.path, selector: r.selector, media: r.media, occurrence: r.occurrence, line: d.line };
        const key = `${sourceKey(source)}|${d.property}`;
        if (reported.has(key)) continue;
        reported.add(key);
        ctx.add({
          id: `fokus-unsichtbar@${key}`, rule: 'fokus-unsichtbar', category: 'fokus', severity: 'fehler', wcag: ['2.4.7'], path: r.path, line: d.line,
          message: `„${d.property}: ${d.value}“ in der Regel „${r.selector}“ entfernt die Fokusmarkierung von ${hit.length} fokussierbaren Element${hit.length === 1 ? '' : 'en'} (z. B. <${hit[0]!.localName}>), ohne Ersatz.`,
          excerpt: `${r.selector} { ${d.property}: ${d.value} }`,
          fix: { label: 'Deklaration entfernen', description: `Entfernt „${d.property}: ${d.value}“; die Fokusmarkierung des Lesesystems erscheint wieder.`, ops: [cssOp(source, d.property, null)] },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------

function navPathOf(files: ReadonlyMap<string, Uint8Array>): string | undefined {
  const container = files.get('META-INF/container.xml');
  const opfPath = container ? /full-path="([^"]+)"/.exec(fromUtf8(container))?.[1] : undefined;
  const opf = opfPath ? files.get(opfPath) : undefined;
  if (!opf || !opfPath) return undefined;
  const item = /<item\b[^>]*\bproperties="[^"]*\bnav\b[^"]*"[^>]*>/.exec(fromUtf8(opf))?.[0];
  const href = item ? /\bhref="([^"]+)"/.exec(item)?.[1] : undefined;
  return href ? resolveHref(opfPath, decodeURIComponent(href))?.path : undefined;
}

/** Runs the check over the main version of a set of container files. */
export function auditFiles(files: ReadonlyMap<string, Uint8Array>, options: AuditOptions = {}): A11yReport {
  const schemes = options.schemes ?? READER_SCHEMES;
  const ctx = new Ctx();
  const manifestBytes = files.get('manifest.json');
  const manifest = manifestBytes ? (JSON.parse(fromUtf8(manifestBytes)) as { readingOrder?: Array<{ url: string }>; resources?: Array<{ url: string; type: string }>; inLanguage?: string; name?: string }) : {};
  const order = (manifest.readingOrder ?? []).map((r) => r.url);
  const xhtml = (manifest.resources ?? []).filter((r) => r.type === XHTML_TYPE && !r.url.startsWith('renditions/')).map((r) => r.url);
  const navPath = navPathOf(files);
  const paths = [...order, ...xhtml.filter((p) => !order.includes(p) && p !== navPath).sort(), ...(navPath && xhtml.includes(navPath) && !order.includes(navPath) ? [navPath] : [])];
  const docs: DocInfo[] = [];
  const sheetPaths = new Set<string>();
  for (const path of paths) {
    const data = files.get(path);
    if (!data) continue;
    let doc: Document;
    try {
      doc = parseXml(fromUtf8(data), path);
    } catch (e) {
      ctx.notChecked.push({ what: path, why: `nicht als XHTML lesbar: ${String(e instanceof Error ? e.message : e)}` });
      continue;
    }
    const { rules, paths: sp } = sheetsOf(doc as unknown as { documentElement: Element | null }, path, files);
    for (const p of sp) sheetPaths.add(p);
    docs.push({ path, doc, isNav: path === navPath, cascade: new Cascade(path, rules), rules });
    ctx.sealed += descendants(doc).filter((e) => e.hasAttribute('data-hp-sealed')).length;
  }
  const title = typeof manifest.name === 'string' ? manifest.name : '';
  for (const info of docs) {
    languageRules(ctx, info, manifest.inLanguage);
    if (info.isNav) continue;
    structureRules(ctx, info, title);
    altRules(ctx, info);
    tableRules(ctx, info);
  }
  readingOrderRules(ctx, docs);
  contrastRules(ctx, docs, schemes);
  focusRules(ctx, docs);

  const notChecked: NotChecked[] = [
    ...ctx.notChecked,
    { what: 'Inhalt der Alternativtexte', why: 'ob ein Text das Bild treffend beschreibt, kann nur ein Mensch beurteilen; geprüft werden Vorhandensein, Dateinamen und Füllwörter' },
    { what: 'Sinnvolle Reihenfolge des Dokuments selbst', why: 'geprüft wird, ob CSS die Reihenfolge verändert; ob die Reihenfolge im Dokument der gemeinten entspricht, ist eine inhaltliche Frage' },
    { what: 'Kontrast von Text in Bildern und von Bedienelementen (WCAG 1.4.11)', why: 'Bildinhalte und Grafikkontraste sind statisch nicht auswertbar' },
    { what: 'Sprachwechsel außer Deutsch, Englisch, Französisch, Italienisch, Spanisch', why: 'die Erkennung kennt nur die Stoppwörter dieser fünf Sprachen' },
    { what: 'Bedienung lebendiger Komponenten (Profil interactive)', why: 'sie laufen in der Sandbox und sind nur im Browser prüfbar (axe-core im Reader-Test)' },
    { what: 'Untertitel und Audiodeskription von Video und Ton', why: 'Inhalt der Medien; die Konformitätsprüfung verlangt Poster und Beschreibung (HPR-INH-019)' },
    ...(ctx.sealed > 0 ? [{ what: `${ctx.sealed} versiegelte Abschnitte`, why: 'verschlüsselt; ohne Schlüssel nicht prüfbar' }] : []),
    ...[...ctx.unevaluable].map(([why, n]) => ({ what: `Kontrast an ${n} Stellen`, why: `nicht auswertbar: ${why}` })),
  ];
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, ctx.findings.filter((f) => f.category === c).length])) as Record<Category, number>;
  const rank = (f: Finding) => CATEGORIES.indexOf(f.category);
  const findings = [...ctx.findings].sort((a, b) => rank(a) - rank(b) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || (a.line ?? 0) - (b.line ?? 0));
  return { checker: CHECKER, documents: docs.map((d) => d.path), stylesheets: [...sheetPaths], schemes: schemes.map((s) => s.label), findings, counts, rules: RULES, notChecked };
}

/** Runs the check over the main version of a container. */
export async function auditContainer(bytes: Uint8Array, options: AuditOptions = {}): Promise<A11yReport> {
  const c = await readContainer(bytes);
  return auditFiles(c.files, options);
}
