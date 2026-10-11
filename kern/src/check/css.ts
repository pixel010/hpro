/**
 * Small CSS reader for the conformance checker: rules with selectors, declarations with
 * line numbers, the enclosing `@media` conditions, `@font-face`, `@page` with margin boxes,
 * `@keyframes`, `@import` and every `url()`. It is not a full CSS parser; it follows the
 * block structure of CSS Syntax Level 3 closely enough for the static rules of part 1
 * (INH-005, -007, -012, -013, -015, -021, -024, PRINT-001…003, PROF-005, VERS-003, CONT-020/021).
 */

export interface CssDeclaration {
  readonly property: string;
  readonly value: string;
  readonly important: boolean;
  readonly line: number;
}

export type CssContext = 'style' | 'font-face' | 'page' | 'page-margin' | 'keyframes';

export interface CssRule {
  readonly context: CssContext;
  /** Selector text (qualified rules), page selector, margin box name or keyframe selector. */
  readonly selector: string;
  readonly declarations: readonly CssDeclaration[];
  readonly line: number;
  /** Conditions of all enclosing `@media` rules, outermost first. */
  readonly media: readonly string[];
}

export interface CssReference {
  readonly value: string;
  readonly line: number;
  readonly kind: 'url' | 'import';
}

export interface CssSheet {
  readonly rules: readonly CssRule[];
  readonly references: readonly CssReference[];
  readonly keyframes: ReadonlyArray<{ readonly name: string; readonly line: number }>;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

class Cursor {
  readonly lineStarts: number[] = [0];
  pos = 0;
  constructor(
    readonly text: string,
    readonly baseLine: number,
  ) {
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') this.lineStarts.push(i + 1);
  }
  lineAt(pos: number): number {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return this.baseLine + lo;
  }
  skipSpace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos]!)) this.pos++;
  }
  /** Reads until one of the stop characters at depth 0, outside strings; returns the text. */
  readUntil(stops: string): string {
    const start = this.pos;
    let depth = 0;
    while (this.pos < this.text.length) {
      const c = this.text[this.pos]!;
      if (c === '"' || c === "'") {
        this.pos++;
        while (this.pos < this.text.length && this.text[this.pos] !== c) {
          if (this.text[this.pos] === '\\') this.pos++;
          this.pos++;
        }
      } else if (c === '(' || c === '[') depth++;
      else if ((c === ')' || c === ']') && depth > 0) depth--;
      else if (depth === 0 && stops.includes(c)) break;
      this.pos++;
    }
    return this.text.slice(start, this.pos);
  }
}

function parseDeclarations(cur: Cursor, out: CssDeclaration[], nested?: (name: string, prelude: string, line: number) => void): void {
  for (;;) {
    cur.skipSpace();
    if (cur.pos >= cur.text.length) return;
    const c = cur.text[cur.pos];
    if (c === '}') {
      cur.pos++;
      return;
    }
    if (c === ';') {
      cur.pos++;
      continue;
    }
    if (c === '@' && nested) {
      const line = cur.lineAt(cur.pos);
      const head = cur.readUntil('{;}');
      if (cur.text[cur.pos] === '{') {
        cur.pos++;
        const m = /^@([\w-]+)\s*(.*)$/s.exec(head.trim());
        nested(m?.[1]?.toLowerCase() ?? '', m?.[2]?.trim() ?? '', line);
      } else if (cur.text[cur.pos] === ';') cur.pos++;
      continue;
    }
    const startPos = cur.pos;
    const decl = cur.readUntil(';}{');
    if (cur.text[cur.pos] === '{') {
      // A nested rule where a declaration was expected: skip its block.
      cur.pos++;
      parseDeclarations(cur, []);
      continue;
    }
    const colon = decl.indexOf(':');
    if (colon > 0) {
      const property = decl.slice(0, colon).trim();
      let value = decl.slice(colon + 1).trim();
      const important = /!\s*important\s*$/i.test(value);
      if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
      out.push({ property: property.startsWith('--') ? property : property.toLowerCase(), value, important, line: cur.lineAt(startPos + (decl.length - decl.trimStart().length)) });
    }
    if (cur.text[cur.pos] === ';') cur.pos++;
  }
}

function parseBlockContents(cur: Cursor, media: string[], rules: CssRule[], keyframes: Array<{ name: string; line: number }>, untilBrace: boolean): void {
  for (;;) {
    cur.skipSpace();
    if (cur.pos >= cur.text.length) return;
    const c = cur.text[cur.pos];
    if (c === '}') {
      cur.pos++;
      if (untilBrace) return;
      continue;
    }
    const line = cur.lineAt(cur.pos);
    if (c === '@') {
      const head = cur.readUntil('{;');
      const m = /^@([\w-]+)\s*(.*)$/s.exec(head.trim());
      const name = m?.[1]?.toLowerCase() ?? '';
      const prelude = (m?.[2] ?? '').trim();
      if (cur.text[cur.pos] === ';' || cur.pos >= cur.text.length) {
        cur.pos++;
        continue;
      }
      cur.pos++; // '{'
      if (name === 'media' || name === 'supports' || name === 'layer' || name === 'container' || name === 'document') {
        parseBlockContents(cur, name === 'media' ? [...media, prelude] : media, rules, keyframes, true);
      } else if (name === 'font-face') {
        const decls: CssDeclaration[] = [];
        parseDeclarations(cur, decls);
        rules.push({ context: 'font-face', selector: '@font-face', declarations: decls, line, media });
      } else if (name === 'page') {
        const decls: CssDeclaration[] = [];
        parseDeclarations(cur, decls, (box, _p, boxLine) => {
          const boxDecls: CssDeclaration[] = [];
          parseDeclarations(cur, boxDecls);
          rules.push({ context: 'page-margin', selector: `@${box}`, declarations: boxDecls, line: boxLine, media });
        });
        rules.push({ context: 'page', selector: prelude, declarations: decls, line, media });
      } else if (name.endsWith('keyframes')) {
        keyframes.push({ name: prelude, line });
        // keyframe blocks: selector { declarations }
        for (;;) {
          cur.skipSpace();
          if (cur.pos >= cur.text.length) break;
          if (cur.text[cur.pos] === '}') {
            cur.pos++;
            break;
          }
          const kLine = cur.lineAt(cur.pos);
          const sel = cur.readUntil('{}');
          if (cur.text[cur.pos] !== '{') continue;
          cur.pos++;
          const decls: CssDeclaration[] = [];
          parseDeclarations(cur, decls);
          rules.push({ context: 'keyframes', selector: sel.trim(), declarations: decls, line: kLine, media });
        }
      } else {
        parseDeclarations(cur, []);
      }
      continue;
    }
    const selector = cur.readUntil('{}');
    if (cur.text[cur.pos] !== '{') {
      cur.pos++;
      continue;
    }
    cur.pos++;
    const decls: CssDeclaration[] = [];
    parseDeclarations(cur, decls);
    rules.push({ context: 'style', selector: selector.trim().replace(/\s+/g, ' '), declarations: decls, line, media });
  }
}

function collectReferences(cur: Cursor): CssReference[] {
  const refs: CssReference[] = [];
  for (const m of cur.text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi)) {
    refs.push({ value: (m[1] ?? m[2] ?? m[3] ?? '').trim(), line: cur.lineAt(m.index ?? 0), kind: 'url' });
  }
  for (const m of cur.text.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    refs.push({ value: (m[1] ?? m[2] ?? '').trim(), line: cur.lineAt(m.index ?? 0), kind: 'import' });
  }
  return refs;
}

/** Parses a stylesheet; `baseLine` shifts line numbers for `style` elements inside XHTML. */
export function parseCss(text: string, baseLine = 1): CssSheet {
  const cur = new Cursor(stripComments(text), baseLine);
  const rules: CssRule[] = [];
  const keyframes: Array<{ name: string; line: number }> = [];
  parseBlockContents(cur, [], rules, keyframes, false);
  return { rules, references: collectReferences(new Cursor(stripComments(text), baseLine)), keyframes };
}

/** Parses the content of a `style` attribute. */
export function parseStyleAttribute(text: string, line: number): { declarations: CssDeclaration[]; references: CssReference[] } {
  const cur = new Cursor(stripComments(text).replace(/\n/g, ' '), line);
  const declarations: CssDeclaration[] = [];
  parseDeclarations(cur, declarations);
  return { declarations, references: collectReferences(cur) };
}

/** Splits a selector list at top-level commas. */
export function splitSelectors(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(selector.slice(start).trim());
  return out.filter((s) => s !== '');
}

/** Last compound's element name of a simple selector (`table`, `div.x > pre` → `pre`), or `*`/''. */
export function subjectElement(selector: string): string {
  const last = selector.trim().split(/[\s>+~]+/).pop() ?? '';
  const m = /^([a-zA-Z][a-zA-Z0-9-]*|\*)/.exec(last);
  return m ? m[1]!.toLowerCase() : '';
}
