import { notFound } from "next/navigation";
import { eq, desc, and, inArray } from "drizzle-orm";
import { Calendar, Trophy, Music2, Crown, Upload } from "lucide-react";
import { db } from "@/db";
import {
  challenges,
  performances,
  performanceLikes,
  users,
} from "@/db/schema";
import type { Instrument } from "@/db/schema";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { PerformanceCard } from "@/components/performance-card";
import { PerformanceUploader } from "@/components/performance-uploader";
import { InstrumentIcon } from "@/components/instrument-icon";
import {
  formatRelativeDeadline,
  formatDate,
  formatInstrument,
  formatSkillLevel,
} from "@/lib/utils";
import { INSTRUMENT_VALUES } from "@/lib/validators";

export const dynamic = "force-dynamic";

export default async function ChallengeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ instrument?: string }>;
}) {
  const { id } = await params;
  const { instrument: filterParam } = await searchParams;
  const filterInstrument =
    filterParam &&
    (INSTRUMENT_VALUES as readonly string[]).includes(filterParam)
      ? (filterParam as Instrument)
      : null;
  const session = await auth();

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, id))
    .limit(1);

  if (!challenge) notFound();

  const where = filterInstrument
    ? and(
        eq(performances.challengeId, id),
        eq(performances.instrument, filterInstrument),
      )
    : eq(performances.challengeId, id);

  const subs = await db
    .select({
      performance: performances,
      student: { id: users.id, name: users.name, image: users.image },
    })
    .from(performances)
    .innerJoin(users, eq(performances.studentId, users.id))
    .where(where)
    .orderBy(desc(performances.isBestPerformer), desc(performances.submittedAt));

  // Distinct instruments present, used to render filter chips.
  const instrumentsPresent = Array.from(
    new Set(
      (
        await db
          .select({ instrument: performances.instrument })
          .from(performances)
          .where(eq(performances.challengeId, id))
      ).map((r) => r.instrument),
    ),
  ) as Instrument[];

  const deadlineLabel = formatRelativeDeadline(challenge.deadline);
  const closed = deadlineLabel === "Closed" || challenge.status !== "ACTIVE";
  const isAdmin = session?.user?.role === "ADMIN";
  const viewerId = session?.user?.id;
  const myOwn = viewerId
    ? subs.filter((s) => s.performance.studentId === viewerId)
    : [];
  const bestPerformers = subs.filter((s) => s.performance.isBestPerformer);
  const otherPerformances = subs.filter((s) => !s.performance.isBestPerformer);

  // Pre-compute the viewer's likes for the visible cards.
  const visibleIds = subs.map((s) => s.performance.id);
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

  return (
    <>
      {/* Band 1 — Hero (cream). 2-column at lg+. */}
      <section className="band band-cream">
        <div className="band-inner-wide band-split">
          <div className="text-center lg:text-left">
            <span className="section-eyebrow">{challenge.status.toLowerCase()} challenge</span>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {challenge.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <Badge variant={closed ? "secondary" : "success"}>{deadlineLabel}</Badge>
              <Badge variant="outline" className="gap-1">
                <Trophy className="h-3 w-3 text-primary" />
                {challenge.points} pts
              </Badge>
              {challenge.instrumentFocus && (
                <Badge variant="outline" className="gap-1">
                  <InstrumentIcon
                    instrument={challenge.instrumentFocus}
                    className="h-3 w-3"
                  />
                  {formatInstrument(challenge.instrumentFocus)}
                </Badge>
              )}
              {challenge.skillLevelTarget && (
                <Badge variant="secondary">
                  {formatSkillLevel(challenge.skillLevelTarget)}
                </Badge>
              )}
            </div>
            <p className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground lg:justify-start">
              <Calendar className="h-3.5 w-3.5" />
              Due{" "}
              {new Date(challenge.deadline).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              <span className="text-muted-foreground/60">·</span>
              Posted {formatDate(challenge.createdAt)}
            </p>
            <div className="mt-5 whitespace-pre-wrap text-left text-sm text-foreground/90 sm:text-base">
              {challenge.description}
            </div>
          </div>

          <div className="grid place-items-center">
            {challenge.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={challenge.coverImageUrl}
                alt=""
                className="aspect-[16/10] w-full max-w-md rounded-2xl object-cover shadow-[0_20px_60px_-30px_rgba(0,0,0,0.4)] lg:max-w-none"
              />
            ) : (
              <div className="aspect-[16/10] w-full max-w-md rounded-2xl bg-gradient-to-br from-primary/40 via-primary/15 to-primary/30 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.4)] lg:max-w-none" />
            )}
          </div>
        </div>
      </section>

      {/* Band 2 — Submit Your Video (ink). 2-column at lg+. */}
      {session?.user && !isAdmin && (
        <section className="band band-ink">
          <div className="band-inner-wide band-split">
            <div className="text-center lg:text-left">
              <span className="section-eyebrow">Open mic</span>
              <h2 className="mt-5 inline-flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                <Upload className="h-7 w-7 text-primary" />
                Submit Your Video
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink-foreground/70 sm:text-base lg:mx-0">
                {closed
                  ? "This challenge has closed. New performances are no longer accepted."
                  : myOwn.length > 0
                  ? "You've already posted — feel free to add another take."
                  : "Upload a video, or paste a YouTube / Vimeo link. Tag your instrument and skill so peers can find you."}
              </p>
            </div>

            {!closed && (
              <div className="form-card mx-auto w-full max-w-xl text-left lg:mx-0">
                <PerformanceUploader
                  challengeId={challenge.id}
                  defaults={{
                    instrument: challenge.instrumentFocus,
                    skillLevel: challenge.skillLevelTarget,
                  }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Band 3 — Previous Submissions (white) */}
      <section className="band band-white">
        <div className="band-inner-wide">
          <div className="text-center">
            <span className="section-eyebrow">Previous submissions</span>
            <h2 className="mt-4 inline-flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              <Music2 className="h-6 w-6 text-primary" />
              Performances
              <Badge variant="secondary">{subs.length}</Badge>
            </h2>
          </div>

          {instrumentsPresent.length > 1 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
              <FilterChip href={`/challenges/${id}`} active={!filterInstrument}>
                All
              </FilterChip>
              {instrumentsPresent.map((inst) => (
                <FilterChip
                  key={inst}
                  href={`/challenges/${id}?instrument=${inst}`}
                  active={filterInstrument === inst}
                >
                  <InstrumentIcon instrument={inst} className="mr-1 h-3 w-3" />
                  {formatInstrument(inst)}
                </FilterChip>
              ))}
            </div>
          )}

          {otherPerformances.length === 0 && bestPerformers.length === 0 ? (
            <p className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-border bg-secondary/40 px-6 py-10 text-center text-sm text-muted-foreground">
              {filterInstrument
                ? `No ${formatInstrument(filterInstrument)} performances yet.`
                : "Be the first to perform."}
            </p>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {otherPerformances.map((s) => (
                <PerformanceCard
                  key={s.performance.id}
                  performance={s.performance}
                  student={s.student}
                  challenge={{ id: challenge.id, title: challenge.title }}
                  likedByMe={likedSet.has(s.performance.id)}
                  canLike={!!viewerId}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Band 4 — Featured / Best Performers (ink) */}
      {bestPerformers.length > 0 && (
        <section className="band band-ink">
          <div className="band-inner-wide">
            <div className="text-center">
              <span className="section-eyebrow">Spotlight</span>
              <h2 className="mt-4 inline-flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                <Crown className="h-6 w-6 text-primary" />
                Best performers
                <Badge variant="warning">{bestPerformers.length}</Badge>
              </h2>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {bestPerformers.map((s) => (
                <PerformanceCard
                  key={s.performance.id}
                  performance={s.performance}
                  student={s.student}
                  challenge={{ id: challenge.id, title: challenge.title }}
                  likedByMe={likedSet.has(s.performance.id)}
                  canLike={!!viewerId}
                />
              ))}
            </div>
          </div>
        </section>
      )}
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
