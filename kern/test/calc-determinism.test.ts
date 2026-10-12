/**
 * HPF-CALC-001 (determinism) and HPF-SEC-002 (own parser and evaluator, no interface to network,
 * file system, clock or randomness): the calculator gives bit-identical results in another time
 * zone and locale, runs with clock, randomness, network and dynamic code disabled, and its source
 * contains none of these interfaces.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './helpers.js';
import { SWEEP_SCRIPT, sweep } from './calc-sweep.js';

test('HPF-CALC-001: same results, bit for bit, in other time zones and locales', () => {
  const here = sweep();
  assert.ok(here.length > 300);
  const runs: Array<{ TZ: string; LANG: string }> = [
    { TZ: 'Pacific/Kiritimati', LANG: 'tr_TR.UTF-8' },
    { TZ: 'America/St_Johns', LANG: 'de_AT.UTF-8' },
    { TZ: 'UTC', LANG: 'C' },
  ];
  for (const env of runs) {
    const out = execFileSync(process.execPath, [SWEEP_SCRIPT], { env: { ...process.env, ...env, LC_ALL: env.LANG }, encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.deepEqual(JSON.parse(out), here, `TZ=${env.TZ} LANG=${env.LANG}`);
  }
});

test('HPF-SEC-002: the calculator runs without clock, randomness, network and dynamic code', () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { Date: g['Date'], random: Math.random, fetch: g['fetch'], eval: g['eval'], Function: g['Function'], XMLHttpRequest: g['XMLHttpRequest'] };
  const forbidden = (name: string) => () => {
    throw new Error(`${name} used by the calculator`);
  };
  const before = sweep();
  try {
    g['Date'] = new Proxy(saved.Date as object, { construct: forbidden('new Date'), apply: forbidden('Date()'), get: (t, k) => (k === 'now' ? forbidden('Date.now') : Reflect.get(t, k)) });
    Math.random = forbidden('Math.random');
    g['fetch'] = forbidden('fetch');
    g['XMLHttpRequest'] = forbidden('XMLHttpRequest');
    g['eval'] = forbidden('eval');
    assert.deepEqual(sweep(), before);
  } finally {
    g['Date'] = saved.Date;
    Math.random = saved.random;
    g['fetch'] = saved.fetch;
    g['XMLHttpRequest'] = saved.XMLHttpRequest;
    g['eval'] = saved.eval;
  }
});

test('HPF-SEC-002: no dynamic code, clock, randomness, network or file access in the calculator source', () => {
  const dir = resolve(REPO_ROOT, 'kern/src/calc');
  // the calculator proper; import, export and container code reads files given to it, not formulas
  const calculator = ['parser.ts', 'evaluate.ts', 'functions.ts', 'engine.ts', 'numbers.ts', 'values.ts', 'dates.ts', 'model.ts', 'dom.ts', 'format.ts'];
  assert.deepEqual(calculator.filter((f) => !readdirSync(dir).includes(f)), []);
  const patterns: Array<[string, RegExp]> = [
    // global eval, not the method Evaluator.eval (its definition `eval(node: …` or calls `this.eval(`)
    ['eval', /(?<![.\w$])eval\s*\((?!\s*node\s*:)/],
    ['Function constructor', /\bnew\s+Function\b|\bFunction\s*\(/],
    ['dynamic import', /\bimport\s*\(/],
    ['clock', /\bDate\.now\b|\bnew\s+Date\s*\(\s*\)|\bperformance\.now\b/],
    ['randomness', /\bMath\.random\b|\bgetRandomValues\b|\brandomUUID\b/],
    ['network', /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/],
    ['file system', /from\s+['"]node:|\brequire\s*\(/],
  ];
  const found: string[] = [];
  for (const f of calculator) {
    const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const [what, re] of patterns) if (re.test(src)) found.push(`${f}: ${what}`);
  }
  assert.deepEqual(found, []);
});

