import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  integer,
  boolean,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

/* ------------------------------------------------------------------ */
/* Enums                                                              */
/* ------------------------------------------------------------------ */

// In the music portal, ADMIN is the Teacher persona — kept as ADMIN in the
// enum so role checks in `proxy.ts` / Auth.js stay stable; the UI labels it
// as "Teacher".
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "STUDENT"]);

export const challengeStatusEnum = pgEnum("challenge_status", [
  "DRAFT",
  "ACTIVE",
  "CLOSED",
  "ARCHIVED",
]);

export const instrumentEnum = pgEnum("instrument", [
  "ACOUSTIC_GUITAR",
  "ELECTRIC_GUITAR",
  "BASS_GUITAR",
  "KEYBOARD",
  "PIANO",
  "SYNTHESIZER",
  "DRUMS",
  "VOCALS",
  "VIOLIN",
  "FLUTE",
  "SAXOPHONE",
  "OTHER",
]);

export const skillLevelEnum = pgEnum("skill_level", [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "PRO",
]);

export const videoProviderEnum = pgEnum("video_provider", [
  "LOCAL",      // file in our own storage (dev)
  "BUNNY",      // Bunny.net Stream
  "VIMEO",      // Vimeo
  "CLOUDINARY", // Cloudinary — managed video pipeline w/ adaptive streaming
  "EMBED",      // generic external embed (YouTube, etc.)
]);

export const performanceStatusEnum = pgEnum("performance_status", [
  "PENDING",
  "PUBLISHED",
  "REJECTED",
]);

/* ------------------------------------------------------------------ */
/* Auth.js core tables                                                */
/* (Required by @auth/drizzle-adapter — names matched to its defaults) */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "user",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("STUDENT"),
    // Music profile
    primaryInstrument: instrumentEnum("primary_instrument"),
    skillLevel: skillLevelEnum("skill_level"),
    bio: text("bio"),
    // Gamification
    points: integer("points").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [uniqueIndex("user_email_unique").on(t.email)],
);

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ------------------------------------------------------------------ */
/* Domain tables                                                       */
/* ------------------------------------------------------------------ */

/**
 * A challenge is a brief posted by a teacher: e.g. "Cover the riff in
 * Sweet Child O' Mine — under 90 seconds." Students submit performances
 * against it.
 */
export const challenges = pgTable(
  "challenge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    coverImageUrl: text("cover_image_url"),
    deadline: timestamp("deadline", { mode: "date" }).notNull(),
    status: challengeStatusEnum("status").notNull().default("ACTIVE"),
    points: integer("points").notNull().default(100),
    // Optional brief constraints — UI uses these as filters / hints.
    instrumentFocus: instrumentEnum("instrument_focus"),
    skillLevelTarget: skillLevelEnum("skill_level_target"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("challenge_status_idx").on(t.status),
    index("challenge_deadline_idx").on(t.deadline),
    index("challenge_instrument_idx").on(t.instrumentFocus),
  ],
);

/**
 * A performance is a student's video submission for a challenge.
 * Always video-centric — `videoUrl` is the playable URL, while
 * `videoProvider` + `videoExternalId` let us swap delivery backends
 * (Bunny.net, Vimeo) without losing the row's identity.
 */
export const performances = pgTable(
  "performance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title"),
    caption: text("caption"),

    // Music tagging
    instrument: instrumentEnum("instrument").notNull(),
    skillLevel: skillLevelEnum("skill_level").notNull(),

    // Video delivery
    videoProvider: videoProviderEnum("video_provider").notNull().default("LOCAL"),
    videoUrl: text("video_url").notNull(), // playback URL (HLS/MP4/embed src)
    videoExternalId: text("video_external_id"), // provider-specific id (Bunny GUID, Vimeo id)
    videoDurationSeconds: integer("video_duration_seconds"),
    thumbnailUrl: text("thumbnail_url"),

    // Moderation + curation
    status: performanceStatusEnum("status").notNull().default("PUBLISHED"),
    isVerified: boolean("is_verified").notNull().default(false), // teacher's quality stamp
    isBestPerformer: boolean("is_best_performer").notNull().default(false),

    likesCount: integer("likes_count").notNull().default(0),
    submittedAt: timestamp("submitted_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("performance_challenge_idx").on(t.challengeId),
    index("performance_student_idx").on(t.studentId),
    index("performance_instrument_idx").on(t.instrument),
    index("performance_skill_idx").on(t.skillLevel),
    index("performance_best_idx").on(t.isBestPerformer),
  ],
);

/**
 * Teacher feedback on a performance. Notes can be timestamped to a
 * specific moment in the video ("watch your wrist at 0:42"). Multi-axis
 * scoring captures the music-pedagogy criteria explicitly.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    performanceId: uuid("performance_id")
      .notNull()
      .references(() => performances.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    note: text("note").notNull(),
    timestampSec: integer("timestamp_sec"), // null = general note, set = timestamped
    rhythmScore: integer("rhythm_score"), // 0-10
    techniqueScore: integer("technique_score"), // 0-10
    musicalityScore: integer("musicality_score"), // 0-10
    isPrivate: boolean("is_private").notNull().default(true), // private = teacher-only
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("feedback_performance_idx").on(t.performanceId),
    index("feedback_teacher_idx").on(t.teacherId),
  ],
);

/**
 * Curated "Best Performer" picks. Backed by a join table so we keep an
 * audit trail (who selected, when, why) and can run multiple selections
 * across periods (week / month / all-time).
 */
export const topPerformers = pgTable(
  "top_performer",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    performanceId: uuid("performance_id")
      .notNull()
      .references(() => performances.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    selectedById: uuid("selected_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason"),
    period: text("period").notNull().default("CHALLENGE"), // CHALLENGE | WEEK | MONTH | ALLTIME
    selectedAt: timestamp("selected_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("top_performer_performance_unique").on(t.performanceId),
    index("top_performer_challenge_idx").on(t.challengeId),
  ],
);

export const performanceLikes = pgTable(
  "performance_like",
  {
    performanceId: uuid("performance_id")
      .notNull()
      .references(() => performances.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.performanceId, t.userId] })],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  challengesCreated: many(challenges),
  performances: many(performances),
  feedback: many(feedback),
  likes: many(performanceLikes),
}));

export const challengesRelations = relations(challenges, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [challenges.createdById],
    references: [users.id],
  }),
  performances: many(performances),
  topPerformers: many(topPerformers),
}));

export const performancesRelations = relations(performances, ({ one, many }) => ({
  challenge: one(challenges, {
    fields: [performances.challengeId],
    references: [challenges.id],
  }),
  student: one(users, {
    fields: [performances.studentId],
    references: [users.id],
  }),
  feedback: many(feedback),
  likes: many(performanceLikes),
  topPerformer: one(topPerformers, {
    fields: [performances.id],
    references: [topPerformers.performanceId],
  }),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  performance: one(performances, {
    fields: [feedback.performanceId],
    references: [performances.id],
  }),
  teacher: one(users, {
    fields: [feedback.teacherId],
    references: [users.id],
  }),
}));

export const topPerformersRelations = relations(topPerformers, ({ one }) => ({
  performance: one(performances, {
    fields: [topPerformers.performanceId],
    references: [performances.id],
  }),
  challenge: one(challenges, {
    fields: [topPerformers.challengeId],
    references: [challenges.id],
  }),
  selectedBy: one(users, {
    fields: [topPerformers.selectedById],
    references: [users.id],
  }),
}));

export const performanceLikesRelations = relations(performanceLikes, ({ one }) => ({
  performance: one(performances, {
    fields: [performanceLikes.performanceId],
    references: [performances.id],
  }),
  user: one(users, {
    fields: [performanceLikes.userId],
    references: [users.id],
  }),
}));

/* ------------------------------------------------------------------ */
/* Inferred types — use these everywhere downstream                   */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
export type Performance = typeof performances.$inferSelect;
export type NewPerformance = typeof performances.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
export type TopPerformer = typeof topPerformers.$inferSelect;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type ChallengeStatus = (typeof challengeStatusEnum.enumValues)[number];
export type Instrument = (typeof instrumentEnum.enumValues)[number];
export type SkillLevel = (typeof skillLevelEnum.enumValues)[number];
export type VideoProvider = (typeof videoProviderEnum.enumValues)[number];
export type PerformanceStatus = (typeof performanceStatusEnum.enumValues)[number];
