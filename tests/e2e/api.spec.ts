import { test, expect } from "./fixtures";

/**
 * Backend smoke tests — hit the deployed Functions directly to confirm the
 * Lambda is healthy and our auth gating works.
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

  test("/api/upload/capabilities reports the deployment's upload posture", async ({
    request,
  }) => {
    const r = await request.get("/api/upload/capabilities");
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(typeof j.uploadsEnabled).toBe("boolean");
    expect(typeof j.storageProvider).toBe("string");
    // On the live Netlify demo this should be FALSE with a non-empty reason.
    if (process.env.BASE_URL?.includes("netlify.app") || !process.env.BASE_URL) {
      expect(j.uploadsEnabled).toBe(false);
      expect(j.reason, "live demo must explain why uploads are off")
        .toBeTruthy();
    }
  });
});
