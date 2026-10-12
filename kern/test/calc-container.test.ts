/**
 * Calculator on containers: fill in and save (HPF-STO-006, HPF-FRZ-006), frozen rendition with
 * values but without calculator (HPF-FRZ-001/002, HP-PROF-006/007), signature over the rendition
 * and detection of a changed frozen value (HPF-FRZ-003/005, HP-PROF-009/010), import with
 * frozen unsupported formulas (HPF-IMP-001…004) and export (HPF-IMP-005).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { SoftwareKeySigner, calc, createContainer, createTestIdentity, readContainer, readZip, signContainer, validateContainer, writeZip, type DocumentInput } from '../src/index.js';
import { parse, show } from './calc-helpers.js';
import { REPO_ROOT, text } from './helpers.js';

const EXAMPLE = resolve(REPO_ROOT, 'docs/spezifikation/beispiele/p19-kostenschaetzung');
const RID = 'nachweis-2026-10-12';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}

async function example(): Promise<Uint8Array> {
  const doc = JSON.parse(readFileSync(join(EXAMPLE, 'dokument.json'), 'utf8')) as DocumentInput & { profile: 'static' };
  const resources = walk(EXAMPLE)
    .map((f) => relative(EXAMPLE, f))
    .filter((p) => p !== 'dokument.json')
    .map((path) => ({ path, mediaType: path.endsWith('.xhtml') ? 'application/xhtml+xml' : 'text/css', data: readFileSync(join(EXAMPLE, path)) }));
  return (await createContainer({ ...doc, resources })).bytes;
}

function cellOf(xhtmlText: string, address: string): calc.CellModel {
  const d = new calc.CalcDocument(parse(xhtmlText));
  return d.cell(address)!;
}

test('Beispiel p19-kostenschaetzung: gespeicherte Werte stimmen mit dem Rechner überein', async () => {
  const r = await calc.inspectCalculation(await example());
  assert.equal(r.integrity.ok, true);
  assert.equal(r.documents[0]!.formulas, 38);
  assert.deepEqual(r.documents[0]!.deviations, []);
});

test('HPF-STO-011/006, HPF-FRZ-006: ausfüllen, neu berechnen, speichern mit computedAt, calculator und Verlauf', async () => {
  const bytes = await example();
  const r = await calc.recalculateContainer(bytes, {
    computedAt: '2026-10-12T10:00:00Z',
    // the same entries as in the cross-check against LibreOffice (scripts/p19-gegenprobe.mjs)
    set: [
      { address: 'aufmass.C2', value: '13,10' },
      { address: 'aufmass.D4', value: '1,95' },
      { address: 'aufmass.E5', value: '-4' },
      { address: 'kosten.A4', value: 'D02' },
      { address: 'kosten.C4', value: '31,5' },
      { address: 'kosten.C6', value: '4' },
      { address: 'kosten.E8', value: '5 %' },
      { address: 'kennzahlen.B4', value: '2026-12-30' },
    ],
  });
  const c = await readContainer(r.bytes);
  assert.equal(c.integrity.ok, true, 'hash manifest updated');
  const m = c.manifest as unknown as { computedAt: string; calculator: unknown; history: Array<{ version: number; note: string; manifestIntegrity: string }>; dateModified: string };
  assert.equal(m.computedAt, '2026-10-12T10:00:00Z');
  assert.equal(m.dateModified, '2026-10-12T10:00:00Z');
  assert.deepEqual(m.calculator, { name: 'hpro-calc', version: '0.1.0', spec: '0.1' });
  assert.equal(m.history.length, 1);
  assert.match(m.history[0]!.note, /aufmass\.C2/);
  assert.match(m.history[0]!.note, /kosten\.E8/);
  assert.match(m.history[0]!.note, /kosten\.F11/);
  assert.match(text(c.files.get('package.opf')!), /dcterms:modified">2026-10-12T10:00:00Z</);
  const x = text(c.files.get('content/index.xhtml')!);
  assert.equal(show(cellOf(x, 'aufmass.F2').stored), '89.74');
  assert.equal(show(cellOf(x, 'kosten.F11').stored), '21556.58');
  assert.equal(show(cellOf(x, 'kosten.B4').stored), '"Unterspannbahn"');
  assert.equal(show(cellOf(x, 'kennzahlen.B6').stored), '53');
  assert.match(x, /data-hp-ref="value">21\.556,58 €</);
  // the change is a text change of the cells: everything else stays byte-identical
  const before = text((await readContainer(bytes)).files.get('content/index.xhtml')!);
  assert.ok(before.includes('data-hp-value="12.4"') && x.includes('data-hp-value="13.1"'));
  const again = await calc.inspectCalculation(r.bytes);
  assert.deepEqual(again.documents[0]!.deviations, [], 'saved values are consistent');
});

test('HPF-FRZ-001/002, HP-PROF-006/007: eingefrorene Fassung mit Werten, Formeln, ohne Eingabe und Prüfregeln', async () => {
  const filled = await calc.recalculateContainer(await example(), { computedAt: '2026-10-12T10:00:00Z', set: [{ address: 'aufmass.C2', value: '-1' }] });
  const frozen = await calc.freezeContainer(filled.bytes, { id: RID, createdAt: '2026-10-12T10:05:00Z', profile: 'signed' });
  const c = await readContainer(frozen.bytes);
  assert.equal(c.integrity.ok, true);
  const prefix = `renditions/${RID}/`;
  assert.deepEqual(frozen.files, [`${prefix}content/index.xhtml`, `${prefix}content/nav.xhtml`, `${prefix}content/styles/document.css`, `${prefix}manifest.json`]);
  const rm = JSON.parse(text(c.files.get(`${prefix}manifest.json`)!));
  assert.equal(rm.computedAt, '2026-10-12T10:05:00Z');
  assert.deepEqual(rm.calculator, { name: 'hpro-calc', version: '0.1.0', spec: '0.1' });
  assert.equal(rm.derivedFrom.method, 'render');
  assert.match(rm.conformsTo, /profile\/signed$/);
  const main = c.manifest as unknown as { renditions: Array<{ id: string; role: string; url: string }> };
  assert.deepEqual(main.renditions.map((r) => [r.id, r.role, r.url]), [[RID, 'frozen', `${prefix}manifest.json`]]);
  const x = text(c.files.get(`${prefix}content/index.xhtml`)!);
  assert.doesNotMatch(x, /data-hp-input|data-hp-check|data-hp-stale/);
  assert.match(x, /data-hp-formula="=ROUND\(\[\.C2\]\*\[\.D2\]\*\[\.E2\];2\)" data-hp-value="-6\.85"/);
  assert.match(x, /<\/table><p class="hp-check-summary">Prüfungen bei der Berechnung: 7 von 8 erfüllt; nicht erfüllt: aufmass\.C2 \(Die Länge muss größer als 0 sein\.\)\.<\/p>/);
  assert.match(x, /<p class="hp-check-summary">Prüfungen bei der Berechnung: 9 von 9 erfüllt\.<\/p>/);
  assert.match(x, /data-hp-role="signature-notice"/);
  // formulas identical to the main version at the time of freezing (HPF-FRZ-002)
  const formulas = (s: string) => [...s.matchAll(/data-hp-formula="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(formulas(x), formulas(text(c.files.get('content/index.xhtml')!)));
  const insp = await calc.inspectCalculation(frozen.bytes, RID);
  assert.equal(insp.integrity.ok, true);
  assert.deepEqual(insp.documents[0]!.deviations, []);
  // HPF-STO-008: without calculator the stored values are what a reader shows
  const d = new calc.CalcDocument(parse(x));
  assert.equal(show(d.cell('kosten.F11')!.stored), show(cellOf(text(c.files.get('content/index.xhtml')!), 'kosten.F11').stored));
});

async function signedFrozen(): Promise<{ bytes: Uint8Array; cert: Uint8Array }> {
  const frozen = await calc.freezeContainer(await example(), { id: RID, createdAt: '2026-10-12T10:05:00Z', profile: 'signed' });
  const id = await createTestIdentity({ algorithm: 'EC-P256', commonName: 'P19 Testunterzeichner' });
  const signer = await SoftwareKeySigner.fromPkcs8(id.pkcs8, { certificateChain: [id.certificate] });
  const signed = await signContainer(frozen.bytes, { signer, signingTime: new Date('2026-10-12T10:06:00Z'), signatureId: 'sig-nachweis', paths: [...frozen.files] });
  return { bytes: signed.bytes, cert: id.certificate };
}

async function changeEntry(bytes: Uint8Array, path: string, edit: (s: string) => string, alsoManifest = false): Promise<Uint8Array> {
  const entries = await readZip(bytes);
  const changed = new TextEncoder().encode(edit(text(entries.find((e) => e.name === path)!.data)));
  const mPath = path.replace(/content\/.*$/, 'manifest.json');
  const { sriSha256 } = await import('../src/hash.js');
  const sri = await sriSha256(changed);
  const out = entries.map((e) => {
    if (e.name === path) return { name: e.name, data: changed };
    if (alsoManifest && e.name === mPath) {
      const m = JSON.parse(text(e.data));
      for (const r of m.resources) if (r.url === path) r.integrity = sri;
      return { name: e.name, data: new TextEncoder().encode(JSON.stringify(m, null, 2) + '\n') };
    }
    return { name: e.name, data: e.data };
  });
  return writeZip(
    out.map((e) => ({ name: e.name, data: e.data, compression: e.name === 'mimetype' ? 'store' : 'auto' })),
    { modified: new Date('2026-10-12T12:00:00Z') },
  );
}

test('HPF-FRZ-005, HP-PROF-010: signierte eingefrorene Fassung; geänderter Wert wird erkannt', async () => {
  const { bytes, cert } = await signedFrozen();
  const ok = await validateContainer(bytes, { trustAnchors: [cert] });
  assert.deepEqual(ok.signatures.map((s) => s.indication), ['TOTAL_PASSED']);
  const path = `renditions/${RID}/content/index.xhtml`;
  // a) value changed with a ZIP tool: signature, hash manifest and recalculation all notice it
  const tampered = await changeEntry(bytes, path, (s) => s.replace('data-hp-value="21525.4">21.525,40 €', 'data-hp-value="12525.4">12.525,40 €'));
  const v = await validateContainer(tampered, { trustAnchors: [cert] });
  assert.equal(v.signatures[0]!.indication, 'TOTAL_FAILED');
  assert.equal(v.signatures[0]!.subIndication, 'HASH_FAILURE');
  const insp = await calc.inspectCalculation(tampered, RID);
  assert.equal(insp.integrity.ok, false);
  assert.deepEqual(insp.integrity.resources.filter((r) => r.status !== 'ok').map((r) => [r.path, r.status]), [[path, 'hash-mismatch']]);
  assert.deepEqual(insp.documents[0]!.deviations.map((d) => [d.address, d.stored, d.computed]), [['kosten.F11', '12525.4', '21525.4']]);
  // b) value and rendition manifest changed consistently: the signature still fails, the recalculation still differs
  const careful = await changeEntry(bytes, path, (s) => s.replace('data-hp-value="21525.4">21.525,40 €', 'data-hp-value="12525.4">12.525,40 €'), true);
  const v2 = await validateContainer(careful, { trustAnchors: [cert] });
  assert.equal(v2.signatures[0]!.subIndication, 'HASH_FAILURE');
  const insp2 = await calc.inspectCalculation(careful, RID);
  assert.equal(insp2.integrity.ok, true);
  assert.equal(insp2.documents[0]!.deviations.length, 1);
});

test('HP-PROF-009: Ausfüllen der Hauptfassung berührt die Signatur der eingefrorenen Fassung nicht', async () => {
  const { bytes, cert } = await signedFrozen();
  const filled = await calc.recalculateContainer(bytes, { computedAt: '2026-10-12T11:00:00Z', set: [{ address: 'kosten.C4', value: '30' }] });
  const v = await validateContainer(filled.bytes, { trustAnchors: [cert] });
  assert.deepEqual(v.signatures.map((s) => s.indication), ['TOTAL_PASSED']);
  const c = await readContainer(filled.bytes);
  assert.notEqual(text(c.files.get('content/index.xhtml')!), text(c.files.get(`renditions/${RID}/content/index.xhtml`)!));
});

const FIXTURES = resolve(REPO_ROOT, 'kern/test/fixtures');

test('HPF-IMP-001/002/003: nicht unterstützte Formeln als Wert eingefroren und im Bericht (ODS aus LibreOffice)', async () => {
  const r = await calc.importSpreadsheet(readFileSync(join(FIXTURES, 'p19-quelle.ods')), { sourceName: 'p19-quelle.ods', importedAt: '2026-10-12T11:00:00Z' });
  const byAddress = new Map(r.report.frozen.map((f) => [f.address, f]));
  const reason = (a: string) => byAddress.get(`content/index.xhtml#kosten.${a}`)?.reason;
  assert.equal(reason('D6'), 'function'); // NOW
  assert.equal(reason('D7'), 'function'); // INDIRECT
  assert.equal(reason('D8'), 'function'); // RAND
  assert.equal(reason('D9'), 'function'); // TEXT
  assert.equal(reason('D10'), 'function'); // CEILING
  assert.equal(reason('D11'), 'reference'); // SUM(B:B)
  assert.equal(reason('D12'), 'syntax'); // inline array
  assert.equal(reason('D13'), 'circular');
  assert.equal(reason('D14'), 'circular');
  assert.equal(reason('D17'), 'function'); // COM.MICROSOFT.XLOOKUP
  assert.equal(reason('D19'), 'macro'); // user function from Basic
  assert.equal(r.report.frozen.filter((f) => f.address === '(Container)' && f.reason === 'macro').length, 3);
  assert.equal(r.report.summary.translated, 8);
  assert.deepEqual(r.report.deviations, [], 'taken-over formulas compute like the source');
  assert.equal(byAddress.get('content/index.xhtml#kosten.D7')!.value, '1175.25');
  assert.equal(byAddress.get('content/index.xhtml#kosten.D13')!.value, '#N/A', 'HPF-IMP-002: no valid stored value');
  const c = await readContainer(r.bytes);
  assert.equal(c.integrity.ok, true);
  assert.ok(c.files.has('data/import-report.json'));
  assert.ok(![...c.files.keys()].some((p) => /Basic|Scripts|Modul/i.test(p)), 'no macro code in the container');
  assert.ok(![...c.files.values()].some((b) => text(b).includes('VERDOPPELN = 2')), 'macro source not copied');
  const x = text(c.files.get('content/index.xhtml')!);
  assert.match(x, /data-hp-import="frozen" data-hp-import-formula="=NOW\(\)"/);
  assert.match(x, /data-hp-formula="=ROUND\(\[\.D4\]\*\[satze\.B1\];2\)"/);
  const m = c.manifest as unknown as { computedAt: string; calculator: { name: string } };
  assert.equal(m.calculator.name, 'hpro-calc');
});

/** Minimal workbook in Excel's own convention (1900 or 1904 system, date format id 14). */
async function excelWorkbook(date1904: boolean, cells: string): Promise<Uint8Array> {
  const u = (t: string) => new TextEncoder().encode(t);
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return writeZip(
    [
      { name: '[Content_Types].xml', data: u('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'), compression: 'auto' },
      { name: 'xl/workbook.xml', data: u(`<workbook xmlns="${main}" xmlns:r="${rel}"><workbookPr${date1904 ? ' date1904="1"' : ''}/><sheets><sheet name="Blatt 1" sheetId="1" r:id="rId1"/></sheets></workbook>`), compression: 'auto' },
      { name: 'xl/_rels/workbook.xml.rels', data: u('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>'), compression: 'auto' },
      { name: 'xl/styles.xml', data: u(`<styleSheet xmlns="${main}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`), compression: 'auto' },
      { name: 'xl/worksheets/sheet1.xml', data: u(`<worksheet xmlns="${main}"><sheetData>${cells}</sheetData></worksheet>`), compression: 'auto' },
    ],
    { modified: new Date('2026-10-12T00:00:00Z') },
  );
}

test('HPF-IMP-004: Übersetzung aus der A1-Schreibweise (XLSX aus LibreOffice)', async () => {
  const r = await calc.importSpreadsheet(readFileSync(join(FIXTURES, 'p19-quelle.xlsx')), { sourceName: 'p19-quelle.xlsx', importedAt: '2026-10-12T11:00:00Z' });
  const c = await readContainer(r.bytes);
  const x = text(c.files.get('content/index.xhtml')!);
  assert.match(x, /data-hp-formula="=SUM\(\[\.D2:\.D3\]\)"/);
  assert.match(x, /data-hp-formula="=ROUND\(\[\.D4\]\*\[satze\.B1\];2\)"/);
  assert.match(x, /data-hp-formula="=SUMIF\(\[\.A2:\.A3\];&quot;Aushub&quot;;\[\.D2:\.D3\]\)"/);
  assert.match(x, /data-hp-type="currency" data-hp-value="18\.9" data-hp-unit="EUR"/);
  assert.match(x, /data-hp-type="date" data-hp-value="2026-10-12"/);
  assert.match(x, /data-hp-formula="=EDATE\(\[\.B20\];1\)" data-hp-type="date" data-hp-value="2026-11-12"/);
  assert.match(x, /data-hp-type="percentage" data-hp-value="0\.2"/);
  const reasons = Object.fromEntries(r.report.frozen.map((f) => [f.address.split('.').pop(), f.reason]));
  assert.equal(reasons.D10, 'function'); // _xlfn.CEILING.MATH
  assert.equal(reasons.D11, 'reference');
  assert.equal(reasons.D12, 'syntax');
  assert.deepEqual(r.report.deviations, []);
  // LibreOffice writes 1900-02-28 as serial 60, which is 1900-02-29 in Excel's 1900 system: reported, not reinterpreted
  assert.deepEqual(r.report.notes.map((n) => n.address), ['content/index.xhtml#kosten.B15']);
  const ids = new Map([['Tabelle1', 'tabelle1']]);
  assert.deepEqual(calc.translateExcelFormula('SUM(A1:A3)', 'Tabelle1', ids).result, { ok: true, formula: '=SUM([.A1:.A3])' });
  assert.deepEqual(calc.translateExcelFormula('SUM(A1,A3)', 'Tabelle1', ids).result, { ok: true, formula: '=SUM([.A1];[.A3])' });
  assert.deepEqual(calc.translateExcelFormula('IF(TRUE,1,0)', 'Tabelle1', ids).result, { ok: true, formula: '=IF(TRUE();1;0)' });
  assert.deepEqual(calc.translateExcelFormula('A2*$B$1', 'Tabelle1', ids, 3, 0).result, { ok: true, formula: '=[.A5]*[.B1]' }, 'shared formula shifted');
  assert.deepEqual(calc.translateExcelFormula("'Blatt 2'!A1+Tabelle1!B2", 'Tabelle1', new Map([...ids, ['Blatt 2', 'blatt-2']])).result, { ok: true, formula: '=[blatt-2.A1]+[.B2]' });
  assert.equal(calc.translateExcelFormula('[1]Blatt!A1', 'Tabelle1', ids).result.ok, false);
  assert.equal(calc.translateExcelFormula('A1 B1', 'Tabelle1', ids).result.ok, false, 'intersection operator');
});

test('HPF-IMP-004: Datum aus dem 1900- und dem 1904-System über das Kalenderdatum', async () => {
  // Excel 1900 system: 59 = 1900-02-28, 61 = 1900-03-01, 45000 = 2023-03-15
  const w1900 = await excelWorkbook(false, '<row r="1"><c r="A1" s="1"><v>59</v></c><c r="B1" s="1"><v>61</v></c><c r="C1" s="1"><v>45000</v></c><c r="D1"><f>C1+1</f><v>45001</v></c></row>');
  const a = await calc.importSpreadsheet(w1900, { sourceName: 'datum1900.xlsx', importedAt: '2026-10-12T11:00:00Z' });
  assert.match(a.xhtml, /data-hp-value="1900-02-28"/);
  assert.match(a.xhtml, /data-hp-value="1900-03-01"/);
  assert.match(a.xhtml, /data-hp-value="2023-03-15"/);
  assert.match(a.xhtml, /data-hp-formula="=\[\.C1\]\+1"/);
  // 1904 system: 0 = 1904-01-01
  const w1904 = await excelWorkbook(true, '<row r="1"><c r="A1" s="1"><v>0</v></c><c r="B1" s="1"><v>43538</v></c></row>');
  const b = await calc.importSpreadsheet(w1904, { sourceName: 'datum1904.xlsx', importedAt: '2026-10-12T11:00:00Z' });
  assert.match(b.xhtml, /data-hp-value="1904-01-01"/);
  assert.match(b.xhtml, /data-hp-value="2023-03-15"/);
  assert.equal(calc.serialFromExcel(59, false), 60, '1900-02-28');
  assert.equal(calc.serialFromExcel(61, false), 61, '1900-03-01');
  assert.equal(calc.serialFromExcel(60, false), null, '1900-02-29 does not exist');
  assert.equal(calc.serialFromExcel(0, true), 1462, '1904 system');
});

test('HPF-IMP-005: Export als OpenDocument-Tabelle', async () => {
  const c = await readContainer(await example());
  const d = new calc.CalcDocument(parse(text(c.files.get('content/index.xhtml')!)));
  d.recalc();
  const fods = text(await calc.exportTables(d, 'fods'));
  assert.match(fods, /table:formula="of:=ROUND\(SUM\(\[\.F2:\.F6\]\);2\)" office:value-type="currency" office:currency="EUR" office:value="18492\.61"/);
  assert.match(fods, /<table:null-date table:date-value="1899-12-30"\/>/);
  assert.match(fods, /office:value-type="date" office:date-value="2026-10-12"/);
  const ods = await calc.exportTables(d, 'ods');
  const entries = await readZip(ods);
  assert.equal(entries[0]!.name, 'mimetype');
  assert.equal(text(entries[0]!.data), 'application/vnd.oasis.opendocument.spreadsheet');
  const csv = text(await calc.exportTables(d, 'csv', 'kosten'));
  assert.match(csv, /^Code,Leistung,Menge,Einheit,Einheitspreis,Betrag\r\n/);
  assert.match(csv, /D01,Ziegeleindeckung inkl\. Lattung,174\.47,m²,68\.5,11951\.2\r\n/);
  const json = JSON.parse(text(await calc.exportTables(d, 'json', 'kennzahlen')));
  assert.deepEqual(json.tables[0].cells.find((x: { address: string }) => x.address === 'B5'), { address: 'B5', type: 'date', value: 46338, stored: '2026-11-12', formula: '=EDATE([.B4];1)', display: '12.11.2026' });
});
