/**
 * Evidence run for docs/belege/P17 (npm run belege:p17 -w app): screenshots of the lock sample —
 * sealed placeholder, wrong password, unsealed in memory, hidden section shown, print view, frozen
 * version with its signature status. Not part of npm test, because it writes into the repository.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { docFrame, openFile, waitForFrame } from './helpers.js';

const SHOTS = fileURLToPath(new URL('../../docs/belege/P17/screenshots/', import.meta.url));
const LOCK_SAMPLE = fileURLToPath(new URL('../dist/sperren.hpro', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

async function scrollTo(page: Page, id: string): Promise<void> {
  await docFrame(page).locator(`#${id}`).scrollIntoViewIfNeeded();
}

test('Belege P17: Sperren im Reader', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openFile(page, LOCK_SAMPLE);
  await scrollTo(page, 'bewertung');
  await shot(page, '01-versiegelt-platzhalter');
  await page.locator('#btn-unseal').click();
  await page.locator('#unseal-password').fill('falsches-Kennwort-123');
  await page.locator('#unseal-ok').click();
  await expect(page.locator('#unseal-status')).toHaveText('Nicht geöffnet: Kennwort passt nicht.');
  await shot(page, '02-falsches-kennwort');
  await page.locator('#unseal-password').fill('Bauamt-Beispielort-2026!');
  await page.locator('#unseal-ok').click();
  await waitForFrame(page);
  await expect(docFrame(page).locator('#bewertung[data-hp-unsealed]')).toBeVisible();
  await scrollTo(page, 'bewertung');
  await shot(page, '03-entsiegelt-im-speicher');
  await openFile(page, LOCK_SAMPLE);
  await scrollTo(page, 'kalkulation');
  await shot(page, '04-ausgeblendet-gekennzeichnet');
  await page.locator('#btn-show-hidden').click();
  await waitForFrame(page);
  await scrollTo(page, 'intern');
  await shot(page, '05-ausgeblendet-eingeblendet');
  await scrollTo(page, 'angebote');
  await page.emulateMedia({ media: 'print' });
  const notice = docFrame(page).locator('[data-hp-print-only]').first();
  await expect(notice).toBeVisible();
  await notice.scrollIntoViewIfNeeded();
  await shot(page, '06-druckansicht-no-print');
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Tabellen' }).click();
  await page.getByLabel('Fassung', { exact: true }).selectOption({ label: 'Eingefrorene Fassung nachweis-2026-10-12 (Profil signed)' });
  await waitForFrame(page);
  await expect(page.locator('#version-banner')).toContainText('Signatur: rechnerisch intakt');
  await shot(page, '07-eingefrorene-fassung-signiert');
});
