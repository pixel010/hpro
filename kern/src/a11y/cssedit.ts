/**
 * Changing one declaration of a stylesheet as text (P8, corrections for contrast, reading order
 * and focus): everything else — comments, formatting, other rules — stays byte for byte. A rule
 * is addressed like the conformance checker reports it: normalised selector text, the enclosing
 * `@media` conditions and the occurrence among rules with the same selector and conditions.
 */

export interface RuleAddress {
  /** Selector text, whitespace collapsed (as `parseCss` reports it). */
  readonly selector: string;
  /** Conditions of the enclosing `@media` rules, outermost first; empty for top level. */
  readonly media: readonly string[];
  /** 0-based occurrence among rules with the same selector and media. */
  readonly occurrence: number;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Comments replaced by spaces of the same length, so positions stay valid in the original. */
function blankComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Position of the next of `stops` at depth 0 outside strings, or text length. */
function scan(t: string, from: number, stops: string): number {
  let depth = 0;
  for (let i = from; i < t.length; i++) {
    const c = t[i]!;
    if (c === '"' || c === "'") {
      for (i++; i < t.length && t[i] !== c; i++) if (t[i] === '\\') i++;
    } else if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if (depth === 0 && stops.includes(c)) return i;
  }
  return t.length;
}

/** End of the block whose `{` is at `open` (position of the matching `}`). */
function blockEnd(t: string, open: number): number {
  let i = open + 1;
  for (;;) {
    const j = scan(t, i, '{}');
    if (j >= t.length) return t.length;
    if (t[j] === '}') return j;
    i = blockEnd(t, j) + 1;
  }
}

/** Body range [start, end) of the addressed qualified rule, or undefined. */
export function findRule(text: string, address: RuleAddress): { start: number; end: number } | undefined {
  const t = blankComments(text);
  const want = norm(address.selector);
  let seen = 0;
  const walk = (from: number, to: number, media: readonly string[]): { start: number; end: number } | undefined => {
    let i = from;
    while (i < to) {
      const brace = scan(t, i, '{};');
      if (brace >= to) return undefined;
      if (t[brace] !== '{') {
        i = brace + 1;
        continue;
      }
      const prelude = norm(t.slice(i, brace));
      const end = blockEnd(t, brace);
      if (prelude.startsWith('@')) {
        const m = /^@([\w-]+)\s*(.*)$/s.exec(prelude);
        const name = m?.[1]?.toLowerCase() ?? '';
        if (['media', 'supports', 'layer', 'container', 'document'].includes(name)) {
          const hit = walk(brace + 1, end, name === 'media' ? [...media, (m?.[2] ?? '').trim()] : media);
          if (hit) return hit;
        }
      } else if (prelude === want && media.length === address.media.length && media.every((x, k) => norm(x) === norm(address.media[k]!))) {
        if (seen === address.occurrence) return { start: brace + 1, end };
        seen++;
      }
      i = end + 1;
    }
    return undefined;
  };
  return walk(0, t.length, []);
}

/** Number of rules with this selector and media in the text (for addressing across `<style>` elements). */
export function countRules(text: string, selector: string, media: readonly string[]): number {
  let n = 0;
  while (findRule(text, { selector, media, occurrence: n })) n++;
  return n;
}

/** Declarations of a block body: [start, end) of each, with the property name. */
function declarations(t: string, start: number, end: number): Array<{ start: number; end: number; property: string; colon: number }> {
  const out: Array<{ start: number; end: number; property: string; colon: number }> = [];
  let i = start;
  while (i < end) {
    let j = scan(t, i, ';{}');
    if (j > end) j = end;
    if (t[j] === '{') {
      // nested block inside a declaration list: skip it
      i = blockEnd(t, j) + 1;
      continue;
    }
    const raw = t.slice(i, j);
    const colon = raw.indexOf(':');
    if (colon > 0 && raw.trim() !== '') {
      const lead = raw.length - raw.trimStart().length;
      out.push({ start: i + lead, end: j, property: raw.slice(0, colon).trim().toLowerCase(), colon: i + colon });
    }
    i = j + 1;
  }
  return out;
}

/**
 * Sets (`value` given) or removes (`value` null) `property` in a declaration list. Setting
 * replaces the value of the last declaration of the property (keeping `!important`) and removes
 * earlier ones; when there is none, the declaration is appended. Removing deletes every
 * declaration of the property. Returns the new text, or undefined when nothing would change.
 */
function editList(text: string, t: string, start: number, end: number, property: string, value: string | null, appendSeparator: string): string | undefined {
  const prop = property.toLowerCase();
  const decls = declarations(t, start, end).filter((d) => d.property === prop);
  if (value === null) {
    if (decls.length === 0) return undefined;
    let out = text;
    for (const d of [...decls].reverse()) {
      // the declaration with its semicolon and the whitespace up to the next one
      let e = d.end;
      if (out[e] === ';') e++;
      while (e < end && /[ \t]/.test(out[e]!)) e++;
      let s = d.start;
      // remove the line if the declaration stood alone on it
      const lineStart = out.lastIndexOf('\n', s - 1) + 1;
      const lineEnd = out.indexOf('\n', e);
      if (/^\s*$/.test(out.slice(lineStart, s)) && lineEnd >= 0 && /^\s*$/.test(out.slice(e, lineEnd))) {
        s = lineStart;
        e = lineEnd + 1;
      }
      out = out.slice(0, s) + out.slice(e);
    }
    return out;
  }
  if (decls.length > 0) {
    const last = decls[decls.length - 1]!;
    const old = text.slice(last.colon + 1, last.end);
    const important = /!\s*important\s*$/i.test(old) ? ' !important' : '';
    const lead = /^\s*/.exec(old)![0] || ' ';
    let out = text.slice(0, last.colon + 1) + lead + value + important + text.slice(last.end).replace(/^[ \t]*(?=;)/, '');
    // keep only the last declaration of the property
    for (const d of decls.slice(0, -1).reverse()) {
      let e = d.end;
      if (out[e] === ';') e++;
      while (e < out.length && /[ \t]/.test(out[e]!)) e++;
      out = out.slice(0, d.start) + out.slice(e);
    }
    if (out === text) return undefined;
    return out;
  }
  // append before the closing brace, in the style of the block
  const body = text.slice(start, end);
  const multiline = body.includes('\n');
  if (multiline) {
    const indent = /\n([ \t]+)\S/.exec(body)?.[1] ?? '  ';
    const trimmedEnd = start + body.trimEnd().length;
    const needsSemi = body.trim() !== '' && !body.trimEnd().endsWith(';');
    return text.slice(0, trimmedEnd) + (needsSemi ? ';' : '') + `\n${indent}${property}: ${value};` + text.slice(trimmedEnd);
  }
  const trimmedEnd = start + body.trimEnd().length;
  const needsSemi = body.trim() !== '' && !body.trimEnd().endsWith(';');
  const before = body.trim() === '' ? (appendSeparator === '' ? '' : ' ') : needsSemi ? '; ' : ' ';
  return text.slice(0, trimmedEnd) + before + `${property}: ${value};` + text.slice(trimmedEnd);
}

/** Sets or removes a declaration in the addressed rule of a stylesheet. */
export function editRuleDeclaration(text: string, address: RuleAddress, property: string, value: string | null): string | undefined {
  const rule = findRule(text, address);
  if (!rule) return undefined;
  return editList(text, blankComments(text), rule.start, rule.end, property, value, ' ');
}

/** Sets or removes a declaration in a `style` attribute value. */
export function editStyleAttribute(style: string, property: string, value: string | null): string {
  const out = editList(style, blankComments(style), 0, style.length, property, value, '');
  return (out ?? style).trim().replace(/^;\s*/, '');
}
