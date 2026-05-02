/**
 * Diagnostic endpoint — returns sanitized info about the runtime so we can
 * confirm what the deployed Function actually sees. Returns NO secret values,
 * only env-var KEYS plus harmless host/CWD/runtime info. Still gated by
 * AUTH_SECRET to avoid information leakage.
 *
 * Delete after verifying the deploy is healthy.
 */
import { NextResponse } from "next/server";
import { dbKind, dbInitError } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret");
  const expected = process.env.AUTH_SECRET;
  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const interesting = [
    "DATABASE_URL",
    "NETLIFY_DATABASE_URL",
    "NETLIFY_DATABASE_URL_UNPOOLED",
    "AUTH_SECRET",
    "AUTH_TRUST_HOST",
    "IS_NETLIFY",
    "NETLIFY",
    "SITE_NAME",
    "URL",
    "DEPLOY_URL",
    "NEXT_PHASE",
    "NODE_ENV",
  ];
  const present: Record<string, boolean> = {};
  for (const k of interesting) present[k] = !!process.env[k];

  const dbHost = (() => {
    const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL ?? "";
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  })();

  // Sample of all env keys starting with NETLIFY_ or DATABASE_ so we discover
  // anything we forgot to ask about.
  const dbKeys = Object.keys(process.env)
    .filter((k) => /^(NETLIFY_|DATABASE_)/.test(k))
    .sort();

  return NextResponse.json({
    ok: true,
    runtime: process.version,
    cwd: process.cwd(),
    platform: process.platform,
    dbKind,
    dbInitError: dbInitError()?.message ?? null,
    dbHost,
    presentEnvKeys: present,
    discoveredDbEnvKeys: dbKeys,
  });
}
