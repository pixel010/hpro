import { expect, type Frame, type FrameLocator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createContainer } from '../../kern/src/index.ts';

/** The sample container as emitted by the build (vite.config.ts, plugin hpro-sample). */
export const SAMPLE = fileURLToPath(new URL('../dist/beispiel.hpro', import.meta.url));
/** The calculating sample of P19 with its signed frozen rendition (scripts/sample.ts). */
export const CALC_SAMPLE = fileURLToPath(new URL('../dist/kostenschaetzung.hpro', import.meta.url));
export const CALC_RENDITION = 'nachweis-2026-10-12';

export const WIDTHS = {
  telefon: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
} as const;

/** The sandboxed document frame inside the frame host (frame.html, P15). */
export function docFrame(page: Page): FrameLocator {
  return page.frameLocator('#doc-host').frameLocator('#doc-frame');
}

/** The document frame as a Playwright `Frame` (for `evaluate`). */
export function innerFrame(page: Page): Frame {
  const frame = page.frames().find((f) => f.parentFrame() !== null && f.parentFrame() !== page.mainFrame() && f.parentFrame()?.parentFrame() === page.mainFrame());
  if (!frame) throw new Error('document frame missing');
  return frame;
}

export async function waitForFrame(page: Page): Promise<void> {
  await expect(page.locator('#viewer')).toHaveAttribute('data-state', 'ready');
}

/** Opens the sample through the file input, like a user picking the file. */
export async function openSample(page: Page): Promise<void> {
  await page.goto('./');
  await page.locator('#file-input').setInputFiles(SAMPLE);
  await waitForFrame(page);
  await expect(page.locator('#doc-title')).toHaveText('Sanierung Schulhaus Mühlau – Projektbericht');
}

/** Opens a container file through the file input. */
export async function openFile(page: Page, file: string): Promise<void> {
  await page.goto('./');
  await page.locator('#file-input').setInputFiles(file);
  await waitForFrame(page);
}

/** Opens the calculating sample (P19). */
export async function openCalcSample(page: Page): Promise<void> {
  await openFile(page, CALC_SAMPLE);
  await expect(page.locator('#doc-title')).toHaveText('Aufmaß und Kostenschätzung Dachsanierung Haus Nr. 12');
  await expect(page.locator('#calc-status')).toHaveText('Rechnet: 38 Formeln');
}

/** Switches to a version through the dialog "Tabellen". */
export async function showVersion(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Tabellen' }).click();
  await page.getByLabel('Fassung', { exact: true }).selectOption({ label });
  await waitForFrame(page);
}

/** Horizontal overflow of the document frame's scrolling element (HP-RS-010). */
export async function frameOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return innerFrame(page).evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
}

/** Horizontal overflow of the reader shell itself. */
export async function shellOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
}

/**
 * A container with 10 000 formula cells (HPF-CALC-005/007): input A2; B2 = A2 + 1; B3…B1001 a
 * chain of 1000 steps; B1002…B10001 depend on A2 and on the end of the chain. Stored values are
 * those for A2 = 1 (B1001 = 1001, B10001 = 1003).
 */
export async function buildLargeCalcContainer(): Promise<{ bytes: Uint8Array; xhtml: string }> {
  const rows: string[] = ['<tr><th>Eingabe</th><th>Formel</th></tr>'];
  rows.push('<tr><td data-hp-type="float" data-hp-value="1" data-hp-input="true">1</td><td data-hp-type="float" data-hp-formula="=[.A2]+1" data-hp-value="2">2</td></tr>');
  for (let r = 3; r <= 10001; r++) {
    const [f, v] = r <= 1001 ? [`=[.B${r - 1}]+1`, r] : [`=[.A2]*2+[.B1001]`, 1003];
    rows.push(`<tr><td>${r}</td><td data-hp-type="float" data-hp-formula="${f}" data-hp-value="${v}">${v}</td></tr>`);
  }
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT"><head><meta charset="UTF-8"/><title>10 000 Formelzellen</title></head><body><main id="inhalt"><h1 id="titel">10 000 Formelzellen</h1><table id="gross"><caption>Kette über 1000 Stufen und 9000 abhängige Zellen</caption><tbody>${rows.join('')}</tbody></table></main></body></html>\n`;
  const created = await createContainer({
    id: 'urn:uuid:3d0f4c1e-6b7a-4e59-8f20-1c9a7d5e2b10',
    title: '10 000 Formelzellen',
    language: 'de-AT',
    modified: '2026-10-12T09:00:00Z',
    profile: 'static',
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: '10 000 Formelzellen', href: 'content/index.xhtml#titel' }] },
    resources: [{ path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: new TextEncoder().encode(xhtml) }],
  });
  return { bytes: created.bytes, xhtml };
}

/** The print test document of P18 (scripts/sample.ts, docs/spezifikation/beispiele/p18-druck/). */
export const PRINT_SAMPLE = fileURLToPath(new URL('../dist/druck.hpro', import.meta.url));

/** Report of the reader's print (paginate.ts) plus what print.ts recorded. */
export interface PrintReport {
  readonly pages: number;
  readonly toc: boolean;
  readonly targets: Record<string, number>;
  readonly headingsAtPageEnd: string[];
  readonly overflow: string[];
  readonly codeBlocks: number;
  readonly markedWraps: number;
  readonly unmarkedWraps: number;
  readonly wideTables: string[];
  readonly passes: number;
  readonly stable: boolean;
  readonly live: Array<{ kind: string; address: string; still: boolean }>;
  readonly omitted: string[];
  readonly headings: Array<{ level: number; text: string; kennung: string | null }>;
  readonly tocEntries: number;
}

/**
 * Presses "Drucken" and returns the report and the print document exactly as laid out for
 * printing (page numbers and code marks filled in). `window.print()` of the frame returns at once
 * in headless Chromium.
 */
export async function printFromReader(page: Page): Promise<{ report: PrintReport; html: string }> {
  await page.locator('#btn-print').click();
  const frame = page.locator('#print-frame[data-state="ready"]');
  await expect(frame).toHaveCount(1, { timeout: 30_000 });
  const report = JSON.parse((await frame.getAttribute('data-report')) ?? '{}') as PrintReport;
  const html = await page.evaluate(() => {
    const f = document.getElementById('print-frame') as HTMLIFrameElement;
    return `<!DOCTYPE html>\n${f.contentDocument!.documentElement.outerHTML}`;
  });
  return { report, html };
}

/** The PDF Chromium prints from that document (same engine and print path as "Als PDF speichern"). */
export async function pdfOf(page: Page, html: string): Promise<Buffer> {
  const sheet = await page.context().newPage();
  try {
    await sheet.setContent(html, { waitUntil: 'load' });
    await sheet.emulateMedia({ media: 'print' });
    return await sheet.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  } finally {
    await sheet.close();
  }
}
