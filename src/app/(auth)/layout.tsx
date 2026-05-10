import Link from "next/link";
import { redirect } from "next/navigation";
import { AudioLines } from "lucide-react";
import { auth } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Already signed in → no need to see sign-in / sign-up pages.
  const session = await auth();
  if (session?.user) redirect("/challenges");
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <AudioLines className="h-5 w-5" />
          </span>
          Shred Sound Music
        </Link>
        {children}
      </div>
    </div>
  );
}
