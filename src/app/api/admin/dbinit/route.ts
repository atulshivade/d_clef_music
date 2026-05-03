/**
 * One-shot bootstrap route — applies the schema (idempotent CREATE IF NOT
 * EXISTS / DO blocks) and seeds demo data on a freshly-provisioned managed
 * Postgres (Netlify DB / Neon / Supabase).
 *
 * Why this exists
 * ---------------
 * The author's machine sits behind a corporate proxy whose self-signed cert
 * chain breaks every CLI path that wants to reach the production DB
 * (`netlify database connect`, direct `psql`, drizzle-kit push). To avoid
 * leaking credentials and to make the deploy fully reproducible, the
 * bootstrap runs inside the deployed Netlify Function, where
 * `NETLIFY_DATABASE_URL` is auto-injected and the upstream network works.
 *
 * Auth: `?secret=<AUTH_SECRET>` must match the env var. The route is
 * idempotent — calling it twice is safe (it skips already-seeded rows and
 * uses CREATE IF NOT EXISTS for DDL).
 *
 * Usage:
 *   GET https://djmusic-challenge.netlify.app/api/admin/dbinit?secret=...
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, challenges, performances } from "@/db/schema";
import type { Instrument, SkillLevel } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEMO_PASSWORD = "Password123";

/**
 * The schema, expressed as idempotent statements. Mirrors
 * drizzle/0000_encore_initial.sql but uses CREATE TYPE … IF NOT EXISTS
 * (via DO blocks) and CREATE TABLE IF NOT EXISTS so it can be re-run
 * safely on an existing DB. We inline it (rather than reading the .sql
 * file from disk) so we don't depend on Next.js's outputFileTracing
 * picking up the drizzle/ folder.
 */
const SCHEMA_STATEMENTS: string[] = [
  // Enums
  `DO $$ BEGIN
     CREATE TYPE "public"."challenge_status" AS ENUM('DRAFT','ACTIVE','CLOSED','ARCHIVED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."instrument" AS ENUM('ACOUSTIC_GUITAR','ELECTRIC_GUITAR','BASS_GUITAR','KEYBOARD','PIANO','SYNTHESIZER','DRUMS','VOCALS','VIOLIN','FLUTE','SAXOPHONE','OTHER');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."performance_status" AS ENUM('PENDING','PUBLISHED','REJECTED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."skill_level" AS ENUM('BEGINNER','INTERMEDIATE','ADVANCED','PRO');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."user_role" AS ENUM('ADMIN','STUDENT');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."video_provider" AS ENUM('LOCAL','BUNNY','VIMEO','EMBED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // Tables
  `CREATE TABLE IF NOT EXISTS "user" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "name" text,
     "email" text NOT NULL,
     "emailVerified" timestamp,
     "image" text,
     "password_hash" text,
     "role" "user_role" DEFAULT 'STUDENT' NOT NULL,
     "primary_instrument" "instrument",
     "skill_level" "skill_level",
     "bio" text,
     "points" integer DEFAULT 0 NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "account" (
     "userId" uuid NOT NULL,
     "type" text NOT NULL,
     "provider" text NOT NULL,
     "providerAccountId" text NOT NULL,
     "refresh_token" text,
     "access_token" text,
     "expires_at" integer,
     "token_type" text,
     "scope" text,
     "id_token" text,
     "session_state" text,
     CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
   )`,
  `CREATE TABLE IF NOT EXISTS "session" (
     "sessionToken" text PRIMARY KEY NOT NULL,
     "userId" uuid NOT NULL,
     "expires" timestamp NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "verificationToken" (
     "identifier" text NOT NULL,
     "token" text NOT NULL,
     "expires" timestamp NOT NULL,
     CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
   )`,
  `CREATE TABLE IF NOT EXISTS "challenge" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "title" text NOT NULL,
     "description" text NOT NULL,
     "cover_image_url" text,
     "deadline" timestamp NOT NULL,
     "status" "challenge_status" DEFAULT 'ACTIVE' NOT NULL,
     "points" integer DEFAULT 100 NOT NULL,
     "instrument_focus" "instrument",
     "skill_level_target" "skill_level",
     "created_by_id" uuid NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL,
     "updated_at" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "performance" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "challenge_id" uuid NOT NULL,
     "student_id" uuid NOT NULL,
     "title" text,
     "caption" text,
     "instrument" "instrument" NOT NULL,
     "skill_level" "skill_level" NOT NULL,
     "video_provider" "video_provider" DEFAULT 'LOCAL' NOT NULL,
     "video_url" text NOT NULL,
     "video_external_id" text,
     "video_duration_seconds" integer,
     "thumbnail_url" text,
     "status" "performance_status" DEFAULT 'PUBLISHED' NOT NULL,
     "is_verified" boolean DEFAULT false NOT NULL,
     "is_best_performer" boolean DEFAULT false NOT NULL,
     "likes_count" integer DEFAULT 0 NOT NULL,
     "submitted_at" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "feedback" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "performance_id" uuid NOT NULL,
     "teacher_id" uuid NOT NULL,
     "note" text NOT NULL,
     "timestamp_sec" integer,
     "rhythm_score" integer,
     "technique_score" integer,
     "musicality_score" integer,
     "is_private" boolean DEFAULT true NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "performance_like" (
     "performance_id" uuid NOT NULL,
     "user_id" uuid NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL,
     CONSTRAINT "performance_like_performance_id_user_id_pk" PRIMARY KEY("performance_id","user_id")
   )`,
  `CREATE TABLE IF NOT EXISTS "top_performer" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "performance_id" uuid NOT NULL,
     "challenge_id" uuid NOT NULL,
     "selected_by_id" uuid NOT NULL,
     "reason" text,
     "period" text DEFAULT 'CHALLENGE' NOT NULL,
     "selected_at" timestamp DEFAULT now() NOT NULL
   )`,

  // Foreign keys (idempotent — wrap each in DO with EXCEPTION on duplicate_object)
  `DO $$ BEGIN
     ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "challenge" ADD CONSTRAINT "challenge_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "performance" ADD CONSTRAINT "performance_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "performance" ADD CONSTRAINT "performance_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "feedback" ADD CONSTRAINT "feedback_performance_id_performance_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performance"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "feedback" ADD CONSTRAINT "feedback_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE restrict;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "performance_like" ADD CONSTRAINT "performance_like_performance_id_performance_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performance"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "performance_like" ADD CONSTRAINT "performance_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "top_performer" ADD CONSTRAINT "top_performer_performance_id_performance_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performance"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "top_performer" ADD CONSTRAINT "top_performer_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "top_performer" ADD CONSTRAINT "top_performer_selected_by_id_user_id_fk" FOREIGN KEY ("selected_by_id") REFERENCES "public"."user"("id") ON DELETE restrict;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // Indexes
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" USING btree ("email")`,
  `CREATE INDEX IF NOT EXISTS "challenge_status_idx" ON "challenge" USING btree ("status")`,
  `CREATE INDEX IF NOT EXISTS "challenge_deadline_idx" ON "challenge" USING btree ("deadline")`,
  `CREATE INDEX IF NOT EXISTS "challenge_instrument_idx" ON "challenge" USING btree ("instrument_focus")`,
  `CREATE INDEX IF NOT EXISTS "performance_challenge_idx" ON "performance" USING btree ("challenge_id")`,
  `CREATE INDEX IF NOT EXISTS "performance_student_idx" ON "performance" USING btree ("student_id")`,
  `CREATE INDEX IF NOT EXISTS "performance_instrument_idx" ON "performance" USING btree ("instrument")`,
  `CREATE INDEX IF NOT EXISTS "performance_skill_idx" ON "performance" USING btree ("skill_level")`,
  `CREATE INDEX IF NOT EXISTS "performance_best_idx" ON "performance" USING btree ("is_best_performer")`,
  `CREATE INDEX IF NOT EXISTS "feedback_performance_idx" ON "feedback" USING btree ("performance_id")`,
  `CREATE INDEX IF NOT EXISTS "feedback_teacher_idx" ON "feedback" USING btree ("teacher_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "top_performer_performance_unique" ON "top_performer" USING btree ("performance_id")`,
  `CREATE INDEX IF NOT EXISTS "top_performer_challenge_idx" ON "top_performer" USING btree ("challenge_id")`,
];

async function applySchema(): Promise<number> {
  let n = 0;
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.execute(sql.raw(stmt));
    n++;
  }
  return n;
}

async function upsertUser(args: {
  name: string;
  email: string;
  role: "ADMIN" | "STUDENT";
  primaryInstrument?: Instrument;
  skillLevel?: SkillLevel;
}) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, args.email))
    .limit(1);
  if (existing) return existing;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const [created] = await db
    .insert(users)
    .values({
      name: args.name,
      email: args.email,
      role: args.role,
      passwordHash,
      primaryInstrument: args.primaryInstrument ?? null,
      skillLevel: args.skillLevel ?? null,
    })
    .returning();
  return created!;
}

async function seedIfEmpty() {
  const summary = {
    teacher: false,
    students: 0,
    challengesInsertedNow: 0,
    performancesInsertedNow: 0,
  };
  const teacher = await upsertUser({
    name: "Ms. Maya Rao",
    email: "admin@portal.dev",
    role: "ADMIN",
  });
  summary.teacher = true;
  const alex = await upsertUser({
    name: "Alex Singh",
    email: "alex@portal.dev",
    role: "STUDENT",
    primaryInstrument: "ACOUSTIC_GUITAR",
    skillLevel: "INTERMEDIATE",
  });
  const riya = await upsertUser({
    name: "Riya Patel",
    email: "riya@portal.dev",
    role: "STUDENT",
    primaryInstrument: "PIANO",
    skillLevel: "ADVANCED",
  });
  summary.students = 2;

  const existing = await db.select({ id: challenges.id }).from(challenges);
  if (existing.length > 0) return summary;

  const inserted = await db
    .insert(challenges)
    .values([
      {
        title: "Cover the riff: Sweet Child O' Mine (intro)",
        description:
          "Play the iconic opening riff. Focus on alternate picking and let each note ring. 30–60 seconds is enough.",
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        points: 200,
        instrumentFocus: "ELECTRIC_GUITAR",
        skillLevelTarget: "INTERMEDIATE",
        createdById: teacher.id,
        status: "ACTIVE",
      },
      {
        title: "Chopin Prelude in E minor — first 16 bars",
        description:
          "Bring out the melodic line over the descending chords. Watch the dynamics. 60–90 seconds.",
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        points: 250,
        instrumentFocus: "PIANO",
        skillLevelTarget: "ADVANCED",
        createdById: teacher.id,
        status: "ACTIVE",
      },
      {
        title: "Synth pad + lead — original 30-second loop",
        description:
          "Build a 30-second loop with one pad and one lead. Any synth, any DAW. Show your patch and play live on top.",
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        points: 150,
        instrumentFocus: "SYNTHESIZER",
        skillLevelTarget: "BEGINNER",
        createdById: teacher.id,
        status: "ACTIVE",
      },
    ])
    .returning();
  summary.challengesInsertedNow = inserted.length;

  const guitarChallenge = inserted[0]!;
  const pianoChallenge = inserted[1]!;
  await db.insert(performances).values([
    {
      challengeId: guitarChallenge.id,
      studentId: alex.id,
      title: "First take — opening riff",
      caption: "A bit nervous on the bend, would love feedback.",
      instrument: "ELECTRIC_GUITAR",
      skillLevel: "INTERMEDIATE",
      videoProvider: "EMBED",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      status: "PUBLISHED",
    },
    {
      challengeId: pianoChallenge.id,
      studentId: riya.id,
      title: "Chopin — slow tempo",
      caption: "Working the dynamics. Take 3.",
      instrument: "PIANO",
      skillLevel: "ADVANCED",
      videoProvider: "EMBED",
      videoUrl: "https://player.vimeo.com/video/76979871",
      status: "PUBLISHED",
      isVerified: true,
      isBestPerformer: true,
    },
  ]);
  summary.performancesInsertedNow = 2;
  return summary;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret");
  const expected = process.env.AUTH_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "AUTH_SECRET not configured" },
      { status: 500 },
    );
  }
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  try {
    const dbUrl =
      process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL ?? process.env.NETLIFY_DB_URL ?? "";
    const dbHost = (() => {
      try {
        return new URL(dbUrl).host;
      } catch {
        return "(none)";
      }
    })();

    const ddlStatements = await applySchema();
    const seedSummary = await seedIfEmpty();

    return NextResponse.json({
      ok: true,
      tookMs: Date.now() - startedAt,
      dbHost,
      ddlStatements,
      seed: seedSummary,
      demoLogins: {
        teacher: { email: "admin@portal.dev", password: DEMO_PASSWORD },
        students: [
          { email: "alex@portal.dev", password: DEMO_PASSWORD },
          { email: "riya@portal.dev", password: DEMO_PASSWORD },
        ],
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        tookMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
