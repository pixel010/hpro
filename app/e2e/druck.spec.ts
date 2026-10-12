/**
 * Print path (P18, Zusage 6; HPL-PRINT-001 … 005): the reader derives the A4 print from the
 * flowing view. Checks the print document and the PDF Chromium makes of it: page size, table of
 * contents with page numbers that match the PDF's named destinations, nothing outside the type
 * area, marked code breaks, live content as still image with its address, no-print respected.
 * Text extraction and pixel checks of the PDF are in scripts/p18-pdf-pruefung.py (evidence run).
 */
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { openFile, pdfOf, printFromReader, PRINT_SAMPLE } from './helpers.js';
import { readPdf } from './pdf.js';

const LIVE_SAMPLE = fileURLToPath(new URL('../dist/lebendig.hpro', import.meta.url));
const A4 = { width: (210 / 25.4) * 72, height: (297 / 25.4) * 72 };
const MM_PT = 72 / 25.4;

async function printSheet(page: Page, html: string) {
  const sheet = await page.context().newPage();
  await sheet.setContent(html, { waitUntil: 'load' });
  await sheet.emulateMedia({ media: 'print' });
  return sheet;
}

test('Druck: Prüfdokument auf A4, Verzeichnis und Verweise mit den Seiten des PDF', async ({ page }) => {
  await openFile(page, PRINT_SAMPLE);
  const { report, html } = await printFromReader(page);
  await expect(page.locator('#live-status')).toHaveText(`Druckfassung: ${report.pages} Seiten A4, mit Verzeichnis, 3 lebendige Elemente als Standbild`);

  // Reader side: nothing outside the type area, code breaks marked, layout stable after numbering.
  expect(report.overflow).toEqual([]);
  expect(report.unmarkedWraps).toBe(0);
  expect(report.markedWraps).toBeGreaterThanOrEqual(2);
  expect(report.headingsAtPageEnd).toEqual([]);
  expect(report.stable).toBe(true);
  expect(report.toc).toBe(true);
  expect(report.pages).toBeGreaterThan(5);
  expect(report.omitted).toEqual(['content/index.xhtml#preise-intern']);
  expect(report.live.map((l) => `${l.kind} ${l.address} ${l.still}`).sort()).toEqual([
    'animation content/index.xhtml#ablauf-abbildung true',
    'component content/index.xhtml#aufwand-diagramm true',
    'video content/index.xhtml#zeitraffer-video true',
  ]);
  for (const h of report.headings) expect(h.kennung, h.text).not.toBeNull();

  // The PDF: A4 on every page, page count and every page number as predicted (named destinations).
  const pdf = readPdf(await pdfOf(page, html));
  expect(pdf.pages.length).toBe(report.pages);
  for (const p of pdf.pages) {
    expect(Math.abs(p.width - A4.width)).toBeLessThan(MM_PT);
    expect(Math.abs(p.height - A4.height)).toBeLessThan(MM_PT);
  }
  expect(pdf.tagged).toBe(true);
  expect(pdf.outline).toBe(true);
  expect(pdf.lang).toBe('de-AT');
  expect(pdf.title).toBe('Dachsanierung Haus Nr. 12 – Feuchtemessung und Bauablauf');
  expect(Object.keys(report.targets).length).toBeGreaterThanOrEqual(12);
  for (const [id, predicted] of Object.entries(report.targets)) expect(pdf.dests[id], `Seite von #${id}`).toBe(predicted);

  // The print document as printed.
  const sheet = await printSheet(page, html);
  try {
    const toc = await sheet.locator('.hp-print-toc li > a').evaluateAll((links) =>
      links.map((a) => ({ target: a.getAttribute('href')!.slice(1), kennung: a.querySelector('.hp-kennung')!.textContent, page: a.querySelector('.hp-seitenzahl')!.textContent })),
    );
    expect(toc.length).toBe(13);
    for (const e of toc) {
      expect(e.kennung).toBe(`#${e.target}`);
      expect(Number(e.page), e.target).toBe(pdf.dests[e.target]);
    }
    await expect(sheet.locator('.hp-print-toc li > span')).toHaveText(/Interne Preiskalkulation.*#preise-intern.*nicht im Ausdruck \(Sperre\)/);
    // Title block: id and dateModified on page 1 (HP-PRINT-003).
    await expect(sheet.locator('.hp-print-titel')).toContainText('urn:uuid:8d41f0b2-5c7e-4e2a-9f13-2b6a0c18d4e7');
    await expect(sheet.locator('.hp-print-titel')).toContainText('2026-10-12T15:00:00Z');
    // Headings carry their address as generated text (HP-PRINT-004).
    await expect(sheet.locator('#messprotokoll > h2')).toHaveAttribute('data-hp-kennung', 'messprotokoll');
    await expect(sheet.locator('#plan-tabelle > h3')).toHaveAttribute('data-hp-kennung', 'plan-tabelle');
    expect(await sheet.locator('#messprotokoll > h2').evaluate((h) => getComputedStyle(h, '::after').content)).toContain('#');
    // Table head repeats, foot does not (HP-PRINT-006).
    expect(await sheet.locator('#messwerte thead').evaluate((t) => getComputedStyle(t).display)).toBe('table-header-group');
    expect(await sheet.locator('#messwerte tbody tr').count()).toBe(200);
    // Code: marks, and the 300-character line complete without the marks (HP-PRINT-007).
    const code = await sheet.locator('#csv-beispiel').evaluate((pre) => {
      const clone = pre.cloneNode(true) as HTMLElement;
      const marks = clone.querySelectorAll('.hp-umbruch').length;
      for (const el of Array.from(clone.querySelectorAll('.hp-umbruch, .hp-fortsetzung'))) el.remove();
      return { marks, firstLine: (clone.textContent ?? '').replace(/\n/g, '').slice(0, 300), ws: getComputedStyle(pre).whiteSpace };
    });
    expect(code.marks).toBe(report.markedWraps);
    expect(code.firstLine).toHaveLength(300);
    expect(code.firstLine.startsWith('messpunkt;achse;feld;')).toBe(true);
    expect(code.ws).toBe('pre-wrap');
    // Live content: still image, caption, address; no video, no script (HP-PRINT-009).
    expect(await sheet.locator('video, audio, script, hp-chart').count()).toBe(0);
    const video = sheet.locator('#zeitraffer-abbildung');
    await expect(video.locator('img.hp-print-still-img')).toHaveCount(1);
    expect(await video.locator('img.hp-print-still-img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(video.locator('figcaption')).toContainText('Zeitraffer, 8 Sekunden');
    await expect(video.locator('figcaption')).toContainText('Lebendige Fassung: content/index.xhtml#zeitraffer-video');
    await expect(sheet.locator('#ablauf-abbildung figcaption')).toContainText('Lebendige Fassung: content/index.xhtml#ablauf-abbildung');
    expect(await sheet.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await sheet.locator('#ablauf-abbildung .s3').evaluate((g) => getComputedStyle(g).opacity)).toBe('1');
    await expect(sheet.locator('#aufwand-diagramm')).toContainText('Lebendige Fassung: content/index.xhtml#aufwand-diagramm');
    // details open, priority 3 shown, no-print gone with notice (HP-PRINT-010, HPL-PRINT-005).
    expect(await sheet.locator('#verfahren').evaluate((d: HTMLDetailsElement) => d.open)).toBe(true);
    await expect(sheet.locator('#verfahren-text')).toBeVisible();
    await expect(sheet.locator('#randnotiz')).toBeVisible();
    await expect(sheet.locator('#preise-intern')).toHaveCount(0);
    await expect(sheet.getByText('Einheitspreise des Auftragnehmers')).toHaveCount(0);
    await expect(sheet.getByText('Abschnitt preise-intern nicht zum Druck freigegeben')).toBeVisible();
    // Links: internal with page and address, external with URL (HP-PRINT-011).
    await expect(sheet.locator('#einleitung .hp-verweis').first()).toHaveText(` (S. ${pdf.dests['messprotokoll']}, #messprotokoll)`.trim());
    const after = await sheet.locator('#einleitung a[href^="https:"]').evaluate((a) => getComputedStyle(a, '::after').content);
    expect(after).toMatch(/\(|https:\/\/www\.w3\.org\/TR\/css-page-3\//);
    // No network source in the print document.
    expect(await sheet.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("default-src 'none'");
  } finally {
    await sheet.close();
  }
});

test('Druck: lebendiges Beispiel (P15) – Video, Animation, Ton und Komponente mit Adresse', async ({ page }) => {
  await openFile(page, LIVE_SAMPLE);
  const { report, html } = await printFromReader(page);
  expect(report.overflow).toEqual([]);
  expect(report.live.map((l) => `${l.kind} ${l.address}`).sort()).toEqual([
    'animation content/index.xhtml#ablauf-abbildung',
    'audio content/index.xhtml#signal-ton',
    'component content/index.xhtml#aufwand-diagramm',
    'video content/index.xhtml#zeitraffer-video',
  ]);
  const pdf = readPdf(await pdfOf(page, html));
  expect(pdf.pages.length).toBe(report.pages);
  for (const [id, predicted] of Object.entries(report.targets)) expect(pdf.dests[id], `Seite von #${id}`).toBe(predicted);
});

for (const name of ['beispiel', 'kostenschaetzung', 'sperren']) {
  test(`Druck: ${name}.hpro – Seitenzahlen der Vorhersage = Seiten im PDF, nichts außerhalb des Satzspiegels`, async ({ page }) => {
    await openFile(page, fileURLToPath(new URL(`../dist/${name}.hpro`, import.meta.url)));
    const { report, html } = await printFromReader(page);
    expect(report.overflow).toEqual([]);
    expect(report.unmarkedWraps).toBe(0);
    const pdf = readPdf(await pdfOf(page, html));
    expect(pdf.pages.length).toBe(report.pages);
    expect(Object.keys(report.targets).length).toBeGreaterThan(0);
    for (const [id, predicted] of Object.entries(report.targets)) expect(pdf.dests[id], `Seite von #${id}`).toBe(predicted);
  });
}

test('Druck: Strg+P im Dokument erzeugt die Druckfassung statt das Readerfenster zu drucken', async ({ page }) => {
  await openFile(page, LIVE_SAMPLE);
  await page.frameLocator('#doc-host').frameLocator('#doc-frame').locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+p');
  await expect(page.locator('#print-frame[data-state="ready"]')).toHaveCount(1);
  await expect(page.locator('#print-frame')).toHaveAttribute('sandbox', 'allow-same-origin allow-modals');
});
