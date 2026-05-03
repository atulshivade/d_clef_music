import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for D Clef Music.
 *
 * - Default `BASE_URL` points at the Netlify production deploy. Override with
 *   `BASE_URL=http://localhost:3000` to run against `npm run dev`.
 * - Tests run serially per file with workers=1 to avoid hammering the live
 *   demo DB (Netlify free tier).
 * - `ignoreHTTPSErrors` for the corp-proxy environment that intercepts TLS.
 */
const BASE_URL = process.env.BASE_URL ?? "https://d-clef-music.netlify.app";

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
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
