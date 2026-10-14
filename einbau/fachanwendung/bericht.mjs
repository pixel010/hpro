#!/usr/bin/env node
/**
 * Fachanwendung (S8): Prüfbericht Trinkwasserhygiene aus Messdaten.
 *
 * Shows how a domain application produces hpro documents with the library @hpro/kern alone:
 *
 *   1. read the measurements (CSV, one sample per line);
 *   2. write the report as XHTML: overview (data-hp-role="summary", HP-NEST-005), a calculating
 *      table (formulas after part 3, values computed by the core, HP-CALC), one collapsible section
 *      per sample (details, HP-NEST-001), stable addresses (ids, HP-ADR), the CSV as attachment
 *      (HP-NEST-003);
 *   3. createContainer (profile `signed`: no scripts) → calc.recalculateContainer (formula and
 *      value are both stored);
 *   4. signContainer: the whole report is signed (XAdES-BASELINE-B, with --tsa B-T) — a report
 *      of a domain application is static, so the document itself is the frozen version (Zusage 5).
 *      With --eingefroren the document stays `static` and lock.freezeAndSign adds a signed frozen
 *      rendition instead (for documents that stay editable; epubcheck 5.4.0 reports RSC-011 for
 *      every frozen rendition until change request HPC-0003 is decided);
 *   5. checkConformance with the rule catalogue shipped in the package (@hpro/kern/spec/…).
 *
 *   node bericht.mjs <messdaten.csv> <bericht.hpro> [--zeit ISO] [--key key.pem --cert cert.pem] [--tsa URL] [--eingefroren]
 *
 * With --tsa the signature gets a RFC 3161 time-stamp (XAdES-BASELINE-T, HPR-SIG-012); the time
 * stamp service is the only network access of the application.
 *
 * Without --key/--cert a TEST identity is created and its certificate written next to the
 * report (<bericht>.zertifikat.pem); a real application uses its own key or a remote signature
 * (CSC, see docs/13). Exit codes: 0 report written and checked without errors, 1 the checker found
 * errors, 2 usage or input error.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  KERN_VERSION,
  HttpTimestampAuthority,
  SoftwareKeySigner,
  addSignatureTimestamp,
  calc,
  certificatesFromPem,
  checkConformance,
  createContainer,
  createTestIdentity,
  lock,
  pkcs8FromPem,
  readContainer,
  signContainer,
  toPem,
} from '@hpro/kern';

const LIMIT = 100; // KBE/100 ml, technischer Maßnahmenwert der Trinkwasserverordnung (Legionella spec.)
const TOOL = { name: 'hpro-fachanwendung-beispiel', version: '0.1.0' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Numbers as the core shows them (thousands with a dot, decimal comma).
const de = (n, digits = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** CSV with `;` and a header line; fields without quotes (as written by the laboratory system). */
function readCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split(';');
  const need = ['probe', 'entnahmestelle', 'entnahme', 'temperatur_c', 'kbe_100ml'];
  for (const n of need) if (!head.includes(n)) throw new Error(`Spalte „${n}“ fehlt in der Kopfzeile`);
  return lines.map((line, i) => {
    const f = line.split(';');
    const row = Object.fromEntries(head.map((h, k) => [h, (f[k] ?? '').trim()]));
    const t = Number(row.temperatur_c);
    const k = Number(row.kbe_100ml);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(row.probe)) throw new Error(`Zeile ${i + 2}: Probennummer „${row.probe}“ ist keine gültige Kennung`);
    if (!Number.isFinite(t) || !Number.isFinite(k) || k < 0) throw new Error(`Zeile ${i + 2}: Temperatur oder KBE ist keine Zahl`);
    if (Number.isNaN(Date.parse(row.entnahme))) throw new Error(`Zeile ${i + 2}: Entnahmezeit „${row.entnahme}“ ungültig`);
    return { id: row.probe, ort: row.entnahmestelle, zeit: row.entnahme, temp: t, kbe: k };
  });
}

/** The report as XHTML. Values of formula cells are placeholders; the core calculates them. */
function reportXhtml(samples, at, signed) {
  const n = samples.length;
  const last = n + 1; // data rows 2 … n+1 (row 1 is the header)
  const rows = samples
    .map((s, i) => {
      const r = i + 2;
      return `          <tr id="zeile-${s.id.toLowerCase()}"><th scope="row"><a href="#probe-${s.id.toLowerCase()}">${esc(s.id)}</a></th><td>${esc(s.ort)}</td>` +
        `<td data-hp-type="float" data-hp-value="${s.temp}">${de(s.temp)}</td>` +
        `<td data-hp-type="float" data-hp-value="${s.kbe}">${de(s.kbe, 0)}</td>` +
        `<td data-hp-type="string" data-hp-formula="=IF([.D${r}]&gt;=${LIMIT};&quot;Maßnahme&quot;;IF([.C${r}]&lt;55;&quot;Temperatur prüfen&quot;;&quot;in Ordnung&quot;))" data-hp-value="">–</td></tr>`;
    })
    .join('\n');
  const details = samples
    .map((s) => {
      const over = s.kbe >= LIMIT;
      const cold = s.temp < 55;
      const finding = over
        ? `Der Maßnahmenwert von ${LIMIT} KBE/100 ml ist überschritten (${de(s.kbe, 0)} KBE/100 ml). Die Entnahmestelle ist zu sperren oder thermisch zu desinfizieren; Nachprobe nach der Maßnahme.`
        : cold
          ? `Kein Befund über dem Maßnahmenwert, aber die Temperatur von ${de(s.temp)} °C liegt unter 55 °C; die Zirkulation ist zu prüfen.`
          : `Kein Befund; Temperatur und Keimzahl im Sollbereich.`;
      return `        <details id="probe-${s.id.toLowerCase()}"${over ? ' open=""' : ''}>
          <summary>Probe ${esc(s.id)}: ${esc(s.ort)}${over ? ' – Maßnahme erforderlich' : ''}</summary>
          <dl>
            <dt>Entnahme</dt><dd><time datetime="${esc(s.zeit)}">${esc(new Date(s.zeit).toLocaleString('de-AT', { timeZone: 'Europe/Vienna', dateStyle: 'long', timeStyle: 'short' }))}</time></dd>
            <dt>Temperatur</dt><dd>${de(s.temp)} °C</dd>
            <dt>Legionella spec.</dt><dd>${de(s.kbe, 0)} KBE/100 ml</dd>
          </dl>
          <p>${esc(finding)}</p>
        </details>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Prüfbericht Trinkwasserhygiene Schule Nord</title>
  <link rel="stylesheet" type="text/css" href="styles/bericht.css"/>
</head>
<body>
  <h1 id="titel">Prüfbericht Trinkwasserhygiene Schule Nord</h1>
${signed ? `  <p id="signaturhinweis" data-hp-role="signature-notice">Dieses Dokument ist elektronisch signiert (XAdES). Den Signaturstatus zeigt ein hpro-Lesesystem;
    EPUB-Lesesysteme prüfen Signaturen nicht und zeigen auch eine veränderte Datei ohne Hinweis an.</p>
` : ''}  <section id="ueberblick" data-hp-role="summary">
    <h2 id="ueberblick-h">Überblick</h2>
    <p id="ergebnis">Untersucht wurden <a href="#messwerte.D${last + 1}" data-hp-ref="value">–</a> Proben auf Legionella spec.
      An <a href="#messwerte.D${last + 2}" data-hp-ref="value">–</a> Entnahmestellen ist der Maßnahmenwert von ${LIMIT} KBE/100 ml erreicht oder überschritten;
      der höchste Wert beträgt <a href="#messwerte.D${last + 3}" data-hp-ref="value">–</a> KBE/100 ml.
      Die mittlere Warmwassertemperatur an den Entnahmestellen liegt bei <a href="#messwerte.C${last + 4}" data-hp-ref="value">–</a> °C.</p>
    <p>Die Zahlen dieses Überblicks rechnet das Dokument aus der Messwerttabelle; die Einzelheiten je Probe stehen
      im Abschnitt <a href="#proben-h">Proben im Einzelnen</a>. Die Messdaten liegen dem Dokument als Anhang bei.</p>
  </section>
  <section id="messwerte-abschnitt">
    <h2 id="messwerte-h">Messwerte</h2>
    <table id="messwerte" data-hp-table="scroll">
      <caption>Messwerte und Bewertung je Entnahmestelle (Probenahme ${esc(at.slice(0, 10))})</caption>
      <thead>
        <tr><th scope="col">Probe</th><th scope="col">Entnahmestelle</th><th scope="col">Temperatur (°C)</th><th scope="col">KBE/100 ml</th><th scope="col">Bewertung</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
      <tfoot>
        <tr><th scope="row" colspan="3">Anzahl Proben</th><td id="messwerte.D${last + 1}" data-hp-type="float" data-hp-formula="=COUNT([.D2:.D${last}])" data-hp-value="0">–</td><td></td></tr>
        <tr><th scope="row" colspan="3">Proben ab ${LIMIT} KBE/100 ml</th><td id="messwerte.D${last + 2}" data-hp-type="float" data-hp-formula="=COUNTIF([.D2:.D${last}];&quot;&gt;=${LIMIT}&quot;)" data-hp-value="0">–</td><td></td></tr>
        <tr><th scope="row" colspan="3">Höchstwert</th><td id="messwerte.D${last + 3}" data-hp-type="float" data-hp-formula="=MAX([.D2:.D${last}])" data-hp-value="0">–</td><td></td></tr>
        <tr><th scope="row" colspan="2">Mittlere Temperatur</th><td id="messwerte.C${last + 4}" data-hp-type="float" data-hp-formula="=ROUND(AVERAGE([.C2:.C${last}]);1)" data-hp-value="0">–</td><td></td><td></td></tr>
      </tfoot>
    </table>
  </section>
  <section id="proben">
    <h2 id="proben-h">Proben im Einzelnen</h2>
${details}
  </section>
  <section id="grundlagen">
    <h2 id="grundlagen-h">Grundlagen</h2>
    <p>Bewertung nach dem technischen Maßnahmenwert von ${LIMIT} KBE/100 ml für Legionella spec. und einer
      Warmwassertemperatur von mindestens 55 °C an den Entnahmestellen. Erzeugt von ${esc(TOOL.name)} ${esc(TOOL.version)}
      mit @hpro/kern ${esc(KERN_VERSION)}.</p>
  </section>
</body>
</html>
`;
}

// Text follows the reading-system variables (HP-INH-004); the values after the comma are fallbacks.
const CSS = `body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 48rem; padding: 1rem;
  font-size: var(--hp-font-size, 1rem); line-height: var(--hp-line-height, 1.5);
  letter-spacing: var(--hp-letter-spacing, normal); word-spacing: var(--hp-word-spacing, normal);
  color: var(--hp-foreground, #111); background: var(--hp-background, #fff); }
p, table, details { margin-top: var(--hp-paragraph-spacing, 1em); margin-bottom: var(--hp-paragraph-spacing, 1em); }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #888; padding: 0.25rem 0.5rem; text-align: left; vertical-align: top; }
td[data-hp-type="float"] { text-align: right; }
details { border: 1px solid #ccc; border-radius: 0.25rem; padding: 0.25rem 0.75rem; margin: 0.5rem 0; }
summary { font-weight: 600; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0 1rem; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; }
table, figure, pre, details { break-inside: avoid; }
`;

async function main(argv) {
  const pos = [];
  const opt = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (['--zeit', '--key', '--cert', '--tsa'].includes(argv[i])) opt.set(argv[i], argv[++i]);
    else if (argv[i] === '--eingefroren') opt.set('--eingefroren', 'ja');
    else if (argv[i].startsWith('--')) throw new UsageError(`unbekannte Option ${argv[i]}`);
    else pos.push(argv[i]);
  }
  if (pos.length !== 2 || opt.has('--key') !== opt.has('--cert')) throw new UsageError('usage: node bericht.mjs <messdaten.csv> <bericht.hpro> [--zeit ISO] [--key key.pem --cert cert.pem] [--tsa URL] [--eingefroren]');
  const [input, output] = pos;
  const at = opt.get('--zeit') ?? new Date().toISOString().slice(0, 19) + 'Z';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(at)) throw new UsageError(`--zeit ${at}: erwartet YYYY-MM-DDThh:mm:ssZ`);
  const csv = await readFile(input);
  const samples = readCsv(new TextDecoder('utf-8', { fatal: true }).decode(csv));
  if (samples.length === 0) throw new UsageError('keine Messwerte');

  // 1–2: document id from the data, so the same measurement gives the same document (HP-CONT-014).
  const h = createHash('sha256').update(csv).digest('hex');
  const id = `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  const xhtml = reportXhtml(samples, at, !opt.has('--eingefroren'));
  const created = await createContainer({
    id,
    title: 'Prüfbericht Trinkwasserhygiene Schule Nord',
    language: 'de-AT',
    modified: at,
    profile: opt.has('--eingefroren') ? 'static' : 'signed',
    creators: ['Hygienelabor Beispiel'],
    description: `Legionellen-Untersuchung von ${samples.length} Entnahmestellen, erzeugt aus ${basename(input)}`,
    readingOrder: ['content/index.xhtml'],
    toc: {
      title: 'Inhalt',
      entries: [
        { title: 'Überblick', href: 'content/index.xhtml#ueberblick' },
        { title: 'Messwerte', href: 'content/index.xhtml#messwerte-abschnitt' },
        { title: 'Proben im Einzelnen', href: 'content/index.xhtml#proben' },
        { title: 'Grundlagen', href: 'content/index.xhtml#grundlagen' },
      ],
    },
    resources: [
      { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: xhtml },
      { path: 'content/styles/bericht.css', mediaType: 'text/css', data: CSS },
      { path: 'attachments/messwerte.csv', mediaType: 'text/csv', data: csv },
    ],
    attachments: [{ url: 'attachments/messwerte.csv', name: `Messdaten (${basename(input)})` }],
    accessibility: {
      accessMode: ['textual'],
      accessModeSufficient: ['textual'],
      accessibilityFeature: ['structuralNavigation', 'tableOfContents'],
      accessibilityHazard: ['none'],
      accessibilitySummary: 'Prüfbericht mit Überblick, rechnender Messwerttabelle mit Zeilen- und Spaltenköpfen und aufklappbaren Einzelbefunden.',
    },
  });

  // 3: the core calculates every formula and stores value and computedAt (part 3).
  const recalc = await calc.recalculateContainer(created.bytes, { computedAt: at, note: 'Werte aus den Messdaten berechnet' });

  // 4: signature over the whole report, or a frozen signed rendition (HP-PROF-006 … 010).
  let certPem;
  let signer;
  if (opt.has('--key')) {
    certPem = await readFile(opt.get('--cert'), 'utf8');
    signer = await SoftwareKeySigner.fromPkcs8(pkcs8FromPem(await readFile(opt.get('--key'), 'utf8')), { certificateChain: certificatesFromPem(certPem) });
  } else {
    const identity = await createTestIdentity({ algorithm: 'EC-P256', commonName: 'Hygienelabor Beispiel (TEST)', notBefore: new Date(Date.parse(at) - 86_400_000) });
    certPem = toPem('CERTIFICATE', identity.certificate);
    await writeFile(output.replace(/\.hpro$/, '') + '.zertifikat.pem', certPem);
    signer = await SoftwareKeySigner.fromPkcs8(identity.pkcs8, { certificateChain: [identity.certificate] });
  }
  let bytes;
  let signatureId;
  let what;
  if (opt.has('--eingefroren')) {
    const frozen = await lock.freezeAndSign(recalc.bytes, { id: 'nachweis', createdAt: at, signer, signatureId: 'nachweis-signatur' });
    bytes = frozen.bytes;
    signatureId = frozen.signatureId;
    what = `eingefrorene Fassung „${frozen.rendition}“ (${frozen.files.length} Dateien) signiert`;
  } else {
    const signed = await signContainer(recalc.bytes, { signer, signingTime: new Date(at), signatureId: 'bericht-signatur' });
    bytes = signed.bytes;
    signatureId = signed.signatureId;
    what = `ganzes Dokument signiert (${signed.signedPaths.length} Dateien)`;
  }
  let stamp;
  if (opt.has('--tsa')) {
    const t = await addSignatureTimestamp(bytes, { signatureId, timestamp: new HttpTimestampAuthority(opt.get('--tsa')) });
    bytes = t.bytes;
    stamp = t.timestamp;
  }
  await writeFile(output, bytes);

  // 5: conformance check with the catalogue of the package.
  const catalog = JSON.parse(await readFile(new URL(import.meta.resolve('@hpro/kern/spec/01-regelkatalog.json')), 'utf8'));
  const report = await checkConformance(bytes, catalog, { fileName: basename(output), trustAnchors: certificatesFromPem(certPem), ...(stamp ? {} : { validationTime: at }) });
  const back = await readContainer(bytes);

  console.log(`${output}: ${bytes.length} Bytes, sha256=${createHash('sha256').update(bytes).digest('hex')}`);
  console.log(`  @hpro/kern ${KERN_VERSION} · ${samples.length} Proben · id ${id} · Stand ${at}`);
  console.log(`  Rechnen: ${recalc.documents.map((d) => `${d.path}: ${d.formulas} Formeln, ${d.changed.length} Werte gesetzt, ${d.circular.length} Zirkelbezüge`).join('; ')}`);
  console.log(`  ${what}, Signatur ${signatureId}${stamp ? `, Zeitstempel ${stamp.genTime} (${stamp.tsaSubject})` : ' (XAdES-BASELINE-B, ohne Zeitstempel)'}`);
  console.log(`  Hash-Manifest beim Rücklesen: ${back.integrity.ok ? 'ok' : 'FEHLER'}; Anhänge: ${(back.manifest.attachments ?? []).map((a) => a.url).join(', ')}`);
  console.log(`  Konformitätsprüfer (${report.tool.name} ${report.tool.version}, Katalog ${report.catalog.version}): ${report.summary.fatal} fatal, ${report.summary.error} Fehler, ${report.summary.warning} Warnungen, ${report.summary.info} Hinweise, ${report.summary.notChecked} nicht geprüft`);
  for (const [level, verdict] of Object.entries(report.levels.verdict)) console.log(`    Stufe ${level}: ${verdict}`);
  for (const r of report.results.filter((x) => x.class !== 'INFO')) console.log(`    ${r.class} ${r.rule}: ${r.message}`);
  for (const r of report.renditions) console.log(`    Fassung ${r.id ?? '(Hauptfassung)'} (${r.profile ?? '?'}): ${Object.entries(r.verdict).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  return report.summary.fatal + report.summary.error > 0 ? 1 : 0;
}

class UsageError extends Error {}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(`hpro-pruefbericht: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  },
);
