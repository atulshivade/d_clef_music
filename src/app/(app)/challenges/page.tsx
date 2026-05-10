import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { challenges } from "@/db/schema";
import { ChallengeCard } from "@/components/challenge-card";
import { Trophy, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  const active = await db
    .select()
    .from(challenges)
    .where(eq(challenges.status, "ACTIVE"))
    .orderBy(desc(challenges.createdAt));

  return (
    <>
      {/* Hero band */}
      <section className="band band-cream">
        <div className="band-inner text-center">
          <span className="section-eyebrow">
            <Sparkles className="h-3 w-3" />
            Live now
          </span>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
            Active challenges
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
            Pick a challenge, build something brilliant, and ship it before the deadline.
          </p>
        </div>
      </section>

      {/* Gallery band */}
      <section className="band band-white pt-6">
        <div className="band-inner-wide">
          {active.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((c) => (
                <Link key={c.id} href={`/challenges/${c.id}`}>
                  <ChallengeCard challenge={c} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto grid max-w-md place-items-center rounded-2xl border border-dashed border-border bg-secondary/40 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
        <Trophy className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">No active challenges yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Check back soon — your team is cooking up the next one.
      </p>
    </div>
  );
}
