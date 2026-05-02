/**
 * Diagnostic — zero imports beyond NextResponse. If this 500s, the entire
 * Netlify Function is broken at the platform level, not in our app code.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    pid: process.pid,
    node: process.version,
    cwd: process.cwd(),
    fnDir: __dirname,
  });
}
