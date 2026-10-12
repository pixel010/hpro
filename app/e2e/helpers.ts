import { expect, type FrameLocator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

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

export function docFrame(page: Page): FrameLocator {
  return page.frameLocator('#doc-frame');
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
  await page.getByLabel('Fassung').selectOption({ label });
  await waitForFrame(page);
}

/** Horizontal overflow of the document frame's scrolling element (HP-RS-010). */
export async function frameOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  const frame = page.frames().find((f) => f !== page.mainFrame() && f.parentFrame() === page.mainFrame());
  if (!frame) throw new Error('document frame missing');
  return frame.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
}

/** Horizontal overflow of the reader shell itself. */
export async function shellOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
}
