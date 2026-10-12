/**
 * Tables with formulas in the reader (package P19):
 *
 * - acceptance 3: a table with formulas is filled in inside the document and recalculates
 *   without the document being reloaded (HPF-STO-011, HPF-CALC-007); checks mark without blocking
 *   (HPF-STO-012); saving writes values, computedAt, calculator and history (HPF-STO-006, HPF-FRZ-006);
 *   data export (HPF-IMP-005);
 * - acceptance 4: the frozen rendition shows its stored values without calculator, and a change to
 *   it is recognisable (hashes, signature, recalculation; HPF-FRZ-003/005, HP-PROF-010).
 *
 * The expected values after filling in are those LibreOffice 26.8 computed for the same entries
 * (docs/belege/P19/gegenprobe/vergleich-beispiel.txt, "Beispiel ausgefüllt").
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calc, readContainer, readZip, sriSha256, writeZip } from '../../kern/src/index.ts';
import { CALC_RENDITION, CALC_SAMPLE, buildLargeCalcContainer, docFrame, openCalcSample, openFile, showVersion, waitForFrame } from './helpers.js';

const SCRATCH = fileURLToPath(new URL('../.scratch/', import.meta.url));

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

function cell(page: Page, address: string) {
  return docFrame(page).locator(`td[data-hp-cell="${address}"]`);
}

function input(page: Page, address: string) {
  return docFrame(page).locator(`input[data-hp-cell="${address}"]`);
}

test.describe('Tabellen mit Formeln (P19)', () => {
  test('Abnahme 3: ausfüllen und neu rechnen, ohne das Dokument neu zu laden', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCalcSample(page);
    await expect(docFrame(page).locator('a[data-hp-ref-cell="kosten.F11"]')).toHaveText('21.525,40 €');
    await expect(docFrame(page).locator('input[data-hp-cell]')).toHaveCount(22);
    await expect(input(page, 'aufmass.C2')).toHaveAccessibleName('Länge (m), Dachfläche Süd (aufmass.C2)');

    const frame = page.frames().find((f) => f.parentFrame() === page.mainFrame());
    if (!frame) throw new Error('document frame missing');
    await frame.evaluate(() => {
      (window as unknown as { hpMarker: string }).hpMarker = 'vor dem Ausfüllen';
    });
    let navigations = 0;
    page.on('framenavigated', (f) => {
      if (f === frame) navigations++;
    });

    const timings: string[] = [];
    for (const [address, value] of FILL) {
      await input(page, address).fill(value);
      await input(page, address).press('Tab');
      await expect(page.locator('#calc-status')).toContainText('Neu berechnet in');
      timings.push(`${address}=${value}: ${await page.locator('#calc-status').textContent()}`);
    }
    // values as computed by LibreOffice for the same entries
    await expect(cell(page, 'aufmass.F2')).toHaveText('89,74');
    await expect(cell(page, 'aufmass.F6')).toHaveText('179,19');
    await expect(cell(page, 'kosten.B4')).toHaveText('Unterspannbahn');
    await expect(cell(page, 'kosten.F7')).toHaveText('18.909,28 €');
    await expect(cell(page, 'kosten.F8')).toHaveText('-945,46 €');
    await expect(cell(page, 'kosten.F11')).toHaveText('21.556,58 €');
    await expect(cell(page, 'kennzahlen.B1')).toHaveText('4');
    await expect(cell(page, 'kennzahlen.B3')).toHaveText('64,91 %');
    await expect(cell(page, 'kennzahlen.B5')).toHaveText('30.01.2027');
    await expect(cell(page, 'kennzahlen.B6')).toHaveText('53');
    await expect(docFrame(page).locator('a[data-hp-ref-cell="kosten.F11"]')).toHaveText('21.556,58 €');
    await expect(docFrame(page).locator('a[data-hp-ref-cell="aufmass.F6"]')).toHaveText('179,19');
    // not reloaded: same window object, no navigation of the frame, viewer stayed ready
    expect(await frame.evaluate(() => (window as unknown as { hpMarker?: string }).hpMarker)).toBe('vor dem Ausfüllen');
    expect(navigations).toBe(0);
    await expect(page.locator('#viewer')).toHaveAttribute('data-state', 'ready');
    test.info().annotations.push({ type: 'Zeiten', description: timings.join(' | ') });
    console.log(`P19 E2E Ausfüllen: ${timings.join(' | ')}`);
  });

  test('HPF-CALC-005/007: 10 000 Formelzellen rechnen nach einer Eingabe neu, ohne dass der Rahmen abstürzt', async ({ page }) => {
    // Regression: one forced layout per changed cell made the frame crash with 10 000 cells.
    // The limit of 1 s is measured in p19-belege.spec.ts; here only a generous bound guards it.
    test.setTimeout(120_000);
    mkdirSync(SCRATCH, { recursive: true });
    const file = `${SCRATCH}p19-10000.hpro`;
    writeFileSync(file, (await buildLargeCalcContainer()).bytes);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFile(page, file);
    await expect(page.locator('#calc-status')).toHaveText('Rechnet: 10000 Formeln');
    const t0 = Date.now();
    await input(page, 'gross.A2').fill('5');
    await input(page, 'gross.A2').press('Tab');
    await expect(cell(page, 'gross.B10001')).toHaveText('1.015', { timeout: 30_000 });
    const ms = Date.now() - t0;
    await expect(cell(page, 'gross.B1001')).toHaveText('1.005');
    await expect(page.locator('#viewer')).toHaveAttribute('data-state', 'ready');
    expect(ms).toBeLessThan(5000);
  });

  test('Prüfregeln kennzeichnen ungültige Eingaben, ohne sie zu verhindern; Fehlerwerte sind beschrieben (HPF-STO-012, HPF-ERR-004)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCalcSample(page);
    await input(page, 'aufmass.C3').fill('0');
    await input(page, 'aufmass.C3').press('Tab');
    await expect(input(page, 'aufmass.C3')).toHaveAttribute('aria-invalid', 'true');
    await expect(cell(page, 'aufmass.C3').locator('[data-hp-reader="check"]')).toHaveText('Die Länge muss größer als 0 sein.');
    await expect(cell(page, 'aufmass.C3').locator('[data-hp-reader="check"]')).toBeVisible();
    await expect(cell(page, 'aufmass.F3')).toHaveText('0,00'); // the entry is kept and calculated
    await input(page, 'aufmass.C3').fill('12,40');
    await input(page, 'aufmass.C3').press('Tab');
    await expect(input(page, 'aufmass.C3')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(cell(page, 'aufmass.F3')).toHaveText('84,94');
    // an entry that is no number is reported, nothing is calculated
    await input(page, 'kosten.C4').fill('viel');
    await input(page, 'kosten.C4').press('Tab');
    await expect(input(page, 'kosten.C4')).toHaveAttribute('aria-invalid', 'true');
    await expect(cell(page, 'kosten.C4').locator('[data-hp-reader="entry"]')).toHaveText('Bitte eine Zahl eingeben.');
    await expect(cell(page, 'kosten.F4')).toHaveText('1.041,60 €');
    // unknown code: VLOOKUP gives #N/A, the check reports it
    await input(page, 'kosten.A5').fill('X99');
    await input(page, 'kosten.A5').press('Tab');
    await expect(cell(page, 'kosten.F5')).toContainText('#N/A');
    await expect(cell(page, 'kosten.F5').locator('.hp-sr')).toHaveText(' (Fehler: Wert nicht verfügbar)');
    await expect(cell(page, 'kosten.A5').locator('[data-hp-reader="check"]')).toHaveText('Unbekannter Code: siehe Einheitspreise.');
  });

  test('Speichern des ausgefüllten Dokuments und Datenexport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    mkdirSync(SCRATCH, { recursive: true });
    await openCalcSample(page);
    await input(page, 'aufmass.C2').fill('13,10');
    await input(page, 'aufmass.C2').press('Tab');
    await expect(cell(page, 'aufmass.F2')).toHaveText('89,74');
    await page.getByRole('button', { name: 'Tabellen' }).click();
    const dialog = page.locator('#dlg-calc');
    await expect(dialog).toContainText('hpro-calc 0.1.1 (Teil 3 v0.1), rechnet in diesem Reader');
    await expect(dialog).toContainText('ausgefüllt: 1');
    const [saved] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Ausgefülltes Dokument speichern' }).click()]);
    expect(saved.suggestedFilename()).toBe('kostenschaetzung-ausgefuellt.hpro');
    const file = `${SCRATCH}p19-ausgefuellt.hpro`;
    await saved.saveAs(file);
    const c = await readContainer(readFileSync(file));
    expect(c.integrity.ok).toBe(true);
    const m = c.manifest as unknown as { computedAt: string; calculator: { name: string }; history: Array<{ note: string }> };
    expect(m.calculator.name).toBe('hpro-calc');
    expect(m.history.at(-1)!.note).toContain('aufmass.C2');
    const x = new TextDecoder().decode(c.files.get('content/index.xhtml'));
    expect(x).toContain('data-hp-value="13.1"');
    expect(x).toContain('data-hp-formula="=ROUND([.C2]*[.D2]*[.E2];2)" data-hp-value="89.74"');
    expect((await calc.inspectCalculation(readFileSync(file))).documents[0]!.deviations).toEqual([]);
    // the frozen rendition is untouched by saving the main version (HP-PROF-009)
    const original = await readContainer(readFileSync(CALC_SAMPLE));
    expect(new TextDecoder().decode(c.files.get(`renditions/${CALC_RENDITION}/content/index.xhtml`))).toBe(new TextDecoder().decode(original.files.get(`renditions/${CALC_RENDITION}/content/index.xhtml`)));

    const [csv] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Kostenschätzung netto und brutto als CSV exportieren' }).click()]);
    expect(csv.suggestedFilename()).toBe('kostenschaetzung-kosten.csv');
    await csv.saveAs(`${SCRATCH}p19-kosten.csv`);
    const csvText = readFileSync(`${SCRATCH}p19-kosten.csv`, 'utf8');
    expect(csvText).toContain('D01,Ziegeleindeckung inkl. Lattung,179.27,m²,68.5,12280\r\n');
    const [ods] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /als OpenDocument-Tabelle exportieren/ }).click()]);
    await ods.saveAs(`${SCRATCH}p19-export.ods`);
    const entries = await readZip(readFileSync(`${SCRATCH}p19-export.ods`));
    expect(new TextDecoder().decode(entries[0]!.data)).toBe('application/vnd.oasis.opendocument.spreadsheet');
    expect(new TextDecoder().decode(entries.find((e) => e.name === 'content.xml')!.data)).toContain('table:formula="of:=ROUND([.C2]*[.D2]*[.E2];2)" office:value-type="float" office:value="89.74"');
  });

  test('Abnahme 4: eingefrorene Fassung zeigt die gespeicherten Werte ohne Rechner', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCalcSample(page);
    await showVersion(page, `Eingefrorene Fassung ${CALC_RENDITION} (Profil signed)`);
    const banner = page.locator('#version-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(`Eingefrorene Fassung ${CALC_RENDITION} (Profil signed): Werte wie berechnet am 2026-10-12T10:05:00Z mit hpro-calc 0.1.1 (Teil 3 v0.1); in dieser Fassung wird nicht gerechnet.`);
    await expect(banner).toContainText('Dateien unverändert');
    await expect(banner).toContainText('Nachrechnung: keine Abweichung');
    await expect(banner).toContainText('Signatur: rechnerisch intakt, Unterzeichner CN=hpro Beispiel (Testschlüssel)');
    await expect(banner).not.toHaveClass(/changed/);
    await expect(page.locator('#calc-status')).toHaveText('Eingefroren: gespeicherte Werte, kein Rechner');
    await expect(docFrame(page).locator('input')).toHaveCount(0);
    await expect(cell(page, 'kosten.F11')).toHaveText('21.525,40 €');
    await expect(docFrame(page).locator('[data-hp-role="signature-notice"]')).toContainText('Eingefrorene Fassung vom 2026-10-12');
    await expect(docFrame(page).locator('p.hp-check-summary').first()).toHaveText('Prüfungen bei der Berechnung: 8 von 8 erfüllt.');
    // back to the main version, which calculates again
    await banner.getByRole('button', { name: 'Hauptfassung anzeigen' }).click();
    await waitForFrame(page);
    await expect(page.locator('#calc-status')).toHaveText('Rechnet: 38 Formeln');
    await expect(page.locator('#version-banner')).toBeHidden();
  });

  test('Abnahme 4: eine Änderung an der eingefrorenen Fassung ist als verändert erkennbar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    mkdirSync(SCRATCH, { recursive: true });
    const path = `renditions/${CALC_RENDITION}/content/index.xhtml`;
    const entries = await readZip(readFileSync(CALC_SAMPLE));
    const changedText = new TextDecoder().decode(entries.find((e) => e.name === path)!.data).replace('data-hp-value="21525.4">21.525,40 €', 'data-hp-value="12525.4">12.525,40 €');
    const changed = new TextEncoder().encode(changedText);
    const write = async (alsoManifest: boolean) => {
      const manifestPath = `renditions/${CALC_RENDITION}/manifest.json`;
      const sri = await sriSha256(changed);
      return writeZip(
        entries.map((e) => {
          let data = e.data;
          if (e.name === path) data = changed;
          if (alsoManifest && e.name === manifestPath) {
            const m = JSON.parse(new TextDecoder().decode(e.data)) as { resources: Array<{ url: string; integrity: string }> };
            for (const r of m.resources) if (r.url === path) r.integrity = sri;
            data = new TextEncoder().encode(JSON.stringify(m, null, 2) + '\n');
          }
          return { name: e.name, data, compression: e.name === 'mimetype' ? 'store' : 'auto' };
        }),
        { modified: new Date('2026-10-12T12:00:00Z') },
      );
    };
    // a) only the value changed (as with a ZIP tool)
    writeFileSync(`${SCRATCH}p19-manipuliert.hpro`, await write(false));
    await openFile(page, `${SCRATCH}p19-manipuliert.hpro`);
    await showVersion(page, `Eingefrorene Fassung ${CALC_RENDITION} (Profil signed)`);
    const banner = page.locator('#version-banner');
    await expect(banner).toHaveClass(/changed/);
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner).toContainText('Achtung, diese eingefrorene Fassung wurde verändert.');
    await expect(banner).toContainText(`Dateien VERÄNDERT: ${path} (Prüfsumme weicht ab)`);
    await expect(banner).toContainText('Nachrechnung: 1 Abweichung(en) zwischen gespeichertem und nachgerechnetem Wert (kosten.F11: gespeichert 12525.4, nachgerechnet 21525.4)');
    await expect(banner).toContainText('Signatur: ungültig – Inhalt nach dem Signieren verändert (TOTAL_FAILED/HASH_FAILURE)');
    await expect(page.locator('#calc-status')).toHaveText('Eingefrorene Fassung VERÄNDERT');
    // the stored (changed) value is shown, not replaced (HPF-FRZ-003)
    await expect(cell(page, 'kosten.F11')).toHaveText('12.525,40 €');
    // b) value and rendition manifest changed consistently: recalculation and signature still notice it
    writeFileSync(`${SCRATCH}p19-manipuliert-sorgfaeltig.hpro`, await write(true));
    await openFile(page, `${SCRATCH}p19-manipuliert-sorgfaeltig.hpro`);
    await showVersion(page, `Eingefrorene Fassung ${CALC_RENDITION} (Profil signed)`);
    await expect(banner).toHaveClass(/changed/);
    await expect(banner).toContainText('Dateien unverändert');
    await expect(banner).toContainText('Nachrechnung: 1 Abweichung(en)');
    await expect(banner).toContainText('Signatur: ungültig – Inhalt nach dem Signieren verändert');
  });
});
