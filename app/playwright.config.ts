/**
 * End-to-end tests of the reader against the production build (`vite preview`), because the
 * service worker and the CSP only exist there. Browsers live in app/.browsers
 * (PLAYWRIGHT_BROWSERS_PATH, set by the npm scripts).
 *
 *   project "chromium": smoke, offline and accessibility tests (part of npm test)
 *   project "belege":   screenshots and measurements for docs/belege/P4 (npm run belege)
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;

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
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    { name: 'chromium', testIgnore: /belege\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'belege', testMatch: /belege\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
});
