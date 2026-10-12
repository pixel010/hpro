/**
 * Forms in the reader (P6): the session calculates, evaluates conditions and validates with the
 * core in the shell; annotateForms marks the frame copy without touching the source.
 */
import { createContainer, form } from '@hpro/kern';
import { describe, expect, it } from 'vitest';
import { openContainer, type LoadedDocument } from '../src/document.js';
import { FormSession, annotateForms, controlId } from '../src/formview.js';

const XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT">
<head><meta charset="UTF-8"/><title>Formular</title></head>
<body>
  <form id="f" action="#" data-hp-form="data/f.json">
    <h2 id="f-h">Bestellung</h2>
    <p><label for="menge">Menge</label> <input id="menge" name="menge" type="number" required="required" min="1"/></p>
    <p><label for="preis">Einzelpreis</label> <input id="preis" name="preis" type="text" data-hp-type="currency" data-hp-unit="EUR" value="12,50" data-hp-value="12.5"/></p>
    <p><label for="summe">Summe</label> <output id="summe" name="summe" data-hp-formula="=menge*preis" data-hp-type="currency" data-hp-unit="EUR"></output></p>
    <p><input name="lieferung" type="checkbox" aria-label="Lieferung"/></p>
    <fieldset id="adresse" data-hp-when="=lieferung"><legend>Adresse</legend>
      <p><label>Straße <input name="strasse" type="text" required="required"/></label></p></fieldset>
    <p id="grenze" data-hp-check="=summe&lt;=1000" data-hp-check-message="Höchstens 1.000 € je Bestellung.">Höchstens 1.000 €.</p>
  </form>
</body>
</html>
`;
const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['form', 'status', 'values'],
  properties: {
    form: { const: 'f' },
    document: { type: 'string' },
    status: { enum: ['draft', 'submitted'] },
    submittedAt: { type: 'string' },
    values: {
      type: 'object',
      properties: { menge: { type: ['integer', 'null'] }, preis: { type: ['number', 'null'] }, summe: { type: ['number', 'null'] }, lieferung: { type: 'boolean' }, strasse: { type: ['string', 'null'] } },
      required: ['menge', 'preis', 'summe', 'lieferung', 'strasse'],
      additionalProperties: false,
    },
  },
};

async function loaded(): Promise<LoadedDocument> {
  const enc = new TextEncoder();
  const blank = { form: 'f', status: 'draft', values: { menge: null, preis: 12.5, summe: 0, lieferung: false, strasse: null } };
  const created = await createContainer({
    id: 'urn:uuid:00000000-0000-4000-8000-000000000006',
    title: 'Formular',
    language: 'de-AT',
    modified: '2026-10-12T08:00:00Z',
    profile: 'interactive',
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: 'Bestellung', href: 'content/index.xhtml#f' }] },
    resources: [
      { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: enc.encode(XHTML) },
      { path: 'data/f.json', mediaType: 'application/json', data: enc.encode(JSON.stringify(blank)) },
      { path: 'data/f.schema.json', mediaType: 'application/json', data: enc.encode(JSON.stringify(SCHEMA)) },
    ],
    data: [{ url: 'data/f.json', schema: 'data/f.schema.json' }],
  });
  return openContainer(created.bytes, 'bestellung.hpro');
}

describe('FormSession', () => {
  it('rechnet in der Hülle, zeigt Meldungen erst nach dem Verlassen eines Feldes', async () => {
    const doc = await loaded();
    const s = new FormSession(doc, 'live');
    expect(s.hasForms).toBe(true);
    const path = 'content/index.xhtml';
    expect(s.hiddenSections(path)).toEqual(new Set(['adresse']));
    let u = s.input(path, 'f.menge', '10', false);
    expect(u.forms[0]!.fields.find((p) => p.name === 'summe')!.text).toBe('125,00 €');
    expect(u.forms[0]!.messages).toEqual([]);
    u = s.input(path, 'f.menge', '100', true);
    expect(u.forms[0]!.messages.map((m) => m.check)).toEqual(['grenze']);
    // the shell's copy holds the entry (print shows it)
    expect(doc.content[0]!.dom.querySelector('#summe')!.textContent).toBe('1.250,00 €');
    u = s.input(path, 'f.lieferung', 'true', true);
    expect(u.forms[0]!.sections).toEqual([{ id: 'adresse', relevant: true }]);
    const all = s.check(path, 'f');
    expect(all.forms[0]!.summary!.map((m) => m.message)).toEqual(['Straße: Pflichtfeld ist leer.', 'Höchstens 1.000 € je Bestellung.']);
    expect(all.focusSummary).toBe('f');
  });

  it('Absenden: der Kern lehnt ungültige Eingaben ab und schreibt gültige als abgesendet', async () => {
    const doc = await loaded();
    const s = new FormSession(doc, 'live');
    const path = 'content/index.xhtml';
    s.input(path, 'f.menge', '0', true);
    await expect(s.submit('f', new Date('2026-10-12T10:00:00Z'))).rejects.toBeInstanceOf(form.FormRejected);
    s.input(path, 'f.menge', '4', true);
    const { result, exported } = await s.submit('f', new Date('2026-10-12T10:00:00Z'));
    expect(exported.data.status).toBe('submitted');
    expect(exported.data.values).toEqual({ menge: 4, preis: 12.5, summe: 50, lieferung: false, strasse: null });
    const [r] = await form.inspectForms(result.bytes);
    expect(r!.status).toBe('submitted');
  });
});

describe('annotateForms', () => {
  it('markiert Felder, ergänzt Meldungen, Zusammenfassung und Knöpfe, blendet nicht geltende Abschnitte aus', () => {
    const doc = new DOMParser().parseFromString(XHTML.replace(/^<\?xml[^>]*>\s*<!DOCTYPE html>/, '<!DOCTYPE html>'), 'text/html');
    annotateForms(doc, 'live', new Set(['adresse']));
    const formEl = doc.querySelector('form')!;
    expect(formEl.getAttribute('data-hp-form-id')).toBe('f');
    expect(doc.querySelector('#menge')!.getAttribute('data-hp-field')).toBe('f.menge');
    expect(doc.querySelector('#menge')!.getAttribute('aria-describedby')).toBe('hp-msg-f-menge');
    expect(doc.querySelector('#menge')!.getAttribute('aria-required')).toBe('true');
    const strasse = doc.querySelector('input[name="strasse"]')!;
    expect(strasse.id).toBe(controlId('f', 'strasse'));
    expect((doc.querySelector('#adresse') as HTMLElement).hidden).toBe(true);
    expect(doc.querySelector('[data-hp-reader="form-summary"]')!.previousElementSibling!.id).toBe('f-h');
    expect([...doc.querySelectorAll('[data-hp-form-action]')].map((b) => `${b.getAttribute('data-hp-form-action')}:${b.getAttribute('type')}`)).toEqual(['check:button', 'save:button', 'export:button', 'submit:button']);
    expect(doc.querySelector('#grenze [data-hp-reader="form-check"]')!.textContent).toBe('Höchstens 1.000 € je Bestellung.');
  });

  it('schreibgeschützt: Felder gesperrt, keine Knöpfe', () => {
    const doc = new DOMParser().parseFromString(XHTML.replace(/^<\?xml[^>]*>\s*<!DOCTYPE html>/, '<!DOCTYPE html>'), 'text/html');
    annotateForms(doc, 'readonly');
    expect(doc.querySelector('#menge')!.hasAttribute('disabled')).toBe(true);
    expect(doc.querySelectorAll('[data-hp-form-action]')).toHaveLength(0);
  });
});
