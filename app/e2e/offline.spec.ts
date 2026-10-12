/**
 * PWA (P4, acceptance 3): manifest and service worker are present, and after the first visit
 * the reader starts and works with the network switched off (HP-RS-001).
 */
import { expect, test } from '@playwright/test';
import { SAMPLE, docFrame, waitForFrame } from './helpers.js';

test.describe('PWA and offline start', () => {
  test('serves a valid, installable web app manifest', async ({ page, context }) => {
    await page.goto('./');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('./manifest.webmanifest');
    const manifest = await (await page.request.get('./manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ name: 'html-Pro Reader', start_url: './', scope: './', display: 'standalone', lang: 'de' });
    for (const icon of manifest.icons as { src: string }[]) expect((await page.request.get(`./${icon.src}`)).status(), icon.src).toBe(200);

    // Chromium's own view of the manifest and of installability.
    const cdp = await context.newCDPSession(page);
    await expect(page.locator('html')).toHaveAttribute('data-offline', 'ready');
    const parsed = await cdp.send('Page.getAppManifest', {});
    expect(parsed.errors).toEqual([]);
    const installability = await cdp.send('Page.getInstallabilityErrors');
    expect(installability.installabilityErrors).toEqual([]);
  });

  test('starts and opens documents without a network after the first visit', async ({ page, context }) => {
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-offline', 'ready');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await expect(page.locator('#offline-status')).toHaveText('Offline bereit: Der Reader startet auch ohne Netzverbindung.');

    const cached = await page.evaluate(async () => {
      const name = (await caches.keys()).find((k) => k.startsWith('hpro-reader-'));
      if (!name) return [];
      return (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname).sort();
    });
    for (const path of ['/', '/index.html', '/manifest.webmanifest', '/beispiel.hpro', '/icons/icon.svg']) expect(cached).toContain(path);
    expect(cached.some((p) => /^\/assets\/index-.*\.js$/.test(p))).toBe(true);
    expect(cached.some((p) => /^\/assets\/index-.*\.css$/.test(p))).toBe(true);

    await context.setOffline(true);
    const failed: string[] = [];
    page.on('requestfailed', (r) => failed.push(r.url()));

    // The network is really gone: an uncached URL fails.
    const probe = await page.evaluate(() => fetch('./nicht-im-cache.txt').then(() => 'geladen', () => 'fehlgeschlagen'));
    expect(probe).toBe('fehlgeschlagen');
    failed.length = 0;

    // Offline start: reload and a fresh tab both come from the service worker.
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole('heading', { level: 1, name: 'html-Pro Reader' })).toBeVisible();
    const fresh = await context.newPage();
    const freshResponse = await fresh.goto('./');
    expect(freshResponse?.fromServiceWorker()).toBe(true);
    await expect(fresh.getByRole('button', { name: 'Beispiel öffnen' })).toBeVisible();
    await fresh.close();

    // Open, search, switch view — all offline.
    await page.getByRole('button', { name: 'Beispiel öffnen' }).click();
    await waitForFrame(page);
    await expect(docFrame(page).locator('h1')).toHaveText('Sanierung Schulhaus Mühlau – Projektbericht');
    await page.getByRole('button', { name: 'Suche' }).click();
    await page.getByLabel('Suchbegriff').fill('Photovoltaik');
    await page.getByLabel('Suchbegriff').press('Enter');
    await expect(page.locator('#search-status')).toContainText('Treffer für „Photovoltaik“');
    await page.getByRole('button', { name: 'Seiten' }).click();
    await expect(docFrame(page).locator('[data-hp-reader="page"]').first()).toBeVisible();

    // A local file opens offline too.
    await page.locator('#file-input').setInputFiles(SAMPLE);
    await waitForFrame(page);
    await expect(page.getByRole('button', { name: 'Fließend' })).toHaveAttribute('aria-pressed', 'true');

    expect(failed).toEqual([]);
    await context.setOffline(false);
  });
});
