import {
  test,
  expect,
  signIn,
  STUDENT_ALEX,
  TEACHER,
  collectConsoleErrors,
} from "./fixtures";

/**
 * End-to-end navigation tests that exercise the responsive layout while
 * walking the major user journeys.
 */
test.describe("Authenticated navigation flows", () => {
  test("student → /challenges → click first card → /challenges/[id] → upload form", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, STUDENT_ALEX);

    // Active challenges grid renders.
    await page.goto("/challenges");
    await expect(
      page.getByRole("heading", { name: /active challenges/i }),
    ).toBeVisible();

    // Click the first challenge link in the grid (the wrapper Link sits
    // around the card, so the card title is the visible target).
    const firstCardLink = page.locator("a[href^='/challenges/']").first();
    await expect(firstCardLink).toBeVisible();
    await firstCardLink.click();
    await page.waitForURL(/\/challenges\/[^/]+/, { timeout: 15_000 });

    // Detail page must render the four-band layout.
    await expect(page.locator("section.band.band-cream").first()).toBeVisible();
    // The student should see the upload band (ink) with the Submit form card.
    await expect(
      page.getByRole("heading", { name: /submit your video/i }),
    ).toBeVisible();
    // Performance gallery band (white).
    await expect(
      page.getByRole("heading", { name: /performances/i }).first(),
    ).toBeVisible();

    // Form widgets exposed by PerformanceUploader.
    await expect(page.getByLabel(/instrument/i)).toBeVisible();
    await expect(page.getByLabel(/skill level/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /submit/i })).toBeVisible();

    // The capability probe should resolve without a console error.
    expect(errors().filter((e) => !/preload|hydration/i.test(e))).toEqual([]);
  });

  test("student / feed renders performance feed heading + best performer", async ({
    page,
  }) => {
    await signIn(page, STUDENT_ALEX);
    await page.goto("/feed");
    await expect(
      page.getByRole("heading", { name: /performance feed/i }),
    ).toBeVisible();
    await expect(page.getByText(/best performer/i).first()).toBeVisible();
  });

  test("navbar brand link routes back to the landing page", async ({ page }) => {
    await signIn(page, STUDENT_ALEX);
    await page.goto("/challenges");
    // The navbar carries an aria-label "Shred Sound Music — home".
    const brand = page.getByRole("link", { name: /shred sound music — home/i });
    await expect(brand).toBeVisible();
    await brand.click();
    // Landing has the hero "Premium Music Platform".
    await expect(
      page.getByRole("heading", { name: /premium\s+music\s+platform/i }),
    ).toBeVisible();
  });

  test("teacher navbar exposes the Studio link, students do not", async ({
    page,
  }) => {
    // Teacher first.
    await signIn(page, TEACHER);
    await page.goto("/challenges");
    await expect(
      page.getByRole("link", { name: /studio/i }).first(),
    ).toBeVisible();

    // Sign out, then sign back in as a student. The dropdown's Sign-out
    // menu item reuses a server action — using a direct GET is simpler
    // and equivalent. Auth.js exposes /api/auth/signout; visiting it
    // clears the cookie. Then the student flow:
    await page.goto("/api/auth/signout");
    // The signout page is a confirmation form; submit it.
    const signOutBtn = page.getByRole("button", { name: /sign out/i });
    if (await signOutBtn.isVisible().catch(() => false)) {
      await signOutBtn.click();
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }

    await signIn(page, STUDENT_ALEX);
    await page.goto("/challenges");
    // Students must NOT see a /admin link.
    await expect(page.locator("a[href='/admin']")).toHaveCount(0);
  });
});
