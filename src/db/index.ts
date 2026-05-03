import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __db: ReturnType<typeof drizzlePostgres> | undefined;
  var __dbKind: "postgres" | "pglite" | undefined;
  var __dbInitError: Error | undefined;
}

const FALLBACK_BUILD_URL = "postgresql://invalid:invalid@127.0.0.1:1/invalid";

/**
 * Picks a database backend based on env:
 *
 * - `DATABASE_URL=postgresql://…`           → real Postgres via `postgres-js`.
 * - `NETLIFY_DATABASE_URL=postgresql://…`   → same, auto-injected by Netlify DB
 *                                             (managed Neon Postgres) at runtime.
 * - missing / empty                         → embedded **PGlite** persisted to
 *                                             `./.data/pgdata` (zero-install
 *                                             local dev — same SQL dialect).
 * - `DATABASE_URL=memory:`                  → ephemeral in-memory PGlite (tests).
 *
 * Reused across HMR via `globalThis` to avoid pool exhaustion.
 *
 * Note: PGlite is loaded via `require()` inside `buildPgliteSync()` so it never
 * reaches the production server bundle. The OpenNext / Netlify Function packager
 * was including the PGlite WASM binary in the deploy and crashing the Lambda
 * cold start. By keeping the require() out of the static import graph, the
 * Netlify build doesn't pull PGlite in — and at runtime on Netlify the
 * postgres-js path always wins (NETLIFY_DATABASE_URL is set).
 */
function buildPgliteSync():
  | ReturnType<typeof drizzlePostgres>
  | null {
  try {
    const { mkdirSync } = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const { drizzle: drizzlePglite } =
      require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
    const { PGlite } =
      require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");

    const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL ?? process.env.NETLIFY_DB_URL;
    if (url === "memory:") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return drizzlePglite(new PGlite() as any, { schema }) as unknown as ReturnType<typeof drizzlePostgres>;
    }
    const dataDir = path.join(process.cwd(), ".data", "pgdata");
    mkdirSync(dataDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return drizzlePglite(new PGlite(dataDir) as any, { schema }) as unknown as ReturnType<typeof drizzlePostgres>;
  } catch (err) {
    globalThis.__dbInitError =
      err instanceof Error ? err : new Error(String(err));
    return null;
  }
}

function buildDb(): ReturnType<typeof drizzlePostgres> {
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL ?? process.env.NETLIFY_DB_URL;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  // Real Postgres path — preferred whenever a URL is set.
  if (url && url.startsWith("postgres")) {
    globalThis.__dbKind = "postgres";
    const client = postgres(url, { max: 10, prepare: false });
    return drizzlePostgres(client, { schema });
  }

  // During `next build` with no DB configured, return a benign no-op postgres
  // proxy so module evaluation succeeds. Real queries at request time will
  // surface a proper connection error.
  if (isBuildPhase && !url) {
    globalThis.__dbKind = "postgres";
    return drizzlePostgres(postgres(FALLBACK_BUILD_URL, { max: 1, prepare: false }), {
      schema,
    });
  }

  // PGlite path (local dev / tests). Loaded via require() so it stays out of
  // the production server bundle.
  globalThis.__dbKind = "pglite";
  const pglite = buildPgliteSync();
  if (pglite) return pglite;

  // Final fallback — a postgres-js handle to an unreachable URL. Keeps module
  // load successful; any real query will fail loudly with the captured
  // dbInitError, which our /api/admin/dbinit and /api/admin/debug routes
  // surface as JSON instead of crashing the function.
  globalThis.__dbKind = "postgres";
  return drizzlePostgres(postgres(FALLBACK_BUILD_URL, { max: 1, prepare: false }), {
    schema,
  });
}

export const db = (globalThis.__db ??= buildDb());
export const dbKind = globalThis.__dbKind!;
export const dbInitError = (): Error | undefined => globalThis.__dbInitError;
export { schema };
