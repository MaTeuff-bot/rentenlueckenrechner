import { defineConfig, devices } from '@playwright/test';

// Minimal flags: --no-sandbox and --disable-dev-shm-usage are required in
// pid- and shm-constrained containers; multi-process mode is kept because
// --single-process proved unstable here (browser died between test files).
// They are harmless on larger CI runners.
const launchArgs = ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/rentenlueckenrechner/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /narrow-smoke/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        launchOptions: {
          args: launchArgs,
        },
      },
    },
    {
      name: 'narrow',
      testMatch: /narrow-smoke/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        launchOptions: {
          args: launchArgs,
        },
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/rentenlueckenrechner/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
