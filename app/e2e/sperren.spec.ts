/**
 * Locks in the reader (package P17, docs/10 promise 5):
 *
 * - criterion 2: a sealed section of the living document is not readable — not in the file
 *   (every entry decoded, raw ZIP), not in the rendered frame, not in the search; it appears only
 *   after the key is given, and only in memory;
 * - `hidden` is out of the flow, marked, can be shown, and the search names it (HPL-LOCK-003);
 * - `no-print` is left out in print with the notice (HP-LOCK-003);
 * - criterion 1 in the reader: the frozen version is signed, checked, its locks are covered by
 *   the signature; a changed frozen version is shown as changed.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lock, readZip, writeZip } from '../../kern/src/index.ts';
import { docFrame, innerFrame, openFile, waitForFrame } from './helpers.js';

const LOCK_SAMPLE = fileURLToPath(new URL('../dist/sperren.hpro', import.meta.url));
const SCRATCH = fileURLToPath(new URL('../.scratch/', import.meta.url));
const PASSWORD = 'Bauamt-Beispielort-2026!';
const RENDITION = 'nachweis-2026-10-12';
const SECRETS = ['Kalkulationsblatt K7', '3,1 Prozent unter den eigenen', 'Vollwärmeschutz', 'Bieter B minus 11,8 Prozent'];

async function openLockSample(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFile(page, LOCK_SAMPLE);
  await expect(page.locator('#doc-title')).toHaveText('Vergabevermerk Sanierung Volksschule Beispielort');
}

async function frameText(page: Page): Promise<string> {
  return innerFrame(page).evaluate(() => document.documentElement.textContent ?? '');
}

async function frameHtml(page: Page): Promise<string> {
  return innerFrame(page).evaluate(() => document.documentElement.outerHTML);
}

test.describe('Sperren und versiegelte Abschnitte (P17)', () => {
  test('Abnahme 2: ein versiegelter Abschnitt ist im lebendigen Dokument nicht auslesbar', async ({ page }) => {
    // The file: every entry decoded and the raw ZIP contain none of the secret text.
    const bytes = readFileSync(LOCK_SAMPLE);
    const found = await lock.searchContainer(bytes, SECRETS);
    expect(found.hits).toEqual([]);

    await openLockSample(page);
    const banner = page.locator('#lock-banner');
    await expect(banner).toContainText('1 versiegelt');
    await expect(banner).toContainText('Nachweis: Sperre nicht signiert');
    // Rendered frame: placeholder only, nothing of the content (text and markup, incl. attributes).
    await expect(docFrame(page).locator('#bewertung[data-hp-sealed]')).toContainText('Versiegelter Abschnitt');
    const html = await frameHtml(page);
    for (const s of SECRETS) expect(html).not.toContain(s);
    // Search over the document finds nothing of it.
    await page.getByRole('button', { name: 'Suche' }).first().click();
    await page.locator('#search-input').fill('Kalkulationsblatt');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#search-status')).toHaveText('Keine Treffer für „Kalkulationsblatt“.');

    // A wrong password opens nothing.
    await page.locator('#btn-unseal').click();
    await page.locator('#unseal-password').fill('falsches-Kennwort-123');
    await page.locator('#unseal-ok').click();
    await expect(page.locator('#unseal-status')).toHaveText('Nicht geöffnet: Kennwort passt nicht.');
    expect(await frameText(page)).not.toContain('Kalkulationsblatt K7');

    // The right password decrypts in memory: the section appears, the file stays unchanged.
    await page.locator('#unseal-password').fill(PASSWORD);
    await page.locator('#unseal-ok').click();
    await waitForFrame(page);
    await expect(docFrame(page).locator('#bewertung[data-hp-unsealed]')).toContainText('Kalkulationsblatt K7');
    await expect(docFrame(page).locator('#bewertung img')).toHaveAttribute('alt', /Bieter B minus 11,8 Prozent/);
    await expect(banner).toContainText('1 versiegelt (1 hier entsiegelt)');
    await page.locator('#search-input').fill('Kalkulationsblatt');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#search-status')).toHaveText('1 Treffer für „Kalkulationsblatt“ in 1 Dokumentteil.');

    // Opening the file again: sealed again (nothing was stored).
    await openLockSample(page);
    expect(await frameText(page)).not.toContain('Kalkulationsblatt K7');
  });

  test('hidden: außerhalb des Flusses, gekennzeichnet, einblendbar, in der Suche benannt', async ({ page }) => {
    await openLockSample(page);
    await expect(page.locator('#lock-banner')).toContainText('1 ausgeblendeter Abschnitt');
    await expect(docFrame(page).locator('#intern')).toBeHidden();
    await expect(docFrame(page).locator('.hp-lock-hidden')).toContainText('Ausgeblendeter Abschnitt intern');
    await page.getByRole('button', { name: 'Suche' }).first().click();
    await page.locator('#search-input').fill('Gemeindevorstand');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#search-results .hit-where').first()).toContainText('in ausgeblendetem Abschnitt');
    await page.locator('#btn-show-hidden').click();
    await waitForFrame(page);
    await expect(docFrame(page).locator('#intern')).toBeVisible();
    await expect(page.locator('#btn-show-hidden')).toHaveAttribute('aria-pressed', 'true');
  });

  test('no-print: im Druck ausgelassen, Hinweis an seiner Stelle (HP-LOCK-003)', async ({ page }) => {
    await openLockSample(page);
    await expect(docFrame(page).locator('#kalkulation')).toBeVisible();
    await expect(docFrame(page).locator('[data-hp-print-only]')).toHaveCount(2);
    await expect(docFrame(page).locator('[data-hp-print-only]').first()).toBeHidden();
    // hidden shown on screen is still not printed.
    await page.locator('#btn-show-hidden').click();
    await waitForFrame(page);
    await expect(docFrame(page).locator('#intern')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(docFrame(page).locator('#kalkulation')).toBeHidden();
    await expect(docFrame(page).locator('#intern')).toBeHidden();
    await expect(docFrame(page).locator('[data-hp-print-only]')).toHaveText(['Abschnitt kalkulation nicht zum Druck freigegeben', 'Abschnitt intern ausgeblendet']);
    for (const n of await docFrame(page).locator('[data-hp-print-only]').all()) await expect(n).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
  });

  test('Abnahme 1 im Reader: eingefrorene Fassung signiert und geprüft, Änderung erkannt', async ({ page }) => {
    await openLockSample(page);
    await page.getByRole('button', { name: 'Tabellen' }).click();
    await page.getByLabel('Fassung').selectOption({ label: `Eingefrorene Fassung ${RENDITION} (Profil signed)` });
    await waitForFrame(page);
    const versionBanner = page.locator('#version-banner');
    await expect(versionBanner).toContainText('Dateien unverändert');
    // The reader has no trust anchor: cryptographically intact, signer not checked (part 1, 7.5).
    await expect(versionBanner).toContainText('Signatur: rechnerisch intakt');
    await expect(page.locator('#lock-banner')).toContainText('Sperren signiert, Signatur rechnerisch intakt');
    await expect(docFrame(page).locator('#bewertung[data-hp-sealed]')).toBeVisible();

    // The frozen version changed with a foreign ZIP tool: shown as changed.
    const entries = await readZip(readFileSync(LOCK_SAMPLE));
    const file = `renditions/${RENDITION}/content/index.xhtml`;
    const tampered = await writeZip(
      entries.filter((e) => !e.name.endsWith('/')).map((e) => ({
        name: e.name,
        data: e.name === file ? new TextEncoder().encode(new TextDecoder().decode(e.data).replace('433.900,00 €', '413.900,00 €')) : e.data,
        compression: e.name === 'mimetype' ? 'store' : 'auto',
      })),
      { modified: new Date('2026-10-12T13:00:00Z') },
    );
    mkdirSync(SCRATCH, { recursive: true });
    const path = `${SCRATCH}sperren-manipuliert.hpro`;
    writeFileSync(path, tampered);
    await openFile(page, path);
    await page.getByRole('button', { name: 'Tabellen' }).click();
    await page.getByLabel('Fassung').selectOption({ label: `Eingefrorene Fassung ${RENDITION} (Profil signed)` });
    await waitForFrame(page);
    await expect(versionBanner).toContainText('Achtung, diese eingefrorene Fassung wurde verändert.');
    await expect(versionBanner).toContainText(`Dateien VERÄNDERT: ${file}`);
    await expect(versionBanner).toContainText('Signatur: ungültig – Inhalt nach dem Signieren verändert (TOTAL_FAILED/HASH_FAILURE)');
  });
});
