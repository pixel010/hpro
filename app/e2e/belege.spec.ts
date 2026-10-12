/**
 * Evidence run for docs/belege/P4 (npm run belege): screenshots in three widths, reflow and
 * zoom measurements, page view geometry, and the full axe-core result of every scenario.
 * Not part of npm test, because it writes into the repository.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, runScenario, type ScenarioResult } from './a11y.js';
import { WIDTHS, docFrame, frameOverflow, innerFrame, openSample, shellOverflow, waitForFrame } from './helpers.js';

const OUT = fileURLToPath(new URL('../../docs/belege/P4/', import.meta.url));
const SHOTS = `${OUT}screenshots/`;
mkdirSync(SHOTS, { recursive: true });

function write(name: string, data: unknown): void {
  writeFileSync(`${OUT}${name}`, `${JSON.stringify(data, null, 2)}\n`);
}

async function gotoToc(page: Page, label: string): Promise<void> {
  const toc = page.locator('#toc-panel');
  if (!(await toc.isVisible())) await page.getByRole('button', { name: 'Inhalt' }).click();
  await toc.getByRole('link', { name: label, exact: true }).click();
  await waitForFrame(page);
  await expect(page.locator('#pos-section')).not.toHaveText('');
}

test.describe.configure({ mode: 'serial' });

test('Screenshots in drei Breiten', async ({ page }) => {
  const taken: string[] = [];
  const shot = async (name: string) => {
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}${name}.png` });
    taken.push(`screenshots/${name}.png`);
  };
  for (const [name, size] of Object.entries(WIDTHS)) {
    await page.setViewportSize(size);
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-offline', 'ready');
    await shot(`${name}-start`);
    await openSample(page);
    await shot(`${name}-fliessend`);
    await gotoToc(page, 'Kostenschätzung');
    await shot(`${name}-fliessend-tabelle`);
    await page.getByRole('button', { name: 'Seiten' }).click();
    await expect(docFrame(page).locator('[data-hp-reader="page"]').first()).toBeVisible();
    await gotoToc(page, 'Projektbericht');
    await shot(`${name}-seiten`);
    await page.getByRole('button', { name: 'Fließend' }).click();
    await page.getByRole('button', { name: 'Suche' }).click();
    await page.getByLabel('Suchbegriff').fill('Lüftung');
    await page.getByLabel('Suchbegriff').press('Enter');
    await waitForFrame(page);
    if (size.width >= 1024) {
      await page.getByRole('button', { name: 'Nächster', exact: true }).click();
      await shot(`${name}-suche`);
    } else {
      await shot(`${name}-suche`);
      await page.getByRole('button', { name: 'Nächster', exact: true }).click();
      await page.keyboard.press('Escape');
      await shot(`${name}-suche-treffer`);
      await page.getByRole('button', { name: 'Inhalt' }).click();
      await shot(`${name}-inhalt`);
    }
  }
  write('screenshots.json', { erzeugt: new Date().toISOString(), breiten: WIDTHS, dateien: taken });
});

test('Messungen: Umfließen, Zoom, Seitenansicht, Ladezeit', async ({ page }) => {
  const reflow: unknown[] = [];
  for (const width of [320, 390, 768, 820, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await openSample(page);
    for (const part of ['Projektbericht', 'Anhang']) {
      await gotoToc(page, part);
      const frame = await frameOverflow(page);
      const shell = await shellOverflow(page);
      reflow.push({ breite: width, teil: part, rahmen: frame, oberflaeche: shell, ohneWaagrechtesScrollen: frame.scrollWidth <= frame.clientWidth && shell.scrollWidth <= shell.clientWidth });
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await openSample(page);
  const p = docFrame(page).locator('#p-einleitung');
  const style = () => p.evaluate((el) => ({ fontSize: parseFloat(getComputedStyle(el).fontSize), lineHeight: getComputedStyle(el).lineHeight }));
  const zoom: unknown[] = [{ zoom: '100 %', ...(await style()) }];
  for (const target of ['200 %', '300 %']) {
    while ((await page.locator('#btn-zoom-reset').textContent()) !== target) await page.getByRole('button', { name: 'Vergrößern' }).click();
    await expect.poll(async () => (await style()).fontSize).toBeGreaterThan(16);
    zoom.push({ zoom: target, ...(await style()), rahmen: await frameOverflow(page) });
  }
  await page.locator('#btn-zoom-reset').click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await openSample(page);
  await page.getByRole('button', { name: 'Seiten' }).click();
  const pages = docFrame(page).locator('[data-hp-reader="page"]');
  await expect(pages.first()).toBeVisible();
  const pageView = {
    seiten: await pages.count(),
    seitenboxPx: await pages.first().evaluate((el) => ({ breite: (el as HTMLElement).offsetWidth, hoehe: (el as HTMLElement).offsetHeight })),
    sollPx: { breite: (210 * 96) / 25.4, hoehe: (297 * 96) / 25.4 },
    kopfzeile: await pages.first().locator('.hp-page-head').textContent(),
    fusszeileLetzteSeite: await pages.last().locator('.hp-page-foot').textContent(),
    statuszeile: await page.locator('#pos-page').textContent(),
  };
  await page.setViewportSize({ width: 390, height: 844 });
  const fit = await innerFrame(page).evaluate(() => getComputedStyle(document.documentElement).zoom);

  // The three rules hpro-check cannot decide without a browser (HPR-INH-004, -006, -022),
  // measured on the sample in the reader's frame with the catalogue's own procedure.
  const rules: Record<string, unknown> = {};
  const inh004: unknown[] = [];
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openSample(page);
    for (const part of ['Projektbericht', 'Anhang']) {
      await gotoToc(page, part);
      inh004.push({ breite: width, teil: part, ...(await frameOverflow(page)) });
    }
  }
  rules['HPR-INH-004'] = inh004;
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSample(page);
  rules['HPR-INH-006'] = await innerFrame(page).evaluate(async () => {
    const root = document.documentElement;
    const ps = Array.from(document.querySelectorAll('p'));
    const before = ps.map((p) => ({ fontSize: parseFloat(getComputedStyle(p).fontSize), lineHeight: parseFloat(getComputedStyle(p).lineHeight) }));
    // As written in the catalogue: the variables are set on the frame root (the reader's own
    // root font-size is reset to 100 % first, so only the variables act).
    root.style.fontSize = '100%';
    root.style.setProperty('--hp-font-size', '200%');
    root.style.setProperty('--hp-line-height', '2');
    const after = ps.map((p) => ({ fontSize: parseFloat(getComputedStyle(p).fontSize), lineHeight: parseFloat(getComputedStyle(p).lineHeight) }));
    const fontFactors = after.map((a, i) => a.fontSize / before[i]!.fontSize);
    return {
      absaetze: ps.length,
      schriftgroesseVorher: [...new Set(before.map((b) => b.fontSize))],
      schriftgroesseNachher: [...new Set(after.map((a) => a.fontSize))],
      faktorSchriftgroesse: { min: Math.min(...fontFactors), max: Math.max(...fontFactors) },
      zeilenhoeheVorherPx: [...new Set(before.map((b) => b.lineHeight))],
      zeilenhoeheNachherPx: [...new Set(after.map((a) => a.lineHeight))],
      zeilenhoeheNachherJeSchriftgroesse: [...new Set(after.map((a) => Math.round((a.lineHeight / a.fontSize) * 1000) / 1000))],
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSample(page);
  await page.waitForTimeout(5000);
  rules['HPR-INH-022'] = await innerFrame(page).evaluate(() => ({
    animationen: document.getAnimations().length,
    medienInWiedergabe: Array.from(document.querySelectorAll('video, audio')).filter((m) => !(m as HTMLMediaElement).paused).length,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const loads: number[] = [];
  for (let i = 0; i < 5; i++) {
    await page.goto('./');
    const start = Date.now();
    await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('../dist/beispiel.hpro', import.meta.url)));
    await waitForFrame(page);
    loads.push(Date.now() - start);
  }

  write('messungen.json', {
    erzeugt: new Date().toISOString(),
    browser: `${page.context().browser()?.browserType().name()} ${page.context().browser()?.version()}`,
    umfliessen: reflow,
    zoomFliessend: zoom,
    seitenansicht: { ...pageView, zoomFaktorBei390px: fit },
    regelnOhneEngineImPruefer: rules,
    oeffnenBisDarstellungMs: { laeufe: loads, median: [...loads].sort((a, b) => a - b)[2] },
  });
});

test('axe-core: alle Szenarien', async ({ page }) => {
  const results: ScenarioResult[] = [];
  for (const scenario of SCENARIOS) results.push(await runScenario(page, scenario));
  const all = results.flatMap((r) => r.violations);

  // axe leaves color-contrast "incomplete" where it cannot see the background: table cells
  // scrolled out of their region (phone) and text over the page boxes, which lie in their own
  // layer (page view). Recomputed here with the WCAG 2.2 formula against the real background.
  const contrastCheck = async (selector: string, background: string) =>
    innerFrame(page).evaluate(
      ({ selector, background }) => {
        const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
        const lum = (c: number[]) => {
          const [r, g, b] = c.slice(0, 3).map((v) => {
            const x = v / 255;
            return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
        };
        // First opaque background from the given element upwards.
        let bgEl: Element | null = document.querySelector(background);
        let bg: number[] = [];
        while (bgEl) {
          bg = parse(getComputedStyle(bgEl).backgroundColor);
          if (bg.length === 3 || (bg[3] ?? 0) >= 1) break;
          bgEl = bgEl.parentElement;
        }
        if (!bgEl) return { fehler: 'kein deckender Hintergrund gefunden' };
        let min = Infinity;
        let count = 0;
        for (const el of Array.from(document.querySelectorAll(selector))) {
          if (!(el.textContent ?? '').trim()) continue;
          const [a, b] = [lum(parse(getComputedStyle(el).color)), lum(bg)].sort((x, y) => y - x);
          min = Math.min(min, (a! + 0.05) / (b! + 0.05));
          count++;
        }
        return { elemente: count, hintergrund: getComputedStyle(bgEl).backgroundColor, kleinstesKontrastverhaeltnis: Math.round(min * 100) / 100 };
      },
      { selector, background },
    );
  const TEXT = 'h1, h2, h3, p, li, dt, dd, th, td, caption, figcaption, summary, pre, a, .hp-page-head, .hp-page-foot';
  const contrast: Record<string, unknown> = {};
  for (const scheme of ['light', 'dark', 'contrast']) {
    await page.goto('./');
    await page.evaluate((s) => localStorage.setItem('hpro-reader-settings', JSON.stringify({ scheme: s })), scheme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    await page.getByRole('button', { name: 'Seiten' }).click();
    await expect(docFrame(page).locator('[data-hp-reader="page"]').first()).toBeVisible();
    const pageView = await contrastCheck(TEXT, '[data-hp-reader="page"]');
    await page.setViewportSize({ width: 390, height: 844 });
    await openSample(page);
    const phoneTable = await contrastCheck('#t-kosten th, #t-kosten td, #t-kosten caption', '#t-kosten');
    contrast[scheme] = { seitenansicht1440: pageView, kostentabelleTelefon390: phoneTable };
  }
  await page.evaluate(() => localStorage.clear());

  write('axe-ergebnis.json', {
    erzeugt: new Date().toISOString(),
    werkzeug: 'axe-core 4.14 über @axe-core/playwright, Tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice',
    zusammenfassung: {
      szenarien: results.length,
      verstoesseGesamt: all.length,
      nachSchwere: all.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v.impact ?? 'ohne']: (acc[v.impact ?? 'ohne'] ?? 0) + 1 }), {}),
    },
    kontrastNachgerechnet: {
      hinweis: 'Für die von axe als incomplete gemeldeten Knoten (color-contrast): Vordergrund gegen den tatsächlichen Hintergrund, Formel WCAG 2.2 (relative Leuchtdichte). AA verlangt 4,5:1 für Fließtext.',
      nachFarbschema: contrast,
    },
    szenarien: results,
  });
});
