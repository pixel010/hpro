/**
 * Minimal JavaScript lexer for the static pre-filter of component scripts (HPR-SBX-016,
 * HPR-SBX-017): identifiers, string literals, punctuators, with line numbers; comments are
 * dropped, template literals are kept as strings (their `${…}` parts are scanned as code).
 * Regular-expression literals are recognised by the preceding token. It is a pre-filter, not
 * a parser: a hit is a violation, no hit is no acquittal (part 1, HPR-SBX-016).
 */
export interface JsToken {
  readonly type: 'ident' | 'string' | 'punct' | 'number' | 'regex' | 'template';
  readonly value: string;
  readonly line: number;
}

const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '=>', 'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

export function tokenize(src: string): JsToken[] {
  const out: JsToken[] = [];
  let i = 0;
  let line = 1;
  const templateDepth: number[] = [];
  let braceDepth = 0;
  const last = () => out[out.length - 1];
  const readString = (q: string): string => {
    let v = '';
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') {
        v += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (src[i] === '\n') line++;
      v += src[i];
      i++;
    }
    i++;
    return v;
  };
  const readTemplate = (): void => {
    // at '`' or after '}' that closes a ${...}; reads until '`' or '${'
    const startLine = line;
    let v = '';
    while (i < src.length) {
      const c = src[i]!;
      if (c === '\\') {
        v += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '`') {
        i++;
        out.push({ type: 'template', value: v, line: startLine });
        return;
      }
      if (c === '$' && src[i + 1] === '{') {
        i += 2;
        out.push({ type: 'template', value: v, line: startLine });
        templateDepth.push(braceDepth);
        braceDepth++;
        return;
      }
      if (c === '\n') line++;
      v += c;
      i++;
    }
  };
  while (i < src.length) {
    const c = src[i]!;
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      const l = line;
      out.push({ type: 'string', value: readString(c), line: l });
      continue;
    }
    if (c === '`') {
      i++;
      readTemplate();
      continue;
    }
    if (c === '}' && templateDepth.length > 0 && templateDepth[templateDepth.length - 1] === braceDepth - 1) {
      templateDepth.pop();
      braceDepth--;
      i++;
      readTemplate();
      continue;
    }
    if (/[A-Za-z_$ -￿]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[\w$ -￿]/.test(src[j]!)) j++;
      out.push({ type: 'ident', value: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < src.length && /[\w.]/.test(src[j]!)) j++;
      out.push({ type: 'number', value: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (c === '/') {
      const prev = last();
      const regexAllowed = !prev || (prev.type === 'punct' && REGEX_AFTER.has(prev.value) && prev.value !== ')' && prev.value !== ']') || (prev.type === 'ident' && REGEX_AFTER.has(prev.value));
      if (regexAllowed) {
        let j = i + 1;
        let inClass = false;
        while (j < src.length && src[j] !== '\n') {
          if (src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          j++;
        }
        j++;
        while (j < src.length && /[a-z]/.test(src[j]!)) j++;
        out.push({ type: 'regex', value: src.slice(i, j), line });
        i = j;
        continue;
      }
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    const p = ['===', '!==', '**=', '...', '>>>', '<<=', '>>='].includes(three) ? three : ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '**'].includes(two) ? two : c;
    if (p === '{') braceDepth++;
    if (p === '}') braceDepth--;
    out.push({ type: 'punct', value: p, line });
    i += p.length;
  }
  return out;
}
