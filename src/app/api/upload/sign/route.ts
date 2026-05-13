/**
 * Cloudinary-direct upload signature endpoint.
 *
 * Why this exists
 * ---------------
 * Vercel's Serverless Functions cap the request body at 4.5 MB on every
 * tier. Anything larger sent to `/api/upload/video` is rejected with
 * `FUNCTION_PAYLOAD_TOO_LARGE` before our code even runs.
 *
 * The Vercel-recommended workaround for media uploads is to mint a
 * short-lived signed URL server-side and have the **browser** PUT the
 * file directly to the storage provider. That's what this route does.
 *
 * Contract
 * --------
 * - `GET ?title=<optional>` — auth-required.
 * - Returns `{ uploadUrl, cloudName, folder, params }` shaped exactly
 *   like `CloudinarySignedUpload` in `lib/video.ts`.
 * - Returns 401 when the caller has no session.
 * - Returns 400 when `VIDEO_PROVIDER` isn't `cloudinary` (or the
 *   credentials are missing) — the client falls back to the embed flow.
 * - Signature is valid for ~1 hour (Cloudinary's default timestamp
 *   window).
 *
 * Security
 * --------
 * The signed payload covers exactly one upload to the configured folder
 * with the supplied title. A malicious authenticated user could spam
 * the endpoint to burn Cloudinary quota — that's bounded by the free-
 * tier limit and acceptable for the current pilot. Tighten later by:
 *   - Rate-limiting per session (e.g. 10 signs/min via Upstash or
 *     Vercel KV).
 *   - Scoping the folder to `<challengeId>/<userId>/<timestamp>` so an
 *     attacker cannot overwrite someone else's file.
 *   - Adding `eager_async` transforms or `notification_url` for audit.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildCloudinarySignedParams,
  resolveCloudinaryConfig,
} from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = (process.env.VIDEO_PROVIDER ?? "local").toLowerCase();
  if (provider !== "cloudinary") {
    // Be explicit so the client can fall back gracefully rather than
    // staring at a generic 500. The `provider` field lets the UI route
    // to the appropriate alternate path.
    return NextResponse.json(
      {
        error:
          "Direct uploads via Cloudinary are not enabled on this deployment.",
        provider,
      },
      { status: 400 },
    );
  }

  const cfg = resolveCloudinaryConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        error:
          "VIDEO_PROVIDER=cloudinary but CLOUDINARY_URL / CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are missing.",
      },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const title = url.searchParams.get("title") ?? undefined;

  const signed = buildCloudinarySignedParams({
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    apiSecret: cfg.apiSecret,
    folder: cfg.folder,
    title: title && title.trim() ? title.trim() : undefined,
  });

  // The api_secret never leaves the server. Only the timestamp + sig +
  // public api_key go to the browser.
  return NextResponse.json(signed);
}
