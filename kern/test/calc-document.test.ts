/**
 * Calculator on content documents: grid (ADR), storage (STO), recalculation (CALC), security
 * limits (SEC) and the load limits of HPF-CALC-005/007.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calc } from '../src/index.js';
import { calcDoc, parse, serialize, show, tableXml, xhtml } from './calc-helpers.js';

const KOSTEN = `
<table id="steuer"><tr><th>Satz</th><td data-hp-type="percentage" data-hp-value="0.2">20 %</td></tr></table>
<table id="kosten" data-hp-table="scroll">
  <caption>Kostenschätzung</caption>
  <thead><tr><th>Position</th><th>Menge</th><th>Einheit</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead>
  <tbody>
    <tr><td>Aushub</td><td data-hp-type="float" data-hp-value="42.5" data-hp-input="true" data-hp-check="=[.B2]&gt;=0" data-hp-check-message="Menge darf nicht negativ sein">42,5</td><td>m³</td>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-value="18.9">18,90 €</td>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=ROUND([.B2]*[.D2];2)" data-hp-value="803.25">803,25 €</td></tr>
    <tr><td>Schotter</td><td data-hp-type="float" data-hp-value="12" data-hp-input="true">12</td><td>t</td>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-value="31">31,00 €</td>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=ROUND([.B3]*[.D3];2)" data-hp-value="372">372,00 €</td></tr>
  </tbody>
  <tfoot>
    <tr><th colspan="4">Summe netto</th><td data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=SUM([.E2:.E3])" data-hp-value="1175.25">1.175,25 €</td></tr>
    <tr><th colspan="4">Umsatzsteuer 20 %</th><td data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=ROUND([.E4]*[steuer.B1];2)" data-hp-value="235.05">235,05 €</td></tr>
  </tfoot>
</table>
<p>Die Schätzung schließt mit <a href="#kosten.E4" data-hp-ref="value">1.175,25 €</a> netto.</p>`;

test('Beispiel aus Teil 3 Abschnitt 2 rechnet wie dort angegeben', () => {
  const d = calcDoc(KOSTEN);
  assert.deepEqual(d.deviations(), []);
  assert.equal(show(d.cell('kosten.E4')!.value), '1175.25');
  assert.equal(show(d.cell('kosten.E5')!.value), '235.05');
});

test('HPF-ADR-002: Raster über thead/tbody/tfoot, colspan und rowspan', () => {
  const d = calcDoc(`<table id="t"><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>
    <tbody><tr><td data-hp-type="float" data-hp-value="1">1</td><td data-hp-type="float" data-hp-value="2">2</td><td rowspan="2" data-hp-type="float" data-hp-value="9">9</td></tr>
    <tr><td colspan="2" data-hp-type="float" data-hp-value="7">7</td></tr></tbody></table>`);
  const t = d.tables[0]!;
  assert.equal(t.rows, 3);
  assert.equal(t.cols, 3);
  assert.equal(calc.evaluateStandalone('=[.A2]', d.tables), 1, 'first body row is row 2');
  assert.equal(calc.evaluateStandalone('=[.A3]', d.tables), 7);
  assert.equal(calc.evaluateStandalone('=ISBLANK([.B3])', d.tables), true, 'covered by colspan: empty');
  assert.equal(calc.evaluateStandalone('=ISBLANK([.C3])', d.tables), true, 'covered by rowspan: empty');
  assert.equal(calc.evaluateStandalone('=[.C2]', d.tables), 9);
});

test('HPF-ADR-003: außerhalb vorhandener Zeilen leer, jenseits der Grenzen #REF!', () => {
  const d = calcDoc(tableXml('t', [[null, 1], [null, 2], [null, 3], [null, 4], [null, 5]]));
  assert.equal(show(calc.evaluateStandalone('=SUM([.B2:.B100])', d.tables)), '14');
  assert.equal(show(calc.evaluateStandalone('=[.B70000]', d.tables)), '#REF!');
  assert.equal(show(calc.evaluateStandalone('=[.AMK1]', d.tables)), '#REF!');
  assert.equal(show(calc.evaluateStandalone('=[.AMJ65536]', d.tables)), '0');
  assert.equal(show(calc.evaluateStandalone('=[fehlt.A1]', d.tables)), '#REF!');
});

test('HPF-ADR-004: Dokumentadresse und Formelbezug zeigen auf dieselbe Zelle', () => {
  const d = calcDoc(KOSTEN);
  const viaAddress = d.cell('kosten.E4')!;
  assert.equal(calc.evaluateStandalone('=[kosten.E4]', d.tables), viaAddress.value);
  assert.equal(d.valueRefs()[0]!.address, 'kosten.E4');
});

test('HPF-ADR-006: Bezug auf eine Formelzelle liefert den Wert', () => {
  const d = calcDoc(tableXml('t', [[2, { f: '=ROUND([.A1]*3;2)', t: 'float', v: '6', text: '6' }, { f: '=[.B1]', t: 'float' }]]));
  assert.equal(show(d.cell('t.C1')!.value), '6');
});

test('HPF-CALC-002: Kette mit falschen gespeicherten Werten wird vollständig berechnet', () => {
  const d = calcDoc(tableXml('t', [[1, { f: '=[.A1]+1', t: 'float', v: '99', text: '99' }, { f: '=[.B1]+1', t: 'float', v: '-5', text: '-5' }]]));
  assert.equal(show(d.cell('t.B1')!.value), '2');
  assert.equal(show(d.cell('t.C1')!.value), '3');
  assert.equal(d.deviations().length, 2);
  d.write();
  const again = new calc.CalcDocument(parse(serialize(d.doc)));
  again.recalc();
  assert.deepEqual(again.deviations(), [], 'after saving: no deviation');
});

test('HPF-CALC-003: eifrig mit Kurzschluss bei IF; Abhängigkeit auch über den nicht gewählten Zweig', () => {
  const d = calcDoc(tableXml('t', [[{ f: '=IF(TRUE();1;[.Z1])', t: 'float' }, { f: '=IF([.C1]>0;[.C1];0)', t: 'float' }, { v: '5', t: 'float', input: true, text: '5' }]]));
  assert.equal(show(d.cell('t.A1')!.value), '1');
  assert.equal(show(d.cell('t.B1')!.value), '5');
  const r = d.setInput('t.C1', '-1');
  assert.ok(r.ok);
  assert.equal(show(d.cell('t.B1')!.value), '0');
});

test('HPF-CALC-004: Zirkel und alles dahinter #CIRC!, keine Iteration', () => {
  const d = calcDoc(tableXml('t', [[{ f: '=[.B1]+1' }, { f: '=[.A1]+1' }, { f: '=[.A1]' }, { f: '=1+1' }, { f: '=[.E1]' }]]));
  assert.deepEqual(['A1', 'B1', 'C1', 'D1', 'E1'].map((a) => show(d.cell(`t.${a}`)!.value)), ['#CIRC!', '#CIRC!', '#CIRC!', '2', '#CIRC!']);
});

test('HPF-STO-001/HPF-ERR-001: Formel, Wert, Wertart und Anzeige werden geschrieben', () => {
  const d = calcDoc(tableXml('t', [[3, { f: '=[.A1]/0', t: 'currency' }, { f: '=[.A1]*2', t: 'currency' }]]));
  d.write();
  const b = d.cell('t.B1')!.element as calc.DomElement;
  const c = d.cell('t.C1')!.element as calc.DomElement;
  assert.deepEqual([b.getAttribute('data-hp-type'), b.getAttribute('data-hp-value'), calc.collapsedText(b)], ['error', '#DIV/0!', '#DIV/0!']);
  assert.deepEqual([c.getAttribute('data-hp-type'), c.getAttribute('data-hp-value'), calc.collapsedText(c)], ['currency', '6', '6,00']);
  assert.equal(c.getAttribute('data-hp-formula'), '=[.A1]*2');
});

test('HPF-STO-007: data-hp-stale wird nach vollständiger Berechnung entfernt', () => {
  const doc = parse(xhtml(tableXml('t', [[1, { f: '=[.A1]+1', t: 'float', v: '2', text: '2' }]]).replace('<table id="t"', '<table id="t" data-hp-stale="true"')));
  const d = new calc.CalcDocument(doc);
  assert.equal(d.tables[0]!.stale, true);
  d.recalc();
  d.write();
  assert.equal(serialize(doc).includes('data-hp-stale'), false);
});

test('HPF-STO-008/009: nicht berechnete Zelle erkannt; Abweichung gemeldet, berechneter Wert angezeigt', () => {
  const d = calcDoc(tableXml('t', [[{ f: '=1+1', t: 'float', v: '3', text: '3' }, { f: '=2+2', t: 'float' }]]));
  assert.equal(d.cell('t.B1')!.notComputed, true);
  assert.deepEqual(
    d.deviations().map((x) => [x.address, x.stored, x.computed]),
    [
      ['t.A1', '3', '2'],
      ['t.B1', '(fehlt)', '4'],
    ],
  );
  const u = d.write();
  assert.equal(u.find((x) => x.address === 't.A1')!.text, '2');
});

test('HPF-STO-010: Wertverweis im Text folgt der Zielzelle', () => {
  const d = calcDoc(KOSTEN);
  const r = d.setInput('kosten.B2', '50');
  assert.ok(r.ok);
  const text = serialize(d.doc);
  assert.match(text, /data-hp-ref="value">1\.317,00 €<\/a>/);
  assert.equal(calc.collapsedText(d.cell('kosten.E4')!.element as calc.DomElement), '1.317,00 €');
});

test('HPF-STO-011: nur Eingabezellen nehmen Eingaben an; Schreibweise des Nutzers und kanonische Form', () => {
  const d = calcDoc(KOSTEN);
  assert.equal(d.setInput('kosten.E2', '1').ok, false);
  assert.equal(d.setInput('kosten.D2', '1').ok, false);
  assert.equal(d.setInput('kosten.B2', 'viel').ok, false);
  const r = d.setInput('kosten.B2', '1.234,5');
  assert.ok(r.ok);
  assert.equal((d.cell('kosten.B2')!.element as calc.DomElement).getAttribute('data-hp-value'), '1234.5');
  assert.ok(d.setInput('kosten.B2', '50').ok);
  assert.equal((d.cell('kosten.B2')!.element as calc.DomElement).getAttribute('data-hp-value'), '50');
  assert.equal(show(d.cell('kosten.E2')!.value), '945');
  assert.ok(d.setInput('kosten.B3', '0.5').ok, 'canonical form with dot');
  assert.equal(show(d.cell('kosten.B3')!.value), '0.5');
});

test('HPF-STO-012: Prüfregel kennzeichnet, verhindert aber die Eingabe nicht', () => {
  const d = calcDoc(KOSTEN);
  assert.deepEqual(d.checks(), [{ address: 'kosten.B2', ok: true, message: 'Menge darf nicht negativ sein' }]);
  const r = d.setInput('kosten.B2', '-1');
  assert.ok(r.ok);
  assert.equal((d.cell('kosten.B2')!.element as calc.DomElement).getAttribute('data-hp-value'), '-1');
  assert.deepEqual(d.checks(), [{ address: 'kosten.B2', ok: false, message: 'Menge darf nicht negativ sein' }]);
});

test('HPF-SEC-003: Werte werden als Text geschrieben, nie als Markup', () => {
  const d = calcDoc(tableXml('t', [[{ f: '=CONCATENATE("<b>";"x")', t: 'string' }, { f: '="<img src=x onerror=alert(1)>"', t: 'string' }]]));
  d.write();
  const text = serialize(d.doc);
  assert.match(text, /&lt;b&gt;x/);
  assert.doesNotMatch(text, /<img/);
  assert.doesNotMatch(text, /<b>/);
});

test('HPF-SEC-004: Grenzen beim Einlesen, übrige Zellen werden berechnet', () => {
  const long = '=' + Array(2500).fill('1').join('+');
  const d = calcDoc(tableXml('t', [[{ f: long }, { f: '=[.A100000]' }, { f: '=2*21' }]]));
  assert.deepEqual(['A1', 'B1', 'C1'].map((a) => show(d.cell(`t.${a}`)!.value)), ['#NAME?', '#REF!', '42']);
});

test('HPF-CALC-005/006/007: 10 000 Formelzellen, Kette über 1000 Stufen, Neuberechnung nach Eingabe', (t) => {
  const rows: string[] = [];
  // Column A: input; B: chain of 1000 steps; C: 9000 independent formulas over the chain.
  for (let r = 1; r <= 1000; r++) {
    const a = r === 1 ? '<td data-hp-type="float" data-hp-value="1" data-hp-input="true">1</td>' : '<td></td>';
    const b = `<td data-hp-type="float" data-hp-formula="${r === 1 ? '=[.A1]' : `=[.B${r - 1}]+1`}"></td>`;
    const cs: string[] = [];
    for (let k = 0; k < 9; k++) cs.push(`<td data-hp-type="float" data-hp-formula="=[.B${r}]*${k + 1}"></td>`);
    rows.push(`<tr>${a}${b}${cs.join('')}</tr>`);
  }
  const doc = parse(xhtml(`<table id="last">${rows.join('')}</table>`));
  const d = new calc.CalcDocument(doc);
  assert.equal(d.formulaCount, 10000);
  let t0 = performance.now();
  d.recalc();
  const first = performance.now() - t0;
  assert.equal(show(d.cell('last.B1000')!.value), '1000');
  assert.equal(show(d.cell('last.K1000')!.value), '9000');
  t0 = performance.now();
  const r = d.setInput('last.A1', '2');
  const input = performance.now() - t0;
  assert.ok(r.ok);
  assert.equal(show(d.cell('last.B1000')!.value), '1001');
  assert.equal(show(d.cell('last.K1000')!.value), '9009');
  t.diagnostic(`10000 Formeln: erste Berechnung ${first.toFixed(1)} ms; Eingabe bis alle Werte geschrieben ${input.toFixed(1)} ms`);
  console.log(`P19 Last: 10000 Formelzellen, Kette 1000 Stufen: erste Berechnung ${first.toFixed(1)} ms, Eingabe + Neuberechnung + Schreiben ${input.toFixed(1)} ms`);
  assert.ok(input < 1000, `HPF-CALC-007: ${input} ms`);
});

test('Anzeige: Sprache des Dokuments, Stellen wie vom Autor', () => {
  const de = calc.numberStyle('de-AT');
  assert.equal(calc.displayValue(1175.25, 'currency', { style: de, decimals: 2, unit: 'EUR' }).text, '1.175,25 €');
  assert.equal(calc.displayValue(0.19, 'percentage', { style: de, decimals: 0, unit: null }).text, '19 %');
  assert.equal(calc.displayValue(46306, 'date', { style: de, decimals: null, unit: null }).text, '11.10.2026');
  assert.equal(calc.displayValue(-0.004, 'float', { style: de, decimals: 2, unit: null }).text, '0,00');
  const en = calc.numberStyle('en');
  assert.equal(calc.displayValue(1175.25, 'currency', { style: en, decimals: 2, unit: 'EUR' }).text, '€1,175.25');
  assert.equal(calc.parseUserEntry('1.234,5', 'float', de), 1234.5);
  assert.equal(calc.parseUserEntry('19 %', 'percentage', de), 0.19);
  assert.equal(calc.parseUserEntry('2026-10-11', 'date', de), 46306);
  assert.equal(calc.parseUserEntry('11.10.2026', 'date', de), 46306);
  assert.equal(calc.parseUserEntry('31.02.2026', 'date', de), null);
});
