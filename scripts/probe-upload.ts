/**
 * Authenticated probe of /api/upload/video against the live demo.
 * Reproduces what a signed-in student sees so we can tell whether the 500
 * is from our EphemeralFsGuardProvider (good — graceful) or from something
 * upstream like Netlify's body-size limit (bad — opaque).
 *
 * Usage:  npx tsx scripts/probe-upload.ts
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "https://djmusic-challenge.netlify.app";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/email/i).fill("alex@portal.dev");
  await page.getByLabel(/password/i).fill("Password123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(challenges|admin)/, { timeout: 30_000 });

  for (const sizeMb of [0.001, 1, 5]) {
    const bytes = Math.round(sizeMb * 1024 * 1024);
    const result = await page.evaluate(async ({ bytes }) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
      const fd = new FormData();
      fd.append("file", blob, "probe.mp4");
      const r = await fetch("/api/upload/video", { method: "POST", body: fd });
      const txt = await r.text();
      return {
        status: r.status,
        contentType: r.headers.get("content-type"),
        contentLength: r.headers.get("content-length"),
        body: txt.slice(0, 600),
      };
    }, { bytes });
    console.log(`\n[size=${sizeMb}MB]`, result);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
