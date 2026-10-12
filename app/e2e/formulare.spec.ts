/**
 * Forms in the reader (package P6, HPC-0009), against the production build:
 *
 * - calculation while typing (the document is not reloaded), conditional sections, messages after
 *   leaving a field;
 * - acceptance 3: "Absenden" with missing or invalid entries is refused (summary with links, no
 *   file), with valid entries it gives the submitted container and the data export, both checked
 *   here with the core: status submitted, data valid against the schema;
 * - print of the filled-in form: fields as text, sections that do not apply as a note;
 * - no network request from the document, no serious axe finding on the form.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { form, readContainer } from '../../kern/src/index.ts';
import { docFrame, printFromReader } from './helpers.js';
import { AXE_TAGS, SEVERE } from './a11y.js';
import { VALID, enter, field, openForm } from './formular.js';

async function saved(download: Download): Promise<Uint8Array> {
  return new Uint8Array(readFileSync(await download.path()));
}

test.describe('Formular (P6)', () => {
  test('rechnet beim Ausfüllen, Bedingungen blenden Abschnitte ein und aus', async ({ page }) => {
    await openForm(page);
    const frame = docFrame(page);
    // conditional sections are hidden in the reader's copy, visible in the stored markup
    await expect(frame.locator('#mitantragsteller')).toBeHidden();
    await expect(frame.locator('#selbststaendig')).toBeHidden();
    await enter(page, 'mitantrag', 'check');
    await expect(frame.locator('#mitantragsteller')).toBeVisible();
    await enter(page, 'einkommen', '2.950,00');
    await enter(page, 'mit_einkommen', '2.480,50');
    await expect(field(page, 'einnahmen_gesamt')).toHaveText('5.430,50 €');
    await enter(page, 'mitantrag', 'uncheck');
    await expect(frame.locator('#mitantragsteller')).toBeHidden();
    // a field in a section that does not apply counts as empty
    await expect(field(page, 'einnahmen_gesamt')).toHaveText('2.950,00 €');
    await enter(page, 'beschaeftigung', 'selbststaendig');
    await expect(frame.locator('#selbststaendig')).toBeVisible();
    await enter(page, 'kaufpreis', '420.000');
    await enter(page, 'eigenmittel', '60.000');
    await expect(field(page, 'nebenkosten')).toHaveText('42.000,00 €');
    await expect(field(page, 'eigenmittelquote')).toHaveText('13 %');
    // a check rule shows its message once a field it uses was left
    await expect(frame.locator('#pruefung-eigenmittel [data-hp-reader="form-check"]')).toBeVisible();
    await expect(frame.locator('#pruefung-eigenmittel')).toHaveClass(/hp-check-failed/);
    // the document was never reloaded: the frame still has the same agent port
    await expect(page.locator('#form-status')).toContainText('neu berechnet in');
  });

  test('Meldungen nach dem Verlassen eines Feldes, mit Feld verknüpft', async ({ page }) => {
    await openForm(page);
    await enter(page, 'iban', 'AT61 1904');
    const iban = field(page, 'iban');
    await expect(iban).toHaveAttribute('aria-invalid', 'true');
    const msg = docFrame(page).locator('#hp-msg-antrag-iban');
    await expect(msg).toHaveText('IBAN: österreichische IBAN mit 20 Stellen, z. B. AT61 1904 3002 3457 3201.');
    await expect(iban).toHaveAttribute('aria-describedby', /hp-msg-antrag-iban/);
    await enter(page, 'iban', 'AT61 1904 3002 3457 3201');
    await expect(iban).not.toHaveAttribute('aria-invalid', 'true');
    await expect(msg).toBeHidden();
  });

  test('Abnahme 3: ohne gültige Eingaben kein Absenden, mit gültigen Eingaben Container und schemageprüfte Daten', async ({ page }) => {
    await openForm(page);
    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    await enter(page, 'vorname', 'Maria');
    await docFrame(page).getByRole('button', { name: 'Absenden' }).click();
    const summary = docFrame(page).locator('[data-hp-reader="form-summary"]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Das Formular kann noch nicht abgesendet werden: 17 Angaben fehlen oder stimmen nicht.');
    await expect(summary).toBeFocused();
    await expect(page.locator('#form-status')).toHaveText('Nicht abgesendet: 17 Angaben fehlen oder stimmen nicht.');
    // a link of the summary leads to its field
    await summary.getByRole('link', { name: 'Nachname: Pflichtfeld ist leer.' }).click();
    await expect(field(page, 'nachname')).toBeFocused();
    expect(downloads).toHaveLength(0);

    for (const [name, value] of VALID) await enter(page, name, value);
    await expect(field(page, 'monatsrate')).toHaveText('1.787,23 €');
    await expect(page.locator('#form-status')).toContainText('alle Angaben gültig, Absenden möglich');
    await docFrame(page).getByRole('button', { name: 'Absenden' }).click();
    await expect.poll(() => downloads.length).toBe(2);
    const [container, json] = downloads as [Download, Download];
    expect(container.suggestedFilename()).toBe('antrag-abgesendet.hpro');
    expect(json.suggestedFilename()).toBe('antrag-antrag.json');
    await expect(page.locator('#form-status')).toContainText('Abgesendet: antrag-abgesendet.hpro');
    // the reader shows the submitted file
    await expect(page.locator('#form-status')).toContainText('Abgesendet');

    const bytes = await saved(container);
    const c = await readContainer(bytes);
    expect(c.integrity.ok).toBe(true);
    const [report] = await form.inspectForms(bytes);
    expect(report!.status).toBe('submitted');
    expect(report!.problems).toEqual([]);
    const data = JSON.parse(new TextDecoder().decode(await saved(json))) as form.FormData;
    expect(data.status).toBe('submitted');
    expect(data.values['monatsrate']).toBe(1787.23);
    expect(data.values['einnahmen_gesamt']).toBe(5568.8);
    expect(data.values['firmenname']).toBeNull();
    // the export is exactly the data file of the submitted container, validated by the core
    const exported = await form.exportFormData(bytes);
    expect(exported.json).toBe(new TextDecoder().decode(await saved(json)));
  });

  test('Druck der ausgefüllten Fassung: Felder als Text, nicht geltende Abschnitte als Hinweis', async ({ page }) => {
    await openForm(page);
    for (const [name, value] of VALID) await enter(page, name, value);
    const { html } = await printFromReader(page);
    expect(html).not.toMatch(/<(input|select|textarea)\b/);
    expect(html).toContain('<span class="hp-field" data-hp-field="iban" id="f-iban">AT61 1904 3002 3457 3201</span>');
    expect(html).toContain('<span class="hp-field" data-hp-field="kaufpreis" id="f-kaufpreis">420.000,00 €</span>');
    expect(html).toMatch(/Abschnitt „Angaben für Selbstständige \(nur bei selbstständiger Tätigkeit\)“ entfällt: Bedingung nicht erfüllt\./);
    expect(html).toMatch(/Formular „antrag“ \(Ausdruck\): 40 Felder, Daten in data\/antrag\.json, Entwurf, nicht abgesendet; alle Prüfungen erfüllt\./);
  });

  test('kein Netzzugriff aus dem Dokument, keine schweren axe-Befunde auf dem Formular mit Meldungen', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1') && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && !r.url().startsWith('about:')) requests.push(r.url());
    });
    await openForm(page);
    await docFrame(page).getByRole('button', { name: 'Eingaben prüfen' }).click();
    await expect(docFrame(page).locator('[data-hp-reader="form-summary"]')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const severe = result.violations.filter((v) => SEVERE.has(v.impact ?? ''));
    expect(severe.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    expect(requests).toEqual([]);
  });
});
