/**
 * Editing in the reader (package P5, docs/10 promise 4 and 5):
 *
 * - criterion 1: text edited in the panel "Bearbeiten" is in the content document of the saved
 *   file (raw ZIP entry), not in an extra layer; the frame shows it before saving already;
 * - criterion 2: "Schwärzen" removes the text from the file and every earlier version; the
 *   reader's search finds nothing afterwards; the log is in the file;
 * - criterion 3: "Verlauf" compares two versions: changed heading, changed paragraph, removed image;
 * - a change that would break the structure (dangling link) is refused with a message;
 * - axe-core: no serious violations with the panel and the dialog open.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { edit, lock, readZip } from '../../kern/src/index.ts';
import { AXE_TAGS, SEVERE } from './a11y.js';
import { docFrame, openFile, waitForFrame } from './helpers.js';

const EDIT_SAMPLE = fileURLToPath(new URL('../dist/bearbeiten.hpro', import.meta.url));
const I = 'content/index.xhtml';
const dec = new TextDecoder();

async function openEditSample(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFile(page, EDIT_SAMPLE);
  await expect(page.locator('#doc-title')).toHaveText('Protokoll Baubesprechung Schule Nord');
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.locator('#edit-blocks .edit-block').first()).toBeVisible();
}

/** Runs a search in the panel "Suche" (opens it if it is closed: the button toggles). */
async function search(page: Page, query: string): Promise<void> {
  if (await page.locator('#search-panel').isHidden()) await page.getByRole('button', { name: 'Suche', exact: true }).click();
  await page.locator('#search-input').fill(query);
  await page.locator('#search-input').press('Enter');
}

function block(page: Page, pointer: string) {
  return page.locator(`#edit-blocks .edit-block[data-pointer="${pointer}"]`);
}

async function savedFile(page: Page, button: () => Promise<void>): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent('download'), button()]);
  await waitForFrame(page);
  return new Uint8Array(readFileSync((await download.path())!));
}

test.describe('Bearbeiten, Verlauf und Schwärzen (P5)', () => {
  test('Abnahme 1 und 3: bearbeiteter Text steht im Container; der Vergleich zeigt Überschrift, Absatz und entferntes Bild', async ({ page }) => {
    await openEditSample(page);
    // Heading: plain text.
    await block(page, `${I}#stand-h`).click();
    await expect(page.locator('#edit-target')).toContainText('Überschrift 2');
    await page.locator('#edit-text').fill('Stand der Arbeiten und Ausblick');
    await page.locator('#edit-text').press('Enter');
    await expect(docFrame(page).locator('#stand-h')).toHaveText('Stand der Arbeiten und Ausblick');
    await expect(page.locator('#edit-status')).toContainText('1 Änderung, noch nicht gespeichert');
    // Paragraph with links: the date changes, the links stay.
    await block(page, `${I}#einleitung`).click();
    await expect(page.locator('#edit-text a')).toHaveCount(2);
    await page.locator('#edit-text').evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.includes('8. Oktober')) n.nodeValue = n.nodeValue.replace('8. Oktober', '9. Oktober');
    });
    await page.getByRole('button', { name: 'Text übernehmen' }).click();
    await expect(docFrame(page).locator('#einleitung')).toContainText('am 9. Oktober 2026');
    await expect(docFrame(page).locator('#einleitung a')).toHaveCount(2);
    // Image: the figure goes with its file.
    await block(page, `${I}#abb-fassade`).click();
    await page.getByRole('button', { name: 'Block löschen' }).click();
    await expect(docFrame(page).locator('#abb-fassade')).toHaveCount(0);
    await expect(page.locator('#edit-status')).toContainText('3 Änderungen');

    const bytes = await savedFile(page, () => page.getByRole('button', { name: 'Speichern' }).click());
    await expect(page.locator('#edit-status')).toContainText('Gespeichert als Fassung 2');
    // The raw ZIP entry of the content document holds the new text; no other entry is new except history blobs.
    const entries = new Map((await readZip(bytes)).map((e) => [e.name, e.data]));
    const index = dec.decode(entries.get(I)!);
    expect(index).toContain('<h2 id="stand-h">Stand der Arbeiten und Ausblick</h2>');
    expect(index).toContain('am 9. Oktober 2026 im Baubüro');
    expect(index).not.toContain('fassade-nord.png');
    expect(entries.has('content/media/fassade-nord.png')).toBe(false);
    const holders = [...entries].filter(([, d]) => dec.decode(d).includes('Stand der Arbeiten und Ausblick')).map(([n]) => n);
    expect(holders.sort()).toEqual(['content/index.xhtml', 'content/nav.xhtml']);
    const original = new Set((await readZip(readFileSync(EDIT_SAMPLE))).map((e) => e.name));
    expect([...entries.keys()].filter((n) => !original.has(n)).every((n) => n.startsWith(edit.BLOB_DIR))).toBe(true);

    // Verlauf: compare version 1 (before) and 2 (saved now) in the reader.
    await page.getByRole('button', { name: 'Verlauf' }).click();
    const dialog = page.locator('#dlg-history');
    await expect(dialog.locator('#history-rows tr')).toHaveCount(3);
    await expect(dialog.locator('#history-rows')).toContainText('byte-genau wiederhergestellt');
    await expect(dialog.getByLabel('Ältere Fassung')).toHaveValue('1');
    await expect(dialog.getByLabel('Neuere Fassung')).toHaveValue('2');
    await dialog.getByRole('button', { name: 'Vergleichen' }).click();
    await expect(dialog.locator('#diff-status')).toContainText('von Fassung 1 zu 2');
    const list = dialog.locator('#diff-list');
    await expect(list.locator('li.heading-changed')).toContainText(`${I}#stand-h`);
    await expect(list.locator('li.heading-changed ins')).toContainText('und Ausblick');
    await expect(list.locator('li.paragraph-changed del')).toContainText('8');
    await expect(list.locator('li.paragraph-changed ins')).toContainText('9');
    await expect(list.locator('li.image-removed')).toContainText('fassade-nord.png');
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).include('#dlg-history').analyze();
    expect(axe.violations.filter((v) => SEVERE.has(v.impact ?? '')).map((v) => v.id)).toEqual([]);
    // The same comparison from the core on the downloaded file.
    const d = await edit.diffVersions(bytes, 1, 2);
    expect(d.changes.map((c) => c.kind).sort()).toEqual(['heading-changed', 'image-removed', 'paragraph-changed', 'resource-removed']);
  });

  test('Abnahme 2: Schwärzen löscht aus Datei, Verlauf und Suche; Protokoll in der Datei', async ({ page }) => {
    await openEditSample(page);
    await search(page, 'Mustermann');
    await expect(page.locator('#search-status')).toContainText('2 Treffer');
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await page.getByRole('button', { name: 'Schwärzen …' }).click();
    const dialog = page.locator('#dlg-redact');
    await dialog.getByLabel('Begriffe, je Zeile einer').fill('Max Mustermann\n+43 512 123456');
    await dialog.getByLabel('Grund').fill('Datenschutz: Name und Telefonnummer der Bauaufsicht');
    const bytes = await savedFile(page, () => dialog.getByRole('button', { name: 'Schwärzen und speichern' }).click());
    await expect(page.locator('#edit-status')).toContainText('Nachprüfung 0 Treffer');
    // The reader's search over the reopened file.
    await search(page, 'Mustermann');
    await expect(page.locator('#search-status')).toHaveText('Keine Treffer für „Mustermann“.');
    await expect(docFrame(page).locator('#teilnehmende-liste [data-hp-redacted]')).toHaveCount(2);
    // The file: every entry in every reading and the raw ZIP; every earlier version.
    expect((await lock.searchContainer(bytes, ['Max Mustermann', '+43 512 123456', 'Mustermann'])).hits).toEqual([]);
    const versions = await edit.listVersions(bytes);
    expect(versions.map((v) => [v.version, v.available])).toEqual([[2, true], [1, true], [0, true]]);
    for (const v of [0, 1]) expect((await lock.searchContainer(await edit.checkoutVersion(bytes, v), ['Mustermann'])).hits).toEqual([]);
    const log = JSON.parse(dec.decode((await readZip(bytes)).find((e) => e.name === 'data/redaction-log.json')!.data)) as lock.RedactionLogEntry[];
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((e) => e.reason === 'Datenschutz: Name und Telefonnummer der Bauaufsicht' && e.check?.hits === 0)).toBe(true);
    // An earlier version opened from the history is clean as well.
    await page.getByRole('button', { name: 'Verlauf' }).click();
    await page.getByRole('button', { name: 'Fassung 0 als eigene Datei öffnen' }).click();
    await waitForFrame(page);
    await search(page, 'Mustermann');
    await expect(page.locator('#search-status')).toHaveText('Keine Treffer für „Mustermann“.');
  });

  test('Struktur bleibt Struktur: eine Änderung mit totem Verweis wird abgelehnt, Listen und Tabellen bleiben Struktur', async ({ page }) => {
    await openEditSample(page);
    await block(page, `${I}#termine`).click();
    await page.getByRole('button', { name: 'Block löschen' }).click();
    await expect(page.locator('#edit-error')).toContainText('Verweis #termine ohne Ziel');
    await expect(docFrame(page).locator('#termine')).toHaveCount(1);
    // A table cell: row below, with the grid kept.
    await block(page, `${I}#termin-tabelle.B3`).click();
    await page.getByRole('button', { name: 'Zeile darunter' }).click();
    await expect(docFrame(page).locator('#termin-tabelle tbody tr')).toHaveCount(5);
    // A list item: a new item after it, then indented.
    await block(page, `${I}#punkte/li[1]`).click();
    await page.getByLabel('Art', { exact: true }).selectOption('list-item');
    await page.getByLabel('Text', { exact: true }).fill('Gerüstabbau beauftragen.');
    await page.getByRole('button', { name: 'Einfügen' }).click();
    await page.getByRole('button', { name: 'Einrücken' }).click();
    await expect(docFrame(page).locator('#punkte > li').first().locator('ol > li')).toHaveText('Gerüstabbau beauftragen.');
    // Undo takes back the last step.
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(docFrame(page).locator('#punkte > li').nth(1)).toHaveText('Gerüstabbau beauftragen.');
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).include('#edit-panel').analyze();
    expect(axe.violations.filter((v) => SEVERE.has(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
