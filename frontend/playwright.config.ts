import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Sloplomacy LLM-driven testing.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1, // Deterministic serial execution for game state scenarios
  reporter: [
    ['list'],
    ['json', { outputFile: '../artifacts/e2e/test-results.json' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    video: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
