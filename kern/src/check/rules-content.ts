/**
 * Content rules on XHTML, SVG and CSS of a version (part 1: CONT-020/021, INH-001…024,
 * ADR-001…007, NEST-001/002/004/005).
 */
import { splitSelectors, subjectElement, type CssDeclaration, type CssRule } from './css.js';
import { finding, isExternalRef, loc, resolveRef, typeOf, type Ctx, type Fassung, type MarkupDoc, type StyleSource } from './context.js';
import { ancestors, attr, children, elements, hasAncestor, inspectDoctype, isHtml, lineOf, localName, NS, text, type XmlElement } from './markup.js';
import { matches } from './selector.js';

export const HP_VARIABLES: ReadonlySet<string> = new Set(['--hp-font-size', '--hp-line-height', '--hp-letter-spacing', '--hp-word-spacing', '--hp-paragraph-spacing', '--hp-foreground', '--hp-background']);
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);
const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const SMIL = new Set(['animate', 'animateTransform', 'animateMotion', 'set']);

export interface ResourceRef {
  readonly path: string;
  readonly line: number | undefined;
  readonly attribute: string;
  readonly value: string;
  readonly element?: XmlElement;
  readonly kind: 'xml' | 'css';
}

/** All resource references of HPR-CONT-020 in the markup and CSS of a version. */
export function resourceReferences(f: Fassung): ResourceRef[] {
  const out: ResourceRef[] = [];
  const pairs: Record<string, string[]> = {
    link: ['href'], img: ['src', 'srcset'], script: ['src'], source: ['src', 'srcset'], audio: ['src'], video: ['src', 'poster'],
    track: ['src'], iframe: ['src'], embed: ['src'], object: ['data'], base: ['href'], a: ['ping'], image: ['href'], use: ['href'],
  };
  const addSrcset = (doc: MarkupDoc, el: XmlElement, name: string, value: string) => {
    for (const cand of value.split(',')) {
      const url = cand.trim().split(/\s+/)[0];
      if (url) out.push({ path: doc.path, line: lineOf(el), attribute: name, value: url, element: el, kind: 'xml' });
    }
  };
  for (const doc of [...f.docs.values(), ...f.svgs.values()]) {
    for (const el of elements(doc.doc)) {
      const name = localName(el);
      const inSvg = el.namespaceURI === NS.svg;
      for (const a of pairs[name] ?? []) {
        // `a/@href` is a hyperlink and exempt; SVG `a` uses href as hyperlink too.
        const v = attr(el, a);
        if (v === null) continue;
        if (a === 'srcset') addSrcset(doc, el, `${name}/@srcset`, v);
        else if (a === 'ping') for (const u of v.split(/\s+/).filter(Boolean)) out.push({ path: doc.path, line: lineOf(el), attribute: 'a/@ping', value: u, element: el, kind: 'xml' });
        else if ((name === 'image' || name === 'use') && !inSvg) continue;
        else out.push({ path: doc.path, line: lineOf(el), attribute: `${name}/@${a}`, value: v, element: el, kind: 'xml' });
      }
      const xlink = el.getAttributeNS(NS.xlink, 'href');
      if (xlink !== null && xlink !== '' && name !== 'a') out.push({ path: doc.path, line: lineOf(el), attribute: `${name}/@xlink:href`, value: xlink, element: el, kind: 'xml' });
      if (name === 'meta' && (attr(el, 'http-equiv') ?? '').toLowerCase() === 'refresh') {
        const m = /url\s*=\s*['"]?([^'";]+)/i.exec(attr(el, 'content') ?? '');
        if (m) out.push({ path: doc.path, line: lineOf(el), attribute: 'meta/@content', value: m[1]!.trim(), element: el, kind: 'xml' });
      }
    }
  }
  for (const s of f.styles) for (const r of s.sheet.references) out.push({ path: s.path, line: r.line, attribute: r.kind === 'import' ? '@import' : 'url()', value: r.value, kind: s.path.endsWith('.css') || typeOf(f, s.path) === 'text/css' ? 'css' : 'xml' });
  for (const a of f.styleAttributes) for (const r of a.references) out.push({ path: a.path, line: a.line, attribute: 'style/url()', value: r.value, element: a.element, kind: 'xml' });
  return out;
}

const refLoc = (r: ResourceRef) => (r.kind === 'css' ? loc.css(r.path, r.line) : loc.xml(r.path, r.line));

/** HPR-CONT-020 and HPR-CONT-021. */
export function checkReferences(ctx: Ctx, f: Fassung, refs: readonly ResourceRef[]): void {
  ctx.report.ran('HPR-CONT-020', 'HPR-CONT-021');
  for (const r of refs) {
    const v = r.value.trim();
    if (v === '' || v.startsWith('#') || /^data:/i.test(v)) continue;
    if (isExternalRef(v)) {
      finding(ctx, 'HPR-CONT-020', { pfad: r.path, zeile: r.line ?? '', attribut: r.attribute, uri: v }, refLoc(r), f);
      continue;
    }
    const target = resolveRef(r.path, v);
    if (!target || !ctx.files.has(target.path)) finding(ctx, 'HPR-CONT-021', { pfad: r.path, zeile: r.line ?? '', attribut: r.attribute, uri: v }, refLoc(r), f);
  }
}

/** HPR-INH-001 and HPR-INH-002 (parse results of all XHTML and XML files of the version). */
export function checkWellFormed(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-INH-001', 'HPR-INH-002');
  for (const [path, p] of f.parsed) {
    const type = typeOf(f, path);
    if (type === 'application/xhtml+xml') {
      if (p.text === undefined) finding(ctx, 'HPR-INH-001', { pfad: path, zeile: 1, grund: 'kein gültiges UTF-8' }, loc.xml(path, 1), f);
      else if (!p.doc) finding(ctx, 'HPR-INH-001', { pfad: path, zeile: p.error?.line ?? '', grund: p.error?.message ?? 'nicht wohlgeformt' }, loc.xml(path, p.error?.line, p.error?.column), f);
      else {
        const root = p.doc.documentElement!;
        if (localName(root) !== 'html' || root.namespaceURI !== NS.xhtml) finding(ctx, 'HPR-INH-001', { pfad: path, zeile: lineOf(root) ?? '', grund: `Wurzel {${root.namespaceURI ?? ''}}${localName(root)}` }, loc.xml(path, lineOf(root)), f);
      }
    }
    if (p.text !== undefined) {
      const dt = inspectDoctype(p.text);
      if (dt && (dt.external || dt.entities)) finding(ctx, 'HPR-INH-002', { pfad: path, zeile: dt.line, grund: [dt.external ? 'externer Kennung (SYSTEM/PUBLIC)' : '', dt.entities ? 'Entitätsdeklaration' : ''].filter(Boolean).join(' und ') }, loc.xml(path, dt.line), f);
    }
  }
}

/** Value of a declaration list for a property (last wins), lower-cased. */
function decl(decls: readonly CssDeclaration[], prop: string): CssDeclaration | undefined {
  for (let i = decls.length - 1; i >= 0; i--) if (decls[i]!.property === prop) return decls[i];
  return undefined;
}

const screenMedia = (rule: CssRule, source: StyleSource) => !source.printOnly && rule.media.every((m) => !/^\s*print\b/i.test(m) && !/prefers-reduced-motion/i.test(m));

/** Effective declarations reaching an element from stylesheets (screen) and its style attribute. */
export function computedDeclarations(f: Fassung, docPath: string, el: XmlElement): CssDeclaration[] {
  const out: CssDeclaration[] = [];
  for (const s of f.docStyles.get(docPath) ?? []) {
    for (const r of s.sheet.rules) if (r.context === 'style' && screenMedia(r, s) && matches(el, r.selector)) out.push(...r.declarations);
  }
  for (const a of f.styleAttributes) if (a.element === el) out.push(...a.declarations);
  return out;
}

/** HPR-INH-003, -008, -009, -010, -011, -014, -015, -018, -019, -020, -023 and ADR/NEST rules on the markup. */
export function checkMarkup(ctx: Ctx, f: Fassung): void {
  const r = ctx.report;
  r.ran('HPR-INH-003', 'HPR-INH-008', 'HPR-INH-009', 'HPR-INH-010', 'HPR-INH-011', 'HPR-INH-014', 'HPR-INH-015', 'HPR-INH-018', 'HPR-INH-019', 'HPR-INH-020', 'HPR-INH-023');
  r.ran('HPR-ADR-001', 'HPR-ADR-002', 'HPR-ADR-003', 'HPR-ADR-006', 'HPR-ADR-007', 'HPR-NEST-001', 'HPR-NEST-002', 'HPR-NEST-004', 'HPR-NEST-005');
  const addressable = new Set(['section', 'article', 'aside', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'figure', 'pre', 'details', 'form']);
  for (const doc of f.docs.values()) {
    const path = doc.path;
    const at = (el: XmlElement) => loc.xml(path, lineOf(el));
    const line = (el: XmlElement) => lineOf(el) ?? '';
    const all = elements(doc.doc);
    const html = doc.root;

    // INH-003 language
    const lang = attr(html, 'lang');
    const xmlLang = html.getAttributeNS(NS.xml, 'lang') ?? html.getAttribute('xml:lang');
    let langProblem: string | undefined;
    if (lang === null || xmlLang === null || xmlLang === '') langProblem = `fehlt (${lang === null ? 'lang' : ''}${lang === null && !xmlLang ? ', ' : ''}${!xmlLang ? 'xml:lang' : ''})`;
    else if (lang !== xmlLang) langProblem = `ungleich (lang="${lang}", xml:lang="${xmlLang}")`;
    else if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(lang)) langProblem = `„${lang}“ ist nicht nach BCP 47 geformt`;
    if (langProblem) finding(ctx, 'HPR-INH-003', { pfad: path, grund: langProblem }, at(html), f);

    // ADR-002/003 ids
    const ids = new Map<string, XmlElement>();
    for (const el of all) {
      const id = attr(el, 'id');
      if (id === null) continue;
      if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(id) || id.length > 64) finding(ctx, 'HPR-ADR-002', { pfad: path, zeile: line(el), kennung: id, grund: id.length > 64 ? `${id.length} Zeichen, höchstens 64` : 'Muster ^[A-Za-z][A-Za-z0-9_.-]*$' }, at(el), f);
      if (ids.has(id)) finding(ctx, 'HPR-ADR-003', { pfad: path, zeile: line(el), kennung: id }, at(el), f);
      else ids.set(id, el);
    }

    let h1 = 0;
    let lastLevel = 0;
    for (const el of all) {
      const name = localName(el);
      if (el.namespaceURI === NS.xhtml) {
        if ((addressable.has(name) || el.hasAttribute('data-hp-priority')) && attr(el, 'id') === null) finding(ctx, 'HPR-ADR-001', { pfad: path, zeile: line(el), element: name }, at(el), f);
        if (name === 'img' && !el.hasAttribute('alt')) finding(ctx, 'HPR-INH-008', { pfad: path, zeile: line(el) }, at(el), f);
        if (/^h[1-6]$/.test(name)) {
          const level = Number(name[1]);
          if (level === 1) h1++;
          if (lastLevel > 0 && level > lastLevel + 1) finding(ctx, 'HPR-INH-010', { pfad: path, zeile: line(el), grund: `Sprung von h${lastLevel} auf h${level}` }, at(el), f);
          else if (lastLevel === 0 && level > 1) finding(ctx, 'HPR-INH-010', { pfad: path, zeile: line(el), grund: `erste Überschrift ist h${level}` }, at(el), f);
          lastLevel = level;
        }
        if (name === 'table') checkTable(ctx, f, path, el);
        if (name === 'video') checkVideo(ctx, f, doc, el, ids);
        if (name === 'audio') checkAudio(ctx, f, doc, el, ids);
        if ((name === 'video' || name === 'audio') && el.hasAttribute('autoplay') && !el.hasAttribute('muted')) finding(ctx, 'HPR-INH-020', { pfad: path, zeile: line(el), element: name }, at(el), f);
        if (name === 'img') {
          const alt = attr(el, 'alt') ?? '';
          if (alt.length > 300 && !hasAncestor(el, (a) => isHtml(a, 'figure'))) finding(ctx, 'HPR-INH-015', { pfad: path, zeile: line(el), grund: `img mit ${alt.length} Zeichen Alternativtext außerhalb von figure (Text als Bild)` }, at(el), f);
        }
        if (el.hasAttribute('data-hp-priority') && !['1', '2', '3'].includes(attr(el, 'data-hp-priority')!)) finding(ctx, 'HPR-NEST-002', { pfad: path, zeile: line(el), wert: attr(el, 'data-hp-priority')! }, at(el), f);
        if (name === 'iframe' || name === 'object') {
          const v = attr(el, name === 'iframe' ? 'src' : 'data');
          if (v !== null) {
            const t = isExternalRef(v) ? undefined : resolveRef(path, v);
            const listed = t ? f.types.get(t.path) : undefined;
            let grund: string | undefined;
            if (!t) grund = 'nicht aus dem Container stammt';
            else if (listed === undefined) grund = 'weder in readingOrder noch in resources der Fassung steht';
            else if (listed !== 'application/xhtml+xml' && listed !== 'image/svg+xml') grund = `Media-Type ${listed} hat`;
            if (grund) finding(ctx, 'HPR-NEST-004', { pfad: path, zeile: line(el), element: name, uri: v, grund }, at(el), f);
          }
        }
      }
      if (name === 'svg' && el.namespaceURI === NS.svg && !hasAncestor(el, (a) => a.namespaceURI === NS.svg)) checkSvgName(ctx, f, path, el);
      if (name === 'math' && el.namespaceURI === NS.mathml) {
        const hasAnnotation = elements(el).some((e) => localName(e) === 'annotation' || localName(e) === 'annotation-xml');
        if (!el.hasAttribute('alttext') && !hasAnnotation) finding(ctx, 'HPR-INH-023', { pfad: path, zeile: line(el) }, at(el), f);
      }
    }
    if (h1 !== 1) finding(ctx, 'HPR-INH-010', { pfad: path, zeile: '', grund: `${h1} Überschriften h1` }, loc.xml(path), f);

    checkHiddenContent(ctx, f, doc);
    checkPositioning(ctx, f, doc);
    checkLinks(ctx, f, doc, ids);
    checkOverview(ctx, f, doc);
  }
  for (const doc of f.svgs.values()) {
    const root = doc.root;
    if (localName(root) === 'svg' && root.namespaceURI === NS.svg) checkSvgName(ctx, f, doc.path, root);
  }
}

function checkSvgName(ctx: Ctx, f: Fassung, path: string, svg: XmlElement): void {
  if (attr(svg, 'aria-hidden') === 'true') return;
  const graphic = new Set(['text', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image', 'use', 'g']);
  if (!elements(svg).some((e) => graphic.has(localName(e)))) return;
  const role = attr(svg, 'role');
  const label = attr(svg, 'aria-label');
  const labelledby = attr(svg, 'aria-labelledby');
  let named = !!label && label.trim() !== '';
  if (!named && labelledby) {
    const titles = elements(svg).filter((e) => localName(e) === 'title' && labelledby.split(/\s+/).includes(attr(e, 'id') ?? ''));
    named = titles.some((t) => text(t).trim() !== '');
  }
  if (role !== 'img' || !named) finding(ctx, 'HPR-INH-009', { pfad: path, zeile: lineOf(svg) ?? '' }, loc.xml(path, lineOf(svg)), f);
}

function rows(table: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (const c of children(table)) {
    if (isHtml(c, 'tr')) out.push(c);
    else if (isHtml(c, 'thead', 'tbody', 'tfoot')) out.push(...children(c).filter((x) => isHtml(x, 'tr')));
  }
  return out;
}

/** Cell grid of a table (HPF-ADR-002): rows over thead/tbody/tfoot, spans keep the top-left position. */
export function tableGrid(table: XmlElement): { grid: Array<Array<XmlElement | null>>; rowWidths: number[] } {
  const grid: Array<Array<XmlElement | null>> = [];
  const rowWidths: number[] = [];
  rows(table).forEach((tr, ri) => {
    grid[ri] ??= [];
    let col = 0;
    let width = 0;
    for (const cell of children(tr).filter((c) => isHtml(c, 'td', 'th'))) {
      while (grid[ri]![col] !== undefined) col++;
      const cs = Math.max(1, Number.parseInt(attr(cell, 'colspan') ?? '1', 10) || 1);
      const rs = Math.max(1, Number.parseInt(attr(cell, 'rowspan') ?? '1', 10) || 1);
      for (let dr = 0; dr < rs; dr++) {
        grid[ri + dr] ??= [];
        for (let dc = 0; dc < cs; dc++) grid[ri + dr]![col + dc] = dr === 0 && dc === 0 ? cell : null;
      }
      col += cs;
    }
    width = grid[ri]!.length;
    rowWidths[ri] = width;
  });
  for (let i = 0; i < grid.length; i++) rowWidths[i] = grid[i]!.length;
  return { grid, rowWidths };
}

function checkTable(ctx: Ctx, f: Fassung, path: string, table: XmlElement): void {
  const trs = rows(table);
  if (trs.length <= 1) return;
  const id = attr(table, 'id') ?? '(ohne id)';
  const at = loc.xml(path, lineOf(table));
  const cells = elements(table).filter((e) => isHtml(e, 'td', 'th'));
  const hasHeaders = cells.some((c) => (isHtml(c, 'th') && c.hasAttribute('scope')) || c.hasAttribute('headers'));
  const caption = children(table).find((c) => isHtml(c, 'caption'));
  const missing = [!hasHeaders ? 'Kopfzellen (th mit scope oder headers)' : '', !caption || text(caption).trim() === '' ? 'caption' : ''].filter(Boolean);
  if (missing.length) finding(ctx, 'HPR-INH-011', { pfad: path, zeile: lineOf(table) ?? '', kennung: id, grund: missing.join(' und ') }, at, f);
  const strategy = attr(table, 'data-hp-table');
  let grund: string | undefined;
  if (strategy === null) grund = 'data-hp-table fehlt';
  else if (!['scroll', 'stack', 'priority'].includes(strategy)) grund = `data-hp-table="${strategy}" ist unbekannt`;
  else if (strategy === 'priority' && !elements(table).some((e) => isHtml(e, 'th', 'col') && e.hasAttribute('data-hp-priority'))) grund = 'priority ohne Spalte mit data-hp-priority';
  if (grund) finding(ctx, 'HPR-INH-014', { pfad: path, zeile: lineOf(table) ?? '', kennung: id, grund }, at, f);
}

function describedByText(el: XmlElement, ids: Map<string, XmlElement>): boolean {
  const ref = attr(el, 'aria-describedby');
  return !!ref && ref.split(/\s+/).some((id) => (ids.get(id) ? text(ids.get(id)!).trim() !== '' : false));
}

function figcaptionText(el: XmlElement): boolean {
  const figure = ancestors(el).find((a) => isHtml(a, 'figure'));
  return !!figure && children(figure).some((c) => isHtml(c, 'figcaption') && text(c).trim() !== '');
}

function checkVideo(ctx: Ctx, f: Fassung, doc: MarkupDoc, el: XmlElement, ids: Map<string, XmlElement>): void {
  const problems: string[] = [];
  const poster = attr(el, 'poster');
  const target = poster && !isExternalRef(poster) ? resolveRef(doc.path, poster) : undefined;
  if (!poster) problems.push('poster');
  else if (!target || !ctx.files.has(target.path)) problems.push('poster aus dem Container');
  if (!figcaptionText(el) && !describedByText(el, ids)) problems.push('Textbeschreibung');
  if (problems.length) finding(ctx, 'HPR-INH-018', { pfad: doc.path, zeile: lineOf(el) ?? '', grund: problems.join(' und ') }, loc.xml(doc.path, lineOf(el)), f);
}

function checkAudio(ctx: Ctx, f: Fassung, doc: MarkupDoc, el: XmlElement, ids: Map<string, XmlElement>): void {
  if (figcaptionText(el) || describedByText(el, ids)) return;
  const figure = ancestors(el).find((a) => isHtml(a, 'figure'));
  const inContainer = (v: string | null) => {
    if (!v || isExternalRef(v)) return false;
    const t = resolveRef(doc.path, v);
    return !!t && (t.path === doc.path || ctx.files.has(t.path));
  };
  if (figure && elements(figure).some((a) => isHtml(a, 'a') && inContainer(attr(a, 'href')))) return;
  if (children(el).some((t) => isHtml(t, 'track') && ['descriptions', 'captions'].includes(attr(t, 'kind') ?? '') && inContainer(attr(t, 'src')))) return;
  finding(ctx, 'HPR-INH-019', { pfad: doc.path, zeile: lineOf(el) ?? '' }, loc.xml(doc.path, lineOf(el)), f);
}

/** HPR-NEST-001: hidden content outside `details`. */
function checkHiddenContent(ctx: Ctx, f: Fassung, doc: MarkupDoc): void {
  const body = elements(doc.doc).find((e) => isHtml(e, 'body'));
  if (!body) return;
  for (const el of elements(body)) {
    if (el.namespaceURI !== NS.xhtml) continue;
    if (text(el).trim() === '') continue;
    let grund: string | undefined;
    if (el.hasAttribute('hidden')) grund = 'Attribut hidden';
    else {
      const d = decl(computedDeclarations(f, doc.path, el), 'display');
      if (d && /^none\b/i.test(d.value)) grund = 'display: none';
    }
    if (!grund) continue;
    if (el.hasAttribute('data-hp-priority') || el.hasAttribute('data-hp-redacted')) continue;
    if (hasAncestor(el, (a) => isHtml(a, 'details', 'template', 'dialog')) || isHtml(el, 'template', 'dialog')) continue;
    // only the outermost hidden element is reported
    if (hasAncestor(el, (a) => a.namespaceURI === NS.xhtml && (a.hasAttribute('hidden') || /^none\b/i.test(decl(computedDeclarations(f, doc.path, a), 'display')?.value ?? '')))) continue;
    finding(ctx, 'HPR-NEST-001', { pfad: doc.path, zeile: lineOf(el) ?? '', element: localName(el), grund }, loc.xml(doc.path, lineOf(el)), f);
  }
}

/** HPR-INH-015 (positioned text inside flow text). */
function checkPositioning(ctx: Ctx, f: Fassung, doc: MarkupDoc): void {
  const flow = (a: XmlElement) => isHtml(a, 'p', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6');
  for (const el of elements(doc.doc)) {
    if (el.namespaceURI !== NS.xhtml || !hasAncestor(el, flow)) continue;
    const pos = decl(computedDeclarations(f, doc.path, el), 'position');
    if (pos && /^(absolute|fixed)\b/i.test(pos.value)) {
      finding(ctx, 'HPR-INH-015', { pfad: doc.path, zeile: lineOf(el) ?? '', grund: `${localName(el)} mit position: ${pos.value} innerhalb von Fließtext` }, loc.xml(doc.path, lineOf(el)), f);
    }
  }
}

/** Cell of a table address `<table>.<Col><Row>` in a document, or a reason. */
export function cellAt(doc: MarkupDoc, fragment: string): { cell: XmlElement | null } | { missing: string } | undefined {
  const m = /^(.+)\.([A-Z]{1,3})([1-9]\d*)$/.exec(fragment);
  if (!m) return undefined;
  const table = elements(doc.doc).find((e) => isHtml(e, 'table') && attr(e, 'id') === m[1]);
  if (!table) return { missing: `Tabelle ${m[1]} fehlt` };
  let col = 0;
  for (const ch of m[2]!) col = col * 26 + (ch.charCodeAt(0) - 64);
  const { grid } = tableGrid(table);
  const cell = grid[Number(m[3]) - 1]?.[col - 1];
  return { cell: cell ?? null };
}

/** HPR-ADR-006 and HPR-ADR-007. */
function checkLinks(ctx: Ctx, f: Fassung, doc: MarkupDoc, ids: Map<string, XmlElement>): void {
  for (const a of elements(doc.doc)) {
    if (!isHtml(a, 'a', 'area')) continue;
    const href = attr(a, 'href');
    if (href === null || isExternalRef(href)) continue;
    const t = resolveRef(doc.path, href);
    const at = loc.xml(doc.path, lineOf(a));
    if (!t) {
      finding(ctx, 'HPR-ADR-006', { pfad: doc.path, zeile: lineOf(a) ?? '', uri: href }, at, f);
      continue;
    }
    const targetDoc = t.path === doc.path ? doc : f.docs.get(t.path);
    let ok = ctx.files.has(t.path);
    let cell: ReturnType<typeof cellAt>;
    if (ok && t.fragment) {
      const targetIds = targetDoc === doc ? ids : targetDoc ? new Map(elements(targetDoc.doc).filter((e) => attr(e, 'id') !== null).map((e) => [attr(e, 'id')!, e])) : undefined;
      cell = targetDoc ? cellAt(targetDoc, t.fragment) : undefined;
      ok = !!targetIds?.has(t.fragment) || (!!cell && 'cell' in cell);
    }
    if (!ok) finding(ctx, 'HPR-ADR-006', { pfad: doc.path, zeile: lineOf(a) ?? '', uri: href }, at, f);
    if (attr(a, 'data-hp-ref') === 'value') {
      const c = targetDoc && t.fragment ? (cell ?? cellAt(targetDoc, t.fragment)) : undefined;
      const hasValue = !!c && 'cell' in c && !!c.cell && (c.cell.hasAttribute('data-hp-value') || text(c.cell).trim() !== '');
      if (!hasValue) finding(ctx, 'HPR-ADR-007', { pfad: doc.path, zeile: lineOf(a) ?? '', uri: href }, at, f);
    }
  }
}

/** HPR-NEST-005: long documents need an overview. */
function checkOverview(ctx: Ctx, f: Fassung, doc: MarkupDoc): void {
  const body = elements(doc.doc).find((e) => isHtml(e, 'body'));
  if (!body) return;
  const words = text(body).split(/\s+/).filter(Boolean).length;
  if (words <= 2000) return;
  const summary = elements(body).some((e) => isHtml(e, 'section') && attr(e, 'data-hp-role') === 'summary' && !hasAncestor(e, (a) => isHtml(a, 'details')));
  if (!summary) finding(ctx, 'HPR-NEST-005', { pfad: doc.path, anzahl: words }, loc.xml(doc.path), f);
}

/** Navigation document of a version: from package.opf for the main version, else the first XHTML with a toc nav. */
export function findToc(f: Fassung): { doc: MarkupDoc; nav: XmlElement } | undefined {
  const isToc = (e: XmlElement) => isHtml(e, 'nav') && (e.getAttributeNS(NS.epub, 'type') ?? '').split(/\s+/).includes('toc');
  const candidates = f.navPath && f.docs.get(f.navPath) ? [f.docs.get(f.navPath)!] : [...f.docs.values()];
  for (const doc of candidates) {
    const nav = elements(doc.doc).find(isToc);
    if (nav) return { doc, nav };
  }
  return undefined;
}

/** HPR-ADR-004 and HPR-ADR-005. */
export function checkToc(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-ADR-004', 'HPR-ADR-005');
  const toc = findToc(f);
  const targets = new Set<string>();
  if (toc) {
    for (const a of elements(toc.nav).filter((e) => isHtml(e, 'a'))) {
      const href = attr(a, 'href') ?? '';
      const t = isExternalRef(href) ? undefined : resolveRef(toc.doc.path, href);
      const target = t ? f.docs.get(t.path) : undefined;
      const exists = !!t && ctx.files.has(t.path) && (!t.fragment || (!!target && elements(target.doc).some((e) => attr(e, 'id') === t.fragment)));
      if (!exists) finding(ctx, 'HPR-ADR-004', { pfad: toc.doc.path, zeile: lineOf(a) ?? '', uri: href }, loc.xml(toc.doc.path, lineOf(a)), f);
      if (t) targets.add(`${t.path}#${t.fragment}`);
    }
  }
  for (const path of f.readingOrder) {
    const doc = f.docs.get(path);
    if (!doc) continue;
    for (const el of elements(doc.doc)) {
      if (!isHtml(el, 'section', 'article') || hasAncestor(el, (a) => isHtml(a, 'section', 'article'))) continue;
      const id = attr(el, 'id');
      if (!id || !targets.has(`${path}#${id}`)) finding(ctx, 'HPR-ADR-005', { pfad: path, zeile: lineOf(el) ?? '', kennung: id ?? '(ohne id)' }, loc.xml(path, lineOf(el)), f);
    }
  }
}

/** CSS rules of a version: INH-005, -007, -012, -013, -021, -024. */
export function checkStyles(ctx: Ctx, f: Fassung): void {
  const r = ctx.report;
  r.ran('HPR-INH-005', 'HPR-INH-007', 'HPR-INH-012', 'HPR-INH-013', 'HPR-INH-021', 'HPR-INH-024');
  const cssLoc = (path: string, line?: number, selector?: string) => loc.css(path, line, selector);
  const reduceBlocks: Array<{ rule: CssRule; source: StyleSource }> = [];
  const animated: Array<{ rule: CssRule; source: StyleSource; d: CssDeclaration }> = [];
  let keyframes: { path: string; line: number } | undefined;
  for (const s of f.styles) {
    if (s.sheet.keyframes.length > 0 && !keyframes) keyframes = { path: s.path, line: s.sheet.keyframes[0]!.line };
    for (const rule of s.sheet.rules) {
      const inReduce = rule.media.some((m) => /prefers-reduced-motion\s*:\s*reduce/i.test(m));
      if (inReduce) reduceBlocks.push({ rule, source: s });
      if (rule.context === 'style') {
        const rootLike = splitSelectors(rule.selector).some((sel) => [':root', 'html', '*'].includes(sel.trim()));
        for (const d of rule.declarations) {
          if (rootLike && HP_VARIABLES.has(d.property)) finding(ctx, 'HPR-INH-005', { pfad: s.path, zeile: d.line, name: d.property, wert: d.value }, cssLoc(s.path, d.line, rule.selector), f);
          checkOrderDeclaration(ctx, f, s.path, d);
          if (d.property === 'font-family') checkFontFamily(ctx, f, s.path, d);
          if (!inReduce && (d.property === 'animation' || d.property === 'animation-name') && !/^none\b/i.test(d.value)) animated.push({ rule, source: s, d });
        }
      }
      if (rule.context === 'font-face') {
        const src = decl(rule.declarations, 'src');
        const family = decl(rule.declarations, 'font-family')?.value.replace(/^["']|["']$/g, '') ?? '?';
        for (const m of (src?.value ?? '').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
          const t = isExternalRef(m[1]!) ? undefined : resolveRef(s.path, m[1]!);
          const type = t ? (f.types.get(t.path) ?? typeOf(f, t.path) ?? 'unbekannt') : 'externe Quelle';
          if (type !== 'font/woff2') finding(ctx, 'HPR-INH-012', { pfad: s.path, zeile: src!.line, name: family, typ: type }, cssLoc(s.path, src!.line), f);
        }
      }
    }
  }
  for (const a of f.styleAttributes) {
    for (const d of a.declarations) {
      if (isHtml(a.element, 'html') && HP_VARIABLES.has(d.property)) finding(ctx, 'HPR-INH-005', { pfad: a.path, zeile: a.line ?? '', name: d.property, wert: d.value }, loc.xml(a.path, a.line), f);
      checkOrderDeclaration(ctx, f, a.path, d, a.line);
      if (d.property === 'font-family') checkFontFamily(ctx, f, a.path, d, a.line);
      if ((d.property === 'animation' || d.property === 'animation-name') && !/^none\b/i.test(d.value)) {
        finding(ctx, 'HPR-INH-021', { pfad: a.path, zeile: a.line ?? '', grund: `style-Attribut setzt ${d.property}: ${d.value}, das ein Block für reduzierte Bewegung nicht erreichen kann` }, loc.xml(a.path, a.line), f);
      }
    }
  }

  // INH-021: every animated rule needs a stop rule in a reduce block (same selector or universal).
  const stops = reduceBlocks.filter(({ rule }) => rule.declarations.some((d) => (d.property === 'animation' && /^none\b/i.test(d.value)) || (d.property === 'animation-name' && /^none\b/i.test(d.value)) || (d.property === 'animation-play-state' && /paused/i.test(d.value))));
  const stopSelectors = new Set(stops.flatMap(({ rule }) => splitSelectors(rule.selector).map((s) => s.trim())));
  const universal = [...stopSelectors].some((s) => s === '*' || s.startsWith('*,') || s === '*::before' || s === 'html *' || s === 'body *');
  for (const { rule, source, d } of animated) {
    const missing = splitSelectors(rule.selector).filter((s) => !stopSelectors.has(s.trim()));
    if (missing.length > 0 && !universal) finding(ctx, 'HPR-INH-021', { pfad: source.path, zeile: d.line, grund: `${d.property}: ${d.value} für „${missing.join(', ')}“ ohne Gegenregel in @media (prefers-reduced-motion: reduce)` }, cssLoc(source.path, d.line, rule.selector), f);
  }
  if (keyframes && animated.length === 0 && stops.length === 0 && reduceBlocks.length === 0) {
    finding(ctx, 'HPR-INH-021', { pfad: keyframes.path, zeile: keyframes.line, grund: '@keyframes ohne Block @media (prefers-reduced-motion: reduce)' }, cssLoc(keyframes.path, keyframes.line), f);
  }
  for (const doc of [...f.docs.values(), ...f.svgs.values()]) {
    for (const el of elements(doc.doc)) {
      if (el.namespaceURI !== NS.svg || !SMIL.has(localName(el))) continue;
      if (attr(el, 'begin') === 'indefinite') continue;
      const hiddenByReduce = reduceBlocks.some(({ rule }) => rule.context === 'style' && rule.declarations.some((d) => d.property === 'display' && /^none\b/i.test(d.value)) && [el, ...ancestors(el)].some((a) => matches(a, rule.selector)));
      if (!hiddenByReduce) finding(ctx, 'HPR-INH-021', { pfad: doc.path, zeile: lineOf(el) ?? '', grund: `SMIL-Element ${localName(el)} ohne begin="indefinite" und ohne Ausblendung bei reduzierter Bewegung` }, loc.xml(doc.path, lineOf(el)), f);
    }
  }

  // INH-024: break rules for figure, table, pre (inside) and h1–h6 (after).
  const hasRule = (element: string, props: string[]) =>
    f.styles.some((s) => s.sheet.rules.some((rule) => rule.context === 'style' && splitSelectors(rule.selector).some((sel) => subjectElement(sel) === element) && rule.declarations.some((d) => props.includes(d.property) && /^avoid\b/i.test(d.value))));
  const where = f.styles.find((s) => typeOf(f, s.path) === 'text/css')?.path ?? f.styles[0]?.path ?? f.readingOrder[0] ?? f.manifestPath;
  for (const el of ['figure', 'table', 'pre']) if (!hasRule(el, ['break-inside', 'page-break-inside'])) finding(ctx, 'HPR-INH-024', { pfad: where, wert: 'break-inside: avoid', element: el }, cssLoc(where), f);
  for (const el of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) if (!hasRule(el, ['break-after', 'page-break-after'])) finding(ctx, 'HPR-INH-024', { pfad: where, wert: 'break-after: avoid', element: el }, cssLoc(where), f);
}

function checkOrderDeclaration(ctx: Ctx, f: Fassung, path: string, d: CssDeclaration, line = d.line): void {
  const v = d.value.trim().toLowerCase();
  const hit =
    (d.property === 'order' && !CSS_WIDE.has(v) && v !== '0') ||
    (d.property === 'flex-direction' && /(row|column)-reverse/.test(v)) ||
    (d.property === 'flex-flow' && /(row|column)-reverse/.test(v)) ||
    (['grid-row', 'grid-column', 'grid-area', 'grid-row-start', 'grid-column-start'].includes(d.property) && v !== 'auto' && !CSS_WIDE.has(v));
  if (hit) finding(ctx, 'HPR-INH-007', { pfad: path, zeile: line, name: d.property, wert: d.value }, path.endsWith('.css') ? loc.css(path, line) : loc.xml(path, line), f);
}

function checkFontFamily(ctx: Ctx, f: Fassung, path: string, d: CssDeclaration, line = d.line): void {
  const v = d.value.trim();
  if (CSS_WIDE.has(v.toLowerCase()) || /var\(/i.test(v)) return;
  const last = v.split(',').pop()!.trim().replace(/^["']|["']$/g, '').toLowerCase();
  const quoted = /["']\s*$/.test(v);
  if (quoted || !GENERIC_FAMILIES.has(last)) finding(ctx, 'HPR-INH-013', { pfad: path, zeile: line, wert: v }, path.endsWith('.css') ? loc.css(path, line) : loc.xml(path, line), f);
}
