import { defineConfig, devices } from '@playwright/test';

// Minimal flags: --no-sandbox and --disable-dev-shm-usage are required in
// pid- and shm-constrained containers; multi-process mode is kept because
// --single-process proved unstable here (browser died between test files).
// They are harmless on larger CI runners.
const launchArgs = ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'];

const previewCommand =
  'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort';
// Every invocation (including direct `npx playwright test`) builds fresh
// assets before its owned preview server, so a stale dist/ is never served
// silently. CI already built once before `npx playwright test`, so the build
// is skipped there to avoid a redundant second build.
const webServerCommand = process.env.CI
  ? previewCommand
  : `npm run build && ${previewCommand}`;

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
    command: webServerCommand,
    url: 'http://127.0.0.1:4173/rentenlueckenrechner/',
    // Never reuse a stale preview server: it silently serves an old dist
    // build and makes both patched and HEAD E2E runs fail spuriously.
    // Playwright never kills a foreign server; a port conflict fails fast
    // via --strictPort so it can be stopped manually.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
