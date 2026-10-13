/** Shared steps of the P8 tests (pruefen.spec.ts) and the evidence run (p8-belege.spec.ts). */
import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { openFile } from './helpers.js';

export const CHECK_SAMPLE = fileURLToPath(new URL('../dist/pruefen.hpro', import.meta.url));
export const PLAN_ALT = 'Lageplan des Hallenbads mit dem neuen barrierefreien Zugang an der Ostseite';
export const PLAN_ID = 'alt-dateiname@content/index.xhtml#plan/img[1]';

export async function openCheck(page: Page, width = 1440, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await openFile(page, CHECK_SAMPLE);
  await expect(page.locator('#doc-title')).toHaveText('Hallenbad Mühlau: Sanierung 2027');
  await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
  await expect(page.locator('#a11y-panel')).toBeVisible();
  await expect(page.locator('#a11y-summary')).toContainText('Befunde in 7 Kategorien');
}

/** Enters the one value without proposal and applies all proposals. */
export async function fixAll(page: Page): Promise<void> {
  await page.locator(`#a11y-list input[data-id="${PLAN_ID}"]`).fill(PLAN_ALT);
  await page.getByRole('button', { name: 'Alle Vorschläge übernehmen' }).click();
  await expect(page.locator('#a11y-summary')).toContainText('Keine Befunde');
}

