import { NextResponse } from "next/server";
import { getUploadCapabilities } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Public capability descriptor for the upload UI. Returns whether direct
 * file uploads are usable on this deployment, and a human-readable reason
 * if not. The PerformanceUploader fetches this on mount to decide whether
 * to show the FILE tab or steer students straight to EMBED mode.
 */
export async function GET() {
  const caps = getUploadCapabilities();
  return NextResponse.json(caps, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
