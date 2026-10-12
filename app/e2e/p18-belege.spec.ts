/**
 * Evidence run for docs/belege/P18 (npm run belege:p18 -w app): the reader prints the P18 test
 * document and the P15 live sample; each print document, its PDF and the reader's report are
 * written to docs/belege/P18/pdf/. scripts/p18-pdf-pruefung.py checks the PDFs independently
 * (pypdf, pdfium), veraPDF runs from scripts/belege-p18.sh. Not part of npm test, because it
 * writes into the repository.
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openFile, pdfOf, printFromReader, PRINT_SAMPLE } from './helpers.js';
import { readPdf } from './pdf.js';

const OUT = fileURLToPath(new URL('../../docs/belege/P18/pdf/', import.meta.url));
const LIVE_SAMPLE = fileURLToPath(new URL('../dist/lebendig.hpro', import.meta.url));
const LOCK_SAMPLE = fileURLToPath(new URL('../dist/sperren.hpro', import.meta.url));
mkdirSync(OUT, { recursive: true });

for (const [name, file] of [
  ['druck', PRINT_SAMPLE],
  ['lebendig', LIVE_SAMPLE],
  ['sperren', LOCK_SAMPLE],
] as const) {
  test(`Belege P18: Ausdruck ${name}.hpro`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFile(page, file);
    const { report, html } = await printFromReader(page);
    await expect(page.locator('#live-status')).toContainText('Druckfassung:');
    const pdf = await pdfOf(page, html);
    const info = readPdf(pdf);
    writeFileSync(`${OUT}${name}.pdf`, pdf);
    writeFileSync(`${OUT}${name}-druckfassung.html`, html);
    writeFileSync(`${OUT}${name}-bericht.json`, `${JSON.stringify({ quelle: `app/dist/${name}.hpro`, reader: report, pdf: info, status: await page.locator('#live-status').textContent() }, null, 2)}\n`);
  });
}

/**
 * Negative control for scripts/p18-pdf-pruefung.py: the same print document without the reader's
 * print profile (style[data-hp-reader="print"]) and without the code marks, printed by Chromium
 * on A4 without margins — what a plain browser print of the content gives. The check must fail
 * here (no header and footer, code cut off, content at the paper edge), else it proves nothing.
 */
test('Belege P18: Gegenprobe ohne Druckprofil', async ({ page }) => {
  await openFile(page, PRINT_SAMPLE);
  const { report, html } = await printFromReader(page);
  const sheet = await page.context().newPage();
  await sheet.setContent(html, { waitUntil: 'load' });
  const plain = await sheet.evaluate(() => {
    document.querySelector('style[data-hp-reader="print"]')?.remove();
    for (const mark of Array.from(document.querySelectorAll('.hp-umbruch'))) {
      const nl = mark.nextSibling;
      if (nl && nl.nodeType === Node.TEXT_NODE && nl.textContent === '\n') nl.remove();
      mark.remove();
    }
    for (const el of Array.from(document.querySelectorAll('.hp-fortsetzung'))) el.remove();
    return `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
  });
  await sheet.setContent(plain, { waitUntil: 'load' });
  await sheet.emulateMedia({ media: 'print' });
  const pdf = await sheet.pdf({ format: 'A4', printBackground: true });
  await sheet.close();
  writeFileSync(`${OUT}kontrolle.pdf`, pdf);
  writeFileSync(`${OUT}kontrolle-druckfassung.html`, plain);
  writeFileSync(`${OUT}kontrolle-bericht.json`, `${JSON.stringify({ quelle: 'app/dist/druck.hpro ohne Druckprofil (Gegenprobe)', reader: report, pdf: readPdf(pdf) }, null, 2)}\n`);
});
