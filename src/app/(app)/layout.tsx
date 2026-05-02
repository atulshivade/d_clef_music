import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";

/**
 * Authenticated app shell. Anonymous visitors are bounced to /sign-in;
 * the role check (ADMIN-only routes) lives in `(app)/admin/layout.tsx`.
 *
 * This replaces the previous `proxy.ts` (Edge runtime) middleware so the
 * deploy doesn't need the @netlify/edge-bundler Deno toolchain.
 */
export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in?callbackUrl=/challenges");
  }
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
