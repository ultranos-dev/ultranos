import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for RTL visual regression testing.
 *
 * Launches each PWA app in both LTR and RTL modes, captures screenshots,
 * and compares against committed baselines. Used by CI to block PRs with
 * unintentional RTL layout regressions.
 */
export default defineConfig({
  testDir: './tests/rtl',
  outputDir: './tests/rtl/test-results',
  snapshotDir: './tests/rtl/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* Parallel execution — 2 workers on CI to avoid OOM (4 web servers + browsers on 7GB runner) */
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,

  reporter: process.env.CI
    ? [['html', { outputFolder: './tests/rtl/html-report', open: 'never' }], ['github']]
    : [['html', { outputFolder: './tests/rtl/html-report', open: 'on-failure' }]],

  /* Screenshot comparison defaults */
  expect: {
    toHaveScreenshot: {
      /* 0.1% pixel difference tolerance — handles anti-aliasing */
      maxDiffPixelRatio: 0.001,
      animations: 'disabled',
    },
  },

  use: {
    /* Base URL will be overridden per project */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // ── OPD Lite ────────────────────────────────────────────
    {
      name: 'opd-lite-ltr',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3001',
        locale: 'en',
      },
      testMatch: /apps\/opd-lite/,
    },
    {
      name: 'opd-lite-rtl',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3001',
        locale: 'ar',
      },
      testMatch: /apps\/opd-lite/,
    },

    // ── Pharmacy Lite ──────────────────────────────────────
    {
      name: 'pharmacy-lite-ltr',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3002',
        locale: 'en',
      },
      testMatch: /apps\/pharmacy-lite/,
    },
    {
      name: 'pharmacy-lite-rtl',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3002',
        locale: 'ar',
      },
      testMatch: /apps\/pharmacy-lite/,
    },

    // ── Lab Lite ───────────────────────────────────────────
    {
      name: 'lab-lite-ltr',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3003',
        locale: 'en',
      },
      testMatch: /apps\/lab-lite/,
    },
    {
      name: 'lab-lite-rtl',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3003',
        locale: 'ar',
      },
      testMatch: /apps\/lab-lite/,
    },

    // ── UI Kit (component harness on port 3010) ────────────
    {
      name: 'ui-kit-ltr',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3010',
        locale: 'en',
      },
      testMatch: /ui-kit/,
    },
    {
      name: 'ui-kit-rtl',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3010',
        locale: 'ar',
      },
      testMatch: /ui-kit/,
    },
  ],

  /* Web servers to start before running tests */
  webServer: [
    {
      command: 'pnpm -F opd-lite build && pnpm -F opd-lite start',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm -F pharmacy-lite build && pnpm -F pharmacy-lite start',
      port: 3002,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm -F lab-lite build && pnpm -F lab-lite start',
      port: 3003,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm -F @ultranos/ui-kit harness',
      port: 3010,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
