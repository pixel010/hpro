/**
 * Evidence run for docs/belege/P19 (npm run belege:p19 -w app): screenshots of filling in and of the
 * frozen rendition, the frozen rendition rendered by Chromium with JavaScript switched off (values
 * without any calculator), and the time from an entry to the display with 10 000 formula cells
 * (HPF-CALC-007). Not part of npm test, because it writes into the repository.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { calc, readContainer, readZip, writeZip } from '../../kern/src/index.ts';
import { CALC_RENDITION, CALC_SAMPLE, WIDTHS, buildLargeCalcContainer, docFrame, openCalcSample, openFile, showVersion, waitForFrame } from './helpers.js';

const OUT = fileURLToPath(new URL('../../docs/belege/P19/', import.meta.url));
const SHOTS = `${OUT}screenshots/`;
const SCRATCH = fileURLToPath(new URL('../.scratch/p19-belege/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
mkdirSync(SCRATCH, { recursive: true });

const FILL: ReadonlyArray<readonly [string, string]> = [
  ['aufmass.C2', '13,10'],
  ['aufmass.D4', '1,95'],
  ['aufmass.E5', '-4'],
  ['kosten.A4', 'D02'],
  ['kosten.C4', '31,5'],
  ['kosten.C6', '4'],
  ['kosten.E8', '5 %'],
  ['kennzahlen.B4', '2026-12-30'],
];

const measurements: Record<string, unknown> = {};

function write(name: string, data: unknown): void {
  writeFileSync(`${OUT}${name}`, `${JSON.stringify(data, null, 2)}\n`);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

/** Scrolls the document frame so that the element with this id is at the top. */
async function scrollFrameTo(page: Page, id: string): Promise<void> {
  await docFrame(page).locator(`#${id}`).evaluate((el) => el.scrollIntoView({ block: 'start' }));
}

async function fill(page: Page, address: string, value: string): Promise<void> {
  const input = docFrame(page).locator(`input[data-hp-cell="${address}"]`);
  await input.fill(value);
  await input.press('Tab');
  await expect(page.locator('#calc-status')).toContainText('Neu berechnet in');
}

test.describe.configure({ mode: 'serial' });

test('Screenshots: ausfüllen, Prüfregel, Dialog (Abnahme 3)', async ({ page }) => {
  for (const [name, size] of [['desktop', WIDTHS.desktop], ['telefon', WIDTHS.telefon]] as const) {
    await page.setViewportSize(size);
    await openCalcSample(page);
    if (name === 'desktop') await shot(page, '01-hauptfassung-vor-dem-ausfuellen-1440');
    for (const [address, value] of FILL) await fill(page, address, value);
    await expect(docFrame(page).locator('td[data-hp-cell="kosten.F11"]')).toHaveText('21.556,58 €');
    await scrollFrameTo(page, 'aufmass-abschnitt');
    await shot(page, `02-ausgefuellt-aufmass-${size.width}`);
    await scrollFrameTo(page, 'kosten-abschnitt');
    await shot(page, `03-ausgefuellt-kosten-${size.width}`);
  }
  await page.setViewportSize(WIDTHS.desktop);
  await openCalcSample(page);
  await fill(page, 'aufmass.C3', '0');
  await expect(docFrame(page).locator('input[data-hp-cell="aufmass.C3"]')).toHaveAttribute('aria-invalid', 'true');
  await scrollFrameTo(page, 'aufmass-abschnitt');
  await shot(page, '04-pruefregel-nicht-erfuellt-1440');
  await page.getByRole('button', { name: 'Tabellen' }).click();
  await expect(page.locator('#dlg-calc')).toContainText('hpro-calc 0.1.1');
  await shot(page, '05-dialog-tabellen-1440');
});

test('Screenshots: eingefrorene Fassung, unverändert und verändert (Abnahme 4)', async ({ page }) => {
  await page.setViewportSize(WIDTHS.desktop);
  await openCalcSample(page);
  await showVersion(page, `Eingefrorene Fassung ${CALC_RENDITION} (Profil signed)`);
  await expect(page.locator('#version-banner')).toContainText('Nachrechnung: keine Abweichung');
  await scrollFrameTo(page, 'kosten-abschnitt');
  await shot(page, '06-eingefroren-unveraendert-1440');

  const path = `renditions/${CALC_RENDITION}/content/index.xhtml`;
  const entries = await readZip(readFileSync(CALC_SAMPLE));
  const changed = new TextEncoder().encode(new TextDecoder().decode(entries.find((e) => e.name === path)!.data).replace('data-hp-value="21525.4">21.525,40 €', 'data-hp-value="12525.4">12.525,40 €'));
  const file = `${SCRATCH}p19-manipuliert.hpro`;
  writeFileSync(file, await writeZip(entries.map((e) => ({ name: e.name, data: e.name === path ? changed : e.data, compression: e.name === 'mimetype' ? 'store' : 'auto' })), { modified: new Date('2026-10-12T12:00:00Z') }));
  await openFile(page, file);
  await showVersion(page, `Eingefrorene Fassung ${CALC_RENDITION} (Profil signed)`);
  await expect(page.locator('#version-banner')).toHaveClass(/changed/);
  await scrollFrameTo(page, 'kosten-abschnitt');
  await shot(page, '07-eingefroren-veraendert-1440');
  measurements.manipulatedBanner = await page.locator('#version-banner').innerText();
});

test('Eingefrorene Fassung ohne Rechner: Chromium mit abgeschaltetem JavaScript (Abnahme 4)', async ({ browser }) => {
  const c = await readContainer(readFileSync(CALC_SAMPLE));
  const prefix = `renditions/${CALC_RENDITION}/`;
  const dir = `${SCRATCH}eingefroren/`;
  const written: string[] = [];
  for (const [name, data] of c.files) {
    if (!name.startsWith(prefix)) continue;
    const target = `${dir}${name.slice(prefix.length)}`;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    written.push(name);
  }
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: WIDTHS.desktop, locale: 'de-AT' });
  const page = await context.newPage();
  await page.goto(pathToFileURL(`${dir}content/index.xhtml`).href);
  const result = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('td[data-hp-formula]')).map((td) => ({
      formula: td.getAttribute('data-hp-formula'),
      stored: td.getAttribute('data-hp-value'),
      type: td.getAttribute('data-hp-type'),
      shown: (td.textContent ?? '').trim(),
    }));
    return {
      contentType: document.contentType,
      scripts: document.querySelectorAll('script').length,
      inputs: document.querySelectorAll('input, [data-hp-input]').length,
      checks: document.querySelectorAll('[data-hp-check]').length,
      notice: document.querySelector('[data-hp-role="signature-notice"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      cells,
    };
  });
  expect(result.scripts).toBe(0);
  expect(result.inputs).toBe(0);
  expect(result.cells.length).toBe(38);
  for (const cell of result.cells) {
    expect(cell.stored, cell.formula ?? '').not.toBeNull();
    expect(cell.shown, cell.formula ?? '').not.toBe('');
    expect(cell.shown.startsWith('='), cell.formula ?? '').toBe(false);
  }
  expect(result.cells.find((x) => x.formula === '=ROUND([.F9]+[.F10];2)')?.shown).toBe('21.525,40 €');
  await page.locator('#kosten-abschnitt').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}08-eingefroren-ohne-javascript-1440.png`, fullPage: true });
  await context.close();
  write('ohne-rechner.json', { browser: `Chromium ${browser.version()}, javaScriptEnabled: false`, files: written, ...result });
});

test('HPF-CALC-007: 10 000 Formelzellen, Eingabe bis Anzeige im Reader', async ({ page }) => {
  test.setTimeout(180_000);
  const { bytes, xhtml } = await buildLargeCalcContainer();
  const file = `${SCRATCH}p19-10000.hpro`;
  writeFileSync(file, bytes);
  const stored = new calc.CalcDocument(new DOMParser().parseFromString(xhtml, 'application/xhtml+xml') as unknown as calc.DomDocument);
  expect(stored.workbook.formulaCells.length).toBe(10000);

  await page.setViewportSize(WIDTHS.desktop);
  const t0 = Date.now();
  await openFile(page, file);
  await expect(page.locator('#calc-status')).toHaveText('Rechnet: 10000 Formeln');
  const openMs = Date.now() - t0;
  const last = docFrame(page).locator('td[data-hp-cell="gross.B10001"]');
  const chainEnd = docFrame(page).locator('td[data-hp-cell="gross.B1001"]');
  const input = docFrame(page).locator('input[data-hp-cell="gross.A2"]');
  // The end of the measurement is checked on every animation frame inside the document frame:
  // expect().toHaveText() polls in steps of 100/250/500/1000 ms and would add up to a second.
  const frame = await (await page.locator('#doc-frame').elementHandle())!.contentFrame();
  if (!frame) throw new Error('document frame not found');
  const runs: Array<{ value: string; endToEndMs: number; status: string }> = [];
  for (const [value, expectLast] of [['5', '1.015'], ['7', '1.021'], ['1', '1.003']] as const) {
    await input.fill(value);
    const t1 = Date.now();
    await input.press('Tab');
    await frame.waitForFunction((v) => document.querySelector('td[data-hp-cell="gross.B10001"]')?.textContent === v, expectLast, { polling: 'raf', timeout: 30_000 });
    const endToEndMs = Date.now() - t1;
    await expect(last).toHaveText(expectLast);
    runs.push({ value, endToEndMs, status: (await page.locator('#calc-status').textContent()) ?? '' });
  }
  await expect(chainEnd).toHaveText('1.001');
  await waitForFrame(page);
  measurements.calc10000 = { formulaCells: 10000, chain: 1000, openUntilReadyMs: openMs, runs, limitMs: 1000 };
  console.log(`P19 HPF-CALC-007 im Reader: ${runs.map((r) => `A2=${r.value}: ${r.endToEndMs} ms bis zur Anzeige (${r.status})`).join(' | ')}`);
  for (const r of runs) expect(r.endToEndMs).toBeLessThanOrEqual(1000);
});

test.afterAll(() => {
  write('messungen-reader.json', measurements);
});
