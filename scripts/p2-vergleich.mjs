#!/usr/bin/env node
// Stellt die Urteile von EU DSS 6.5 (docs/belege/P2/dss/*.txt, wörtliche Ausgabe von
// prototyp/dss validate) und des TypeScript-Kerns (docs/belege/P2/ts/*.json) gegenüber und
// schreibt docs/belege/P2/vergleich-dss.json. Exit 0 nur, wenn alle Urteile übereinstimmen.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const B = resolve(ROOT, 'docs/belege/P2');
const faelle = JSON.parse(await readFile(resolve(B, 'faelle.json'), 'utf8'));
const laufzeiten = new Map(
  (existsSync(resolve(B, 'laufzeiten.tsv')) ? await readFile(resolve(B, 'laufzeiten.tsv'), 'utf8') : '')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
    .map(([id, dss, ts, code]) => [id, { dssMs: Number(dss), tsMs: Number(ts), tsExitCode: Number(code) }]),
);

/** Parses the text report of HproDss.validate. */
function parseDss(text) {
  const out = { erkannt: true, anzahl: 0, gueltig: 0, signaturen: [] };
  let cur;
  for (const line of text.split('\n')) {
    let m;
    if (line.startsWith('DSS: kein unterstütztes Signaturformat')) out.erkannt = false;
    if ((m = line.match(/^Anzahl Signaturen: (\d+) \(gültig: (\d+)\)/))) [out.anzahl, out.gueltig] = [Number(m[1]), Number(m[2])];
    if ((m = line.match(/^--- Signatur (.+)$/))) out.signaturen.push((cur = { id: m[1], fehler: [], warnungen: [], infos: [], formatPruefung: [] }));
    if (!cur) continue;
    if ((m = line.match(/^Dateiname: (.*)$/))) cur.datei = m[1];
    if ((m = line.match(/^Format: (.*)$/))) cur.format = m[1];
    if ((m = line.match(/^Indication: (\S+)(?: \/ (\S+))?$/))) [cur.indication, cur.subIndication] = [m[1], m[2] ?? null];
    if ((m = line.match(/^Signierte Objekte: \[(.*)\]$/))) cur.signierteObjekte = m[1] ? m[1].split(', ').sort() : [];
    if ((m = line.match(/^FEHLER: (.*)$/))) cur.fehler.push(m[1]);
    if ((m = line.match(/^WARNUNG: (.*)$/))) cur.warnungen.push(m[1]);
    if ((m = line.match(/^INFO: (.*)$/))) cur.infos.push(m[1]);
    if ((m = line.match(/^Format-Prüfung \(FC\): (.*)$/))) cur.fc = m[1];
    if ((m = line.match(/^ {2}(.+ -> .+)$/))) cur.formatPruefung.push(m[1]);
  }
  return out;
}

const norm = (msgs) => [...new Set(msgs.map((s) => s.replace(/ \[[^\]]*\]$/, '').replace(/ \(.*\)$/, '')))].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ergebnisse = [];
let sigGesamt = 0;
let urteilGleich = 0;
let objekteGleich = 0;
let warnungenGleich = 0;

for (const f of faelle) {
  const dssText = await readFile(resolve(B, 'dss', `${f.id}.txt`), 'utf8');
  const dss = parseDss(dssText);
  const ts = JSON.parse(await readFile(resolve(B, 'ts', `${f.id}.json`), 'utf8'));
  const tsSigs = ts.signatures.map((s) => ({
    id: s.signatureId,
    datei: s.file,
    format: s.level,
    indication: s.indication,
    subIndication: s.subIndication ?? null,
    signierteObjekte: [...s.signedPaths].sort(),
    fehler: s.errors,
    warnungen: s.warnings,
  }));

  // Paare bilden: gleiche Signaturdatei und gleiche signierte Objekte, sonst gleiche Datei.
  const frei = [...tsSigs];
  const paare = dss.signaturen.map((d) => {
    let i = frei.findIndex((t) => t.datei === d.datei && same(t.signierteObjekte, d.signierteObjekte));
    if (i < 0) i = frei.findIndex((t) => t.datei === d.datei);
    if (i < 0) i = 0;
    const t = frei.splice(i, 1)[0];
    return { d, t };
  });

  const abweichungen = [];
  if (dss.anzahl !== tsSigs.length) abweichungen.push(`Anzahl Signaturen: DSS ${dss.anzahl}, Kern ${tsSigs.length}`);
  const signaturen = paare.map(({ d, t }) => {
    const urteil = !!t && d.indication === t.indication && (d.subIndication ?? null) === (t.subIndication ?? null);
    const objekte = !!t && same(d.signierteObjekte, t.signierteObjekte);
    const warn = !!t && same(norm(d.warnungen), norm(t.warnungen));
    sigGesamt++;
    if (urteil) urteilGleich++;
    else abweichungen.push(`Urteil ${d.id}: DSS ${d.indication}/${d.subIndication ?? '-'}, Kern ${t ? `${t.indication}/${t.subIndication ?? '-'}` : 'keine Signatur'}`);
    if (objekte) objekteGleich++;
    if (warn) warnungenGleich++;
    return {
      urteilGleich: urteil,
      signierteObjekteGleich: objekte,
      warnungenGleich: warn,
      dss: { id: d.id, datei: d.datei, format: d.format, indication: d.indication, subIndication: d.subIndication, signierteObjekte: d.signierteObjekte, fehler: d.fehler, warnungen: d.warnungen, formatPruefung: d.fc },
      kern: t ?? null,
    };
  });
  for (const t of frei) abweichungen.push(`Kern meldet zusätzliche Signatur ${t.id}`);

  const bytes = await readFile(resolve(ROOT, f.container));
  ergebnisse.push({
    id: f.id,
    gruppe: f.gruppe,
    titel: f.titel,
    container: f.container,
    containerSha256: createHash('sha256').update(bytes).digest('hex'),
    richtlinie: f.policy,
    vertrauensanker: f.trust,
    urteilGleich: abweichungen.length === 0,
    abweichungen,
    dssAnzahl: dss.anzahl,
    kernAnzahl: tsSigs.length,
    unsignierteDateienKern: ts.unsignedPaths,
    signaturen,
    laufzeit: laufzeiten.get(f.id) ?? null,
    belege: { dss: `dss/${f.id}.txt`, kern: `ts/${f.id}.json` },
  });
}

const zeiten = ergebnisse.map((e) => e.laufzeit).filter(Boolean);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const ergebnis = {
  paket: 'P2 – Signaturprüfung ohne Java',
  erzeugt: new Date().toISOString(),
  referenz: 'EU DSS 6.5 über prototyp/dss (HproDss validate), Richtlinie je Fall: dss-default = DSS-Standard, hpro = policy-hpro.xml, strict = policy-streng.xml',
  pruefling: JSON.parse(await readFile(resolve(B, 'ts', `${faelle[0].id}.json`), 'utf8')).validator,
  vergleichsregel: 'Urteil gleich = Indication und SubIndication je Signatur identisch und gleiche Anzahl Signaturen. Signierte Objekte und Warnungen werden zusätzlich verglichen, gehen aber nicht ins Urteil ein.',
  zusammenfassung: {
    faelle: ergebnisse.length,
    faelleMitGleichemUrteil: ergebnisse.filter((e) => e.urteilGleich).length,
    signaturen: sigGesamt,
    signaturenMitGleichemUrteil: urteilGleich,
    signaturenMitGleichenSigniertenObjekten: objekteGleich,
    signaturenMitGleichenWarnungen: warnungenGleich,
    laufzeitMedianMs: { dssProzess: median(zeiten.map((z) => z.dssMs)), kernProzess: median(zeiten.map((z) => z.tsMs)) },
  },
  faelle: ergebnisse,
};
await writeFile(resolve(B, 'vergleich-dss.json'), JSON.stringify(ergebnis, null, 2) + '\n');

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('Fall', 40)} ${pad('DSS', 42)} ${pad('Kern', 42)} gleich`);
for (const e of ergebnisse) {
  const fmt = (xs) => (xs.length === 0 ? '0 Signaturen' : xs.map((x) => `${x.indication}${x.subIndication ? '/' + x.subIndication : ''}`).join(', '));
  console.log(`${pad(e.id, 40)} ${pad(fmt(e.signaturen.map((s) => s.dss)), 42)} ${pad(fmt(e.signaturen.map((s) => s.kern).filter(Boolean)), 42)} ${e.urteilGleich ? 'ja' : 'NEIN'}`);
  for (const a of e.abweichungen) console.log(`    ${a}`);
}
console.log();
console.log(JSON.stringify(ergebnis.zusammenfassung, null, 2));
process.exit(ergebnis.zusammenfassung.faelleMitGleichemUrteil === ergebnis.zusammenfassung.faelle ? 0 : 1);
