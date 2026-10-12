#!/usr/bin/env node
// Gegenprobe der Signatururteile des Konformitätsprüfers (HPR-SIG-015/016) mit EU DSS 6.5 an
// allen signierten Dokumenten der Testsuite (Paket S3). Je Signatur wird die Hauptindikation
// verglichen: DSS `Indication:` gegen den Prüfer (HPR-SIG-015 = TOTAL_FAILED, HPR-SIG-016 =
// INDETERMINATE, kein Befund = TOTAL_PASSED). Fälle ohne Vertrauensanker werden mit einem
// fremden Anker (prototyp/ergebnisse/container/signer.pem) geprüft, wie im Prüfer ohne Anker.
//
// Aufruf: node scripts/s3-dss-vergleich.mjs [--json pfad]
//   (nach `npm run build:test -w kern` und prototyp/setup-tools.sh; DSS-Werkzeug unter prototyp/dss/target)
// Rückgabe: 0 alle Urteile gleich, 1 mindestens eine Abweichung, 2 Werkzeug fehlt.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { certificatesFromPem, checkConformance, readZip } from '../kern/build/src/index.js';

const ROOT = resolve(import.meta.dirname, '..');
const SUITE = resolve(ROOT, 'testsuite');
const JAVA = resolve(ROOT, 'prototyp/tools/jdk-21.0.12.1+1/bin/java');
const DSS_CP = `${resolve(ROOT, 'prototyp/dss/target/classes')}:${resolve(ROOT, 'prototyp/dss/target/lib')}/*`;
const POLICY = resolve(ROOT, 'docs/belege/P3/policy-hpro.xml');
const FOREIGN = resolve(ROOT, 'prototyp/ergebnisse/container/signer.pem');
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : undefined;

for (const p of [JAVA, resolve(ROOT, 'prototyp/dss/target/classes'), POLICY, FOREIGN]) {
  if (!existsSync(p)) {
    console.error(`fehlt: ${p} (prototyp/setup-tools.sh ausführen)`);
    process.exit(2);
  }
}

const catalog = JSON.parse(await readFile(resolve(ROOT, 'docs/spezifikation/01-regelkatalog.json'), 'utf8'));
const suite = JSON.parse(await readFile(resolve(SUITE, 'faelle.json'), 'utf8'));

async function dss(file, trust) {
  let out;
  try {
    out = await promisify(execFile)(JAVA, ['-Dorg.slf4j.simpleLogger.defaultLogLevel=error', '-cp', DSS_CP, 'example.hpro.HproDss', 'validate', file, trust, POLICY], { maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    out = err;
  }
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  const indications = [...text.matchAll(/^Indication: (\S+)(?: \/ (\S+))?/gm)].map((m) => ({ main: m[1], sub: m[2] ?? null }));
  return { indications, text };
}

/**
 * Deviations that are understood: the main indication differs, the verdict of level Signiert does
 * not (another error rule of the catalogue fails the level in the checker). Anything else is a defect.
 */
const EXPLAINED = {
  'schlecht-sig-011-odf-manifest':
    'DSS prüft in der Formatprüfung (FC) „Is the manifest file present (ASiC-E)?“ und meldet FORMAT_FAILURE; EN 319 162-1 nennt META-INF/manifest.xml bei XAdES optional, hpro verlangt es über HPR-SIG-011 (Fehler). Die kryptografische Prüfung des Kerns ergibt TOTAL_PASSED; Stufe Signiert in beiden Fällen nicht bestanden.',
  'schlecht-sig-002-ohne-xades':
    'Ohne QualifyingProperties fehlt SigningCertificateV2: DSS findet keinen Kandidaten für das Signaturzertifikat (INDETERMINATE/NO_SIGNING_CERTIFICATE_FOUND), der Kern meldet die fehlenden XAdES-Eigenschaften als FORMAT_FAILURE. Beide lehnen ab; Stufe Signiert nicht bestanden (HPR-SIG-002, Fehler).',
};
const rows = [];
for (const f of suite.faelle) {
  const bytes = await readFile(resolve(SUITE, f.datei));
  let entries;
  try {
    entries = await readZip(bytes);
  } catch {
    continue; // not a readable ZIP (e.g. HPR-CONT-001, HPR-LOCK-006): no signature to compare
  }
  const names = entries.map((e) => e.name);
  if (!names.some((n) => /^META-INF\/signatures[^/]*\.xml$/.test(n))) continue;
  const trustFile = f.vertrauensanker ? resolve(SUITE, f.vertrauensanker) : FOREIGN;
  const report = await checkConformance(bytes, catalog, {
    fileName: f.datei,
    trustAnchors: f.vertrauensanker ? certificatesFromPem(await readFile(trustFile, 'utf8')) : [],
    validationTime: suite.pruefzeitpunktSignaturen,
  });
  // Signature ids and their indication in the checker: from the signature files, then the findings.
  const sigIds = [];
  for (const e of entries) {
    if (!/^META-INF\/signatures[^/]*\.xml$/.test(e.name)) continue;
    for (const m of new TextDecoder().decode(e.data).matchAll(/<(?:ds:)?Signature\b[^>]*\bId="([^"]+)"/g)) sigIds.push(m[1]);
  }
  const ours = sigIds.map((id) => {
    const failed = report.results.find((r) => r.rule === 'HPR-SIG-015' && r.params?.signatur === id);
    const indet = report.results.find((r) => r.rule === 'HPR-SIG-016' && r.params?.signatur === id);
    const ind = failed ?? indet;
    const m = ind ? /^(\S+)(?: \/ (\S+))?/.exec(String(ind.params?.indikation ?? (failed ? 'TOTAL_FAILED' : 'INDETERMINATE'))) : null;
    return { id, main: failed ? 'TOTAL_FAILED' : indet ? 'INDETERMINATE' : 'TOTAL_PASSED', sub: m?.[2] ?? null };
  });
  const t0 = performance.now();
  const theirs = await dss(resolve(SUITE, f.datei), trustFile);
  const ms = Math.round(performance.now() - t0);
  const a = ours.map((x) => x.main).sort().join(',');
  const b = theirs.indications.map((x) => x.main).sort().join(',');
  const explained = a !== b ? EXPLAINED[f.id] : undefined;
  const verdict = report.levels.verdict.Signiert ?? '–';
  rows.push({ id: f.id, anker: f.vertrauensanker ? 'Testzertifikat' : 'fremd', pruefer: ours, dss: theirs.indications, gleich: a === b, ...(explained ? { erklaerung: explained } : {}), urteilSigniert: verdict, dssMs: ms });
  console.log(`${f.id.padEnd(44)} ${(f.vertrauensanker ? 'Anker' : 'fremd').padEnd(6)} Prüfer: ${ours.map((x) => `${x.main}${x.sub ? `/${x.sub}` : ''}`).join(', ').padEnd(48)} DSS: ${theirs.indications.map((x) => `${x.main}${x.sub ? `/${x.sub}` : ''}`).join(', ').padEnd(48)} ${a === b ? 'gleich' : explained ? 'ABWEICHUNG (erklärt)' : 'ABWEICHUNG'}  Stufe Signiert: ${verdict}`);
}
const diff = rows.filter((r) => !r.gleich);
const unexplained = diff.filter((r) => !r.erklaerung);
console.log(`\nErgebnis: ${rows.length - diff.length} von ${rows.length} signierten Dokumenten mit gleicher Hauptindikation je Signatur (Prüfer gegen DSS 6.5, Richtlinie ${POLICY.slice(ROOT.length + 1)}); ${diff.length - unexplained.length} erklärte, ${unexplained.length} unerklärte Abweichungen`);
for (const r of diff) console.log(`  ${r.id}: ${r.erklaerung ?? 'UNERKLÄRT'}`);
if (jsonOut) await writeFile(resolve(process.cwd(), jsonOut), JSON.stringify(rows, null, 2) + '\n');
process.exit(unexplained.length ? 1 : 0);
