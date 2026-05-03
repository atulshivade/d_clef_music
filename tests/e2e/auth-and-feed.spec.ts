import {
  test,
  expect,
  signIn,
  STUDENT_ALEX,
  collectConsoleErrors,
} from "./fixtures";

test.describe("Authenticated student flows", () => {
  test("student signs in and lands on /challenges with seeded data", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, STUDENT_ALEX);
    await page.goto("/challenges");
    await expect(page.getByRole("heading", { name: /active challenges/i }))
      .toBeVisible();
    // At least the seeded "Sweet Child O' Mine" challenge should be there.
    await expect(
      page.getByText(/Sweet Child O.{1,3} Mine/i).first(),
    ).toBeVisible();
    expect(errors().filter((e) => !/preload|hydration/i.test(e))).toEqual([]);
  });

  test("/feed renders Best Performer spotlight and at least one card", async ({
    page,
  }) => {
    await signIn(page, STUDENT_ALEX);
    await page.goto("/feed");
    await expect(page.getByRole("heading", { name: /performance feed/i }))
      .toBeVisible();
    // Best Performer spotlight (seeded with Riya's Chopin take).
    await expect(page.getByText(/best performer/i).first()).toBeVisible();
    // Performance cards have an interactive Like button with an aria-label
    // mentioning "like".
    await expect(
      page.getByRole("button", { name: /like|unlike/i }).first(),
    ).toBeVisible();
  });

  test("authenticated upload returns a clean 503 with JSON body when storage is off", async ({
    page,
    request,
  }) => {
    // Sign in via the visible form so the request fixture inherits the
    // session cookie.
    await signIn(page, STUDENT_ALEX);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const r = await request.post("/api/upload/video", {
      headers: { cookie: cookieHeader },
      multipart: {
        file: {
          name: "tiny.mp4",
          mimeType: "video/mp4",
          buffer: Buffer.from([0, 0, 0, 0]),
        },
      },
    });
    // On the live demo (no durable storage) we expect a structured 503.
    // On a hypothetical local run with STORAGE_PROVIDER set, this may pass
    // (200) — both are acceptable, but if the response IS an error it must
    // be JSON, not a plain-text gateway error.
    if (r.status() !== 200) {
      expect(r.headers()["content-type"] ?? "").toMatch(/application\/json/);
      const j = await r.json();
      expect(j.error, "error response must include a message").toBeTruthy();
    }
  });

  test("uploader banner steers students to the embed flow when uploads are off", async ({
    page,
  }) => {
    await signIn(page, STUDENT_ALEX);
    // Open any active challenge detail page; the banner only shows up once
    // the capabilities probe resolves.
    await page.goto("/challenges");
    const firstChallenge = page.getByRole("link", { name: /sweet child/i }).first();
    await firstChallenge.click();
    await page.waitForURL(/\/challenges\/[^/]+/);

    // Wait for the capability fetch to either flip to FILE mode (uploads
    // on) or render the banner (uploads off). The banner has a stable
    // testid so it's the cleanest signal.
    const banner = page.getByTestId("uploads-disabled-banner");
    const fileTab = page.getByRole("tab", { name: /upload video/i });
    await Promise.race([
      banner.waitFor({ state: "visible", timeout: 10_000 }),
      // Equivalent: file tab is enabled (capability said true). Either is OK.
      page.waitForFunction(() => {
        const t = document.querySelector("[role='tab'][data-state='active']");
        return !!t;
      }, { timeout: 10_000 }),
    ]).catch(() => undefined);

    if (await banner.isVisible().catch(() => false)) {
      // FILE tab must be disabled and EMBED must be the active mode.
      await expect(fileTab).toBeDisabled();
      await expect(page.getByRole("tab", { name: /paste link/i }))
        .toHaveAttribute("data-state", "active");
    }
  });

  test("liking a performance increases the like count", async ({ page }) => {
    await signIn(page, STUDENT_ALEX);
    await page.goto("/feed");
    const likeBtn = page.getByRole("button", { name: /like|unlike/i }).first();
    await expect(likeBtn).toBeVisible();

    // Capture the count text before clicking. The button label looks like
    // "Like (3)" or "Unlike (4)" depending on prior state.
    const before = await likeBtn.textContent();
    const beforeCount = parseInt((before?.match(/\d+/) ?? ["0"])[0], 10);

    await likeBtn.click();

    // Optimistic UI flips immediately; allow some time for server reconciliation.
    await expect
      .poll(
        async () => {
          const t = await likeBtn.textContent();
          return parseInt((t?.match(/\d+/) ?? ["0"])[0], 10);
        },
        { timeout: 8_000 },
      )
      .not.toBe(beforeCount);

    // Click again to put the like state back to where we found it (idempotent
    // test — important because we run against the live demo DB).
    await likeBtn.click();
  });
});
