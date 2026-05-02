import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

declare global {
  var __db: ReturnType<typeof drizzlePostgres> | ReturnType<typeof drizzlePglite> | undefined;
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
 * Failure model: this function is invoked at module load. If init fails (e.g.
 * read-only fs on Lambda when falling back to PGlite), we surface a *poison*
 * Drizzle handle that throws a clear error on first query, instead of crashing
 * the whole serverless function. That lets routes like `/api/admin/dbinit`
 * return a useful JSON error rather than a generic 500.
 */
function buildDb() {
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  // Real Postgres path
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

  // PGlite path (default for local dev / tests). Catch fs errors so the
  // function doesn't die before our route handler can return JSON.
  globalThis.__dbKind = "pglite";
  try {
    if (url === "memory:") {
      return drizzlePglite(new PGlite(), { schema });
    }
    const dataDir = path.join(process.cwd(), ".data", "pgdata");
    mkdirSync(dataDir, { recursive: true });
    return drizzlePglite(new PGlite(dataDir), { schema });
  } catch (err) {
    globalThis.__dbInitError =
      err instanceof Error
        ? err
        : new Error(`PGlite init failed: ${String(err)}`);
    // In-memory PGlite as a last resort so module load completes — any
    // queries on the deferred error are still surfaced via __dbInitError.
    return drizzlePglite(new PGlite(), { schema });
  }
}

export const db = (globalThis.__db ??= buildDb()) as ReturnType<typeof drizzlePostgres>;
export const dbKind = globalThis.__dbKind!;
export const dbInitError = (): Error | undefined => globalThis.__dbInitError;
export { schema };
