import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Shred Sound Music.
 *
 * - Default `BASE_URL` points at the local dev server. Override with
 *   `BASE_URL=https://...` to run against a deployment.
 * - When BASE_URL is the default localhost target, Playwright will boot
 *   `npm run dev` for you and wait until it's reachable. CI / external
 *   targets opt out by setting BASE_URL explicitly.
 * - Tests run serially per file with workers=1 to keep PGlite (single
 *   process) and the live demo DB safe from concurrent mutation.
 * - We run a Desktop Chromium project plus a Mobile Safari (iPhone 12)
 *   project so the responsive layout regressions are caught at both
 *   form factors. `--project=chromium` runs only the desktop set.
 * - `ignoreHTTPSErrors` for the corp-proxy environment that intercepts
 *   TLS.
 */
const DEFAULT_BASE_URL = "http://localhost:3000";
const BASE_URL = process.env.BASE_URL ?? DEFAULT_BASE_URL;
const isLocalDefault = BASE_URL === DEFAULT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-safari",
      // iPhone 12 — narrow portrait viewport for catching mobile regressions.
      use: { ...devices["iPhone 12"] },
      testMatch: /(public|responsive)\.spec\.ts/,
    },
  ],
  ...(isLocalDefault
    ? {
        webServer: {
          command: "npm run dev",
          url: DEFAULT_BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      }
    : {}),
});
