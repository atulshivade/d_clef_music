import { z } from "zod";

/* Mirrors enums in src/db/schema.ts. Kept as const arrays so we can reuse
 * for select-option rendering without importing the DB layer into the client. */
export const INSTRUMENT_VALUES = [
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
] as const;

export const SKILL_LEVEL_VALUES = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "PRO",
] as const;

/**
 * IMPORTANT: must include EVERY value present in the `video_provider` pgEnum
 * in `src/db/schema.ts`. Forgetting a value here makes the server action
 * silently reject otherwise-valid submissions with a Zod error — the DB
 * column accepts it but the validator doesn't.
 *
 * Kept as a plain readonly tuple (instead of `videoProviderEnum.enumValues`
 * via a direct import) because validators run on the client too, and the
 * Drizzle schema module pulls in Node-only dependencies.
 */
export const VIDEO_PROVIDER_VALUES = [
  "LOCAL",
  "BUNNY",
  "VIMEO",
  "CLOUDINARY",
  "EMBED",
] as const;

/* ---------------- Auth ---------------- */

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    name: z.string().min(2, "Name is too short").max(80),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
    role: z.enum(["STUDENT", "ADMIN"]).default("STUDENT"),
    primaryInstrument: z.enum(INSTRUMENT_VALUES).optional(),
    skillLevel: z.enum(SKILL_LEVEL_VALUES).optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

/* -------------- Challenges -------------- */

export const createChallengeSchema = z.object({
  title: z.string().min(3, "Title is too short").max(120),
  description: z.string().min(10, "Add a meaningful brief").max(4000),
  deadline: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), "Deadline must be in the future"),
  points: z.coerce.number().int().min(1).max(10000).default(100),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  instrumentFocus: z.enum(INSTRUMENT_VALUES).optional(),
  skillLevelTarget: z.enum(SKILL_LEVEL_VALUES).optional(),
});
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;

/* -------------- Performances -------------- */

export const createPerformanceSchema = z.object({
  challengeId: z.string().uuid(),
  title: z.string().max(120).optional(),
  caption: z.string().max(2000).optional(),
  instrument: z.enum(INSTRUMENT_VALUES),
  skillLevel: z.enum(SKILL_LEVEL_VALUES),
  videoProvider: z.enum(VIDEO_PROVIDER_VALUES),
  videoUrl: z.string().min(1, "Video is required"),
  videoExternalId: z.string().optional().nullable(),
  videoDurationSeconds: z.number().int().nonnegative().optional().nullable(),
  thumbnailUrl: z.string().optional().nullable(),
});
export type CreatePerformanceInput = z.infer<typeof createPerformanceSchema>;

/* -------------- Feedback (timestamped, multi-axis) -------------- */

export const createFeedbackSchema = z.object({
  performanceId: z.string().uuid(),
  note: z.string().min(2, "Add feedback").max(2000),
  timestampSec: z.coerce.number().int().min(0).max(60 * 60 * 4).optional(),
  rhythmScore: z.coerce.number().int().min(0).max(10).optional(),
  techniqueScore: z.coerce.number().int().min(0).max(10).optional(),
  musicalityScore: z.coerce.number().int().min(0).max(10).optional(),
  isPrivate: z.coerce.boolean().optional().default(true),
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

/* -------------- Verify / Crown / Status -------------- */

export const togglePerformanceFlagSchema = z.object({
  performanceId: z.string().uuid(),
  isVerified: z.boolean().optional(),
  isBestPerformer: z.boolean().optional(),
});
export type TogglePerformanceFlagInput = z.infer<
  typeof togglePerformanceFlagSchema
>;

export const setPerformanceStatusSchema = z.object({
  performanceId: z.string().uuid(),
  status: z.enum(["PENDING", "PUBLISHED", "REJECTED"]),
});
export type SetPerformanceStatusInput = z.infer<
  typeof setPerformanceStatusSchema
>;
