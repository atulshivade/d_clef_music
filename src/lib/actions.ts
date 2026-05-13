"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  performances,
  performanceLikes,
  feedback,
  topPerformers,
  challenges,
  users,
} from "@/db/schema";
import { auth, requireAdmin } from "@/lib/auth";
import {
  createPerformanceSchema,
  createFeedbackSchema,
  togglePerformanceFlagSchema,
  setPerformanceStatusSchema,
} from "@/lib/validators";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

/* --------------------------- Likes --------------------------- */

export async function togglePerformanceLikeAction(
  performanceId: string,
): Promise<
  | { ok: true; liked: boolean; likesCount: number }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to like" };
  if (typeof performanceId !== "string" || performanceId.length < 8) {
    return { ok: false, error: "Invalid performance" };
  }

  // Confirm the performance exists before mutating the like table — also
  // gives us the challenge id we need for revalidation later.
  const [perf] = await db
    .select({ id: performances.id, challengeId: performances.challengeId })
    .from(performances)
    .where(eq(performances.id, performanceId))
    .limit(1);
  if (!perf) return { ok: false, error: "Performance not found" };

  const [existing] = await db
    .select()
    .from(performanceLikes)
    .where(
      and(
        eq(performanceLikes.performanceId, performanceId),
        eq(performanceLikes.userId, session.user.id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(performanceLikes)
      .where(
        and(
          eq(performanceLikes.performanceId, performanceId),
          eq(performanceLikes.userId, session.user.id),
        ),
      );
    // Clamp to >= 0 in case the counter ever drifted out of sync.
    const [updated] = await db
      .update(performances)
      .set({
        likesCount: sql`GREATEST(${performances.likesCount} - 1, 0)`,
      })
      .where(eq(performances.id, performanceId))
      .returning({ likesCount: performances.likesCount });

    revalidatePath("/feed");
    revalidatePath(`/challenges/${perf.challengeId}`);
    return { ok: true, liked: false, likesCount: updated?.likesCount ?? 0 };
  }

  await db.insert(performanceLikes).values({
    performanceId,
    userId: session.user.id,
  });
  const [updated] = await db
    .update(performances)
    .set({ likesCount: sql`${performances.likesCount} + 1` })
    .where(eq(performances.id, performanceId))
    .returning({ likesCount: performances.likesCount });

  revalidatePath("/feed");
  revalidatePath(`/challenges/${perf.challengeId}`);
  return { ok: true, liked: true, likesCount: updated?.likesCount ?? 1 };
}

/* --------------------------- Performances --------------------------- */

export async function createPerformanceAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to submit" };

  const parsed = createPerformanceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, parsed.data.challengeId))
    .limit(1);

  if (!challenge) return { ok: false, error: "Challenge not found" };
  if (challenge.status !== "ACTIVE") {
    return { ok: false, error: "Challenge is not accepting submissions" };
  }
  if (new Date(challenge.deadline).getTime() <= Date.now()) {
    return { ok: false, error: "Deadline has passed" };
  }

  await db.insert(performances).values({
    challengeId: parsed.data.challengeId,
    studentId: session.user.id,
    title: parsed.data.title || null,
    caption: parsed.data.caption || null,
    instrument: parsed.data.instrument,
    skillLevel: parsed.data.skillLevel,
    videoProvider: parsed.data.videoProvider,
    videoUrl: parsed.data.videoUrl,
    videoExternalId: parsed.data.videoExternalId || null,
    videoDurationSeconds: parsed.data.videoDurationSeconds ?? null,
    thumbnailUrl: parsed.data.thumbnailUrl || null,
    status: "PUBLISHED",
  });

  revalidatePath(`/challenges/${parsed.data.challengeId}`);
  revalidatePath("/feed");
  // Teachers expect the dashboard + evaluation studio to update the moment
  // a student posts a video — without a hard refresh.
  revalidatePath("/admin");
  revalidatePath("/admin/evaluate");
  return { ok: true };
}

/* --------------------------- Feedback --------------------------- */

export async function createFeedbackAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = createFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  await db.insert(feedback).values({
    performanceId: parsed.data.performanceId,
    teacherId: session.user.id,
    note: parsed.data.note,
    timestampSec: parsed.data.timestampSec ?? null,
    rhythmScore: parsed.data.rhythmScore ?? null,
    techniqueScore: parsed.data.techniqueScore ?? null,
    musicalityScore: parsed.data.musicalityScore ?? null,
    isPrivate: parsed.data.isPrivate ?? true,
  });

  revalidatePath("/admin/evaluate");
  return { ok: true };
}

/* --------------------------- Verify / Crown --------------------------- */

export async function togglePerformanceFlagAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = togglePerformanceFlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const [current] = await db
    .select()
    .from(performances)
    .where(eq(performances.id, parsed.data.performanceId))
    .limit(1);
  if (!current) return { ok: false, error: "Performance not found" };

  const nextVerified =
    parsed.data.isVerified !== undefined
      ? parsed.data.isVerified
      : current.isVerified;
  const nextBest =
    parsed.data.isBestPerformer !== undefined
      ? parsed.data.isBestPerformer
      : current.isBestPerformer;

  await db
    .update(performances)
    .set({ isVerified: nextVerified, isBestPerformer: nextBest })
    .where(eq(performances.id, parsed.data.performanceId));

  // Best Performer was just turned on → record an explicit top_performer pick
  // (audit trail), and award the challenge points to the student.
  if (nextBest && !current.isBestPerformer) {
    const [challenge] = await db
      .select({ id: challenges.id, points: challenges.points })
      .from(challenges)
      .where(eq(challenges.id, current.challengeId))
      .limit(1);
    if (challenge) {
      await db
        .insert(topPerformers)
        .values({
          performanceId: current.id,
          challengeId: challenge.id,
          selectedById: session.user.id,
          period: "CHALLENGE",
        })
        .onConflictDoNothing();

      const [student] = await db
        .select({ points: users.points })
        .from(users)
        .where(eq(users.id, current.studentId))
        .limit(1);
      if (student) {
        await db
          .update(users)
          .set({ points: student.points + challenge.points })
          .where(eq(users.id, current.studentId));
      }
    }
  } else if (!nextBest && current.isBestPerformer) {
    await db
      .delete(topPerformers)
      .where(eq(topPerformers.performanceId, current.id));
  }

  revalidatePath("/admin/evaluate");
  revalidatePath(`/challenges/${current.challengeId}`);
  revalidatePath("/feed");
  return { ok: true };
}

export async function setPerformanceStatusAction(
  input: unknown,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = setPerformanceStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const [current] = await db
    .select({ challengeId: performances.challengeId })
    .from(performances)
    .where(eq(performances.id, parsed.data.performanceId))
    .limit(1);
  if (!current) return { ok: false, error: "Performance not found" };

  await db
    .update(performances)
    .set({ status: parsed.data.status })
    .where(eq(performances.id, parsed.data.performanceId));

  revalidatePath("/admin/evaluate");
  revalidatePath(`/challenges/${current.challengeId}`);
  revalidatePath("/feed");
  return { ok: true };
}
