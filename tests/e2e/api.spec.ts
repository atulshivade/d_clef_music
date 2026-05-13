import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, signIn, STUDENT_ALEX, TEACHER } from "./fixtures";
import { parseCloudinaryUrl } from "../../src/lib/video";
import { VIDEO_PROVIDER_VALUES } from "../../src/lib/validators";
import { videoProviderEnum } from "../../src/db/schema";

/**
 * Backend smoke tests — hit the Functions / Next API routes directly to
 * confirm Auth gating and the capabilities probe behave correctly.
 */
test.describe("API health", () => {
  test("/api/auth/session returns JSON (200) for an anon visitor", async ({
    request,
  }) => {
    const r = await request.get("/api/auth/session");
    expect(r.status()).toBe(200);
    const body = await r.json();
    // Either {} or { user: null } depending on Auth.js version — both fine.
    expect(typeof body).toBe("object");
  });

  test("/api/admin/dbinit refuses requests without the secret", async ({
    request,
  }) => {
    const r = await request.get("/api/admin/dbinit");
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body.ok).toBe(false);
  });

  test("/api/admin/dbinit refuses requests with the wrong secret", async ({
    request,
  }) => {
    const r = await request.get("/api/admin/dbinit?secret=wrong");
    expect(r.status()).toBe(401);
  });

  test("/api/upload/video refuses anonymous uploads", async ({ request }) => {
    const r = await request.post("/api/upload/video", {
      multipart: {
        file: {
          name: "blank.mp4",
          mimeType: "video/mp4",
          buffer: Buffer.from([0]),
        },
      },
    });
    expect([401, 403]).toContain(r.status());
  });

  test("/api/upload/capabilities reports a coherent upload posture", async ({
    request,
  }) => {
    const r = await request.get("/api/upload/capabilities");
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(typeof j.uploadsEnabled).toBe("boolean");
    expect(typeof j.storageProvider).toBe("string");
    // If uploads are off, the deployment must explain why.
    if (j.uploadsEnabled === false) {
      expect(j.reason, "disabled deployments must explain why").toBeTruthy();
    }
    // Recognise the providers we ship.
    expect(["local", "s3", "graceful-disabled", "cloudinary", "bunny", "vimeo"])
      .toContain(j.storageProvider);
  });

  /**
   * Regression guard: when a title is provided, the Cloudinary signing
   * payload must include the `context` field. We previously sent it as a
   * form field only, which caused Cloudinary to reject every titled upload
   * with `401 Invalid Signature`. This test reproduces that exact path
   * end-to-end so the bug can never sneak back in.
   *
   * Skipped unless the local server is wired to a real Cloudinary tenant —
   * we don't want CI runs without credentials to fail.
   */
  test("/api/upload/video accepts a titled video against Cloudinary", async ({
    page,
  }) => {
    test.skip(
      process.env.VIDEO_PROVIDER !== "cloudinary",
      "VIDEO_PROVIDER is not cloudinary on this runner",
    );

    await signIn(page, STUDENT_ALEX);

    const buffer = readFileSync(
      path.resolve(process.cwd(), "tests/fixtures/probe.mp4"),
    );

    const r = await page.request.post("/api/upload/video", {
      multipart: {
        file: {
          name: "regression-title.mp4",
          mimeType: "video/mp4",
          buffer,
        },
        title: "regression caption with =|chars",
      },
    });

    expect(
      r.status(),
      `unexpected upload status: ${await r.text().catch(() => "(no body)")}`,
    ).toBe(200);
    const j = (await r.json()) as {
      provider?: string;
      playbackUrl?: string;
      thumbnailUrl?: string;
    };
    expect(j.provider).toBe("CLOUDINARY");
    expect(j.playbackUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(j.thumbnailUrl).toMatch(/\.jpg$/);
  });
});

/**
 * Regression guard for the "I can't see uploaded videos as admin" defect.
 * The admin dashboard previously listed *challenges* but no performances —
 * a teacher would have to manually navigate to /admin/evaluate to confirm a
 * student's submission landed. This spec proves the new "Recent student
 * submissions" panel surfaces fresh submissions without that detour.
 *
 * Posts the performance via the EMBED tab (YouTube URL) so the test does
 * not depend on a real Cloudinary tenant — the dashboard guard is provider-
 * agnostic.
 */
test.describe("Admin sees recent student submissions", () => {
  test("admin dashboard lists a freshly submitted performance", async ({
    page,
    browser,
  }) => {
    const uniqueTitle = `e2e admin probe ${Date.now()}`;

    // 1) Student posts an embedded performance against the first challenge.
    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();
    await signIn(studentPage, STUDENT_ALEX);

    await studentPage.goto("/challenges");
    const firstChallengeLink = studentPage
      .locator("a[href^='/challenges/']")
      .first();
    await firstChallengeLink.click();
    await studentPage.waitForURL(/\/challenges\/[^/]+/, { timeout: 15_000 });

    await studentPage
      .getByRole("tab", { name: /paste link/i })
      .click()
      .catch(() => undefined);
    await studentPage
      .getByLabel(/youtube or vimeo url/i)
      .fill("https://youtu.be/dQw4w9WgXcQ");
    await studentPage.getByLabel(/title/i).fill(uniqueTitle);
    await studentPage.getByRole("button", { name: /submit/i }).click();
    await expect(
      studentPage.getByText(/Performance posted to the gallery/i),
    ).toBeVisible({ timeout: 15_000 });
    await studentCtx.close();

    // 2) Admin (separate context) opens /admin and sees the new card.
    await signIn(page, TEACHER);
    await page.goto("/admin");

    // CardTitle renders as a styled <div>, not an actual <h1/2/3>, so we
    // assert on visible text rather than `role: heading`.
    await expect(
      page.getByText(/recent student submissions/i).first(),
    ).toBeVisible();
    await expect(
      page
        .locator("[data-testid='admin-recent-submission']")
        .filter({ hasText: uniqueTitle })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // sanity: the cards point at /admin/evaluate so a click takes the
    // teacher to the full review surface.
    const firstCard = page
      .locator("[data-testid='admin-recent-submission']")
      .first();
    await expect(firstCard).toHaveAttribute("href", "/admin/evaluate");
  });
});

/**
 * `CLOUDINARY_URL` is the single-line connection string the dashboard
 * prints. The factory must parse it identically to the discrete trio so
 * a copy-paste deploy "just works".
 */
test.describe("parseCloudinaryUrl", () => {
  test("returns null for empty / malformed inputs", () => {
    expect(parseCloudinaryUrl(undefined)).toBeNull();
    expect(parseCloudinaryUrl("")).toBeNull();
    expect(parseCloudinaryUrl("not-a-url")).toBeNull();
    // Wrong scheme.
    expect(parseCloudinaryUrl("https://key:secret@cloud")).toBeNull();
    // Missing parts.
    expect(parseCloudinaryUrl("cloudinary://cloudonly")).toBeNull();
    expect(parseCloudinaryUrl("cloudinary://key@cloud")).toBeNull();
  });

  test("decodes a canonical cloudinary://key:secret@cloud", () => {
    // Synthetic credentials — never copy real keys into source. The test
    // is about the parser, not about any particular account.
    const parsed = parseCloudinaryUrl(
      "cloudinary://123456789012345:fake_secret_for_tests_only@example-cloud",
    );
    expect(parsed).toEqual({
      cloudName: "example-cloud",
      apiKey: "123456789012345",
      apiSecret: "fake_secret_for_tests_only",
    });
  });

  test("URL-decodes secrets that contain reserved characters", () => {
    // `:` and `@` inside a secret must be percent-encoded; the parser
    // gives them back un-escaped so the signer sees the real bytes.
    const parsed = parseCloudinaryUrl(
      "cloudinary://abcKey:s%3Acret%40ish@my-cloud",
    );
    expect(parsed).toEqual({
      cloudName: "my-cloud",
      apiKey: "abcKey",
      apiSecret: "s:cret@ish",
    });
  });
});

/**
 * Lock-step guard: the Zod validator MUST accept every provider the DB
 * enum accepts. If you add a new provider in `db/schema.ts` and forget to
 * also list it in `lib/validators.ts`, every upload routed through the
 * new provider gets rejected by the server action with a Zod error and
 * disappears silently — that was the actual root cause of the
 * "I can't see uploaded videos from admin" bug.
 */
test.describe("Schema / validator alignment", () => {
  test("VIDEO_PROVIDER_VALUES matches the DB video_provider enum exactly", () => {
    const dbValues = [...videoProviderEnum.enumValues].sort();
    const zodValues = [...VIDEO_PROVIDER_VALUES].sort();
    expect(zodValues).toEqual(dbValues);
  });
});

/**
 * End-to-end regression that reproduces what the user actually does:
 * student picks a video file → it uploads via Cloudinary → the
 * createPerformanceAction must accept the resulting payload → admin
 * /admin dashboard must list that exact title.
 *
 * Previously the validator was missing "CLOUDINARY" from
 * VIDEO_PROVIDER_VALUES, so the action returned `{ok:false}` after Zod
 * validation, the row never landed in the DB, and the teacher saw
 * nothing. Skipped when VIDEO_PROVIDER != cloudinary (CI without creds).
 */
test.describe("Student → Cloudinary file upload → Teacher dashboard", () => {
  test.skip(
    process.env.VIDEO_PROVIDER !== "cloudinary",
    "Requires a live Cloudinary tenant.",
  );

  test("file upload via Cloudinary lands in the teacher dashboard", async ({
    page,
    browser,
  }) => {
    // The full student → Cloudinary → teacher flow includes two sign-ins,
    // a real multipart upload to api.cloudinary.com, and two SSR-rendered
    // dashboard checks. 60s is too tight on this Windows box; allow more
    // headroom so a real perf hiccup is the only cause of failure.
    test.setTimeout(120_000);
    const uniqueTitle = `cloud upload regression ${Date.now()}`;

    // 1) Student logs in, opens the first challenge, uploads a real file.
    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();
    await signIn(studentPage, STUDENT_ALEX);

    await studentPage.goto("/challenges");
    await studentPage
      .locator("a[href^='/challenges/']")
      .first()
      .click();
    await studentPage.waitForURL(/\/challenges\/[^/]+/, { timeout: 15_000 });

    // Stay on the FILE tab (default when uploads are enabled). Attach the
    // tiny mp4 fixture so the real /api/upload/video → Cloudinary path
    // runs, then submit the form so createPerformanceAction is invoked.
    await studentPage
      .getByLabel(/performance video/i)
      .setInputFiles(path.resolve(process.cwd(), "tests/fixtures/probe.mp4"));
    await studentPage.getByLabel(/title/i).fill(uniqueTitle);
    await studentPage.getByRole("button", { name: /submit/i }).click();

    // Toast must say success — if Zod rejects the payload we see an error
    // toast instead (which was the silent bug).
    await expect(
      studentPage.getByText(/Performance posted to the gallery/i),
    ).toBeVisible({ timeout: 30_000 });
    // The error path used to look like this — assert we never see it.
    await expect(
      studentPage.getByText(/Invalid enum value|videoProvider/i),
    ).toHaveCount(0);

    await studentCtx.close();

    // 2) Teacher opens /admin and sees the upload listed.
    await signIn(page, TEACHER);
    await page.goto("/admin");
    await expect(
      page
        .locator("[data-testid='admin-recent-submission']")
        .filter({ hasText: uniqueTitle })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // 3) Teacher opens /admin/evaluate and the upload is in the Published tab.
    await page.goto("/admin/evaluate");
    await page.getByRole("tab", { name: /published/i }).click();
    await expect(
      page.getByText(uniqueTitle).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
