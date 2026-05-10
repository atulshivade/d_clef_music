import { test, expect } from "./fixtures";

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
});
