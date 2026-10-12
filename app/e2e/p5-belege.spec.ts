/**
 * Evidence run for docs/belege/P5 (npm run belege:p5 -w app): screenshots of editing in the
 * reader — the structure panel with the live preview, a refused change, the comparison of two
 * versions, the redaction dialog and the search after the redaction, a narrow screen. Not part of
 * npm test, because it writes into the repository.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { docFrame, openFile, waitForFrame } from './helpers.js';

const SHOTS = fileURLToPath(new URL('../../docs/belege/P5/screenshots/', import.meta.url));
const EDIT_SAMPLE = fileURLToPath(new URL('../dist/bearbeiten.hpro', import.meta.url));
const I = 'content/index.xhtml';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

const block = (page: Page, pointer: string) => page.locator(`#edit-blocks .edit-block[data-pointer="${pointer}"]`);

test('Belege P5: Bearbeiten, Vergleich und Schwärzen im Reader', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFile(page, EDIT_SAMPLE);
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await block(page, `${I}#stand-h`).click();
  await page.locator('#edit-text').fill('Stand der Arbeiten und Ausblick');
  await page.locator('#edit-text').press('Enter');
  await expect(docFrame(page).locator('#stand-h')).toHaveText('Stand der Arbeiten und Ausblick');
  await block(page, `${I}#stand-text`).click();
  await shot(page, '01-bearbeiten-ueberschrift-vorschau');
  await block(page, `${I}#termin-tabelle.B3`).click();
  await page.getByRole('button', { name: 'Zeile darunter' }).click();
  await block(page, `${I}#abb-fassade`).click();
  await page.getByRole('button', { name: 'Block löschen' }).click();
  await block(page, `${I}#termine`).click();
  await page.getByRole('button', { name: 'Block löschen' }).click();
  await expect(page.locator('#edit-error')).toContainText('ohne Ziel');
  await shot(page, '02-abgelehnt-toter-verweis');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Speichern' }).click()]);
  await download.path();
  await waitForFrame(page);
  await page.getByRole('button', { name: 'Verlauf' }).click();
  await page.locator('#dlg-history').getByRole('button', { name: 'Vergleichen', exact: true }).click();
  await expect(page.locator('#diff-list li').first()).toBeVisible();
  await shot(page, '03-verlauf-vergleich');
  await page.locator('#dlg-history').getByRole('button', { name: 'Schließen' }).click();
  await page.getByRole('button', { name: 'Schwärzen …' }).click();
  await page.locator('#dlg-redact').getByLabel('Begriffe, je Zeile einer').fill('Max Mustermann\n+43 512 123456');
  await page.locator('#dlg-redact').getByLabel('Grund').fill('Datenschutz');
  await shot(page, '04-schwaerzen-dialog');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.locator('#dlg-redact').getByRole('button', { name: 'Schwärzen und speichern' }).click()]);
  await d2.path();
  await waitForFrame(page);
  await page.getByRole('button', { name: 'Suche', exact: true }).click();
  await page.locator('#search-input').fill('Mustermann');
  await page.locator('#search-input').press('Enter');
  await expect(page.locator('#search-status')).toHaveText('Keine Treffer für „Mustermann“.');
  await docFrame(page).locator('#teilnehmende').scrollIntoViewIfNeeded();
  await shot(page, '05-nach-schwaerzung-suche-ohne-treffer');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await block(page, `${I}#einleitung`).click();
  await shot(page, '06-telefon-bearbeiten');
});
