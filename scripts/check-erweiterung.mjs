#!/usr/bin/env node
/**
 * Extension and namespace check for an html-Pro container (Teil 2, Abschnitt 7; Teil 1 rules
 * HPR-VERS-002, HPR-VERS-003, HPR-VERS-004, HPR-VERS-005, HPR-META-011, HPR-CONT-020).
 *
 * This is a partial checker: it applies only the rules that concern third-party extensions and
 * names. The full conformance checker against the whole catalogue is package S3.
 *
 * Findings follow the catalogue: { rule, class, location, message }. The registry
 * (docs/spezifikation/02-registry.json) adds advisory notes (class INFO) for unregistered
 * prefixes; those are not catalogue rules but Teil 2 requirements (HPG-EXT-006).
 *
 * Usage: node scripts/check-erweiterung.mjs <container> [--json]
 * Exit 0 when no ERROR/FATAL finding, 1 otherwise, 2 on usage/IO problems.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REGISTRY_PATH = resolve(ROOT, 'docs', 'spezifikation', '02-registry.json');

/** Teil 0 (and Teil 3) define these `data-hp-*` attributes; every other `data-hp-*` is a finding. */
export const DEFINED_DATA_HP = [
  'data-hp-table', 'data-hp-priority', 'data-hp-role', 'data-hp-ref', 'data-hp-redacted',
  'data-hp-signature-ref', 'data-hp-formula', 'data-hp-value', 'data-hp-type', 'data-hp-input',
  'data-hp-stale', 'data-hp-unit', 'data-hp-check', 'data-hp-check-message', 'data-hp-style',
  'data-hp-style-if', 'data-hp-import', 'data-hp-import-formula',
];
/** Lesesystem variables of HP-INH-004; authors may read them, never set them on :root. */
export const DEFINED_CSS_HP = [
  '--hp-font-size', '--hp-line-height', '--hp-letter-spacing', '--hp-word-spacing',
  '--hp-paragraph-spacing', '--hp-foreground', '--hp-background',
];
/** Manifest keys Teil 0 defines plus the Publication Manifest keys HPR-META-011 accepts. */
export const DEFINED_MANIFEST_KEYS = [
  '@context', 'conformsTo', 'id', 'name', 'inLanguage', 'dateModified', 'readingOrder', 'resources',
  'components', 'renditions', 'access', 'attachments', 'data', 'extensions', 'history', 'source',
  'derivedFrom', 'accessibility', 'author', 'publisher', 'datePublished', 'abridged', 'url', 'type',
  'accessMode', 'accessModeSufficient', 'accessibilityFeature', 'accessibilityHazard', 'accessibilitySummary',
  'computedAt', 'calculator',
];
/** Keys defined inside the objects of the manifest lists (Teil 0: HP-CONT-008, HP-SBX-001, HP-PROF-006/011, HP-LOCK-001, HP-NEST-003, HP-SBX-008, HP-VERS-004, HP-META-005/006; Teil 3: HPF-STO-006). */
export const DEFINED_NESTED_KEYS = {
  readingOrder: ['url', 'type'],
  resources: ['url', 'type', 'integrity'],
  components: ['name', 'version', 'url', 'integrity'],
  renditions: ['id', 'role', 'url', 'createdAt'],
  access: ['target', 'rules'],
  attachments: ['url', 'type', 'name'],
  data: ['url', 'schema'],
  extensions: ['id', 'required', 'url', 'dir'],
  history: ['version', 'dateModified', 'note', 'manifestIntegrity'],
  source: ['url', 'type', 'tool', 'date'],
  derivedFrom: ['integrity', 'method'],
  accessibility: ['conformsTo', 'accessMode', 'accessModeSufficient', 'accessibilityFeature', 'accessibilityHazard', 'accessibilitySummary'],
  calculator: ['name', 'version', 'spec'],
};
export const KENNUNG_RE = /^[a-z0-9]+$/; // Teil 0, HP-VERS-005: x-<kennung>-
export const X_PREFIX_RE = /^x-([a-z0-9]+)-/;
const SCRIPT_TYPES = new Set(['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript', 'application/wasm']);
const RESOURCE_ATTRS = [['link', 'href'], ['img', 'src'], ['script', 'src'], ['source', 'src'], ['audio', 'src'], ['video', 'src'], ['video', 'poster'], ['track', 'src'], ['iframe', 'src'], ['embed', 'src'], ['object', 'data'], ['image', 'href'], ['use', 'href'], ['base', 'href']];

export function loadRegistry(path = REGISTRY_PATH) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isAbsoluteUri(s) {
  return typeof s === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith('//');
}

function externalRef(value) {
  const v = value.trim();
  return v !== '' && !v.startsWith('#') && !v.startsWith('data:') && (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//'));
}

/**
 * Applies the extension rules to a read container: `files` is a Map<path, Uint8Array>,
 * `manifest` the parsed manifest.json. Returns { findings, kennungen }.
 */
export function checkExtensions({ files, manifest }, registry = loadRegistry()) {
  const findings = [];
  const add = (rule, cls, location, message) => findings.push({ rule, class: cls, location, message });
  const td = new TextDecoder();
  const used = new Map(); // kennung -> locations where x-<kennung>- names are used
  const noteUse = (k, where) => { if (!used.has(k)) used.set(k, []); used.get(k).push(where); };

  // --- manifest.json#extensions (HPR-VERS-002, HPR-VERS-004) ---------------------------------
  const declared = new Map(); // kennung -> entry
  const ext = manifest.extensions;
  if (ext !== undefined && !Array.isArray(ext)) add('HPR-VERS-002', 'ERROR', 'manifest.json#extensions', '`extensions` ist keine Liste.');
  for (const [i, e] of (Array.isArray(ext) ? ext : []).entries()) {
    const loc = `manifest.json#extensions[${i}]`;
    const problems = [];
    if (!e || typeof e !== 'object') { add('HPR-VERS-002', 'ERROR', loc, 'Eintrag ist kein Objekt.'); continue; }
    if (!isAbsoluteUri(e.id)) problems.push(`\`id\` „${e.id}“ ist keine absolute URI`);
    if (typeof e.required !== 'boolean') problems.push('`required` fehlt oder ist nicht boolesch');
    if (e.url !== undefined && !isAbsoluteUri(e.url)) problems.push('`url` ist keine absolute URI');
    const kennung = typeof e.dir === 'string' ? e.dir : (typeof e.id === 'string' ? e.id.split('/').filter(Boolean).pop() : undefined);
    if (e.dir !== undefined && (typeof e.dir !== 'string' || !KENNUNG_RE.test(e.dir))) problems.push(`\`dir\` „${e.dir}“ entspricht nicht ^[a-z0-9]+$`);
    if (problems.length) add('HPR-VERS-002', 'ERROR', loc, `${problems.join('; ')} (Erweiterung braucht \`id\`, \`required\` und ein Verzeichnis \`ext/<kennung>/\`).`);
    if (kennung && KENNUNG_RE.test(kennung)) declared.set(kennung, e);
    if (e.required === true) add('HPR-VERS-004', 'INFO', loc, `Erweiterung „${e.id}“ ist als erforderlich deklariert; Lesesysteme ohne sie zeigen das Dokument mit Hinweis.`);
  }

  // --- files under ext/ (HPR-VERS-002 Zuordnung, HPR-VERS-005 Skripte/extern) ----------------
  const types = new Map((manifest.resources ?? []).map((r) => [r.url, r.type]));
  for (const [path, data] of files) {
    if (!path.startsWith('ext/')) continue;
    const seg = path.split('/');
    const kennung = seg[1] ?? '';
    if (seg.length < 3 || !KENNUNG_RE.test(kennung)) add('HPR-VERS-002', 'ERROR', path, 'Datei liegt nicht unter `ext/<kennung>/`.');
    else if (!declared.has(kennung)) add('HPR-VERS-002', 'ERROR', path, `Verzeichnis \`ext/${kennung}/\` gehört zu keinem Eintrag in \`manifest.json#extensions\`.`);
    const type = types.get(path) ?? '';
    if (SCRIPT_TYPES.has(type) || /\.(m?js|wasm)$/i.test(path)) add('HPR-VERS-005', 'ERROR', path, `Erweiterungsdatei ${path}: Skript- oder WebAssembly-Datei (Media-Type ${type || 'unbekannt'}); Erweiterungen heben keine Muss-Anforderung auf.`);
    if (data.length >= 4 && data[0] === 0 && data[1] === 0x61 && data[2] === 0x73 && data[3] === 0x6d) add('HPR-VERS-005', 'ERROR', path, `Erweiterungsdatei ${path}: WebAssembly-Signatur (\\0asm).`);
  }

  // --- CSS: url()/@import external (HPR-CONT-020 via HPR-VERS-005) and custom properties ------
  for (const [path, data] of files) {
    if ((types.get(path) ?? '') !== 'text/css' && !path.endsWith('.css')) continue;
    const text = td.decode(data);
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/g)) {
        const ref = m[1] ?? m[2];
        if (ref && externalRef(ref)) add(path.startsWith('ext/') ? 'HPR-VERS-005' : 'HPR-CONT-020', 'ERROR', `${path}:${i + 1}`, `Verweis „${ref}“ zeigt nach außen; Ressourcen müssen im Container liegen.`);
      }
      // declarations of custom properties: `--name:`
      for (const m of line.matchAll(/(^|[\s;{])(--[A-Za-z0-9_-]+)\s*:/g)) {
        const name = m[2];
        if (name.startsWith('--hp-')) {
          add('HPR-VERS-003', 'ERROR', `${path}:${i + 1}`, DEFINED_CSS_HP.includes(name) ? `Name „${name}“ ist eine Lesesystem-Variable und darf in Autoren-CSS nicht gesetzt werden (HP-INH-004).` : `Name „${name}“ ist weder in der Spezifikation definiert noch mit \`x-<kennung>-\` präfigiert (\`hp\` ist reserviert).`);
        } else if (name.startsWith('--x-')) {
          const k = X_PREFIX_RE.exec(name.slice(2));
          if (!k) add('HPR-VERS-003', 'ERROR', `${path}:${i + 1}`, `Name „${name}“ trägt keinen gültigen Präfix \`--x-<kennung>-\`.`);
          else noteUse(k[1], `${path}:${i + 1} ${name}`);
        } else {
          add('HPR-VERS-003', 'ERROR', `${path}:${i + 1}`, `Name „${name}“ ist weder in der Spezifikation definiert noch mit \`x-<kennung>-\` präfigiert.`);
        }
      }
    });
  }

  // --- XHTML/SVG: data-* attributes, custom elements, external resources ----------------------
  const parser = new DOMParser({ onError: () => {} });
  for (const [path, data] of files) {
    const type = types.get(path) ?? '';
    if (type !== 'application/xhtml+xml' && type !== 'image/svg+xml') continue;
    let doc;
    try { doc = parser.parseFromString(td.decode(data), 'text/xml'); } catch { continue; }
    const all = doc.getElementsByTagName('*');
    const declaredComponents = new Set((manifest.components ?? []).map((c) => c.name));
    for (let i = 0; i < all.length; i++) {
      const el = all.item(i);
      const name = el.localName ?? el.nodeName;
      const line = el.lineNumber ?? '?';
      const loc = `${path}:${line}`;
      if (name.includes('-')) {
        if (name.startsWith('hp-')) {
          if (!declaredComponents.has(name)) add('HPR-VERS-003', 'ERROR', loc, `Name „${name}“ ist weder in der Spezifikation definiert noch mit \`x-<kennung>-\` präfigiert (\`hp\` ist reserviert).`);
        } else {
          const k = X_PREFIX_RE.exec(name);
          if (!k) add('HPR-VERS-003', 'ERROR', loc, `Name „${name}“ ist weder in der Spezifikation definiert noch mit \`x-<kennung>-\` präfigiert.`);
          else noteUse(k[1], `${loc} <${name}>`);
        }
      }
      for (let a = 0; a < el.attributes.length; a++) {
        const attr = el.attributes.item(a);
        const an = attr.name;
        if (an.startsWith('data-')) {
          if (an.startsWith('data-hp-')) {
            if (!DEFINED_DATA_HP.includes(an)) add('HPR-VERS-003', 'ERROR', loc, `Name „${an}“ ist weder in der Spezifikation definiert noch mit \`x-<kennung>-\` präfigiert (\`hp\` ist reserviert).`);
          } else {
            const k = X_PREFIX_RE.exec(an.slice(5));
            if (!k) add('HPR-VERS-003', 'ERROR', loc, `Name „${an}“ ist weder in der Spezifikation definiert noch mit \`x-<kennung>-\` präfigiert.`);
            else noteUse(k[1], `${loc} ${an}`);
          }
        }
      }
      for (const [eln, attrn] of RESOURCE_ATTRS) {
        if (name !== eln) continue;
        const v = el.getAttribute(attrn) ?? (attrn === 'href' ? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') : null);
        if (v && externalRef(v)) add('HPR-CONT-020', 'ERROR', loc, `Verweis ${attrn}="${v}" zeigt nach außen; Ressourcen müssen im Container liegen.`);
      }
    }
  }

  // --- manifest keys (HPR-META-011) and access rules (HPR-VERS-003) ----------------------------
  const checkKeys = (obj, where, defined) => {
    for (const key of Object.keys(obj)) {
      if (defined.includes(key)) continue;
      const k = X_PREFIX_RE.exec(key);
      if (!k) add('HPR-META-011', 'ERROR', where, `${where}: unbekannter Schlüssel „${key}“ ohne Präfix \`x-<kennung>-\`.`);
      else noteUse(k[1], `${where} ${key}`);
    }
  };
  checkKeys(manifest, 'manifest.json', DEFINED_MANIFEST_KEYS);
  for (const [list, keys] of Object.entries(DEFINED_NESTED_KEYS)) {
    const v = manifest[list];
    if (Array.isArray(v)) v.forEach((o, i) => { if (o && typeof o === 'object') checkKeys(o, `manifest.json#${list}[${i}]`, keys); });
    else if (v && typeof v === 'object') checkKeys(v, `manifest.json#${list}`, keys);
  }
  const LOCK_RULES = new Set(['read-only', 'no-print', 'no-export', 'hidden']);
  for (const [i, a] of (Array.isArray(manifest.access) ? manifest.access : []).entries()) {
    for (const r of Array.isArray(a?.rules) ? a.rules : []) {
      if (LOCK_RULES.has(r)) continue;
      const k = X_PREFIX_RE.exec(String(r));
      if (!k) add('HPR-VERS-003', 'ERROR', `manifest.json#access[${i}]`, `Sperrregel „${r}“ ist weder definiert noch mit \`x-<kennung>-\` präfigiert.`);
      else noteUse(k[1], `manifest.json#access[${i}] ${r}`);
    }
  }

  // --- Teil 2: used kennung must be declared (HPG-EXT-003) and registry notes (HPG-EXT-006) ----
  const registered = new Set((registry?.extensions ?? []).filter((e) => e.status !== 'zurückgezogen').map((e) => e.kennung));
  for (const [k, where] of used) {
    if (!declared.has(k)) add('HPG-EXT-003', 'WARNING', where[0], `Kennung „${k}“ wird verwendet (${where.length} Stelle(n)), ist aber nicht in \`manifest.json#extensions\` deklariert.`);
    if (registry && !registered.has(k)) add('HPG-EXT-006', 'INFO', where[0], `Kennung „${k}“ ist nicht in der Registry eingetragen; Kollisionen mit anderen Anbietern sind nicht ausgeschlossen.`);
  }
  for (const [k, e] of declared) {
    if (registry && !registered.has(k) && !used.has(k)) add('HPG-EXT-006', 'INFO', `manifest.json#extensions (${e.id})`, `Kennung „${k}“ ist nicht in der Registry eingetragen.`);
  }
  const order = { FATAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };
  findings.sort((a, b) => order[a.class] - order[b.class] || a.rule.localeCompare(b.rule) || a.location.localeCompare(b.location));
  return { findings, kennungen: { declared: [...declared.keys()], used: [...used.keys()] } };
}

export function summarize(findings) {
  const counts = { FATAL: 0, ERROR: 0, WARNING: 0, INFO: 0 };
  for (const f of findings) counts[f.class]++;
  return counts;
}

export async function checkContainerFile(path, registry = loadRegistry()) {
  const { readContainer } = await import(resolve(ROOT, 'kern', 'dist', 'index.js'));
  const bytes = readFileSync(path);
  const c = await readContainer(bytes);
  return { file: path, bytes: bytes.length, ...checkExtensions({ files: c.files, manifest: c.manifest }, registry) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: node scripts/check-erweiterung.mjs <container> [--json]'); process.exit(2); }
  try {
    const result = await checkContainerFile(file);
    const counts = summarize(result.findings);
    if (json) console.log(JSON.stringify({ ...result, counts }, null, 2));
    else {
      console.log(`file: ${file} (${result.bytes} bytes)`);
      console.log(`extensions declared: [${result.kennungen.declared.join(', ')}]  prefixes used: [${result.kennungen.used.join(', ')}]`);
      for (const f of result.findings) console.log(`${f.class.padEnd(7)} ${f.rule.padEnd(13)} ${f.location}: ${f.message}`);
      console.log(`findings: ${counts.FATAL} fatal, ${counts.ERROR} error, ${counts.WARNING} warning, ${counts.INFO} info`);
      console.log(`result: ${counts.FATAL + counts.ERROR === 0 ? 'OK' : 'FAILED'}`);
    }
    process.exit(counts.FATAL + counts.ERROR === 0 ? 0 : 1);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(2);
  }
}
