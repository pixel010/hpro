/**
 * Formula syntax (part 3, section 3): the subset of OpenFormula [Q1] chapter 5 that a document
 * may contain. One `=`, StandardNumber, strings with doubled quotes, `;` as separator,
 * references in brackets (`[.B7]`, `[.B2:.B9]`, `[kosten.B7]`, `[kosten.B2:.B9]`), the error
 * constants of table 7.1 and the operators of HPF-SYN-005 with the precedence of [Q1] §5.5
 * table 1. Everything else (inline arrays, named expressions, `!`, `~`, `,`, whole rows or
 * columns, sources) is a syntax error, which the evaluator turns into `#NAME?` (HPF-ERR-003).
 *
 * Own parser, no host-language evaluation (HPF-SEC-002).
 */
import { isErrorName, type ErrorName } from './values.js';

/** Limits of HPF-SYN-010 and HPF-ADR-003. */
export const LIMITS = {
  formulaLength: 1024,
  parameters: 30,
  nesting: 7,
  stringLength: 32767,
  columns: 1024,
  rows: 65536,
} as const;

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '<=' | '>' | '>=';

export interface RefNode {
  readonly k: 'ref';
  /** Table id, or null for the formula's own table. */
  readonly table: string | null;
  /** Zero-based, normalised so that r1 <= r2 and c1 <= c2. */
  readonly r1: number;
  readonly c1: number;
  readonly r2: number;
  readonly c2: number;
  /** True when written as range (`[.A1:.A1]` is a range of one cell). */
  readonly range: boolean;
  /** Source text including brackets. */
  readonly text: string;
}

export type Node =
  | { readonly k: 'num'; readonly v: number }
  | { readonly k: 'str'; readonly v: string }
  | { readonly k: 'err'; readonly v: ErrorName }
  | RefNode
  | { readonly k: 'neg' | 'pos'; readonly x: Node }
  | { readonly k: 'pct'; readonly x: Node }
  | { readonly k: 'bin'; readonly op: BinaryOp; readonly a: Node; readonly b: Node }
  | { readonly k: 'call'; readonly name: string; readonly args: ReadonlyArray<Node | null> };

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number,
    /** `limit` when a limit of HPF-SYN-010 is exceeded (SEC-004). */
    readonly kind: 'syntax' | 'limit' = 'syntax',
  ) {
    super(message);
    this.name = 'FormulaSyntaxError';
  }
}

type Token =
  | { t: 'num'; v: number; p: number }
  | { t: 'str'; v: string; p: number }
  | { t: 'ref'; v: RefNode; p: number }
  | { t: 'err'; v: ErrorName; p: number }
  | { t: 'name'; v: string; p: number }
  | { t: 'op'; v: string; p: number }
  | { t: 'end'; p: number };

const WS = new Set([' ', '\t', '\n', '\r']);
const NUMBER_RE = /[0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?/y;
const NAME_RE = /[A-Za-z_][A-Za-z0-9._]*/y;
const ERROR_RE = /#(?:DIV\/0!|N\/A|NAME\?|NUM!|REF!|VALUE!|NULL!|CIRC!)/y;
const CELL = String.raw`\$?([A-Z]+)\$?([0-9]+)`;
/** `SheetName ::= [^\]\. #$':]+` (HPF-ADR-001: no `.`, `[`, `]`, `'`, `#`, `$`, `:`, whitespace). */
const REF_RE = new RegExp(String.raw`^([^\[\]. \t\n\r#$':]+)?\.${CELL}(?::\.${CELL})?$`);

/** Column letters to zero-based index (A = 0). */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Zero-based column index to letters. */
export function columnName(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** `B7` style address of a zero-based position. */
export function cellAddress(row: number, col: number): string {
  return `${columnName(col)}${row + 1}`;
}

const ADDRESS_RE = /^([A-Z]+)([1-9][0-9]*)$/;

/** Parses `B7` into a zero-based position, or null. */
export function parseAddress(text: string): { row: number; col: number } | null {
  const m = ADDRESS_RE.exec(text);
  if (!m) return null;
  return { row: Number(m[2]) - 1, col: columnIndex(m[1]!) };
}

function parseRef(inner: string, p: number): RefNode {
  const m = REF_RE.exec(inner);
  if (!m) throw new FormulaSyntaxError(`invalid reference [${inner}]`, p);
  const rowA = Number(m[3]);
  if (m[3]!.startsWith('0') || rowA < 1) throw new FormulaSyntaxError(`invalid row in [${inner}]`, p);
  const ca = columnIndex(m[2]!);
  const ra = rowA - 1;
  let cb = ca;
  let rb = ra;
  if (m[4] !== undefined) {
    const rowB = Number(m[5]);
    if (m[5]!.startsWith('0') || rowB < 1) throw new FormulaSyntaxError(`invalid row in [${inner}]`, p);
    cb = columnIndex(m[4]);
    rb = rowB - 1;
  }
  return {
    k: 'ref',
    table: m[1] ?? null,
    r1: Math.min(ra, rb),
    c1: Math.min(ca, cb),
    r2: Math.max(ra, rb),
    c2: Math.max(ca, cb),
    range: m[4] !== undefined,
    text: `[${inner}]`,
  };
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (WS.has(c)) {
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      NUMBER_RE.lastIndex = i;
      const m = NUMBER_RE.exec(src)!;
      out.push({ t: 'num', v: Number(m[0]), p: i });
      i += m[0].length;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      for (;;) {
        if (j >= src.length) throw new FormulaSyntaxError('unterminated string', i);
        const d = src[j]!;
        if (d === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += d;
        j++;
      }
      if ([...s].length > LIMITS.stringLength) throw new FormulaSyntaxError('string constant too long', i, 'limit');
      out.push({ t: 'str', v: s, p: i });
      i = j + 1;
      continue;
    }
    if (c === '[') {
      const j = src.indexOf(']', i);
      if (j < 0) throw new FormulaSyntaxError('unterminated reference', i);
      out.push({ t: 'ref', v: parseRef(src.slice(i + 1, j), i), p: i });
      i = j + 1;
      continue;
    }
    if (c === '#') {
      ERROR_RE.lastIndex = i;
      const m = ERROR_RE.exec(src);
      if (!m || !isErrorName(m[0])) throw new FormulaSyntaxError('unknown error constant', i);
      out.push({ t: 'err', v: m[0], p: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      NAME_RE.lastIndex = i;
      const m = NAME_RE.exec(src)!;
      out.push({ t: 'name', v: m[0], p: i });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') {
      out.push({ t: 'op', v: two, p: i });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%();'.includes(c)) {
      out.push({ t: 'op', v: c, p: i });
      i++;
      continue;
    }
    throw new FormulaSyntaxError(`unexpected character ${JSON.stringify(c)}`, i);
  }
  out.push({ t: 'end', p: src.length });
  return out;
}

class Parser {
  private i = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i]!;
  }
  private next(): Token {
    return this.tokens[this.i++]!;
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === 'op' && t.v === v;
  }
  private expectOp(v: string): void {
    const t = this.next();
    if (t.t !== 'op' || t.v !== v) throw new FormulaSyntaxError(`expected "${v}"`, t.p);
  }

  parse(): Node {
    const node = this.comparison();
    const t = this.peek();
    if (t.t !== 'end') throw new FormulaSyntaxError('unexpected input after expression', t.p);
    return node;
  }

  private binaryLevel(ops: readonly string[], sub: () => Node): Node {
    let a = sub();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && ops.includes(t.v)) {
        this.next();
        a = { k: 'bin', op: t.v as BinaryOp, a, b: sub() };
      } else return a;
    }
  }
  private comparison = (): Node => this.binaryLevel(['=', '<>', '<', '<=', '>', '>='], this.concat);
  private concat = (): Node => this.binaryLevel(['&'], this.additive);
  private additive = (): Node => this.binaryLevel(['+', '-'], this.multiplicative);
  private multiplicative = (): Node => this.binaryLevel(['*', '/'], this.power);
  private power = (): Node => this.binaryLevel(['^'], this.postfix);

  private postfix = (): Node => {
    let x = this.prefix();
    while (this.isOp('%')) {
      this.next();
      x = { k: 'pct', x };
    }
    return x;
  };

  private prefix = (): Node => {
    if (this.isOp('-')) {
      this.next();
      return { k: 'neg', x: this.prefix() };
    }
    if (this.isOp('+')) {
      this.next();
      return { k: 'pos', x: this.prefix() };
    }
    return this.primary();
  };

  private primary(): Node {
    const t = this.next();
    switch (t.t) {
      case 'num':
        return { k: 'num', v: t.v };
      case 'str':
        return { k: 'str', v: t.v };
      case 'err':
        return { k: 'err', v: t.v };
      case 'ref':
        return t.v;
      case 'name': {
        if (!this.isOp('(')) throw new FormulaSyntaxError(`named expressions are not allowed (${t.v})`, t.p);
        this.next();
        this.depth++;
        if (this.depth > LIMITS.nesting) throw new FormulaSyntaxError('function calls nested deeper than 7 levels', t.p, 'limit');
        const args: Array<Node | null> = [];
        if (this.isOp(')')) {
          this.next();
        } else {
          for (;;) {
            if (this.isOp(';') || this.isOp(')')) args.push(null);
            else args.push(this.comparison());
            if (args.length > LIMITS.parameters) throw new FormulaSyntaxError('more than 30 parameters', t.p, 'limit');
            const sep = this.next();
            if (sep.t === 'op' && sep.v === ';') continue;
            if (sep.t === 'op' && sep.v === ')') break;
            throw new FormulaSyntaxError('expected ";" or ")"', sep.p);
          }
        }
        this.depth--;
        return { k: 'call', name: t.v.toUpperCase(), args };
      }
      case 'op':
        if (t.v === '(') {
          const x = this.comparison();
          this.expectOp(')');
          return x;
        }
        throw new FormulaSyntaxError(`unexpected "${t.v}"`, t.p);
      case 'end':
        throw new FormulaSyntaxError('unexpected end of formula', t.p);
    }
  }
}

/**
 * Length of a formula as counted by HPF-SYN-010: without the brackets of references and without
 * the dot of a reference part that has no table id.
 */
export function formulaLength(formula: string): number {
  let n = [...formula].length;
  for (const m of formula.matchAll(/"(?:[^"]|"")*"|\[([^\]]*)\]/g)) {
    if (m[1] === undefined) continue;
    n -= 2;
    n -= (m[1].startsWith('.') ? 1 : 0) + (m[1].includes(':.') ? 1 : 0);
  }
  return n;
}

/** Parses a formula text with leading `=` (HPF-SYN-001). Throws FormulaSyntaxError. */
export function parseFormula(formula: string): Node {
  if (!formula.startsWith('=') || formula.startsWith('==')) throw new FormulaSyntaxError('formula must start with exactly one "="', 0);
  if (formulaLength(formula) > LIMITS.formulaLength) throw new FormulaSyntaxError('formula longer than 1024 characters', 0, 'limit');
  const tokens = tokenize(formula.slice(1));
  return new Parser(tokens).parse();
}

/** Every reference node of a formula, including those in branches not taken (HPF-CALC-003). */
export function collectRefs(node: Node, out: RefNode[] = []): RefNode[] {
  switch (node.k) {
    case 'ref':
      out.push(node);
      break;
    case 'neg':
    case 'pos':
    case 'pct':
      collectRefs(node.x, out);
      break;
    case 'bin':
      collectRefs(node.a, out);
      collectRefs(node.b, out);
      break;
    case 'call':
      for (const a of node.args) if (a) collectRefs(a, out);
      break;
    default:
      break;
  }
  return out;
}

/** Every function name used in a formula. */
export function collectFunctions(node: Node, out: Set<string> = new Set()): Set<string> {
  switch (node.k) {
    case 'call':
      out.add(node.name);
      for (const a of node.args) if (a) collectFunctions(a, out);
      break;
    case 'neg':
    case 'pos':
    case 'pct':
      collectFunctions(node.x, out);
      break;
    case 'bin':
      collectFunctions(node.a, out);
      collectFunctions(node.b, out);
      break;
    default:
      break;
  }
  return out;
}
