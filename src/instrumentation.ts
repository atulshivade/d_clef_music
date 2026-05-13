/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used to bring up PGlite (auto-apply schema migrations) and, in dev,
 * to optionally bypass TLS verification when the workstation sits behind
 * a corporate proxy that re-signs HTTPS traffic with its own root CA.
 */
export async function register() {
  // Skip during the edge runtime (proxy.ts) — we only want the Node server.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ── Optional: trust the local TLS chain even if it's a corp-proxy
  // self-signed cert. Without this, Node `fetch()` to api.cloudinary.com
  // (and any other outbound HTTPS) fails with SELF_SIGNED_CERT_IN_CHAIN
  // when the workstation is behind a re-signing MITM proxy. We refuse
  // the bypass in production so this is impossible to ship by accident.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_INSECURE_TLS === "true"
  ) {
    try {
      const { setGlobalDispatcher, Agent } = await import("undici");
      setGlobalDispatcher(
        new Agent({ connect: { rejectUnauthorized: false } }),
      );
      console.warn(
        "[tls] ⚠ ALLOW_INSECURE_TLS=true — outbound HTTPS verification is DISABLED for this dev process. Never enable in production.",
      );
    } catch (err) {
      console.warn("[tls] failed to install insecure dispatcher:", err);
    }
  }

  const { dbKind } = await import("./db");
  if (dbKind !== "pglite") return;

  const { applyMigrations } = await import("./db/migrate");
  await applyMigrations();
  console.log("[db] PGlite ready (.data/pgdata) — migrations applied.");
}
