/**
 * End-to-end tests of the reader against the production build (`vite preview`), because the
 * service worker and the CSP only exist there. Browsers live in app/.browsers
 * (PLAYWRIGHT_BROWSERS_PATH, set by the npm scripts).
 *
 *   project "chromium": smoke, offline and accessibility tests (part of npm test)
 *   project "belege":   screenshots and measurements for docs/belege/P4 (npm run belege)
 *   projects "engine-*": cross-engine suite in Chromium, Firefox and WebKit (P13, npm run engines)
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;

/**
 * Specs of the cross-engine suite (P13, test matrix in docs/16). By default (CI): the engine
 * comparison plus the functional specs that hold in all three engines; with P13_VOLL=1 every
 * functional spec, including those with known engine differences or Chromium-only tooling
 * (`page.pdf`, CDP), to make the differences visible as failures.
 */
const FULL = process.env['P13_VOLL'] === '1';
const ENGINE_SPECS = FULL
  ? /(engines|reader|lebendig|offline|tabellen|formulare|sperren|anmerkungen|bearbeiten|druck|pruefen|a11y)\.spec\.ts/
  : /(engines|reader|tabellen|formulare|sperren|bearbeiten|a11y)\.spec\.ts/;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    locale: 'de-AT',
    trace: 'off',
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    // A leftover preview server from an interrupted run used to fail the whole check with
    // "is already used ... set reuseExistingServer:true". The server always serves dist/ from
    // disk, so reusing one is harmless; the process is stopped when the suite ends.
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    { name: 'chromium', testIgnore: [/belege\.spec\.ts/, /engines\.spec\.ts/], use: { ...devices['Desktop Chrome'] } },
    { name: 'belege', testMatch: /belege\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Cross-engine suite (P13): the same files in Chromium, Firefox and WebKit (npm run engines).
    { name: 'engine-chromium', testMatch: ENGINE_SPECS, use: { ...devices['Desktop Chrome'] } },
    { name: 'engine-firefox', testMatch: ENGINE_SPECS, use: { ...devices['Desktop Firefox'] } },
    {
      name: 'engine-webkit',
      testMatch: ENGINE_SPECS,
      // On a host without root the libraries come from scripts/p13-sysroot.sh and WebKit starts
      // through scripts/p13-webkit-run.sh; CI installs them with `playwright install --with-deps`.
      use: { ...devices['Desktop Safari'], launchOptions: process.env.P13_WEBKIT_EXECUTABLE ? { executablePath: process.env.P13_WEBKIT_EXECUTABLE } : {} },
    },
  ],
});
