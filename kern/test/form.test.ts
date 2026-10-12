/**
 * Forms (package P6, HPC-0009): calculation with field names as named expressions, conditions,
 * validation before submitting (entries, HTML constraints, check rules, JSON Schema), data file
 * and export, the static form of a frozen rendition. Uses the example
 * docs/spezifikation/beispiele/p6-antrag/ and small documents for edge cases.
 */
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { calc, createContainer, form, readContainer, type DocumentInput } from '../src/index.js';
import { REPO_ROOT, nodeSri, text } from './helpers.js';

const EXAMPLE = join(REPO_ROOT, 'docs/spezifikation/beispiele/p6-antrag');
const T0 = '2026-10-12T09:00:00Z';
const T1 = '2026-10-12T09:30:00Z';

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** The example of P6 as a container, built the way scripts/p6-beispiel.mjs builds it. */
async function example(): Promise<Uint8Array> {
  const doc = JSON.parse(await readFile(join(EXAMPLE, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const types: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', json: 'application/json' };
  const files = (await walk(EXAMPLE)).map((f) => relative(EXAMPLE, f)).filter((p) => p !== 'dokument.json').sort();
  const resources = await Promise.all(files.map(async (path) => ({ path, mediaType: types[path.split('.').pop()!]!, data: new Uint8Array(await readFile(join(EXAMPLE, path))) })));
  return (await createContainer({ ...doc, resources })).bytes;
}

/** A valid, complete application (as typed by a user, German number format). */
const VALID: Record<string, string> = {
  vorname: 'Maria', nachname: 'Muster', geburtsdatum: '14.03.1988', email: 'maria.muster@beispiel.at', telefon: '+43 512 123456',
  familienstand: 'verheiratet', kinder: '1', beschaeftigung: 'angestellt', mitantrag: 'ja', mit_vorname: 'Thomas', mit_nachname: 'Muster',
  mit_einkommen: '2.480,50', einkommen: '2.950,00', sonstige_einnahmen: '138,30', wohnkosten: '1.150,00', lebenshaltung: '1.850,00',
  kaufpreis: '420.000', eigenmittel: '105.000', laufzeit_jahre: '25', kontoinhaber: 'Maria Muster', iban: 'AT61 1904 3002 3457 3201',
  antragsdatum: '2026-10-12', ort: 'Innsbruck', angaben_richtig: 'ja', datenschutz: 'ja',
};
const entries = (o: Record<string, string>): form.FormEntry[] => Object.entries(o).map(([field, value]) => ({ field, value }));

function dom(body: string): calc.DomDocument {
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT"><head><title>t</title></head><body>${body}</body></html>`;
  return new DOMParser().parseFromString(xhtml, 'application/xhtml+xml') as unknown as calc.DomDocument;
}

async function rejected(p: Promise<unknown>): Promise<form.FormRejected> {
  try {
    await p;
  } catch (err) {
    assert.ok(err instanceof form.FormRejected, `expected FormRejected, got ${String(err)}`);
    return err;
  }
  assert.fail('expected FormRejected, nothing was thrown');
}

describe('Formeln: Feldnamen als benannte Ausdrücke (OpenFormula §5.11)', () => {
  it('nur mit { names: true }; Tabellenformeln lehnen Namen weiter ab', () => {
    assert.deepEqual(calc.parseFormula('=a+b', { names: true }), { k: 'bin', op: '+', a: { k: 'name', v: 'a' }, b: { k: 'name', v: 'b' } });
    assert.throws(() => calc.parseFormula('=a+b'), /named expressions are not allowed/);
    assert.throws(() => calc.parseFormula('=A1+1', { names: true }), /invalid name A1/);
    assert.throws(() => calc.parseFormula('=TRUE+1', { names: true }), /invalid name TRUE/);
    assert.equal(calc.isFormName('kaufpreis'), true);
    assert.equal(calc.isFormName('ab12'), false);
    assert.deepEqual([...calc.collectNames(calc.parseFormula('=IF(x;SUM(y;[t.A1]);z)', { names: true }))], ['x', 'y', 'z']);
  });
});

describe('Berechnung', () => {
  it('rechnet berechnete Felder in Abhängigkeitsreihenfolge, auch gegen die Dokumentreihenfolge', () => {
    const fd = new form.FormDocument(
      dom(`<form id="f" action="#" data-hp-form="data/f.json">
        <output name="gesamt" data-hp-formula="=netto+steuer" data-hp-type="currency" data-hp-unit="EUR"></output>
        <output name="steuer" data-hp-formula="=ROUND(netto*satz;2)" data-hp-type="currency" data-hp-unit="EUR"></output>
        <input name="netto" type="text" data-hp-type="currency" value="1.234,50"/>
        <input name="satz" type="text" data-hp-type="percentage" value="20 %"/>
      </form>`),
    );
    const f = fd.form('f')!;
    assert.equal(f.fields.get('steuer')!.value, 246.9);
    assert.equal(f.fields.get('gesamt')!.value, 1481.4);
    assert.equal(fd.patch(f.fields.get('gesamt')!).text, '1.481,40 €');
    assert.deepEqual(fd.setEntry('f', 'netto', '1000'), { ok: true });
    assert.equal(f.fields.get('gesamt')!.value, 1200);
    // grouping in German entries: 420.000 is four hundred and twenty thousand
    fd.setEntry('f', 'netto', '420.000');
    assert.equal(f.fields.get('netto')!.value, 420000);
    fd.setEntry('f', 'netto', '1,5');
    assert.equal(f.fields.get('netto')!.value, 1.5);
  });

  it('Bezüge auf Tabellenzellen desselben Dokuments ([tabelle.B2])', () => {
    const fd = new form.FormDocument(
      dom(`<table id="kosten"><tr><td>A</td><td data-hp-type="currency" data-hp-value="100">100</td></tr>
        <tr><td>B</td><td data-hp-type="currency" data-hp-formula="=[.B1]*2" data-hp-value="0">0</td></tr></table>
        <form id="f" action="#" data-hp-form="data/f.json"><input name="anteil" type="text" data-hp-type="percentage" value="50 %"/>
        <output name="betrag" data-hp-formula="=[kosten.B2]*anteil"></output></form>`),
    );
    assert.equal(fd.form('f')!.fields.get('betrag')!.value, 100);
  });

  it('Zirkel ergeben #CIRC!, unbekannte Namen #NAME?, Fehlerwerte verhindern das Absenden', () => {
    const fd = new form.FormDocument(
      dom(`<form id="f" action="#" data-hp-form="data/f.json">
        <output name="a" data-hp-formula="=b+1"></output><output name="b" data-hp-formula="=a+1"></output>
        <output name="c" data-hp-formula="=a*2"></output><output name="d" data-hp-formula="=gibtsnicht+1"></output>
        <input name="x" type="number" value="4"/><output name="e" data-hp-formula="=x/0"></output></form>`),
    );
    const f = fd.form('f')!;
    for (const n of ['a', 'b', 'c']) assert.equal(String(f.fields.get(n)!.value), '#CIRC!', n);
    assert.equal(String(f.fields.get('d')!.value), '#NAME?');
    assert.equal(String(f.fields.get('e')!.value), '#DIV/0!');
    assert.ok(f.markup.some((m) => /unbekanntes Feld gibtsnicht/.test(m)));
    const codes = fd.validate('f').map((p) => `${p.code}:${p.field ?? ''}`);
    for (const n of ['a', 'b', 'c', 'd', 'e']) assert.ok(codes.includes(`formula:${n}`), `${n} in ${codes.join(' ')}`);
  });
});

describe('Bedingungen', () => {
  const html = `<form id="f" action="#" data-hp-form="data/f.json">
    <input name="art" type="radio" value="privat" checked="checked"/><input name="art" type="radio" value="firma"/>
    <fieldset id="firma" data-hp-when="=art=&quot;firma&quot;"><input name="umsatz" type="text" data-hp-type="currency" required="required" value="50.000"/>
      <input name="export" type="checkbox"/>
      <fieldset id="ausland" data-hp-when="=export"><input name="land" type="text" required="required"/></fieldset></fieldset>
    <output name="summe" data-hp-formula="=10+umsatz"></output></form>`;

  it('Feld in einem nicht geltenden Abschnitt zählt als leer, ist null in den Daten und wird nicht geprüft', () => {
    const fd = new form.FormDocument(dom(html));
    const f = fd.form('f')!;
    assert.deepEqual(f.conditions.map((c) => [c.id, c.relevant]), [['firma', false], ['ausland', false]]);
    assert.equal(f.fields.get('summe')!.value, 10);
    assert.equal(fd.data('f', 'draft').values.umsatz, null);
    assert.deepEqual(fd.validate('f'), []);
  });

  it('gilt die Bedingung, rechnet und prüft das Feld mit; verschachtelte Bedingung folgt dem Elternabschnitt', () => {
    const fd = new form.FormDocument(dom(html));
    const f = fd.form('f')!;
    fd.setEntry('f', 'art', 'firma');
    assert.equal(f.fields.get('summe')!.value, 50010);
    assert.equal(fd.data('f', 'draft').values.umsatz, 50000);
    fd.setEntry('f', 'export', 'ja');
    assert.deepEqual(f.conditions.map((c) => c.relevant), [true, true]);
    assert.deepEqual(fd.validate('f').map((p) => `${p.code}:${p.field}`), ['required:land']);
    fd.setEntry('f', 'art', 'privat'); // parent switches off: child section goes with it
    assert.deepEqual(f.conditions.map((c) => c.relevant), [false, false]);
    assert.deepEqual(fd.validate('f'), []);
    fd.write();
    const xml = String(fd.doc.documentElement);
    // stored markup keeps the section visible: without a calculator the form stays readable (HP-NEST-001)
    assert.match(xml, /<fieldset id="firma" data-hp-when="[^"]*">/);
  });
});

describe('Validierung vor dem Absenden', () => {
  it('meldet Typfehler, Pflichtfelder, pattern, E-Mail, min/max, Länge, Auswahl und Prüfregeln', () => {
    const fd = new form.FormDocument(
      dom(`<form id="f" action="#" data-hp-form="data/f.json">
        <label for="n">Name</label><input id="n" name="name" type="text" required="required" maxlength="5"/>
        <label>E-Mail <input name="mail" type="email"/></label>
        <input name="plz" type="text" pattern="[0-9]{4}" aria-label="Postleitzahl" data-hp-message="PLZ: vier Ziffern."/>
        <input name="alter" type="number" min="18" max="99" aria-label="Alter"/>
        <input name="betrag" type="text" data-hp-type="currency" aria-label="Betrag"/>
        <select name="land" aria-label="Land"><option value="">–</option><option value="AT">Österreich</option></select>
        <input name="von" type="date" aria-label="von"/><input name="bis" type="date" aria-label="bis"/>
        <p id="regel" data-hp-check="=bis&gt;=von" data-hp-check-message="Das Ende liegt vor dem Beginn.">Ende nach Beginn</p></form>`),
    );
    fd.setEntry('f', 'name', 'Maximilian');
    fd.setEntry('f', 'mail', 'kein-at-zeichen');
    fd.setEntry('f', 'plz', '60200');
    fd.setEntry('f', 'alter', '17');
    assert.deepEqual(fd.setEntry('f', 'betrag', 'zwölf'), { ok: false, message: 'Bitte eine Zahl eingeben, z. B. 1.234,50.' });
    assert.equal(fd.setEntry('f', 'land', 'DE').ok, false);
    fd.setEntry('f', 'von', '2026-10-12');
    fd.setEntry('f', 'bis', '01.10.2026');
    const got = fd.validate('f').map((p) => `${p.code}:${p.field ?? p.check}:${p.message}`);
    assert.deepEqual(got, [
      'maxlength:name:Name: höchstens 5 Zeichen.',
      'email:mail:E-Mail: keine gültige E-Mail-Adresse.',
      'pattern:plz:PLZ: vier Ziffern.',
      'min:alter:Alter: mindestens 18.',
      'entry:betrag:Betrag: Bitte eine Zahl eingeben, z. B. 1.234,50.',
      'entry:land:Land: „DE“ ist keine der Auswahlmöglichkeiten.',
      'check:regel:Das Ende liegt vor dem Beginn.',
    ]);
    fd.setEntry('f', 'name', '');
    assert.equal(fd.validate('f')[0]!.message, 'Name: Pflichtfeld ist leer.');
  });

  it('Prüfregel wartet, bis die Pflichtfelder gefüllt sind, von denen sie abhängt (auch über Formeln)', () => {
    const fd = new form.FormDocument(
      dom(`<form id="f" action="#" data-hp-form="data/f.json"><input name="a" type="number" required="required"/>
        <input name="b" type="number"/><output name="s" data-hp-formula="=a+b"></output>
        <p data-hp-check="=s&gt;=10" data-hp-check-message="zu klein">x</p></form>`),
    );
    assert.equal(fd.form('f')!.checks[0]!.result, null);
    fd.setEntry('f', 'a', '3');
    assert.equal(fd.form('f')!.checks[0]!.result, false);
    fd.setEntry('f', 'b', '7');
    assert.equal(fd.form('f')!.checks[0]!.result, true);
  });

  it('Schema: Abweichungen werden dem Feld zugeordnet; ein Entwurf speichert ungültige Werte als null', () => {
    const fd = new form.FormDocument(dom(`<form id="f" action="#" data-hp-form="data/f.json"><input name="anzahl" type="number" aria-label="Anzahl"/><input name="code" type="text" aria-label="Code"/></form>`));
    const schema = {
      type: 'object',
      properties: {
        values: { type: 'object', properties: { anzahl: { type: ['integer', 'null'], maximum: 10 }, code: { type: ['string', 'null'], pattern: '^[A-Z]+$' } } },
        status: { enum: ['draft', 'submitted'] },
      },
    };
    fd.setEntry('f', 'anzahl', '12');
    fd.setEntry('f', 'code', 'abc');
    assert.deepEqual(fd.validate('f', schema).map((p) => `${p.code}:${p.field}`), ['schema:anzahl', 'schema:code']);
    const draft = fd.draftData('f', schema);
    assert.equal(draft.ok, true);
    assert.deepEqual(draft.data.values, { anzahl: null, code: null });
    assert.deepEqual(draft.nulled.sort(), ['anzahl', 'code']);
  });
});

describe('Container: ausfüllen, absenden, exportieren (Beispiel p6-antrag)', () => {
  it('das Beispiel ist stimmig: Felder, Schema und manifest.json#data passen zusammen; leer kann nicht abgesendet werden', async () => {
    const [r] = await form.inspectForms(await example());
    assert.equal(r!.id, 'antrag');
    assert.equal(r!.fields.length, 40);
    assert.deepEqual(r!.consistency, []);
    assert.equal(r!.status, 'draft');
    assert.equal(r!.problems.filter((p) => p.code === 'required').length, 18);
    assert.deepEqual(r!.problems.filter((p) => p.code !== 'required'), []);
  });

  it('ohne gültige Eingaben kein Absenden: FormRejected, es entsteht keine Datei', async () => {
    const bytes = await example();
    const bad = { ...VALID, eigenmittel: '50.000', iban: 'DE12 3456', datenschutz: 'nein', beschaeftigung: 'selbststaendig' };
    const err = await rejected(form.fillForms(bytes, { set: entries(bad), submit: true, time: T1 }));
    const codes = err.problems.map((p) => `${p.code}:${p.field ?? p.check}`);
    for (const c of ['pattern:iban', 'required:datenschutz', 'required:firmenname', 'required:gruendungsjahr', 'check:pruefung-eigenmittel', 'schema:eigenmittelquote']) assert.ok(codes.includes(c), `${c} fehlt in ${codes.join(', ')}`);
    // Submitting the blank form is refused as well.
    await rejected(form.fillForms(bytes, { submit: true, time: T1 }));
  });

  it('Entwurf speichern, korrigieren, absenden: Daten schemagültig, Markup mit Werten, Verlauf', async () => {
    const draft = await form.fillForms(await example(), { set: entries({ ...VALID, iban: 'AT61 1904', eigenmittel: '50.000' }), time: T0 });
    const d1 = draft.data.get('data/antrag.json')!;
    assert.equal(d1.status, 'draft');
    assert.equal(d1.values.iban, null); // invalid entry: null in the data, kept in the form
    assert.match(text((await readContainer(draft.bytes)).files.get('content/index.xhtml')!), /name="iban"[^>]*value="AT61 1904"/);
    const sub = await form.fillForms(draft.bytes, { set: entries({ iban: VALID.iban!, eigenmittel: '105.000' }), submit: true, time: T1 });
    const d2 = sub.data.get('data/antrag.json')!;
    assert.equal(d2.status, 'submitted');
    assert.equal(d2.submittedAt, T1);
    assert.equal(d2.values.finanzierungsbedarf, 357000);
    assert.equal(d2.values.monatsrate, 1787.23);
    assert.equal(d2.values.einnahmen_gesamt, 5568.8);
    assert.equal(d2.values.kreditrate, null); // section "kredite" does not apply
    const c = await readContainer(sub.bytes);
    assert.equal(c.integrity.ok, true);
    assert.deepEqual(JSON.parse(text(c.files.get('data/antrag.json')!)), d2);
    const xhtml = text(c.files.get('content/index.xhtml')!);
    assert.match(xhtml, /<output id="f-rate" [^>]*data-hp-value="1787.23"[^>]*>1\.787,23 €<\/output>/);
    assert.match(xhtml, /<fieldset id="kredite" data-hp-when="=bestehende_kredite">/);
    assert.match(xhtml, /<fieldset id="mitantragsteller" data-hp-when="=mitantrag">/);
    const history = (c.manifest as unknown as { history: Array<{ note: string }> }).history;
    assert.match(history.at(-1)!.note, /^Formular antrag abgesendet/);
    // history chain: each entry names the manifest it replaced
    assert.equal(history.length, 2);
    assert.equal((history.at(-1) as unknown as { manifestIntegrity: string }).manifestIntegrity, nodeSri((await readContainer(draft.bytes)).files.get('manifest.json')!));
    // Export = the stored data, validated against the schema.
    const e = await form.exportFormData(sub.bytes);
    assert.equal(e.json, text(c.files.get('data/antrag.json')!));
    assert.equal(e.schemaPath, 'data/antrag.schema.json');
  });

  it('Datenexport ist schemageprüft: manipulierte Daten oder fehlendes Schema werden nicht exportiert', async () => {
    const sub = await form.fillForms(await example(), { set: entries(VALID), submit: true, time: T1 });
    const c = await readContainer(sub.bytes);
    const { readZip, writeZip } = await import('../src/index.js');
    const swap = async (path: string, data: Uint8Array | null) => {
      const entriesIn = await readZip(sub.bytes);
      return writeZip(
        entriesIn.filter((x) => data !== null || x.name !== path).map((x) => ({ name: x.name, data: x.name === path && data ? data : x.data, compression: x.method === 'stored' ? ('store' as const) : ('deflate' as const) })),
        { modified: new Date(T1) },
      );
    };
    // The data file says submitted, but a value breaks the schema of a submitted application.
    const data = JSON.parse(text(c.files.get('data/antrag.json')!));
    data.values.eigenmittelquote = 0.1;
    const manipulated = await swap('data/antrag.json', new TextEncoder().encode(JSON.stringify(data)));
    // the markup still holds the submitted values, so the export rebuilds them as a draft — valid;
    // a broken schema file, however, stops every export
    const noSchema = await swap('data/antrag.schema.json', new TextEncoder().encode('{"type": 5}'));
    const err = await rejected(form.exportFormData(noSchema));
    assert.match(err.problems[0]!.message, /Schema unbrauchbar|type hat einen unbekannten Wert/);
    const e = await form.exportFormData(manipulated);
    assert.equal(e.data.status, 'draft');
    assert.equal(e.data.values.eigenmittelquote, 0.2273);
  });
});

describe('Eingefrorene Fassung', () => {
  it('Felder werden Text, nicht geltende Abschnitte ein Hinweis, kein Steuerelement bleibt', async () => {
    const sub = await form.fillForms(await example(), { set: entries(VALID), submit: true, time: T1 });
    const frozen = await calc.freezeContainer(sub.bytes, { id: 'nachweis-antrag', createdAt: '2026-10-12T10:00:00Z' });
    const c = await readContainer(frozen.bytes);
    const x = text(c.files.get('renditions/nachweis-antrag/content/index.xhtml')!);
    assert.doesNotMatch(x, /<(input|select|textarea|form)\b/);
    assert.match(x, /<span class="hp-field" data-hp-field="iban" id="f-iban">AT61 1904 3002 3457 3201<\/span>/);
    assert.match(x, /<span class="hp-field" data-hp-field="kaufpreis" id="f-kaufpreis">420\.000,00 €<\/span>/);
    assert.match(x, /<span class="hp-field" data-hp-field="angaben_richtig" id="f-richtig">☒ ja<\/span>/);
    assert.match(x, /Abschnitt „Angaben für Selbstständige \(nur bei selbstständiger Tätigkeit\)“ entfällt: Bedingung nicht erfüllt\./);
    assert.match(x, /Formular „antrag“ \(eingefrorene Fassung\): 40 Felder, Daten in data\/antrag\.json, abgesendet am 12\.10\.2026 09:30 UTC; alle Prüfungen erfüllt\./);
    assert.match(x, /<output id="f-rate" [^>]*data-hp-formula="[^"]+"[^>]*>1\.787,23 €<\/output>/);
    assert.ok(c.files.has('renditions/nachweis-antrag/data/antrag.json'));
  });
});
