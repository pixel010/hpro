#!/usr/bin/env node
/**
 * Reference-side reading of a container for the implementability touchstone
 * (specification section 17.3, steps 4a and 4c). Uses the reference implementation
 * `@html-pro/kern` to print, as JSON, exactly what the minimal reader of a foreign developer
 * has to print: metadata, reading order, sections with addresses `path#id` and heading text,
 * running text in reading order, and the hash-manifest result.
 *
 * Usage: node scripts/s1-referenz.mjs <container> [--text]
 * Exit code 0 when the manifest verifies, 1 otherwise, 2 on structural errors.
 * Requires `npm run build:test -w kern` (kern/build/src/index.js).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const { readContainer, ContainerError } = await import(resolve(HERE, '..', 'kern', 'build', 'src', 'index.js'));
const require = createRequire(resolve(HERE, '..', 'kern', 'package.json'));
const { DOMParser } = require('@xmldom/xmldom');

const SECTION_ELEMENTS = new Set(['section', 'article', 'aside', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'figure', 'pre', 'details', 'form']);
const XHTML = 'http://www.w3.org/1999/xhtml';

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function headingText(el) {
  if (/^h[1-6]$/.test(el.localName)) return normalize(el.textContent);
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && /^h[1-6]$/.test(c.localName)) return normalize(c.textContent);
    if (c.nodeType === 1 && (c.localName === 'caption' || c.localName === 'figcaption' || c.localName === 'summary')) return normalize(c.textContent);
  }
  return '';
}

function walk(el, visit) {
  visit(el);
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) walk(c, visit);
}

function analyze(path, xml) {
  const doc = new DOMParser({ onError: (level, msg) => { if (level === 'fatalError') throw new Error(msg); } }).parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.namespaceURI !== XHTML || root.localName !== 'html') throw new Error(`${path}: root is not XHTML html`);
  const sections = [];
  let body = null;
  walk(root, (el) => {
    if (el.localName === 'body' && el.namespaceURI === XHTML) body = el;
    const id = el.getAttribute('id');
    if (SECTION_ELEMENTS.has(el.localName) && id) sections.push({ address: `${path}#${id}`, element: el.localName, heading: headingText(el) });
  });
  return { path, lang: root.getAttribute('lang'), sections, text: body ? normalize(body.textContent) : '' };
}

async function main(argv) {
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: node scripts/s1-referenz.mjs <container> [--text]'); return 2; }
  let c;
  try {
    c = await readContainer(await readFile(file));
  } catch (e) {
    console.log(JSON.stringify({ file, rejected: true, code: e instanceof ContainerError ? e.code : 'error', message: e.message }, null, 2));
    return 2;
  }
  const m = c.manifest;
  const documents = [];
  const decoder = new TextDecoder();
  for (const link of m.readingOrder) {
    const bytes = c.files.get(link.url);
    if (!bytes) { documents.push({ path: link.url, error: 'missing' }); continue; }
    try { documents.push(analyze(link.url, decoder.decode(bytes))); } catch (e) { documents.push({ path: link.url, error: e.message }); }
  }
  const out = {
    file,
    mimetype: c.mimetype,
    rootfile: c.packagePath,
    metadata: { id: m.id, name: m.name, inLanguage: m.inLanguage, dateModified: m.dateModified, conformsTo: m.conformsTo },
    readingOrder: m.readingOrder.map((l) => l.url),
    sections: documents.flatMap((d) => d.sections ?? []),
    integrity: {
      ok: c.integrity.ok,
      changed: c.integrity.resources.filter((r) => r.status === 'hash-mismatch').map((r) => r.path),
      missing: c.integrity.resources.filter((r) => r.status === 'missing').map((r) => r.path),
      unlisted: [...c.integrity.unlisted],
      problems: [...c.integrity.problems],
    },
  };
  if (argv.includes('--text')) out.text = documents.map((d) => d.text ?? '').join(' ');
  console.log(JSON.stringify(out, null, 2));
  return c.integrity.ok ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
