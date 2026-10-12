/**
 * Sequence difference (Myers, "An O(ND) Difference Algorithm and Its Variations", 1986) on arrays
 * of strings, used for the history journal (token patches) and for the comparison of two versions
 * (blocks, words). Common prefix and suffix are trimmed first; above `maxEdits` differences the
 * middle part is reported as one replacement, so that time and memory stay bounded.
 */

export type DiffOp =
  | { readonly kind: 'equal'; readonly a: number; readonly b: number; readonly length: number }
  | { readonly kind: 'delete'; readonly a: number; readonly length: number }
  | { readonly kind: 'insert'; readonly b: number; readonly length: number };

export interface DiffOptions {
  /** Upper bound for the edit distance searched exactly (default 4000). */
  readonly maxEdits?: number;
  readonly equals?: (x: string, y: string) => boolean;
}

function push(out: DiffOp[], op: DiffOp): void {
  if (op.length === 0) return;
  const last = out[out.length - 1];
  if (last && last.kind === op.kind) {
    if (op.kind === 'equal' && last.kind === 'equal' && last.a + last.length === op.a && last.b + last.length === op.b) {
      out[out.length - 1] = { ...last, length: last.length + op.length };
      return;
    }
    if (op.kind === 'delete' && last.kind === 'delete' && last.a + last.length === op.a) {
      out[out.length - 1] = { ...last, length: last.length + op.length };
      return;
    }
    if (op.kind === 'insert' && last.kind === 'insert' && last.b + last.length === op.b) {
      out[out.length - 1] = { ...last, length: last.length + op.length };
      return;
    }
  }
  out.push(op);
}

/** Edit script turning `a` into `b`: equal, delete (from `a`) and insert (from `b`) runs in order. */
export function diffSequences(a: readonly string[], b: readonly string[], options: DiffOptions = {}): DiffOp[] {
  const eq = options.equals ?? ((x: string, y: string) => x === y);
  const maxEdits = options.maxEdits ?? 4000;
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start]!, b[start]!)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1]!, b[endB - 1]!)) {
    endA--;
    endB--;
  }
  const out: DiffOp[] = [];
  push(out, { kind: 'equal', a: 0, b: 0, length: start });
  const n = endA - start;
  const m = endB - start;
  if (n === 0 || m === 0) {
    push(out, { kind: 'delete', a: start, length: n });
    push(out, { kind: 'insert', b: start, length: m });
  } else {
    const middle = myers(a, b, start, endA, start, endB, eq, maxEdits);
    if (middle) for (const op of middle) push(out, op);
    else {
      push(out, { kind: 'delete', a: start, length: n });
      push(out, { kind: 'insert', b: start, length: m });
    }
  }
  push(out, { kind: 'equal', a: endA, b: endB, length: a.length - endA });
  return out;
}

/** Greedy Myers with a stored trace (only diagonals -d…d per step); null if the distance exceeds `maxEdits`. */
function myers(a: readonly string[], b: readonly string[], a0: number, a1: number, b0: number, b1: number, eq: (x: string, y: string) => boolean, maxEdits: number): DiffOp[] | null {
  const n = a1 - a0;
  const m = b1 - b0;
  const max = Math.min(n + m, maxEdits);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d][k + d] = furthest x on diagonal k after step d - 1, for k in -d…d.
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    const prev = trace[d]!;
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && prev[k - 1 + d]! < prev[k + 1 + d]!)) x = prev[k + 1 + d]!;
      else x = prev[k - 1 + d]! + 1;
      let y = x - k;
      while (x < n && y < m && eq(a[a0 + x]!, b[b0 + y]!)) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;
  const steps: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && prev[k - 1 + d]! < prev[k + 1 + d]!);
    const prevK = down ? k + 1 : k - 1;
    const prevX = prev[prevK + d]!;
    const prevY = prevX - prevK;
    const startX = down ? prevX : prevX + 1;
    const startY = down ? prevY + 1 : prevY;
    if (x > startX) steps.push({ kind: 'equal', a: a0 + startX, b: b0 + startY, length: x - startX });
    if (down) steps.push({ kind: 'insert', b: b0 + prevY, length: 1 });
    else steps.push({ kind: 'delete', a: a0 + prevX, length: 1 });
    x = prevX;
    y = prevY;
  }
  if (x > 0) steps.push({ kind: 'equal', a: a0, b: b0, length: x });
  steps.reverse();
  const out: DiffOp[] = [];
  for (const s of steps) push(out, s);
  return out;
}

/** Tokens of a text file for journal patches: tags, words, white space; `tokens.join('') === text`. */
export function patchTokens(text: string): string[] {
  return text.match(/<[^<>]*>|[^<\s]+|\s+|</g) ?? [];
}

/** Words, white space and punctuation of a block text, for word-level comparison. */
export function wordTokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? [];
}

/** A reverse patch hunk: at token index `at` of the newer text, replace `remove` tokens by `insert`. */
export type Hunk = readonly [at: number, remove: number, insert: string];

/** Hunks turning `newer` into `older` (applied to the tokens of `newer`). */
export function makePatch(newer: string, older: string): Hunk[] {
  const a = patchTokens(newer);
  const b = patchTokens(older);
  const hunks: Array<[number, number, string]> = [];
  let ai = 0;
  for (const op of diffSequences(a, b, { maxEdits: 2000 })) {
    if (op.kind === 'equal') {
      ai = op.a + op.length;
      continue;
    }
    const last = hunks[hunks.length - 1];
    if (op.kind === 'delete') {
      if (last && last[0] + last[1] === op.a) last[1] += op.length;
      else hunks.push([op.a, op.length, '']);
      ai = op.a + op.length;
    } else {
      const text = b.slice(op.b, op.b + op.length).join('');
      if (last && last[0] + last[1] === ai) last[2] += text;
      else hunks.push([ai, 0, text]);
    }
  }
  return hunks;
}

/** Applies hunks from `makePatch(newer, older)` to `newer`, giving `older`. */
export function applyPatch(newer: string, hunks: readonly Hunk[]): string {
  const tokens = patchTokens(newer);
  const out: string[] = [];
  let i = 0;
  for (const [at, remove, insert] of hunks) {
    if (at < i || at + remove > tokens.length) throw new Error(`patch does not fit: hunk at ${at} (+${remove}) on ${tokens.length} tokens`);
    out.push(...tokens.slice(i, at));
    if (insert !== '') out.push(insert);
    i = at + remove;
  }
  out.push(...tokens.slice(i));
  return out.join('');
}
