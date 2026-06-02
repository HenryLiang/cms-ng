import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for full-project functional regression.
 *
 * Strategy: existing dev frontend on :3000, all API calls transparently
 * rewritten to QA backend on :3002 (see tests/regression/_shared/fixtures.ts).
 * Real Next.js 16 frontend is exercised, all data flows to cms_ng_qa DB.
 */
export default defineConfig({
  testDir: './tests/regression',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  workers: 3, // parallel agents may share CI; keep modest
  reporter: [
    ['list'],
    ['json', { outputFile: 'tests/regression/results/run-summary.json' }],
    ['html', { outputFolder: 'tests/regression/results/html', open: 'never' }],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Do NOT start any webServer — both dev and QA backends + dev frontend are assumed running.
  outputDir: 'tests/regression/results/artifacts',
});
