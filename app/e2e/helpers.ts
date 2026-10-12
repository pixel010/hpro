import { expect, type FrameLocator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/** The sample container as emitted by the build (vite.config.ts, plugin hpro-sample). */
export const SAMPLE = fileURLToPath(new URL('../dist/beispiel.hpro', import.meta.url));

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
