/**
 * Evidence run for docs/belege/P6 (npm run belege:p6 -w app): the form sample in the reader at
 * telephone and desktop width — blank, refused "Absenden" with summary, filled in, submitted —,
 * the submitted container and data export as the reader saves them, the PDF of the filled-in
 * version from the reader's print path, times from an entry to the display, horizontal overflow at
 * three widths and the network requests of the whole run. Not part of npm test (writes into the
 * repository).
 */
import { expect, test, type Download, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { form, readContainer } from '../../kern/src/index.ts';
import { WIDTHS, docFrame, frameOverflow, pdfOf, printFromReader, shellOverflow } from './helpers.js';
import { VALID, enter, field, openForm } from './formular.js';

const OUT = fileURLToPath(new URL('../../docs/belege/P6/', import.meta.url));
const SHOTS = `${OUT}screenshots/`;
const CONTAINER = `${OUT}container/`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(CONTAINER, { recursive: true });

const measurements: Record<string, unknown> = {};

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

async function scrollTo(page: Page, id: string): Promise<void> {
  await docFrame(page).locator(`#${id}`).evaluate((el) => el.scrollIntoView({ block: 'start' }));
}

test.describe.configure({ mode: 'serial' });

test('Bildschirmfotos: leer, abgelehnt, ausgefüllt, abgesendet (Telefon und Desktop)', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(r.url())) requests.push(r.url());
  });
  for (const [name, size] of [['desktop', WIDTHS.desktop], ['telefon', WIDTHS.telefon]] as const) {
    await page.setViewportSize(size);
    await openForm(page);
    await scrollTo(page, 'antrag');
    await shot(page, `${name}-01-leer`);
    await enter(page, 'vorname', 'Maria');
    await docFrame(page).getByRole('button', { name: 'Absenden' }).click();
    await expect(docFrame(page).locator('[data-hp-reader="form-summary"]')).toBeFocused();
    await shot(page, `${name}-02-absenden-abgelehnt`);
    for (const [n, v] of VALID) await enter(page, n, v);
    await enter(page, 'eigenmittel', '60.000');
    await scrollTo(page, 'vorhaben');
    await shot(page, `${name}-03-pruefregel-nicht-erfuellt`);
    await enter(page, 'eigenmittel', '105.000');
    await expect(field(page, 'monatsrate')).toHaveText('1.787,23 €');
    await scrollTo(page, 'vorhaben');
    await shot(page, `${name}-04-ausgefuellt-berechnet`);
    await docFrame(page).getByRole('button', { name: 'Absenden' }).click();
    await expect(page.locator('#form-status')).toContainText('Abgesendet: antrag-abgesendet.hpro');
    await scrollTo(page, 'erklaerung');
    await shot(page, `${name}-05-abgesendet`);
  }
  measurements['netzwerkAnfragenAusserhalbDesReaders'] = requests;
  expect(requests).toEqual([]);
});

test('Absenden im Reader: Container, Datenexport und PDF der ausgefüllten Fassung', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await openForm(page);
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  for (const [n, v] of VALID) await enter(page, n, v);
  await docFrame(page).getByRole('button', { name: 'Absenden' }).click();
  await expect.poll(() => downloads.length).toBe(2);
  const [container, json] = downloads as [Download, Download];
  await container.saveAs(`${CONTAINER}reader-abgesendet.hpro`);
  await json.saveAs(`${CONTAINER}reader-antrag.json`);
  const bytes = new Uint8Array(readFileSync(`${CONTAINER}reader-abgesendet.hpro`));
  const [report] = await form.inspectForms(bytes);
  const c = await readContainer(bytes);
  measurements['readerAbsenden'] = {
    container: 'container/reader-abgesendet.hpro',
    bytes: bytes.length,
    integrity: c.integrity.ok,
    status: report!.status,
    submittedAt: report!.submittedAt,
    probleme: report!.problems.length,
    export: 'container/reader-antrag.json',
    exportGleichDatendatei: readFileSync(`${CONTAINER}reader-antrag.json`, 'utf8') === new TextDecoder().decode(c.files.get('data/antrag.json')!),
  };
  // The reader now shows the submitted file; its print is the filled-in version.
  await expect(page.locator('#form-status')).toContainText('Abgesendet');
  const { report: printReport, html } = await printFromReader(page);
  writeFileSync(`${CONTAINER}antrag-ausgefuellt-druck.html`, html);
  const pdf = await pdfOf(page, html);
  writeFileSync(`${CONTAINER}antrag-ausgefuellt.pdf`, pdf);
  measurements['druck'] = { seiten: printReport.pages, ausgelassen: printReport.omitted, pdfBytes: pdf.length, steuerelementeImDruck: (html.match(/<(input|select|textarea)\b/g) ?? []).length };
});

test('Messungen: Zeit von der Eingabe bis zur Anzeige, waagrechtes Scrollen in drei Breiten', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await openForm(page);
  for (const [n, v] of VALID) await enter(page, n, v);
  const times: Array<{ feld: string; eingabe: string; huelleMs: number; bisAnzeigeMs: number }> = [];
  const values = ['400.000', '410.000', '420.000', '430.000', '440.000', '450.000', '460.000', '470.000', '480.000', '420.000'];
  for (const v of values) {
    const before = await field(page, 'monatsrate').textContent();
    const input = field(page, 'kaufpreis');
    await input.fill(v);
    const t0 = Date.now();
    await input.press('Tab');
    await expect(field(page, 'monatsrate')).not.toHaveText(before ?? '', { timeout: 5000 }).catch(() => undefined);
    const shown = Date.now() - t0;
    const status = (await page.locator('#form-status').textContent()) ?? '';
    const m = /neu berechnet in ([\d,]+) ms/.exec(status);
    times.push({ feld: 'kaufpreis', eingabe: v, huelleMs: m ? Number(m[1]!.replace(',', '.')) : NaN, bisAnzeigeMs: shown });
  }
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
  const median = (xs: number[]) => sorted(xs)[Math.floor(xs.length / 2)]!;
  measurements['eingabeBisAnzeige'] = {
    hinweis: 'huelleMs: Rechnen, Bedingungen und Validierung in der Hülle (performance.now, aus der Statuszeile); bisAnzeigeMs: Tab gedrückt bis berechnete Monatsrate im Rahmen geändert (Playwright, Date.now, enthält Abfrageintervall)',
    messungen: times,
    huelleMedianMs: median(times.map((t) => t.huelleMs)),
    huelleMaxMs: Math.max(...times.map((t) => t.huelleMs)),
    bisAnzeigeMedianMs: median(times.map((t) => t.bisAnzeigeMs)),
    bisAnzeigeMaxMs: Math.max(...times.map((t) => t.bisAnzeigeMs)),
  };
  const overflow: Record<string, unknown> = {};
  for (const [name, size] of Object.entries(WIDTHS)) {
    await page.setViewportSize(size);
    await page.waitForTimeout(300);
    overflow[name] = { breite: size.width, rahmen: await frameOverflow(page), huelle: await shellOverflow(page) };
  }
  measurements['waagrechtesScrollen'] = overflow;
  for (const v of Object.values(overflow) as Array<{ rahmen: { scrollWidth: number; clientWidth: number } }>) expect(v.rahmen.scrollWidth).toBeLessThanOrEqual(v.rahmen.clientWidth);
});

test.afterAll(() => {
  writeFileSync(`${OUT}messungen-reader.json`, `${JSON.stringify(measurements, null, 2)}\n`);
});
