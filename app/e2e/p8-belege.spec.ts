/**
 * Evidence run for docs/belege/P8 (npm run belege:p8 -w app):
 *
 * - screenshots of the panel "Prüfen" with the findings of the test document, after all
 *   corrections, and at telephone width;
 * - Abnahme 3: axe-core over the reader with the panel open — the complete result (every
 *   violation with impact, also minor ones; "needs review" items) at three states, written to
 *   gegenprobe/axe-oberflaeche.json;
 * - cross-check with an independent tool: axe-core over the rendered test document (only the
 *   document frame) before and after the corrections → gegenprobe/axe-dokument.json;
 * - cross-check of the static contrast computation: the colours Chromium computes for the
 *   flagged elements in the three colour schemes of the reader, contrast after the WCAG formula,
 *   against the numbers of the core → gegenprobe/kontrast-chromium.json; the same for the two
 *   findings in the print sample (druck.hpro, dark scheme);
 * - time from opening the panel to the complete list, and of "Alle Vorschläge übernehmen".
 *
 * Not part of npm test (writes into the repository).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { a11y } from '../../kern/src/index.ts';
import { AXE_TAGS, SEVERE } from './a11y.js';
import { innerFrame, openFile, WIDTHS } from './helpers.js';
import { CHECK_SAMPLE, fixAll, openCheck } from './pruefen.js';

const OUT = fileURLToPath(new URL('../../docs/belege/P8/', import.meta.url));
const SHOTS = `${OUT}screenshots/`;
const CROSS = `${OUT}gegenprobe/`;
const PRINT_SAMPLE = fileURLToPath(new URL('../dist/druck.hpro', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
mkdirSync(CROSS, { recursive: true });

const measurements: Record<string, unknown> = {};

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage });
}

type AxeSummary = { violations: Array<{ id: string; impact: string | null; nodes: number; targets: string[] }>; incomplete: Array<{ id: string; impact: string | null; nodes: number; targets: string[]; why: string[] }>; passes: number };

async function axe(page: Page, scope: 'oberflaeche' | 'dokument'): Promise<AxeSummary> {
  let b = new AxeBuilder({ page }).withTags(AXE_TAGS);
  b = scope === 'oberflaeche' ? b.exclude('#doc-host') : b.include('#doc-host');
  const r = await b.analyze();
  return {
    violations: r.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, nodes: v.nodes.length, targets: v.nodes.map((n) => n.target.map(String).join(' >>> ')) })),
    incomplete: r.incomplete.map((v) => ({ id: v.id, impact: v.impact ?? null, nodes: v.nodes.length, targets: v.nodes.map((n) => n.target.map(String).join(' >>> ')), why: v.nodes.flatMap((n) => [...n.any, ...n.all, ...n.none].map((c) => c.message)) })),
    passes: r.passes.length,
  };
}

async function setScheme(page: Page, scheme: 'light' | 'dark' | 'contrast'): Promise<void> {
  await page.getByRole('button', { name: 'Darstellung' }).click();
  await page.getByLabel('Farbschema').selectOption(scheme);
  await page.keyboard.press('Escape');
  await expect(page.locator('#viewer')).toHaveAttribute('data-state', 'ready');
  await page.waitForTimeout(300);
}

/** Text and effective background colour as Chromium computes them, and the WCAG contrast. */
async function measure(page: Page, selector: string): Promise<{ selector: string; fg: string; bg: string; ratio: number }> {
  return innerFrame(page).evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`${sel} missing`);
    const parse = (s: string) => {
      const m = /rgba?\(([^)]+)\)/.exec(s);
      const p = m ? m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number) : [0, 0, 0, 0];
      return { r: p[0]!, g: p[1]!, b: p[2]!, a: p[3] ?? 1 };
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (x: number) => (x / 255 <= 0.04045 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    let bg = { r: 255, g: 255, b: 255, a: 0 };
    const layers: Array<{ r: number; g: number; b: number; a: number }> = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c.a > 0) layers.push(c);
      if (c.a >= 1) break;
    }
    // canvas below everything: white (light scheme) unless a layer is opaque
    bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) bg = { r: l.r * l.a + bg.r * (1 - l.a), g: l.g * l.a + bg.g * (1 - l.a), b: l.b * l.a + bg.b * (1 - l.a), a: 1 };
    const fg = parse(getComputedStyle(el).color);
    const hex = (c: { r: number; g: number; b: number }) => '#' + [c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
    const l1 = lum(fg);
    const l2 = lum(bg);
    return { selector: sel, fg: hex(fg), bg: hex(bg), ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100 };
  }, selector);
}

test.describe.configure({ mode: 'serial' });

test('Bildschirmfotos und Abnahme 3: axe-core über die Oberfläche mit dem Prüfpanel', async ({ page }) => {
  const result: Record<string, AxeSummary> = {};
  const t0 = Date.now();
  await openCheck(page);
  measurements['oeffnenBisListe_ms'] = Date.now() - t0;
  await shot(page, 'p8-panel-befunde-desktop');
  result['Prüfpanel mit 19 Befunden, 1440 px'] = await axe(page, 'oberflaeche');
  await page.setViewportSize(WIDTHS.telefon);
  await expect(page.locator('#a11y-panel')).toBeVisible();
  await shot(page, 'p8-panel-befunde-telefon');
  result['Prüfpanel mit 19 Befunden, 390 px'] = await axe(page, 'oberflaeche');
  await page.setViewportSize(WIDTHS.desktop);
  const t1 = Date.now();
  await fixAll(page);
  measurements['alleVorschlaegeUebernehmen_ms'] = Date.now() - t1;
  await page.getByRole('button', { name: 'Erneut prüfen' }).click();
  await expect(page.locator('#a11y-summary')).toContainText('Keine Befunde');
  await shot(page, 'p8-panel-nach-korrektur-desktop');
  result['Prüfpanel nach allen Korrekturen, 1440 px'] = await axe(page, 'oberflaeche');
  writeFileSync(`${CROSS}axe-oberflaeche.json`, JSON.stringify(result, null, 2) + '\n');
  for (const [k, v] of Object.entries(result)) {
    const severe = v.violations.filter((x) => x.impact && SEVERE.has(x.impact));
    console.log(`axe Oberfläche | ${k}: ${v.passes} bestandene Regeln, Verstöße: ${v.violations.map((x) => `${x.id} (${x.impact}, ${x.nodes})`).join(', ') || 'keine'}; schwer (serious/critical): ${severe.length}; zu prüfen: ${v.incomplete.map((x) => `${x.id} (${x.nodes}: ${x.targets.join(', ')} – ${x.why.join(' / ')})`).join(', ') || 'keine'}`);
    expect(severe).toEqual([]);
  }
});

test('Gegenprobe axe-core über das Dokument: fehlerhaft gegen korrigiert', async ({ page }) => {
  const result: Record<string, AxeSummary> = {};
  await openCheck(page);
  result['Testdokument wie geliefert'] = await axe(page, 'dokument');
  await fixAll(page);
  result['nach allen Korrekturen (ungespeichert, Vorschau)'] = await axe(page, 'dokument');
  writeFileSync(`${CROSS}axe-dokument.json`, JSON.stringify(result, null, 2) + '\n');
  for (const [k, v] of Object.entries(result)) console.log(`axe Dokument | ${k}: Verstöße ${v.violations.map((x) => `${x.id} (${x.impact}, ${x.nodes})`).join(', ') || 'keine'}`);
  expect(result['Testdokument wie geliefert']!.violations.length).toBeGreaterThan(0);
  expect(result['nach allen Korrekturen (ungespeichert, Vorschau)']!.violations).toEqual([]);
});

test('Gegenprobe Kontrast: Chromium berechnet dieselben Farben und Verhältnisse wie der Kern', async ({ page }) => {
  const core = await a11y.auditContainer(new Uint8Array(readFileSync(CHECK_SAMPLE)));
  const coreLines = core.findings.filter((f) => f.rule === 'kontrast-text').map((f) => f.message);
  const out: Record<string, unknown> = { kern: coreLines };
  const elements = ['.hinweis', '.warnung', '.box-dunkel p', '#einleitung'];
  await page.setViewportSize(WIDTHS.desktop);
  await openFile(page, CHECK_SAMPLE);
  for (const scheme of ['light', 'dark', 'contrast'] as const) {
    await setScheme(page, scheme);
    out[`chromium ${scheme}`] = await Promise.all(elements.map((s) => measure(page, s)));
  }
  // the print sample: the two findings there are in the dark and high-contrast schemes
  await openFile(page, PRINT_SAMPLE);
  const printCore = await a11y.auditContainer(new Uint8Array(readFileSync(PRINT_SAMPLE)));
  out['druck.hpro kern'] = printCore.findings.map((f) => f.message);
  for (const scheme of ['light', 'dark', 'contrast'] as const) {
    await setScheme(page, scheme);
    out[`druck.hpro chromium ${scheme}`] = await Promise.all(['pre code', 'aside[data-hp-priority] p'].map((s) => measure(page, s)));
  }
  await setScheme(page, 'light');
  writeFileSync(`${CROSS}kontrast-chromium.json`, JSON.stringify(out, null, 2) + '\n');
  for (const [k, v] of Object.entries(out)) console.log(`Kontrast | ${k}: ${JSON.stringify(v)}`);
});

test.afterAll(() => {
  writeFileSync(`${OUT}messungen-reader.json`, JSON.stringify({ host: 'Intel N100, 800 MHz ohne Turbo (siehe 00-werkzeuge.txt)', ...measurements }, null, 2) + '\n');
});
