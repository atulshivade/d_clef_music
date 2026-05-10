import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep PGlite (and its WASM data file) out of Turbopack's static bundling
  // graph. Turbopack rewrites `import.meta.url` to a placeholder root which
  // breaks PGlite's runtime data file resolution. By marking it as a server-
  // external package, Node's native resolver loads it at runtime instead.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "drizzle-orm",
  ],
};

export default nextConfig;
