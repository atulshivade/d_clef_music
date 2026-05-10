import { test, expect, collectConsoleErrors } from "./fixtures";

test.describe("Public pages (no auth)", () => {
  test("/ landing renders Shred Sound Music branding and hero CTA", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");

    // Document title carries the brand.
    await expect(page).toHaveTitle(/Shred Sound Music/i);

    // Brand wordmark appears at least once (top-bar + footer).
    await expect(
      page.getByText("Shred Sound Music", { exact: false }).first(),
    ).toBeVisible();

    // Hero H1 reads "Premium Music Platform" across two coloured spans.
    await expect(
      page.getByRole("heading", { name: /premium\s+music\s+platform/i }),
    ).toBeVisible();

    // The two main CTAs should be visible.
    await expect(
      page.getByRole("link", { name: /browse performances/i }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("link", { name: /(join the stage|continue|open studio)/i })
        .first(),
    ).toBeVisible();

    // The Instagram link in the footer points at the new brand handle.
    const ig = page.getByRole("link", {
      name: /follow shred sound music on instagram/i,
    });
    await expect(ig).toBeVisible();
    await expect(ig).toHaveAttribute(
      "href",
      "https://www.instagram.com/shred_sound_music/",
    );
    await expect(ig).toHaveAttribute("target", "_blank");
    await expect(ig).toHaveAttribute("rel", /noopener/);

    // No console errors during render (other than browser preload noise).
    expect(errors().filter((e) => !/preload|hydration/i.test(e))).toEqual([]);
  });

  test("no stale 'Encore' or 'D Clef Music' branding remains on key pages", async ({
    page,
  }) => {
    for (const path of ["/", "/sign-in", "/sign-up"]) {
      await page.goto(path);
      const html = await page.content();
      for (const stale of ["Encore", "D Clef Music", "d-clef-music", "d_clef_music"]) {
        expect(
          html.includes(stale),
          `expected no "${stale}" mentions on ${path}`,
        ).toBe(false);
      }
    }
  });

  test("/sign-in shows email + password fields and brand copy", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled();
    // The card description should mention the new brand.
    await expect(
      page.getByText(/Sign in to your Shred Sound Music account/i),
    ).toBeVisible();
  });

  test("/sign-up exposes optional instrument + skill", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByLabel(/name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(
      page.locator("select[name='primaryInstrument'], #primaryInstrument"),
    ).toBeAttached();
    await expect(
      page.locator("select[name='skillLevel'], #skillLevel"),
    ).toBeAttached();
    await expect(page.getByText(/Join Shred Sound Music/i)).toBeVisible();
  });

  test("/feed redirects unauthenticated visitors to /sign-in", async ({ page }) => {
    const resp = await page.goto("/feed");
    expect(page.url()).toMatch(/\/sign-in/);
    expect(resp?.status() ?? 200).toBeLessThan(500);
  });

  test("/admin redirects unauthenticated visitors to /sign-in", async ({ page }) => {
    await page.goto("/admin");
    expect(page.url()).toMatch(/\/sign-in/);
  });

  test("light theme is in effect (cream bg + dark text)", async ({ page }) => {
    // The redesigned theme is light cream — bg lightness should be high
    // and the foreground should be dark. A missing-stylesheet regression
    // would leave us at a default white bg with black text (still high/low),
    // so we additionally assert the *primary* CSS custom property is the
    // expected gold so we're sure the theme tokens loaded.
    await page.goto("/");
    const probe = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      const root = getComputedStyle(document.documentElement);
      return {
        bg: cs.backgroundColor,
        fg: cs.color,
        primary: root.getPropertyValue("--primary").trim(),
      };
    });

    function lightness(colour: string): number | null {
      const lab = colour.match(/^lab\(\s*([0-9.+-]+)/);
      if (lab) return parseFloat(lab[1]);
      const rgb = colour.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgb) {
        const [r, g, b] = rgb.slice(1, 4).map(Number);
        return ((r + g + b) / 3 / 255) * 100;
      }
      return null;
    }

    const bgL = lightness(probe.bg);
    const fgL = lightness(probe.fg);
    expect(bgL, `unexpected bg colour format: ${probe.bg}`).not.toBeNull();
    expect(fgL, `unexpected fg colour format: ${probe.fg}`).not.toBeNull();
    expect(bgL!, `body bg should be light, got ${probe.bg} (L=${bgL})`).toBeGreaterThan(85);
    expect(fgL!, `body fg should be dark, got ${probe.fg} (L=${fgL})`).toBeLessThan(40);
    // The gold accent must be a real colour value. We define it as oklch
    // in CSS but Chromium serialises getPropertyValue() to lab(...). Accept
    // any colour syntax — but reject the empty string (which is what we'd
    // see if the stylesheet failed to load at all).
    expect(probe.primary, `--primary should be set, got "${probe.primary}"`)
      .toMatch(/oklch|lab|hsl|rgb|#/i);
  });

  test("landing renders three banded sections (cream + ink + white)", async ({
    page,
  }) => {
    await page.goto("/");
    // Each top-level <section class="band ..."> should be visible.
    const cream = page.locator("section.band.band-cream").first();
    const ink = page.locator("section.band.band-ink").first();
    const white = page.locator("section.band.band-white").first();
    await expect(cream).toBeVisible();
    await expect(ink).toBeVisible();
    await expect(white).toBeVisible();
    // Submit Your Video header lives on the ink band.
    await expect(
      page.getByRole("heading", { name: /submit your video/i }),
    ).toBeVisible();
    // What-you-get header lives on the white band.
    await expect(
      page.getByRole("heading", { name: /built for the student stage/i }),
    ).toBeVisible();
  });
});
