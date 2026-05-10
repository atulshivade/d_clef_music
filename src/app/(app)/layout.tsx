import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";

/**
 * Authenticated app shell. Anonymous visitors are bounced to /sign-in;
 * the role check (ADMIN-only routes) lives in `(app)/admin/layout.tsx`.
 *
 * `<main>` is intentionally edge-to-edge: pages render their content
 * inside `.band` strips so we get the alternating cream / ink / white
 * layout from the mobile-first reference design. Each band constrains
 * its inner column with `.band-inner` (or `.band-inner-wide`).
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
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
