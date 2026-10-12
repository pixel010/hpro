/**
 * Accessibility check with axe-core shared by the test (a11y.spec.ts) and the evidence run
 * (belege.spec.ts): the same scenarios, the same rule set.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { docFrame, openSample, waitForFrame } from './helpers.js';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
/** "Schwere Verstöße": the two highest impact levels of axe-core. */
export const SEVERE = new Set(['critical', 'serious']);

export interface ScenarioResult {
  readonly scenario: string;
  readonly viewport: string;
  readonly passes: number;
  /** Rules axe could not decide automatically ("needs review"), with their impact. */
  readonly incomplete: ReadonlyArray<{ id: string; impact: string | null; nodes: number }>;
  readonly violations: ReadonlyArray<{ id: string; impact: string | null; help: string; nodes: number; targets: string[] }>;
}

export interface Scenario {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  prepare(page: Page): Promise<void>;
}

export const SCENARIOS: readonly Scenario[] = [
  { name: 'Startseite', width: 390, height: 844, prepare: async (page) => void (await page.goto('./')) },
  { name: 'Dokument, fließend', width: 390, height: 844, prepare: openSample },
  { name: 'Dokument, fließend', width: 1440, height: 900, prepare: openSample },
  {
    name: 'Dokument, Seitenansicht',
    width: 1440,
    height: 900,
    prepare: async (page) => {
      await openSample(page);
      await page.getByRole('button', { name: 'Seiten' }).click();
      await expect(docFrame(page).locator('[data-hp-reader="page"]').first()).toBeVisible();
    },
  },
  {
    name: 'Suche mit Treffern, aufgeklappte Details',
    width: 1440,
    height: 900,
    prepare: async (page) => {
      await openSample(page);
      await page.getByRole('button', { name: 'Suche' }).click();
      await page.getByLabel('Suchbegriff').fill('Lüftung');
      await page.getByLabel('Suchbegriff').press('Enter');
      await waitForFrame(page);
      await page.getByRole('button', { name: 'Nächster', exact: true }).click();
      await expect(docFrame(page).locator('mark.hp-hit-current').first()).toBeVisible();
    },
  },
  {
    name: 'Inhaltsverzeichnis als Überlagerung',
    width: 390,
    height: 844,
    prepare: async (page) => {
      await openSample(page);
      await page.getByRole('button', { name: 'Inhalt' }).click();
      await expect(page.locator('#toc-panel')).toBeVisible();
    },
  },
  {
    name: 'Anhang mit gestapelter Tabelle',
    width: 390,
    height: 844,
    prepare: async (page) => {
      await openSample(page);
      await page.keyboard.press(']');
      await waitForFrame(page);
      await expect(docFrame(page).locator('h1')).toHaveText('Anhang');
    },
  },
  {
    name: 'Dialog Darstellung, dunkles Schema',
    width: 820,
    height: 1180,
    prepare: async (page) => {
      await openSample(page);
      await page.getByRole('button', { name: 'Darstellung' }).click();
      await page.getByLabel('Farbschema').selectOption('dark');
    },
  },
  {
    name: 'Hoher Kontrast',
    width: 820,
    height: 1180,
    prepare: async (page) => {
      await openSample(page);
      await page.getByRole('button', { name: 'Darstellung' }).click();
      await page.getByLabel('Farbschema').selectOption('contrast');
      await page.keyboard.press('Escape');
    },
  },
];

export async function runScenario(page: Page, scenario: Scenario): Promise<ScenarioResult> {
  await page.setViewportSize({ width: scenario.width, height: scenario.height });
  // Every scenario starts with default reader settings (they persist in localStorage).
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await scenario.prepare(page);
  // axe-core/playwright also analyses the sandboxed document frame (it injects into every frame).
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return {
    scenario: scenario.name,
    viewport: `${scenario.width}×${scenario.height}`,
    passes: result.passes.length,
    incomplete: result.incomplete.map((v) => ({ id: v.id, impact: v.impact ?? null, nodes: v.nodes.length })),
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      nodes: v.nodes.length,
      targets: v.nodes.map((n) => n.target.map(String).join(' >>> ')),
    })),
  };
}
