import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Sloplomacy LLM-driven testing.
 * Defaults to Google Chrome (`channel: 'chrome'`), with optional override via
 * `PLAYWRIGHT_CHANNEL` (set `PLAYWRIGHT_CHANNEL=none` or `chromium` to use bundled Chromium).
 */
const rawChannel = process.env.PLAYWRIGHT_CHANNEL;
const browserChannel =
  rawChannel === undefined
    ? 'chrome'
    : rawChannel.toLowerCase() === 'none' || rawChannel.toLowerCase() === 'chromium' || rawChannel === ''
      ? undefined
      : rawChannel;

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
    ...(browserChannel ? { channel: browserChannel } : {}),
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
        ...(browserChannel ? { channel: browserChannel } : {}),
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
