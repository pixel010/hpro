/**
 * Accessibility baseline (P4, acceptance 4): axe-core over shell and document frame in all
 * scenarios, no critical or serious violations.
 */
import { expect, test } from '@playwright/test';
import { SCENARIOS, SEVERE, runScenario } from './a11y.js';

for (const scenario of SCENARIOS) {
  test(`axe-core: ${scenario.name} (${scenario.width} px) ohne schwere Verstöße`, async ({ page }) => {
    const result = await runScenario(page, scenario);
    const severe = result.violations.filter((v) => v.impact !== null && SEVERE.has(v.impact));
    expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
    expect(result.passes).toBeGreaterThan(10);
  });
}
