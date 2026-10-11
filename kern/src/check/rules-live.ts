/**
 * Rules on scripts, components, frozen renditions, locks, print, names and the office minimum
 * profile (part 1: INH-016/017, SBX-004…009/011/013/014/016/017, PROF-003/005/010/011/012/016,
 * LOCK-003/004, PRINT-001…003, VERS-003/005, MIN-002…010, SIG-019).
 */
import { splitSelectors, subjectElement, type CssDeclaration } from './css.js';
import { RFC3339_UTC_RE, X_PREFIX_RE, finding, isExternalRef, isObject, isValidUtc, loc, resolveRef, typeOf, type Ctx, type Fassung, type MarkupDoc } from './context.js';
import { tokenize, type JsToken } from './jslex.js';
import { ancestors, attr, attributes, children, decodeUtf8, elements, hasAncestor, isHtml, lightText, lineOf, localName, NS, text, type XmlElement } from './markup.js';
import { HP_VARIABLES, computedDeclarations, findToc, resourceReferences, tableGrid } from './rules-content.js';
import { redactionTargets } from './rules-manifest.js';

/** `data-hp-*` attributes defined by part 0 and part 3. */
export const DEFINED_DATA_HP: ReadonlySet<string> = new Set([
  'data-hp-table', 'data-hp-priority', 'data-hp-role', 'data-hp-ref', 'data-hp-redacted', 'data-hp-signature-ref', 'data-hp-formula',
  'data-hp-value', 'data-hp-type', 'data-hp-input', 'data-hp-stale', 'data-hp-unit', 'data-hp-check', 'data-hp-check-message',
  'data-hp-style', 'data-hp-style-if', 'data-hp-import', 'data-hp-import-formula', 'data-hp-frozen',
]);
/** Component names of the registry (part 2, `02-registry.json`). */
export const REGISTERED_COMPONENTS: ReadonlySet<string> = new Set(['hp-table', 'hp-form', 'hp-chart', 'hp-calc', 'hp-signature-field']);
const JS_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript']);
const FORBIDDEN_FUNCTIONS = new Set(['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'WEBSERVICE', 'DDE', 'MACRO', 'EXEC', 'CALL', 'REGISTER']);
const COMPONENT_APIS = new Set([
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookie', 'BroadcastChannel', 'SharedWorker', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'EventSource', 'sendBeacon', 'RTCPeerConnection', '__TAURI__', '__TAURI_INTERNALS__', 'ipcRenderer', 'require', 'process', 'eval', 'importScripts', 'Worker',
]);
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);

const scriptUrl = (value: string) => /^javascript:/i.test(value.replace(/[\s\u0000-\u001f]/g, ''));
const isComponentElement = (el: XmlElement) => el.namespaceURI === NS.xhtml && localName(el).includes('-');

/** Script rules for non-interactive versions (INH-016/017) and interactive ones (SBX-004…008). */
export function checkScripts(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-INH-016', 'HPR-INH-017', 'HPR-SBX-004', 'HPR-SBX-005', 'HPR-SBX-006', 'HPR-SBX-007', 'HPR-SBX-008', 'HPR-PROF-003');
  const interactive = f.profile === 'interactive';
  const componentNames = new Set((Array.isArray(f.manifest.components) ? f.manifest.components : []).flatMap((c) => (isObject(c) && typeof c.name === 'string' ? [c.name] : [])));
  const componentUrls = new Set((Array.isArray(f.manifest.components) ? f.manifest.components : []).flatMap((c) => (isObject(c) && typeof c.url === 'string' ? [c.url] : [])));
  for (const doc of [...f.docs.values(), ...f.svgs.values()]) {
    const p = doc.path;
    for (const el of elements(doc.doc)) {
      const name = localName(el);
      const at = loc.xml(p, lineOf(el));
      const line = lineOf(el) ?? '';
      const smilHref = (name === 'set' || name === 'animate') && el.namespaceURI === NS.svg && /^(xlink:)?href$/i.test(attr(el, 'attributeName') ?? '');
      if (!interactive) {
        if (name === 'script') finding(ctx, 'HPR-INH-016', { pfad: p, zeile: line, profil: f.profile }, at, f);
        if (smilHref) finding(ctx, 'HPR-INH-017', { pfad: p, zeile: line, element: name, attribut: 'attributeName', grund: 'SMIL-Animation setzt href', profil: f.profile }, at, f);
      } else {
        if (name === 'script') {
          const src = attr(el, 'src');
          const type = (attr(el, 'type') ?? '').trim().toLowerCase();
          if (el.namespaceURI === NS.svg || doc.kind === 'svg') finding(ctx, 'HPR-SBX-007', { pfad: p, zeile: line, element: 'script' }, at, f);
          else if (src === null || text(el).trim() !== '' || !JS_TYPES.has(type)) finding(ctx, 'HPR-SBX-004', { pfad: p, zeile: line }, at, f);
          if (src !== null) {
            const t = isExternalRef(src) ? undefined : resolveRef(p, src);
            if (!t || !componentUrls.has(t.path)) finding(ctx, 'HPR-PROF-003', { pfad: p, zeile: line, uri: src }, at, f);
          }
        }
        if (smilHref) finding(ctx, 'HPR-SBX-007', { pfad: p, zeile: line, element: name }, at, f);
        if (isComponentElement(el) && !componentNames.has(name)) finding(ctx, 'HPR-SBX-008', { pfad: p, zeile: line, element: name }, at, f);
      }
      for (const a of attributes(el)) {
        if (a.namespace === null && /^on/i.test(a.localName)) {
          if (interactive) finding(ctx, 'HPR-SBX-005', { pfad: p, zeile: line, attribut: a.name }, at, f);
          else finding(ctx, 'HPR-INH-017', { pfad: p, zeile: line, element: name, attribut: a.name, grund: 'Ereignisattribut', profil: f.profile }, at, f);
        }
        const compact = a.value.replace(/[\s\u0000-\u001f]/g, '');
        if (scriptUrl(a.value) || (interactive && /^data:text\/html/i.test(compact))) {
          if (interactive) finding(ctx, 'HPR-SBX-006', { pfad: p, zeile: line, element: name, attribut: a.name }, at, f);
          else finding(ctx, 'HPR-INH-017', { pfad: p, zeile: line, element: name, attribut: a.name, grund: 'javascript:-URL', profil: f.profile }, at, f);
        }
      }
    }
  }
}

/** SBX-009, SBX-011, SBX-013, SBX-014 (markup of every version). */
export function checkInteractiveMarkup(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-SBX-009', 'HPR-SBX-011', 'HPR-SBX-013', 'HPR-SBX-014');
  const supported = ctx.options.supportedFunctions ? new Set(ctx.options.supportedFunctions.map((n) => n.toUpperCase())) : undefined;
  for (const doc of f.docs.values()) {
    const p = doc.path;
    for (const el of elements(doc.doc)) {
      const at = loc.xml(p, lineOf(el));
      const line = lineOf(el) ?? '';
      if (f.profile === 'interactive' && isComponentElement(el)) {
        const insideTemplate = (e: XmlElement) => {
          for (let q = e.parentNode; q && (q as unknown) !== el; q = q.parentNode) if (q.nodeType === 1 && localName(q as unknown as XmlElement) === 'template') return true;
          return false;
        };
        const hasImg = elements(el).some((e) => isHtml(e, 'img') && !insideTemplate(e));
        if (lightText(el).trim() === '' && !hasImg) finding(ctx, 'HPR-SBX-009', { pfad: p, zeile: line, element: localName(el), kennung: attr(el, 'id') ?? '(ohne id)' }, at, f);
      }
      if (isHtml(el, 'form')) {
        const action = attr(el, 'action');
        if (action !== null && action.trim() !== '' && action.trim() !== '#') finding(ctx, 'HPR-SBX-011', { pfad: p, zeile: line, uri: action }, at, f);
      }
      if (isHtml(el, 'button', 'input') && el.hasAttribute('formaction')) finding(ctx, 'HPR-SBX-011', { pfad: p, zeile: line, uri: attr(el, 'formaction') ?? '' }, at, f);
      if (isHtml(el, 'td', 'th') && el.hasAttribute('data-hp-formula')) {
        const id = attr(el, 'id') ?? cellName(el);
        if (!el.hasAttribute('data-hp-value') || text(el).trim() === '') finding(ctx, 'HPR-SBX-013', { pfad: p, zeile: line, kennung: id }, at, f);
        for (const fn of formulaFunctions(attr(el, 'data-hp-formula') ?? '')) {
          const upper = fn.name.toUpperCase();
          const forbidden = FORBIDDEN_FUNCTIONS.has(upper) || (upper === 'HYPERLINK' && fn.firstArg !== undefined && isExternalRef(fn.firstArg)) || (supported !== undefined && !supported.has(upper) && upper !== 'HYPERLINK');
          if (forbidden) finding(ctx, 'HPR-SBX-014', { pfad: p, zeile: line, kennung: id, name: fn.name }, at, f);
        }
      }
    }
  }
}

/** Position of a cell as `<table>.<Col><Row>` for messages. */
function cellName(cell: XmlElement): string {
  const table = ancestors(cell).find((a) => isHtml(a, 'table'));
  if (!table) return '(Zelle)';
  const { grid } = tableGrid(table);
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r]!.indexOf(cell);
    if (c >= 0) {
      let col = '';
      for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
      return `${attr(table, 'id') ?? '?'}.${col}${r + 1}`;
    }
  }
  return '(Zelle)';
}

/** Function calls in an OpenFormula expression (names followed by `(`), outside string literals. */
export function formulaFunctions(formula: string): Array<{ name: string; firstArg?: string }> {
  const out: Array<{ name: string; firstArg?: string }> = [];
  const strings: string[] = [];
  const masked = formula.replace(/"((?:[^"]|"")*)"/g, (_m, s: string) => {
    strings.push(s.replace(/""/g, '"'));
    return `"\u0000${strings.length - 1}\u0000"`;
  });
  const noRefs = masked.replace(/\[[^\]]*\]/g, '[]');
  for (const m of noRefs.matchAll(/([A-Za-z_][A-Za-z0-9._]*)\s*\(/g)) {
    const after = noRefs.slice((m.index ?? 0) + m[0].length);
    const arg = /^\s*"\u0000(\d+)\u0000"/.exec(after);
    out.push({ name: m[1]!, ...(arg ? { firstArg: strings[Number(arg[1])]! } : {}) });
  }
  return out;
}

/** SBX-016 and SBX-017: static pre-filter over component scripts. */
export function checkComponentScripts(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-SBX-016', 'HPR-SBX-017');
  const comps = (Array.isArray(f.manifest.components) ? f.manifest.components : []).flatMap((c) => (isObject(c) && typeof c.url === 'string' ? [{ name: String(c.name ?? '?'), version: String(c.version ?? '?'), url: c.url }] : []));
  const urls = new Set(comps.map((c) => c.url));
  for (const c of comps) {
    const bytes = ctx.files.get(c.url);
    if (!bytes) continue;
    const src = decodeUtf8(bytes) ?? new TextDecoder().decode(bytes);
    const toks = tokenize(src);
    const at = (t: JsToken) => loc.xml(c.url, t.line);
    const prevIdent = (i: number) => (toks[i - 1]?.value === '.' || toks[i - 1]?.value === '?.' ? toks[i - 2] : undefined);
    toks.forEach((t, i) => {
      if (t.type !== 'ident') return;
      const next = toks[i + 1];
      const owner = prevIdent(i);
      let hit: string | undefined;
      if (COMPONENT_APIS.has(t.value)) hit = t.value;
      else if (t.value === 'Function' && (next?.value === '(' || toks[i - 1]?.value === 'new')) hit = 'Function';
      else if (['open', 'top', 'parent', 'opener'].includes(t.value) && owner?.type === 'ident' && GLOBAL_OBJECTS.has(owner.value)) hit = `${owner.value}.${t.value}`;
      if (hit) finding(ctx, 'HPR-SBX-016', { pfad: c.url, zeile: t.line, name: c.name, version: c.version, wert: hit }, at(t), f);

      const sbx17 = (uri: string) => finding(ctx, 'HPR-SBX-017', { pfad: c.url, zeile: t.line, name: c.name, version: c.version, uri }, at(t), f);
      if ((t.value === 'import' || t.value === 'export') && toks[i - 1]?.value !== '.') {
        if (t.value === 'import' && next?.value === '(') {
          const arg = toks[i + 2];
          if (arg && (arg.type === 'string' || (arg.type === 'template' && toks[i + 3]?.value === ')')) && toks[i + 3]?.value === ')') {
            const target = resolveRef(c.url, arg.value);
            if (!target || !urls.has(target.path)) sbx17(arg.value);
          } else sbx17('(nicht literales Ziel)');
        } else if (t.value === 'import' && next?.type === 'string') {
          const target = resolveRef(c.url, next.value);
          if (!/^\.{0,2}\//.test(next.value) || !target || !urls.has(target.path)) sbx17(next.value);
        } else if (next?.value !== '.' && next?.value !== '(') {
          // import … from 'x' / export … from 'x': find `from` before the statement ends
          for (let k = i + 1; k < toks.length && k < i + 200; k++) {
            if (toks[k]!.value === ';' || (toks[k]!.type === 'ident' && ['import', 'export', 'const', 'let', 'var', 'function', 'class'].includes(toks[k]!.value) && k > i + 1 && toks[k - 1]!.value !== ',')) break;
            if (toks[k]!.type === 'ident' && toks[k]!.value === 'from' && toks[k + 1]?.type === 'string') {
              const spec = toks[k + 1]!.value;
              const target = resolveRef(c.url, spec);
              if (!/^\.{0,2}\//.test(spec) || !target || !urls.has(target.path)) sbx17(spec);
              break;
            }
          }
        }
      }
      if (t.value === 'Worker' && toks[i - 1]?.value === 'new') sbx17('new Worker(…)');
      if (t.value === 'importScripts' && next?.value === '(') sbx17('importScripts(…)');
      if (t.value === 'createElement' && next?.value === '(' && toks[i + 2]?.type === 'string' && toks[i + 2]!.value.toLowerCase() === 'script') sbx17('createElement("script")');
    });
  }
}

/** PROF-003 is in checkScripts; PROF-005 (archive fonts), PROF-010/011/012 (frozen), PROF-016 (signature notice). */
export function checkRenditionContent(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-PROF-005', 'HPR-PROF-010', 'HPR-PROF-011', 'HPR-PROF-012', 'HPR-PROF-016');
  if (f.profile === 'archive') {
    const declared = new Set<string>();
    for (const s of f.styles) {
      for (const r of s.sheet.rules) {
        if (r.context !== 'font-face') continue;
        const fam = r.declarations.find((d) => d.property === 'font-family')?.value.replace(/^["']|["']$/g, '').trim().toLowerCase();
        const src = r.declarations.find((d) => d.property === 'src')?.value ?? '';
        const inside = [...src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].some((m) => !isExternalRef(m[1]!) && ctx.files.has(resolveRef(s.path, m[1]!)?.path ?? ''));
        if (fam && inside) declared.add(fam);
      }
    }
    const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'inherit', 'initial', 'unset', 'revert']);
    const check = (path: string, d: CssDeclaration, line: number | undefined) => {
      for (const raw of d.value.split(',')) {
        const fam = raw.trim().replace(/^["']|["']$/g, '').trim();
        if (fam === '' || generic.has(fam.toLowerCase()) || /var\(/.test(fam)) continue;
        if (!declared.has(fam.toLowerCase())) finding(ctx, 'HPR-PROF-005', { pfad: path, zeile: line ?? '', name: fam }, path.endsWith('.css') ? loc.css(path, line) : loc.xml(path, line), f);
      }
    };
    for (const s of f.styles) for (const r of s.sheet.rules) if (r.context === 'style') for (const d of r.declarations) if (d.property === 'font-family') check(s.path, d, d.line);
    for (const a of f.styleAttributes) for (const d of a.declarations) if (d.property === 'font-family') check(a.path, d, a.line);
  }

  if (f.id !== null) {
    // PROF-010: self-contained
    for (const r of resourceReferences(f)) {
      const v = r.value.trim();
      if (v === '' || v.startsWith('#') || /^data:/i.test(v) || isExternalRef(v)) continue;
      const t = resolveRef(r.path, v);
      if (t && !t.path.startsWith(f.prefix)) finding(ctx, 'HPR-PROF-010', { pfad: r.path, zeile: r.line ?? '', uri: v, fassung: f.id }, r.kind === 'css' ? loc.css(r.path, r.line) : loc.xml(r.path, r.line), f);
    }
    for (const doc of f.docs.values()) {
      for (const a of elements(doc.doc).filter((e) => isHtml(e, 'a', 'area'))) {
        const href = attr(a, 'href');
        if (href === null || isExternalRef(href) || href.startsWith('#')) continue;
        const t = resolveRef(doc.path, href);
        if (t && !t.path.startsWith(f.prefix)) finding(ctx, 'HPR-PROF-010', { pfad: doc.path, zeile: lineOf(a) ?? '', uri: href, fassung: f.id }, loc.xml(doc.path, lineOf(a)), f);
      }
    }
    // PROF-011: no live content left
    if (f.profile === 'interactive') finding(ctx, 'HPR-PROF-011', { pfad: f.manifestPath, zeile: '', grund: 'Profil interactive', fassung: f.id }, loc.manifest(f.manifestPath, '/conformsTo'), f);
    for (const p of f.paths) if (p.startsWith(`${f.prefix}components/`)) finding(ctx, 'HPR-PROF-011', { pfad: p, zeile: '', grund: 'Datei unter components/', fassung: f.id }, loc.entry(p), f);
    for (const doc of [...f.docs.values(), ...f.svgs.values()]) {
      for (const el of elements(doc.doc)) {
        const problems: string[] = [];
        if (localName(el) === 'script') problems.push('script-Element');
        if (isComponentElement(el)) problems.push(`Komponenten-Element ${localName(el)}`);
        for (const a of attributes(el)) {
          if (a.namespace === null && /^on/i.test(a.localName)) problems.push(`Ereignisattribut ${a.name}`);
          if (scriptUrl(a.value)) problems.push(`javascript:-URL in ${a.name}`);
        }
        for (const g of problems) finding(ctx, 'HPR-PROF-011', { pfad: doc.path, zeile: lineOf(el) ?? '', grund: g, fassung: f.id }, loc.xml(doc.path, lineOf(el)), f);
      }
    }
    // PROF-012: formulas carry values; manifest names computedAt and calculator
    let formulas = 0;
    for (const doc of f.docs.values()) {
      for (const el of elements(doc.doc)) {
        if (!isHtml(el, 'td', 'th') || !el.hasAttribute('data-hp-formula')) continue;
        formulas++;
        if (!el.hasAttribute('data-hp-value') || text(el).trim() === '') finding(ctx, 'HPR-PROF-012', { pfad: `${doc.path}:${lineOf(el) ?? ''}`, grund: `Zelle ${cellName(el)} ohne gespeicherten Wert`, fassung: f.id }, loc.xml(doc.path, lineOf(el)), f);
      }
    }
    if (formulas > 0) {
      const m = f.manifest;
      if (!isValidUtc(m.computedAt, RFC3339_UTC_RE)) finding(ctx, 'HPR-PROF-012', { pfad: f.manifestPath, grund: 'computedAt fehlt oder ist kein RFC-3339-Zeitpunkt in UTC', fassung: f.id }, loc.manifest(f.manifestPath, '/computedAt'), f);
      if (!isObject(m.calculator) || typeof m.calculator.name !== 'string' || typeof m.calculator.version !== 'string') finding(ctx, 'HPR-PROF-012', { pfad: f.manifestPath, grund: 'calculator { name, version } fehlt', fassung: f.id }, loc.manifest(f.manifestPath, '/calculator'), f);
    }
  }

  // PROF-016: signature notice in the first document of a signed version
  if (ctx.signatures.some((s) => s.fassung === f.id)) {
    const first = f.readingOrder[0];
    const doc = first ? f.docs.get(first) : undefined;
    const notice = doc && elements(doc.doc).some((e) => attr(e, 'data-hp-role') === 'signature-notice' && text(e).trim() !== '');
    if (first && !notice) finding(ctx, 'HPR-PROF-016', { pfad: first }, loc.xml(first), f);
  }
}

/** LOCK-003 and LOCK-004. */
export function checkRedaction(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-LOCK-003', 'HPR-LOCK-004');
  for (const target of redactionTargets(ctx, f)) {
    if (target.endsWith('/')) continue; // removal of a whole rendition (part 1, 7.4)
    const hash = target.indexOf('#');
    const path = hash < 0 ? target : target.slice(0, hash);
    const id = hash < 0 ? '' : target.slice(hash + 1);
    const doc = f.docs.get(path);
    let ok = false;
    if (doc) {
      const scope = id ? elements(doc.doc).find((e) => attr(e, 'id') === id) : doc.root;
      ok = !!scope && (scope.hasAttribute('data-hp-redacted') || elements(scope).some((e) => e.hasAttribute('data-hp-redacted')));
    }
    if (!ok && (doc || !ctx.files.has(path) || f.paths.includes(path))) finding(ctx, 'HPR-LOCK-003', { uri: target }, loc.xml(path), f);
  }
  for (const doc of f.docs.values()) {
    for (const el of elements(doc.doc)) {
      if (!el.hasAttribute('data-hp-redacted')) continue;
      const content = text(el).trim();
      const problems: string[] = [];
      if (content !== '') problems.push(content.slice(0, 60));
      if (children(el).length > 0) problems.push(`${children(el).length} Kindelemente`);
      if (attr(el, 'role') !== 'img') problems.push('role="img" fehlt');
      if (!attr(el, 'aria-label')) problems.push('aria-label fehlt');
      if (problems.length) finding(ctx, 'HPR-LOCK-004', { pfad: doc.path, zeile: lineOf(el) ?? '', wert: problems.join('; ') }, loc.xml(doc.path, lineOf(el)), f);
    }
  }
}

const PAGE_MM = [210, 297, 215.9, 279.4];

function toMm(value: string): number | undefined {
  const m = /^(-?\d*\.?\d+)(mm|cm|in|pt|px|q)?$/i.exec(value.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'px').toLowerCase();
  return unit === 'mm' ? n : unit === 'cm' ? n * 10 : unit === 'in' ? n * 25.4 : unit === 'pt' ? (n * 25.4) / 72 : unit === 'q' ? n / 4 : (n * 25.4) / 96;
}

const isPageSize = (v: string | null | undefined) => {
  if (!v) return false;
  const mm = toMm(v);
  return mm !== undefined && PAGE_MM.some((d) => Math.abs(mm - d) <= d * 0.02);
};

/** PRINT-001…003. */
export function checkPrint(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-PRINT-001', 'HPR-PRINT-002', 'HPR-PRINT-003');
  const pageDims = (decls: readonly CssDeclaration[]) => decls.filter((d) => (d.property === 'width' || d.property === 'height' || d.property === 'min-height' || d.property === 'min-width') && isPageSize(d.value));
  const positioned = (decls: readonly CssDeclaration[]) => decls.some((d) => d.property === 'position' && /^(absolute|fixed)\b/i.test(d.value));
  for (const s of f.styles) {
    for (const r of s.sheet.rules) {
      if (r.context === 'style') {
        const dims = pageDims(r.declarations);
        if (positioned(r.declarations) && dims.length > 0) finding(ctx, 'HPR-PRINT-001', { pfad: s.path, zeile: dims[0]!.line, grund: `${r.selector}: position absolut/fest mit ${dims.map((d) => `${d.property}: ${d.value}`).join(', ')}` }, loc.css(s.path, dims[0]!.line, r.selector), f);
        const print = s.printOnly || r.media.some((m) => /\bprint\b/i.test(m));
        if (print) {
          for (const sel of splitSelectors(r.selector)) {
            const el = subjectElement(sel);
            for (const d of r.declarations) {
              const v = d.value.trim().toLowerCase();
              const hit =
                (['thead', 'details', 'summary', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav'].includes(el) && ((d.property === 'display' && v.startsWith('none')) || (d.property === 'visibility' && v.startsWith('hidden')))) ||
                (['pre', 'table'].includes(el) && /^overflow(-x|-y)?$/.test(d.property) && v.startsWith('hidden')) ||
                (el === 'pre' && d.property === 'white-space' && v === 'pre');
              if (hit) finding(ctx, 'HPR-PRINT-003', { pfad: s.path, zeile: d.line, wert: `${d.property}: ${d.value}`, element: el }, loc.css(s.path, d.line, sel), f);
            }
          }
        }
      }
      if (r.context === 'page') {
        for (const d of r.declarations) {
          let top: string | undefined;
          let bottom: string | undefined;
          if (d.property === 'margin') {
            const parts = d.value.trim().split(/\s+/);
            top = parts[0];
            bottom = parts[2] ?? parts[0];
          } else if (d.property === 'margin-top') top = d.value;
          else if (d.property === 'margin-bottom') bottom = d.value;
          for (const [which, v] of [['oben', top], ['unten', bottom]] as const) {
            const mm = v ? toMm(v) : undefined;
            if (mm !== undefined && mm < 15) finding(ctx, 'HPR-PRINT-002', { pfad: s.path, zeile: d.line, grund: `Rand ${which} ${v} unter 15 mm` }, loc.css(s.path, d.line, `@page ${r.selector}`.trim()), f);
          }
        }
      }
      if (r.context === 'page-margin' && /^@(top|bottom)-/.test(r.selector)) {
        const c = r.declarations.find((d) => d.property === 'content');
        if (c && (/^none$/i.test(c.value.trim()) || /^(""|'')$/.test(c.value.trim()))) finding(ctx, 'HPR-PRINT-002', { pfad: s.path, zeile: c.line, grund: `${r.selector} mit content: ${c.value}` }, loc.css(s.path, c.line, r.selector), f);
      }
    }
  }
  for (const a of f.styleAttributes) {
    const dims = pageDims(a.declarations);
    if (positioned(a.declarations) && dims.length > 0) finding(ctx, 'HPR-PRINT-001', { pfad: a.path, zeile: a.line ?? '', grund: `style-Attribut: position absolut/fest mit ${dims.map((d) => `${d.property}: ${d.value}`).join(', ')}` }, loc.xml(a.path, a.line), f);
  }
  for (const doc of f.docs.values()) {
    for (const el of elements(doc.doc)) {
      if (el.namespaceURI !== NS.xhtml) continue;
      const tokens = `${attr(el, 'class') ?? ''} ${attr(el, 'role') ?? ''}`.split(/\s+/);
      if (tokens.includes('page')) {
        const dims = pageDims(computedDeclarations(f, doc.path, el));
        if (dims.length > 0) finding(ctx, 'HPR-PRINT-001', { pfad: doc.path, zeile: lineOf(el) ?? '', grund: `Element ${localName(el)} mit Klasse/Rolle page und ${dims.map((d) => `${d.property}: ${d.value}`).join(', ')}` }, loc.xml(doc.path, lineOf(el)), f);
      }
      if (isHtml(el, 'body')) {
        const kids = children(el);
        const only = kids.length === 1 ? kids[0]! : undefined;
        if (only && (isHtml(only, 'img') || localName(only) === 'svg')) {
          const dims = [attr(only, 'width'), attr(only, 'height')].filter((v) => isPageSize(v));
          const css = pageDims(computedDeclarations(f, doc.path, only));
          if (dims.length > 0 || css.length > 0) finding(ctx, 'HPR-PRINT-001', { pfad: doc.path, zeile: lineOf(only) ?? '', grund: `${localName(only)} als einziges Kind von body mit Seitenmaßen` }, loc.xml(doc.path, lineOf(only)), f);
        }
      }
    }
  }
}

/** VERS-003 (third-party names) and VERS-005 (no code in extensions). */
export function checkNames(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-VERS-003', 'HPR-VERS-005');
  const bad =(path: string, line: number | undefined, wert: string, css = false) => finding(ctx, 'HPR-VERS-003', { pfad: path, zeile: line ?? '', wert }, css ? loc.css(path, line) : loc.xml(path, line), f);
  for (const doc of [...f.docs.values(), ...f.svgs.values()]) {
    for (const el of elements(doc.doc)) {
      const name = localName(el);
      if (el.namespaceURI === NS.xhtml && name.includes('-')) {
        // `hp` is reserved: only names the specification (registry) defines; others need x-<kennung>-.
        const ok = name.startsWith('hp-') ? REGISTERED_COMPONENTS.has(name) : X_PREFIX_RE.test(name);
        if (!ok) bad(doc.path, lineOf(el), name);
      }
      for (const a of attributes(el)) {
        if (a.namespace !== null || !a.name.startsWith('data-')) continue;
        const ok = a.name.startsWith('data-hp-') ? DEFINED_DATA_HP.has(a.name) : X_PREFIX_RE.test(a.name.slice(5));
        if (!ok) bad(doc.path, lineOf(el), a.name);
      }
    }
  }
  const checkProp = (path: string, d: CssDeclaration, root: boolean, line: number | undefined, css: boolean) => {
    if (!d.property.startsWith('--')) return;
    if (d.property.startsWith('--hp-')) {
      if (!HP_VARIABLES.has(d.property) || !root) bad(path, line, d.property, css);
    } else if (!X_PREFIX_RE.test(d.property.slice(2))) bad(path, line, d.property, css);
  };
  for (const s of f.styles) {
    const css = typeOf(f, s.path) === 'text/css';
    for (const r of s.sheet.rules) {
      const root = splitSelectors(r.selector).some((sel) => [':root', 'html', '*'].includes(sel.trim()));
      for (const d of r.declarations) checkProp(s.path, d, root, d.line, css);
    }
  }
  for (const a of f.styleAttributes) for (const d of a.declarations) checkProp(a.path, d, isHtml(a.element, 'html'), a.line, false);

  for (const p of f.paths) {
    if (!p.startsWith(`${f.prefix}ext/`)) continue;
    const type = typeOf(f, p) ?? '';
    const data = ctx.files.get(p);
    if (['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript', 'application/wasm'].includes(type)) finding(ctx, 'HPR-VERS-005', { pfad: p, grund: `Skript- oder WebAssembly-Datei (Media-Type ${type})` }, loc.entry(p), f);
    else if (data && data[0] === 0 && data[1] === 0x61 && data[2] === 0x73 && data[3] === 0x6d) finding(ctx, 'HPR-VERS-005', { pfad: p, grund: 'WebAssembly-Signatur \\0asm' }, loc.entry(p), f);
  }
}

const MIN_GLOBAL = new Set(['id', 'class', 'lang', 'xml:lang', 'dir', 'data-hp-style']);
const MIN_ELEMENTS: Readonly<Record<string, readonly string[]>> = {
  html: [], head: [], title: [], meta: ['charset'], link: ['rel', 'href', 'type'], body: [], section: ['role', 'epub:type'],
  h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  p: [], br: [], blockquote: [], pre: [], em: [], strong: [], sub: [], sup: [], code: [], span: [],
  ul: [], ol: ['start', 'reversed'], li: [],
  table: ['data-hp-table'], caption: [], thead: [], tbody: [], tr: [], th: ['colspan', 'rowspan', 'scope', 'headers'], td: ['colspan', 'rowspan', 'scope', 'headers'],
  figure: [], img: ['src', 'alt', 'width', 'height'], figcaption: [],
  a: ['href', 'role', 'epub:type'], aside: ['role', 'epub:type'],
};
const MIN_ROLES = new Set(['doc-noteref', 'doc-footnote', 'doc-endnotes', 'doc-backlink']);
const MIN_EPUB_TYPES = new Set(['noteref', 'footnote', 'endnotes']);

/** MIN-002…010 (only when the main version claims the office minimum profile). */
export function checkOfficeMin(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-MIN-002', 'HPR-MIN-003', 'HPR-MIN-004', 'HPR-MIN-005', 'HPR-MIN-006', 'HPR-MIN-007', 'HPR-MIN-008', 'HPR-MIN-009', 'HPR-MIN-010');
  const navPath = findToc(f)?.doc.path;
  for (const doc of f.docs.values()) {
    if (doc.path === navPath) continue;
    checkOfficeDoc(ctx, f, doc);
  }
}

function epubType(el: XmlElement): string {
  return el.getAttributeNS(NS.epub, 'type') ?? '';
}

function checkOfficeDoc(ctx: Ctx, f: Fassung, doc: MarkupDoc): void {
  const p = doc.path;
  const all = elements(doc.doc);
  const ids = new Map(all.filter((e) => attr(e, 'id') !== null).map((e) => [attr(e, 'id')!, e]));
  const noteTargets = new Map<XmlElement, number>();
  for (const el of all) {
    const name = localName(el);
    const at = loc.xml(p, lineOf(el));
    const line = lineOf(el) ?? '';
    const min2 = (attribut: string) => finding(ctx, 'HPR-MIN-002', { pfad: p, zeile: line, element: name, attribut }, at, f);
    if (el.namespaceURI !== NS.xhtml || !(name in MIN_ELEMENTS)) min2('');
    else {
      const allowed = MIN_ELEMENTS[name]!;
      for (const a of attributes(el)) {
        const an = a.namespace === NS.epub ? 'epub:type' : a.namespace === NS.xml ? 'xml:lang' : a.name;
        if (!MIN_GLOBAL.has(an) && !allowed.includes(an)) min2(`/@${an}`);
        else if (an === 'role' && !MIN_ROLES.has(a.value)) min2(`/@role="${a.value}"`);
        else if (an === 'epub:type' && !a.value.split(/\s+/).every((t) => MIN_EPUB_TYPES.has(t))) min2(`/@epub:type="${a.value}"`);
        else if (an === 'reversed' && name !== 'ol') min2(`/@${an}`);
      }
      if (name === 'link') {
        const href = attr(el, 'href');
        const t = href && !isExternalRef(href) ? resolveRef(p, href) : undefined;
        if (attr(el, 'rel') !== 'stylesheet' || !t || !ctx.files.has(t.path)) min2(`/@rel="${attr(el, 'rel') ?? ''}"`);
      }
    }
    if ((isHtml(el, 'aside') && attr(el, 'role') === 'doc-footnote') || (isHtml(el, 'li') && ancestors(el).some((a) => isHtml(a, 'section') && attr(a, 'role') === 'doc-endnotes'))) {
      if (attr(el, 'id') === null) finding(ctx, 'HPR-MIN-003', { pfad: p, zeile: line }, at, f);
      noteTargets.set(el, 0);
    }
    if (isHtml(el, 'li')) {
      const m = /^\s*([•\-–*·]|\d+[.)]|[a-zA-Z][.)])\s/.exec(text(el));
      if (m) finding(ctx, 'HPR-MIN-004', { pfad: p, zeile: line, wert: m[1]! }, at, f);
    }
    if (isHtml(el, 'ul', 'ol')) {
      const parent = el.parentNode as unknown as XmlElement | null;
      if (parent && parent.nodeType === 1 && isHtml(parent, 'ul', 'ol')) finding(ctx, 'HPR-MIN-005', { pfad: p, zeile: line, element: name }, at, f);
    }
    if (isHtml(el, 'table')) {
      const { rowWidths } = tableGrid(el);
      const expected = rowWidths[0] ?? 0;
      rowWidths.forEach((w, i) => {
        if (w !== expected) finding(ctx, 'HPR-MIN-006', { pfad: p, zeile: line, kennung: attr(el, 'id') ?? '(ohne id)', wert: `${w} (Zeile ${i + 1})`, erwartet: expected }, at, f);
      });
    }
    if (isHtml(el, 'td', 'th') && ancestors(el).some((a) => isHtml(a, 'thead'))) {
      if (!isHtml(el, 'th') || attr(el, 'scope') !== 'col') finding(ctx, 'HPR-MIN-007', { pfad: p, zeile: line, element: name }, at, f);
    }
    if (isHtml(el, 'img')) {
      const parent = el.parentNode as unknown as XmlElement | null;
      const src = attr(el, 'src') ?? '';
      const t = isExternalRef(src) ? undefined : resolveRef(p, src);
      const type = t ? (f.types.get(t.path) ?? typeOf(f, t.path)) : undefined;
      if (!parent || parent.nodeType !== 1 || !isHtml(parent, 'figure')) finding(ctx, 'HPR-MIN-008', { pfad: p, zeile: line, grund: 'steht nicht in figure' }, at, f);
      if (!type || !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(type)) finding(ctx, 'HPR-MIN-008', { pfad: p, zeile: line, grund: `hat Format ${type ?? 'unbekannt'} außerhalb der Kernmedientypen` }, at, f);
    }
    if (isHtml(el, 'a') && /^\s*(Seite|S\.|page|p\.)\s*\d+\s*$/i.test(text(el))) finding(ctx, 'HPR-MIN-010', { pfad: p, zeile: line, wert: text(el).trim() }, at, f);
  }
  // MIN-009: footnote pairs
  for (const a of all.filter((e) => isHtml(e, 'a') && attr(e, 'role') === 'doc-noteref')) {
    const line = lineOf(a) ?? '';
    const href = attr(a, 'href') ?? '';
    const target = href.startsWith('#') ? ids.get(href.slice(1)) : undefined;
    const valid =
      !!target &&
      ((isHtml(target, 'aside') && attr(target, 'role') === 'doc-footnote' && epubType(target).split(/\s+/).includes('footnote')) ||
        (isHtml(target, 'li') && ancestors(target).some((s) => isHtml(s, 'section') && attr(s, 'role') === 'doc-endnotes' && epubType(s).split(/\s+/).includes('endnotes'))));
    if (!epubType(a).split(/\s+/).includes('noteref')) finding(ctx, 'HPR-MIN-009', { pfad: p, zeile: line, grund: 'doc-noteref ohne epub:type="noteref"' }, loc.xml(p, lineOf(a)), f);
    if (!valid) finding(ctx, 'HPR-MIN-009', { pfad: p, zeile: line, grund: `Verweis „${href}“ zeigt auf keinen Notentext im selben Dokument` }, loc.xml(p, lineOf(a)), f);
    else noteTargets.set(target!, (noteTargets.get(target!) ?? 0) + 1);
  }
  for (const [note, count] of noteTargets) {
    if (count !== 1) finding(ctx, 'HPR-MIN-009', { pfad: p, zeile: lineOf(note) ?? '', grund: `Notentext ${attr(note, 'id') ?? '(ohne id)'} hat ${count} Verweise statt genau einem` }, loc.xml(p, lineOf(note)), f);
  }
}

/** SIG-019: signature fields without signature. */
export function checkSignatureFields(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-SIG-019');
  const ids = new Set(ctx.signatures.map((s) => s.id));
  for (const doc of f.docs.values()) {
    for (const el of elements(doc.doc)) {
      const ref = attr(el, 'data-hp-signature-ref');
      if (ref !== null && !ids.has(ref)) finding(ctx, 'HPR-SIG-019', { pfad: doc.path, zeile: lineOf(el) ?? '', kennung: ref }, loc.xml(doc.path, lineOf(el)), f);
    }
  }
}
