/**
 * Smoke test of the reader (P4, acceptance 1): open a container, table of contents, search,
 * switching between flowing and page view, plus zoom, keyboard, addresses, links, reflow and
 * the frame sandbox.
 */
import { expect, test } from '@playwright/test';
import { docFrame, frameOverflow, innerFrame, openSample, shellOverflow, waitForFrame } from './helpers.js';

test.describe('Reader', () => {
  test('opens a container and shows its table of contents', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    const toc = page.locator('#toc-panel');
    await expect(toc).toBeVisible();
    const links = toc.locator('a');
    await expect(links).toHaveCount(12);
    await expect(links.first()).toHaveText('Projektbericht');
    await expect(docFrame(page).locator('h1')).toHaveText('Sanierung Schulhaus Mühlau – Projektbericht');

    // Entry in the same content document.
    await toc.getByRole('link', { name: 'Kostenschätzung' }).click();
    await expect(docFrame(page).locator('#kosten-titel')).toBeInViewport();
    await expect(toc.getByRole('link', { name: 'Kostenschätzung' })).toHaveAttribute('aria-current', 'location');

    // Entry in the second content document.
    await toc.getByRole('link', { name: 'Raumliste' }).click();
    await waitForFrame(page);
    await expect(docFrame(page).locator('#raumliste-titel')).toBeInViewport();
    await expect(page.locator('#pos-section')).toHaveText('Raumliste');
    await expect(toc.getByRole('link', { name: 'Raumliste' })).toHaveAttribute('aria-current', 'location');
  });

  test('searches the text, including collapsed details, and jumps to hits', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    await page.getByRole('button', { name: 'Suche' }).click();
    const input = page.getByLabel('Suchbegriff');
    await expect(input).toBeFocused();

    // Only inside a collapsed <details> (HP-RS-003).
    await input.fill('wärmerückgewinnungsgrad');
    await input.press('Enter');
    await expect(page.locator('#search-status')).toHaveText('1 Treffer für „wärmerückgewinnungsgrad“ in 1 Dokumentteil.');
    const hit = page.locator('#search-results .hit').first();
    await expect(hit).toContainText('content/bericht.xhtml#p-det-1');
    await waitForFrame(page);
    await hit.click();
    const mark = docFrame(page).locator('mark[data-hp-hit="0"]');
    await expect(mark).toHaveClass(/hp-hit-current/);
    await expect(mark).toBeInViewport();
    await expect(docFrame(page).locator('#det-lueftung')).toHaveAttribute('open', '');

    // Case and diacritics folded; hits in both content documents; stepping across documents.
    await input.fill('raumliste');
    await input.press('Enter');
    await expect(page.locator('#search-status')).toContainText('in 2 Dokumentteilen');
    const count = await page.locator('#search-results .hit').count();
    expect(count).toBeGreaterThanOrEqual(3);
    await page.getByRole('button', { name: 'Nächster', exact: true }).click();
    await expect(page.locator('#search-results .hit').first()).toHaveAttribute('aria-current', 'true');
    for (let i = 1; i < count; i++) await page.getByRole('button', { name: 'Nächster', exact: true }).click();
    await expect(page.locator('#search-results .hit').nth(count - 1)).toHaveAttribute('aria-current', 'true');
    await waitForFrame(page);
    await expect(docFrame(page).locator('h1')).toHaveText('Anhang');
    await expect(docFrame(page).locator('mark.hp-hit-current').first()).toBeInViewport();

    const none = 'gibtesnichtimdokument';
    await input.fill(none);
    await input.press('Enter');
    await expect(page.locator('#search-status')).toHaveText(`Keine Treffer für „${none}“.`);
  });

  test('shows a tapped hit on a phone by closing the search overlay', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSample(page);
    await page.getByRole('button', { name: 'Suche' }).click();
    await expect(page.locator('#search-panel')).toBeVisible();
    await page.getByLabel('Suchbegriff').fill('Schimmel');
    await page.getByLabel('Suchbegriff').press('Enter');
    await waitForFrame(page);
    await page.locator('#search-results .hit').nth(1).click();
    await expect(page.locator('#search-panel')).toBeHidden();
    await expect(docFrame(page).locator('mark.hp-hit-current').first()).toBeInViewport();
  });

  test('switches between flowing and fixed page view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    const flow = page.getByRole('button', { name: 'Fließend' });
    const pages = page.getByRole('button', { name: 'Seiten' });
    await expect(flow).toHaveAttribute('aria-pressed', 'true');
    await expect(docFrame(page).locator('[data-hp-reader="page"]')).toHaveCount(0);

    await pages.click();
    await expect(pages).toHaveAttribute('aria-pressed', 'true');
    await expect(flow).toHaveAttribute('aria-pressed', 'false');
    await expect(docFrame(page).locator('html')).toHaveClass(/hp-page/);
    const pageBoxes = docFrame(page).locator('[data-hp-reader="page"]');
    await expect.poll(() => pageBoxes.count()).toBeGreaterThanOrEqual(2);
    const n = await pageBoxes.count();
    await expect(page.locator('#pos-page')).toHaveText(new RegExp(`Seite \\d+ von ${n}`));
    await expect(pageBoxes.last().locator('.hp-page-foot')).toHaveText(`Seite ${n} von ${n}`);
    await expect(pageBoxes.first().locator('.hp-page-head')).toHaveText('Sanierung Schulhaus Mühlau – Projektbericht');
    // A4 at 96 dpi: 210 mm = 793.7 px wide, 297 mm = 1122.5 px high (before zoom).
    const size = await pageBoxes.first().evaluate((el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }));
    expect(Math.abs(size.w - 793.7)).toBeLessThan(1.5);
    expect(Math.abs(size.h - 1122.5)).toBeLessThan(1.5);
    // No block starts in a page's bottom margin or in the gap between pages.
    const misplaced = await innerFrame(page).evaluate(() => {
      const mm = 96 / 25.4;
      const stride = 297 * mm + 8 * mm;
      const contentHeight = 267 * mm;
      const origin = document.body.getBoundingClientRect().top + 15 * mm;
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll('body p, body h1, body h2, body h3, body li, body tr, body figure, body pre, body details'))) {
        if (el.closest('[data-hp-reader]')) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        const zoom = parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1;
        const top = (r.top - origin) / zoom;
        const offset = top - Math.floor(top / stride) * stride;
        // 1 px tolerance at both ends: WebKit puts a block that starts a page up to 0.5 px above
        // the page top (sub-pixel rounding, P13 / docs/16 U4).
        if (offset > contentHeight + 1 && offset < stride - 1) bad.push(`${el.localName}#${el.id} @${Math.round(offset)}`);
      }
      return bad;
    });
    expect(misplaced).toEqual([]);

    // Navigation also works in the page view.
    await page.locator('#toc-panel').getByRole('link', { name: 'Technische Details' }).click();
    await expect(docFrame(page).locator('#technik-titel')).toBeInViewport();

    await flow.click();
    await expect(flow).toHaveAttribute('aria-pressed', 'true');
    await expect(docFrame(page).locator('[data-hp-reader="page"]')).toHaveCount(0);
    await expect(docFrame(page).locator('html')).not.toHaveClass(/hp-page/);
    await expect(docFrame(page).locator('#technik-titel')).toBeInViewport();
    await expect(docFrame(page).locator('[data-hp-break]')).toHaveCount(0);
  });

  test('makes the same page breaks regardless of width and scroll position', async ({ page }) => {
    const breaks = async () => {
      await expect(docFrame(page).locator('[data-hp-reader="page"]').first()).toBeAttached();
      return innerFrame(page).evaluate(() => ({
        pages: document.querySelectorAll('[data-hp-reader="page"]').length,
        breaks: Array.from(document.querySelectorAll('[data-hp-break]')).map((el) => el.id),
      }));
    };
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    await page.getByRole('button', { name: 'Seiten' }).click();
    const reference = await breaks();
    expect(reference.pages).toBeGreaterThanOrEqual(2);

    // Scrolled down before switching (scroll anchoring must not shift the breaks).
    await page.getByRole('button', { name: 'Fließend' }).click();
    await page.locator('#toc-panel').getByRole('link', { name: 'Kostenschätzung' }).click();
    await expect(docFrame(page).locator('#kosten-titel')).toBeInViewport();
    await page.getByRole('button', { name: 'Seiten' }).click();
    expect(await breaks()).toEqual(reference);
    // The reading position survives the switch.
    await expect(docFrame(page).locator('#kosten-titel')).toBeInViewport();

    // Narrow window: the page is scaled to fit, its breaks stay.
    await page.setViewportSize({ width: 390, height: 844 });
    await openSample(page);
    await page.getByRole('button', { name: 'Seiten' }).click();
    expect(await breaks()).toEqual(reference);
    const zoom = await innerFrame(page).evaluate(() => parseFloat(getComputedStyle(document.documentElement).zoom));
    expect(zoom).toBeLessThan(0.5);
    const overflow = await frameOverflow(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test('zooms text in the flowing view without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSample(page);
    const paragraph = docFrame(page).locator('#p-einleitung');
    const before = await paragraph.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await page.getByRole('button', { name: 'Vergrößern' }).click();
    await page.getByRole('button', { name: 'Vergrößern' }).click();
    await expect(page.locator('#btn-zoom-reset')).toHaveText('125 %');
    await expect.poll(() => paragraph.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(before * 1.25, 1);
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Vergrößern' }).click();
    await expect(page.locator('#btn-zoom-reset')).toHaveText('300 %');
    await expect.poll(() => paragraph.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(before * 3, 1);
    const overflow = await frameOverflow(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    await page.locator('#btn-zoom-reset').click();
    await expect(page.locator('#btn-zoom-reset')).toHaveText('100 %');
  });

  test('is operable with the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    await page.locator('body').press('/');
    await expect(page.getByLabel('Suchbegriff')).toBeFocused();
    await page.keyboard.type('Lärche');
    await page.keyboard.press('Enter');
    await expect(page.locator('#search-status')).toContainText('1 Treffer');
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-panel')).toBeHidden();
    await expect(page.locator('#btn-search')).toBeFocused();

    await page.keyboard.press('n');
    await expect(docFrame(page).locator('mark.hp-hit-current')).toBeInViewport();
    await page.keyboard.press('v');
    await expect(page.getByRole('button', { name: 'Seiten' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('+');
    await expect(page.locator('#btn-zoom-reset')).toHaveText('110 %');
    await page.keyboard.press('0');
    await page.keyboard.press('v');
    await expect(page.getByRole('button', { name: 'Fließend' })).toHaveAttribute('aria-pressed', 'true');

    // Keys pressed inside the document frame reach the reader as well.
    await docFrame(page).locator('body').press('v');
    await expect(page.getByRole('button', { name: 'Seiten' })).toHaveAttribute('aria-pressed', 'true');
    await docFrame(page).locator('body').press('v');
    await page.keyboard.press(']');
    await waitForFrame(page);
    await expect(docFrame(page).locator('h1')).toHaveText('Anhang');

    // Tab reaches the table of contents and Enter follows an entry.
    const entry = page.locator('#toc-panel').getByRole('link', { name: 'Zeitplan' });
    await entry.focus();
    await page.keyboard.press('Enter');
    await waitForFrame(page);
    await expect(docFrame(page).locator('#zeitplan-titel')).toBeInViewport();

    // Single-key shortcuts can be switched off (WCAG 2.1.4).
    await page.getByRole('button', { name: 'Darstellung' }).click();
    await page.getByLabel(/Tastenkürzel mit einzelnen Zeichen/).uncheck();
    await page.keyboard.press('Escape');
    await page.locator('body').press('v');
    await expect(page.getByRole('button', { name: 'Fließend' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('offers both address forms and resolves typed addresses', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    await page.locator('#toc-panel').getByRole('link', { name: 'Befunde' }).click();
    await expect(page.locator('#pos-section')).toHaveText('Befunde');
    await page.getByRole('button', { name: 'Adresse' }).click();
    await expect(page.getByLabel('Kurzform')).toHaveValue('content/bericht.xhtml#befunde');
    await expect(page.getByLabel('Langform (zitierfähig)')).toHaveValue('urn:uuid:7d6f3c1e-4b52-4c1a-9f0e-5a8d2b9c4e11!/content/bericht.xhtml#befunde');
    await page.getByLabel('Zu Adresse springen').fill('urn:uuid:7d6f3c1e-4b52-4c1a-9f0e-5a8d2b9c4e11!/content/anhang.xhtml#quellen');
    await page.getByRole('button', { name: 'Springen' }).click();
    await expect(page.locator('#dlg-address')).toBeHidden();
    await waitForFrame(page);
    await expect(docFrame(page).locator('#quellen-titel')).toBeInViewport();
  });

  test('follows internal links and asks before external ones', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    await docFrame(page).locator('#p-bef-2 a').click();
    await waitForFrame(page);
    await expect(docFrame(page).locator('#raumliste-titel')).toBeInViewport();

    const popups: string[] = [];
    page.on('popup', (p) => popups.push(p.url()));
    await docFrame(page).getByRole('link', { name: 'WCAG 2.2 beim W3C' }).click();
    const dialog = page.getByRole('dialog', { name: 'Externer Verweis' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#link-url')).toHaveText('https://www.w3.org/TR/WCAG22/');
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dialog).toBeHidden();
    expect(popups).toEqual([]);
    expect(innerFrame(page).url()).toBe('about:srcdoc');
  });

  test('keeps the document in a sandbox without network access', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:4317/') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url());
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    await expect(page.frameLocator('#doc-host').locator('#doc-frame')).toHaveAttribute('sandbox', 'allow-scripts');
    const frame = innerFrame(page);
    const probe = await frame.evaluate(async () => {
      const result: Record<string, string> = { origin: String(window.origin) };
      try {
        await fetch('https://example.org/');
        result['fetch'] = 'erlaubt';
      } catch (e) {
        result['fetch'] = `blockiert (${(e as Error).name})`;
      }
      try {
        void window.parent.document;
        result['parent'] = 'erreichbar';
      } catch (e) {
        result['parent'] = `blockiert (${(e as Error).name})`;
      }
      try {
        localStorage.setItem('x', '1');
        result['storage'] = 'erlaubt';
      } catch (e) {
        result['storage'] = `blockiert (${(e as Error).name})`;
      }
      return result;
    });
    expect(probe['origin']).toBe('null');
    expect(probe['fetch']).toMatch(/^blockiert/);
    expect(probe['parent']).toMatch(/^blockiert/);
    expect(probe['storage']).toMatch(/^blockiert/);
    await expect(docFrame(page).locator('img').first()).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/);
    expect(external).toEqual([]);
  });

  for (const width of [320, 768, 1280, 1920]) {
    test(`reflows at ${width} px without horizontal scrolling (HP-RS-010)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openSample(page);
      const toc = page.locator('#toc-panel');
      for (const target of ['Projektbericht', 'Anhang']) {
        if (!(await toc.isVisible())) await page.getByRole('button', { name: 'Inhalt' }).click();
        await toc.getByRole('link', { name: target, exact: true }).click();
        await waitForFrame(page);
        const frame = await frameOverflow(page);
        expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
        const shell = await shellOverflow(page);
        expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth);
      }
    });
  }

  test('rejects a file that is not a container with a readable message', async ({ page }) => {
    await page.goto('./');
    await page.locator('#file-input').setInputFiles({ name: 'kaputt.hpro', mimeType: 'application/epub+zip', buffer: Buffer.from('kein ZIP') });
    await expect(page.getByRole('alert')).toContainText('„kaputt.hpro“ lässt sich nicht öffnen');
    await expect(page.locator('#welcome')).toBeVisible();
  });
});
