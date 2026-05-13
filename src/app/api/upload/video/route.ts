import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getVideoProvider, isVideoContentType } from "@/lib/video";
import { getUploadCapabilities } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB — short performance clips

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Short-circuit before parsing the body when uploads are disabled — a
  // clean 503 is much friendlier than letting the body parsing reach an
  // EphemeralFsGuardProvider that throws a 500.
  const caps = getUploadCapabilities();
  if (!caps.uploadsEnabled) {
    return NextResponse.json(
      { error: caps.reason ?? "Uploads disabled", uploadsEnabled: false },
      { status: 503 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const title = (form?.get("title") as string) || undefined;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit` },
      { status: 413 },
    );
  }
  if (!isVideoContentType(file.type)) {
    return NextResponse.json(
      { error: `Unsupported content-type: ${file.type}` },
      { status: 415 },
    );
  }

  try {
    const uploaded = await getVideoProvider().upload({
      file,
      filename: file.name,
      contentType: file.type,
      title,
    });
    return NextResponse.json(uploaded);
  } catch (err) {
    console.error("[upload-video] failed", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    // Drill into `cause` so opaque "fetch failed" turns into something the
    // user can act on (cert chain issues, DNS, timeouts, …).
    const cause =
      err instanceof Error && err.cause && typeof err.cause === "object"
        ? (err.cause as { code?: string; message?: string })
        : null;
    let detail = message;
    if (cause?.code === "SELF_SIGNED_CERT_IN_CHAIN") {
      detail =
        "Outbound TLS to the video provider was blocked by a self-signed certificate (corporate proxy). " +
        "Set ALLOW_INSECURE_TLS=true in .env.local and restart `npm run dev` to bypass for local development.";
    } else if (cause?.code) {
      detail = `${message} (${cause.code}${cause.message ? `: ${cause.message}` : ""})`;
    }
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
