/**
 * Accessibility check in the reader (package P8):
 *
 * - Abnahme 1: the panel "Prüfen" finds the deliberately faulty test document's problems in all
 *   seven categories (at least five are required);
 * - Abnahme 2: the proposals are applicable — one by one (with focus moving on to the next
 *   finding) and all at once — and the second run finds nothing; the saved file checks clean in
 *   the core as well and carries a history entry;
 * - Abnahme 3: axe-core over the reader with the panel open shows no serious or critical
 *   violation (the faulty document itself is left out; after the corrections it is included).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { a11y, readContainer } from '../../kern/src/index.ts';
import { AXE_TAGS, SEVERE } from './a11y.js';
import { docFrame, innerFrame } from './helpers.js';
import { fixAll, openCheck, PLAN_ALT, PLAN_ID } from './pruefen.js';

async function severe(page: Page, excludeDocument: boolean) {
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (excludeDocument) builder = builder.exclude('#doc-host');
  const r = await builder.analyze();
  return r.violations.filter((v) => v.impact && SEVERE.has(v.impact)).map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' >>> ')) }));
}

test('Abnahme 1: der Prüflauf findet im Testdokument alle sieben Kategorien', async ({ page }) => {
  await openCheck(page);
  await expect(page.locator('#a11y-summary')).toHaveText(/^19 Befunde in 7 Kategorien, 19 mit Korrekturvorschlag\./);
  const counts = await page.locator('#a11y-counts tbody tr').evaluateAll((rows) => rows.map((r) => [r.querySelector('th')!.textContent, Number(r.querySelector('td')!.textContent)] as const));
  expect(counts).toEqual([
    ['Struktur', 3],
    ['Lesereihenfolge', 1],
    ['Alternativtexte', 3],
    ['Kontrast', 3],
    ['Sprache', 3],
    ['Tabellenköpfe', 2],
    ['Fokusführung', 4],
  ]);
  expect(counts.filter(([, n]) => n > 0).length).toBeGreaterThanOrEqual(5);
  // the panel names WCAG criteria and gives a proposal with its source
  const alt = page.locator('#a11y-list li[data-id="alt-fehlt@content/index.xhtml#abb-becken/img[1]"]');
  await expect(alt).toContainText('WCAG 1.1.1 · HP-INH-006');
  await expect(alt.getByLabel('Alternativtext')).toHaveValue('Das Sportbecken vor der Sanierung, Blick von der Galerie');
  await expect(page.locator(`#a11y-list li[data-id="${PLAN_ID}"]`)).toContainText('Kein Vorschlag – bitte eintragen.');
});

test('Abnahme 2: einzeln korrigieren mit Fokusführung, Rückgängig', async ({ page }) => {
  await openCheck(page);
  const sprung = page.locator('#a11y-list li[data-id="ueberschrift-sprung@content/index.xhtml#ueberblick-h"]');
  await sprung.getByRole('button', { name: 'Zu h2 machen' }).click();
  await expect(page.locator('#a11y-summary')).toContainText('18 Befunde in 7 Kategorien');
  await expect(page.locator('#a11y-summary')).toContainText('1 Korrektur noch nicht gespeichert');
  // the preview shows the change at once
  await expect(docFrame(page).locator('#ueberblick-h')).toHaveJSProperty('localName', 'h2');
  // the focus moved on to the next finding (the hand-made heading) instead of getting lost
  await expect(page.locator('#a11y-list li[data-id="pseudo-ueberschrift@content/index.xhtml#ueberblick/p[2]"] button[data-fix]')).toBeFocused();
  // a value from the input field
  const svg = page.locator('#a11y-list li[data-id="grafik-ohne-namen@content/index.xhtml#stimmen/svg[1]"]');
  await svg.getByLabel('Beschreibung der Grafik').fill('Balkendiagramm: Energiebedarf sinkt von 100 auf 60 Prozent');
  await svg.getByRole('button', { name: 'Grafik benennen' }).click();
  await expect(page.locator('#a11y-summary')).toContainText('17 Befunde');
  await expect(docFrame(page).locator('svg[role="img"]')).toHaveAttribute('aria-label', 'Balkendiagramm: Energiebedarf sinkt von 100 auf 60 Prozent');
  // contrast: a stylesheet change, visible in the frame
  await page.locator('#a11y-list li[data-id^="kontrast-text@content/styles/document.css|.warnung"]').getByRole('button', { name: /Textfarbe #[0-9a-f]{6} verwenden/ }).click();
  await expect(page.locator('#a11y-summary')).toContainText('16 Befunde');
  const colour = await innerFrame(page).evaluate(() => getComputedStyle(document.querySelector('.warnung')!).color);
  expect(colour).toBe('rgb(92, 92, 92)');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('#a11y-summary')).toContainText('17 Befunde');
  await expect(page.locator('#a11y-summary')).toBeFocused();
});

test('Abnahme 2: alle Vorschläge übernehmen, zweiter Lauf fehlerfrei, gespeicherte Datei geprüft', async ({ page }) => {
  await openCheck(page);
  await fixAll(page);
  await expect(page.locator('#a11y-list')).toBeEmpty();
  // second run over the corrected state
  await page.getByRole('button', { name: 'Erneut prüfen' }).click();
  await expect(page.locator('#a11y-summary')).toHaveText(/^Keine Befunde – alle sieben Kategorien geprüft/);
  await expect(page.locator('#a11y-summary')).toBeFocused();
  const counts = await page.locator('#a11y-counts tbody td').allTextContents();
  expect(counts).toEqual(['0', '0', '0', '0', '0', '0', '0']);
  // the corrected document in the frame
  const frame = docFrame(page);
  await expect(frame.locator('#tab-kosten th[scope="col"]')).toHaveCount(2);
  await expect(frame.locator('#tab-kosten caption')).toHaveText('Die Kosten im Überblick');
  await expect(frame.locator('img[src*="plan"], img[alt="' + PLAN_ALT + '"]').first()).toHaveAttribute('alt', PLAN_ALT);
  // saving writes a new version; the core checks the file again: no findings
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Speichern' }).click()]);
  expect(download.suggestedFilename()).toBe('pruefen-geprueft.hpro');
  const bytes = new Uint8Array(readFileSync((await download.path())!));
  const report = await a11y.auditContainer(bytes);
  expect(report.findings).toEqual([]);
  const manifest = JSON.parse(new TextDecoder().decode((await readContainer(bytes)).files.get('manifest.json')!)) as { history: Array<{ version: number; note: string }> };
  expect(manifest.history.map((h) => h.version)).toEqual([1]);
  expect(manifest.history[0]!.note).toMatch(/^Barrierefreiheit: 19 Korrekturen aus dem Prüflauf/);
  // the reader opened the saved file and the panel checks it: clean
  await expect(page.locator('#a11y-summary')).toContainText('Keine Befunde');
});

test('Abnahme 3: axe-core ohne schwere Verstöße – Prüfpanel mit Befunden und nach den Korrekturen', async ({ page }) => {
  await openCheck(page);
  expect(await severe(page, true)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#a11y-panel')).toBeVisible();
  expect(await severe(page, true)).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await fixAll(page);
  // now the corrected document is part of the check, too
  expect(await severe(page, false)).toEqual([]);
});
