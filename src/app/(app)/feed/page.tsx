import { and, desc, eq, inArray } from "drizzle-orm";
import { Crown, Music2, Sparkles, Filter } from "lucide-react";
import { db } from "@/db";
import {
  performances,
  performanceLikes,
  users,
  challenges,
} from "@/db/schema";
import type { Instrument, SkillLevel } from "@/db/schema";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { PerformanceCard } from "@/components/performance-card";
import { InstrumentIcon } from "@/components/instrument-icon";
import {
  formatInstrument,
  formatSkillLevel,
} from "@/lib/utils";
import {
  INSTRUMENT_VALUES,
  SKILL_LEVEL_VALUES,
} from "@/lib/validators";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string; skill?: string }>;
}) {
  const { instrument: instParam, skill: skillParam } = await searchParams;
  const instrumentFilter =
    instParam && (INSTRUMENT_VALUES as readonly string[]).includes(instParam)
      ? (instParam as Instrument)
      : null;
  const skillFilter =
    skillParam && (SKILL_LEVEL_VALUES as readonly string[]).includes(skillParam)
      ? (skillParam as SkillLevel)
      : null;

  const baseSelect = db
    .select({
      performance: performances,
      student: { id: users.id, name: users.name, image: users.image },
      challenge: { id: challenges.id, title: challenges.title },
    })
    .from(performances)
    .innerJoin(users, eq(performances.studentId, users.id))
    .innerJoin(challenges, eq(performances.challengeId, challenges.id));

  // Pull all PUBLISHED performances; do filtering in JS (small dataset, easy
  // to combine multiple optional filters without conditional `where` builders).
  const all = (
    await baseSelect
      .where(eq(performances.status, "PUBLISHED"))
      .orderBy(desc(performances.submittedAt))
  ).filter(
    (r) =>
      (!instrumentFilter || r.performance.instrument === instrumentFilter) &&
      (!skillFilter || r.performance.skillLevel === skillFilter),
  );

  const bestPerformers = all.filter((r) => r.performance.isBestPerformer);
  const rest = all.filter((r) => !r.performance.isBestPerformer);

  // Pre-compute which performances the viewer has already liked so the
  // <LikeButton> renders in the correct initial state without extra round-trips.
  const session = await auth();
  const viewerId = session?.user?.id;
  const visibleIds = all.map((r) => r.performance.id);
  const likedSet = new Set<string>();
  if (viewerId && visibleIds.length > 0) {
    const liked = await db
      .select({ performanceId: performanceLikes.performanceId })
      .from(performanceLikes)
      .where(
        and(
          eq(performanceLikes.userId, viewerId),
          inArray(performanceLikes.performanceId, visibleIds),
        ),
      );
    for (const l of liked) likedSet.add(l.performanceId);
  }

  const filterPath = (extra: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    if (instrumentFilter && extra.instrument === undefined)
      sp.set("instrument", instrumentFilter);
    if (skillFilter && extra.skill === undefined) sp.set("skill", skillFilter);
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    return qs ? `/feed?${qs}` : "/feed";
  };

  return (
    <>
      {/* Band 1 — Hero (cream) */}
      <section className="band band-cream pb-6">
        <div className="band-inner text-center">
          <span className="section-eyebrow">
            <Sparkles className="h-3 w-3" />
            Live performances
          </span>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
            Performance feed
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
            Hear what your peers are playing. Filter by instrument or skill
            level to find your tribe.
          </p>
        </div>
      </section>

      {/* Filters strip — still cream, sits between hero and gallery */}
      <section className="band-cream pb-12">
        <div className="band-inner-wide px-4 sm:px-6">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Filter className="h-4 w-4 text-primary" /> Filter
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Instrument
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <FilterChip
                    href={filterPath({ instrument: null })}
                    active={!instrumentFilter}
                  >
                    All
                  </FilterChip>
                  {INSTRUMENT_VALUES.map((inst) => (
                    <FilterChip
                      key={inst}
                      href={filterPath({ instrument: inst })}
                      active={instrumentFilter === inst}
                    >
                      <InstrumentIcon
                        instrument={inst as Instrument}
                        className="mr-1 h-3 w-3"
                      />
                      {formatInstrument(inst)}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Skill
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <FilterChip
                    href={filterPath({ skill: null })}
                    active={!skillFilter}
                  >
                    All
                  </FilterChip>
                  {SKILL_LEVEL_VALUES.map((sk) => (
                    <FilterChip
                      key={sk}
                      href={filterPath({ skill: sk })}
                      active={skillFilter === sk}
                    >
                      {formatSkillLevel(sk)}
                    </FilterChip>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Band 2 — Best Performer spotlight (ink) */}
      {bestPerformers.length > 0 && (
        <section className="band band-ink">
          <div className="band-inner-wide">
            <div className="text-center">
              <span className="section-eyebrow">Spotlight</span>
              <h2 className="mt-4 inline-flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                <Crown className="h-6 w-6 text-primary" />
                Best Performer spotlight
                <Badge variant="warning">{bestPerformers.length}</Badge>
              </h2>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {bestPerformers.slice(0, 6).map((r) => (
                <PerformanceCard
                  key={r.performance.id}
                  performance={r.performance}
                  student={r.student}
                  challenge={r.challenge}
                  likedByMe={likedSet.has(r.performance.id)}
                  canLike={!!viewerId}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Band 3 — All performances (white) */}
      <section className="band band-white">
        <div className="band-inner-wide">
          <div className="text-center">
            <span className="section-eyebrow">Latest takes</span>
            <h2 className="mt-4 inline-flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              <Music2 className="h-6 w-6 text-primary" />
              All performances
              <Badge variant="secondary">{rest.length}</Badge>
            </h2>
          </div>
          {all.length === 0 ? (
            <p className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-border bg-secondary/40 px-6 py-10 text-center text-sm text-muted-foreground">
              No performances yet — pick a challenge and be the first to perform.
            </p>
          ) : rest.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              All visible performances are featured above.
            </p>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((r) => (
                <PerformanceCard
                  key={r.performance.id}
                  performance={r.performance}
                  student={r.student}
                  challenge={r.challenge}
                  likedByMe={likedSet.has(r.performance.id)}
                  canLike={!!viewerId}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </a>
  );
}
