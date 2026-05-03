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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
