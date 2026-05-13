import Link from "next/link";
import Image from "next/image";
import { count, eq, desc } from "drizzle-orm";
import {
  PlusCircle,
  ClipboardList,
  Users,
  Crown,
  Inbox,
  ArrowRight,
  Music2,
  PlayCircle,
  Film,
} from "lucide-react";
import { db } from "@/db";
import { challenges, performances, users } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatInstrument } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [
    [{ totalChallenges }],
    [{ activeChallenges }],
    [{ totalPerformances }],
    [{ verifiedPerformances }],
    [{ bestPerformers }],
    [{ totalStudents }],
    recentChallenges,
    recentSubmissions,
  ] = await Promise.all([
    db.select({ totalChallenges: count() }).from(challenges),
    db
      .select({ activeChallenges: count() })
      .from(challenges)
      .where(eq(challenges.status, "ACTIVE")),
    db.select({ totalPerformances: count() }).from(performances),
    db
      .select({ verifiedPerformances: count() })
      .from(performances)
      .where(eq(performances.isVerified, true)),
    db
      .select({ bestPerformers: count() })
      .from(performances)
      .where(eq(performances.isBestPerformer, true)),
    db.select({ totalStudents: count() }).from(users).where(eq(users.role, "STUDENT")),
    db.select().from(challenges).orderBy(desc(challenges.createdAt)).limit(5),
    // Recent student submissions — joined with student + challenge so the
    // dashboard surfaces uploaded videos directly (instead of forcing the
    // teacher to navigate to /admin/evaluate to confirm a submission landed).
    db
      .select({
        id: performances.id,
        title: performances.title,
        thumbnailUrl: performances.thumbnailUrl,
        videoProvider: performances.videoProvider,
        instrument: performances.instrument,
        status: performances.status,
        isVerified: performances.isVerified,
        isBestPerformer: performances.isBestPerformer,
        submittedAt: performances.submittedAt,
        student: { id: users.id, name: users.name, image: users.image },
        challenge: { id: challenges.id, title: challenges.title },
      })
      .from(performances)
      .innerJoin(users, eq(performances.studentId, users.id))
      .innerJoin(challenges, eq(performances.challengeId, challenges.id))
      .orderBy(desc(performances.submittedAt))
      .limit(8),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teacher dashboard</h1>
          <p className="text-muted-foreground">
            Post music challenges, watch performances, leave timestamped
            feedback, and crown Best Performers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/evaluate">
              <Inbox className="h-4 w-4" /> Evaluate
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/challenges/new">
              <PlusCircle className="h-4 w-4" /> New challenge
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ClipboardList className="h-5 w-5" />}
          label="Total challenges"
          value={totalChallenges}
          hint={`${activeChallenges} active`}
        />
        <StatCard
          icon={<Music2 className="h-5 w-5" />}
          label="Performances"
          value={totalPerformances}
          hint={`${verifiedPerformances} verified`}
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Students"
          value={totalStudents}
          hint="Active musicians"
        />
        <StatCard
          icon={<Crown className="h-5 w-5" />}
          label="Best Performers"
          value={bestPerformers}
          hint="Crowned this season"
        />
      </section>

      <section>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent challenges</CardTitle>
              <CardDescription>The five most recently created challenges.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/challenges">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentChallenges.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No challenges yet — create your first one.
              </p>
            ) : (
              <ul className="divide-y">
                {recentChallenges.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.title}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {formatDate(c.createdAt)}
                      </div>
                    </div>
                    <Badge
                      variant={
                        c.status === "ACTIVE"
                          ? "success"
                          : c.status === "DRAFT"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {c.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Film className="h-5 w-5 text-primary" /> Recent student submissions
              </CardTitle>
              <CardDescription>
                The eight most recent performances posted by students. Click any
                card to open the evaluation studio.
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/evaluate">
                Evaluate all <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentSubmissions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No student submissions yet — uploads will appear here as soon as
                a student posts a performance.
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {recentSubmissions.map((p) => (
                  <li key={p.id}>
                    <Link
                      href="/admin/evaluate"
                      className="group block overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md"
                      data-testid="admin-recent-submission"
                    >
                      <div className="relative aspect-video bg-muted">
                        {p.thumbnailUrl ? (
                          <Image
                            src={p.thumbnailUrl}
                            alt={p.title ?? "Performance thumbnail"}
                            fill
                            unoptimized
                            sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                            className="object-cover transition group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-muted-foreground">
                            <Music2 className="h-8 w-8" />
                          </div>
                        )}
                        <span className="absolute right-2 top-2">
                          <Badge
                            variant={
                              p.status === "PUBLISHED"
                                ? "success"
                                : p.status === "PENDING"
                                ? "secondary"
                                : "destructive"
                            }
                            className="text-[10px] uppercase"
                          >
                            {p.status.toLowerCase()}
                          </Badge>
                        </span>
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium shadow-sm">
                          <PlayCircle className="h-3 w-3" />
                          {p.videoProvider.toLowerCase()}
                        </span>
                      </div>
                      <div className="space-y-1.5 p-3">
                        <div className="truncate text-sm font-medium">
                          {p.title ?? "Untitled performance"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {p.student.name ?? "Anonymous"} ·{" "}
                          {formatInstrument(p.instrument)}
                        </div>
                        <div className="truncate text-xs uppercase tracking-wide text-primary">
                          {p.challenge.title}
                        </div>
                        <div className="flex items-center gap-1.5 pt-0.5 text-[10px] text-muted-foreground">
                          <span>{formatDate(p.submittedAt)}</span>
                          {p.isVerified && (
                            <Badge variant="outline" className="px-1 py-0 text-[9px]">
                              verified
                            </Badge>
                          )}
                          {p.isBestPerformer && (
                            <Badge variant="success" className="gap-0.5 px-1 py-0 text-[9px]">
                              <Crown className="h-2.5 w-2.5" /> best
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="text-2xl font-semibold">{value}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
