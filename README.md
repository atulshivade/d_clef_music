# D Clef Music — Performance & Challenge Portal

A dark-themed music platform where **teachers** post challenges, **students**
upload performance videos tagged by instrument and skill, and the D Clef Music
community discovers what's next via a feed with a Best Performer spotlight.

> Follow on Instagram: [@d_clef_music](https://www.instagram.com/d_clef_music/)
>
> Built by **Digital COE Gen AI Team**.

## Live demo

- **URL:** https://d-clef-music.netlify.app
- **Teacher login:** `admin@portal.dev` / `Password123`
- **Student logins:** `alex@portal.dev` / `Password123`, `riya@portal.dev` / `Password123`

> Hosted on Netlify with managed Netlify DB (Neon Postgres). The seed includes
> 3 challenges, 2 sample performances and one **Best Performer** (Riya's
> Chopin take). Note: file uploads are disabled on the live demo because
> Netlify Functions have an ephemeral filesystem — configure
> `STORAGE_PROVIDER=s3` to enable durable uploads.

---

## Highlights

- **Music-first uploads.** Each performance is tagged by **Instrument**
  (Acoustic Guitar, Electric Guitar, Bass, Keyboard, Piano, Synth, Drums,
  Vocals, Violin, Flute, Sax, Other) and **Skill Level** (Beginner →
  Intermediate → Advanced → Pro).
- **Pluggable video hosting.** `IVideoProvider` ships three implementations:
  `LOCAL` (filesystem, dev-friendly), `BUNNY` (Bunny.net Stream — HLS, cost
  effective, DRM-friendly), and `VIMEO` (private/unlisted). Choose with one
  env var.
- **TikTok / Vimeo / YouTube embeds** without an upload — paste a link and
  the embed type is auto-detected.
- **Teacher evaluation studio** with a real video player, **timestamped
  feedback** ("watch the wrist at 0:42" — captured from the playhead),
  **multi-axis scoring** (Rhythm / Technique / Musicality, 0–10 each),
  **Verified** badge, and **Best Performer** crown with audit trail.
- **Best Performer spotlight** on the feed, plus per-challenge highlight on
  the detail page.
- **Filterable feed and gallery** by instrument and skill.
- **Dark, music-platform UI** out of the box. Glowing violet primary,
  electric magenta accent, near-black surface.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, RSC, Server Actions) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (New York) + lucide-react |
| ORM | Drizzle ORM (`postgres-js` for external Postgres, `pglite` for embedded local dev) |
| Database | Postgres — works with **Supabase**, Neon, local Docker, or zero-install PGlite |
| Auth | Auth.js v5 (NextAuth) — Credentials + optional Google, role-based (`STUDENT` / `ADMIN`-as-Teacher) |
| Storage | Pluggable `IStorageProvider` (local filesystem now, S3-ready) |
| Video | Pluggable `IVideoProvider` — Local · **Bunny.net Stream** · **Vimeo** |
| Validation | Zod |

---

## Project layout

```
challenge-portal/
├── drizzle.config.ts
├── drizzle/                                 # generated SQL migrations (gitignored runtime)
├── scripts/
│   ├── seed.ts                              # demo teacher/students + music challenges + sample performances
│   ├── sanity.ps1                           # role-aware HTTP smoke sweep
│   └── sanity-write.ps1                     # upload + admin actions + UI rendering smoke sweep
├── public/uploads/                          # local storage target (gitignored)
└── src/
    ├── proxy.ts                             # role-aware route protection (Next.js 16 edge proxy)
    ├── instrumentation.ts                   # auto-applies migrations on dev boot (PGlite)
    ├── app/
    │   ├── layout.tsx                       # root html / dark mode default / Toaster
    │   ├── page.tsx                         # public landing
    │   ├── globals.css                      # Tailwind v4 + dark music palette
    │   ├── (auth)/                          # sign-in / sign-up (with instrument + skill profile fields)
    │   ├── (app)/                           # protected app shell with navbar
    │   │   ├── challenges/page.tsx          # active challenges grid
    │   │   ├── challenges/[id]/page.tsx     # detail + uploader + filterable performance gallery
    │   │   ├── feed/page.tsx                # filterable feed + Best Performer spotlight
    │   │   └── admin/                       # teacher dashboard, create-challenge, evaluation studio
    │   └── api/
    │       ├── auth/[...nextauth]/route.ts
    │       ├── upload/route.ts              # multipart image/video upload (raw)
    │       └── upload/video/route.ts        # video upload routed through IVideoProvider
    ├── components/
    │   ├── ui/                              # shadcn primitives
    │   ├── navbar.tsx                       # role-aware top nav
    │   ├── nav-link.tsx
    │   ├── challenge-card.tsx               # with instrument-focus badge
    │   ├── performance-card.tsx             # video + Verified / Best Performer badges + duration
    │   ├── performance-uploader.tsx         # tabbed file-upload OR YouTube/Vimeo embed
    │   ├── performance-admin-actions.tsx    # Verify / Crown / Publish / Reject / Add feedback
    │   ├── evaluate-row.tsx                 # threads video.currentTime → feedback dialog
    │   ├── video-player.tsx                 # <video> for files, <iframe> for embeds
    │   └── instrument-icon.tsx              # Lucide icon mapping per instrument
    ├── db/
    │   ├── index.ts                         # Drizzle client (HMR-safe, PGlite or postgres-js)
    │   ├── migrate.ts                       # idempotent migration runner
    │   └── schema.ts                        # users · challenges · performances · feedback · top_performers
    └── lib/
        ├── actions.ts                       # createPerformance / createFeedback / togglePerformanceFlag / setPerformanceStatus
        ├── auth.ts                          # Auth.js config + requireAdmin / requireUser
        ├── storage.ts                       # IStorageProvider abstraction
        ├── video.ts                         # IVideoProvider abstraction (Local / Bunny / Vimeo)
        ├── utils.ts                         # cn(), date helpers, instrument/skill labels, formatSeconds()
        └── validators.ts                    # Zod schemas + INSTRUMENT_VALUES / SKILL_LEVEL_VALUES
```

---

## Quick start

### Option A — Zero-install (PGlite, no Docker required)

```powershell
npm install
$env:AUTH_SECRET = "any-32-char-string-for-dev-only"
npm run db:seed   # creates demo users + music challenges + sample performances
npm run dev
```

That's it. The app boots an embedded Postgres (`PGlite`) into `.data/pgdata/`,
applies all migrations, serves at http://localhost:3000.

### Option B — Supabase / Neon / external Postgres

```powershell
cp .env.example .env.local
# Set DATABASE_URL to your Supabase connection string and AUTH_SECRET to a strong secret.
# Optionally set VIDEO_PROVIDER=bunny + BUNNY_STREAM_* for production-grade hosting.
npm install
npm run db:push       # syncs the Drizzle schema
npm run db:seed
npm run dev
```

### Demo accounts (password = `Password123`)

| Role | Email |
|---|---|
| Teacher (admin) | `admin@portal.dev` |
| Student (acoustic guitar, intermediate) | `alex@portal.dev` |
| Student (piano, advanced) | `riya@portal.dev` |

Open http://localhost:3000.

---

## Database schema (high level)

```
user            (id, email, name, role[ADMIN|STUDENT],
                 primary_instrument, skill_level, points, …)
account / session / verificationToken                 # Auth.js tables

challenge       (id, title, description, deadline, status, points,
                 instrument_focus, skill_level_target, …)

performance     (id, challenge_id, student_id,
                 instrument, skill_level,
                 video_provider[LOCAL|BUNNY|VIMEO|EMBED],
                 video_url, video_external_id, video_duration_seconds,
                 thumbnail_url, status[PENDING|PUBLISHED|REJECTED],
                 is_verified, is_best_performer, likes_count, …)

feedback        (id, performance_id, teacher_id, note,
                 timestamp_sec,            -- pin to a moment in the video
                 rhythm_score, technique_score, musicality_score,
                 is_private, …)

top_performer   (id, performance_id, challenge_id, selected_by_id,
                 reason, period[CHALLENGE|WEEK|MONTH|ALLTIME], selected_at)

performance_like (performance_id, user_id, created_at)
```

Inferred TypeScript types are exported from `src/db/schema.ts` — use them
everywhere instead of redefining shapes.

---

## Routes

### Public
- `/` — landing
- `/sign-in`, `/sign-up`

### Authenticated (any role)
- `/challenges` — active challenges grid (with instrument-focus badges)
- `/challenges/[id]` — detail + your performance uploader + filterable
  gallery + Best Performer highlight
- `/feed` — filterable feed by instrument / skill, with Best Performer
  spotlight at the top

### Teacher (admin) only
- `/admin` — studio dashboard
- `/admin/challenges/new` — create challenge with instrument focus + skill target
- `/admin/evaluate` — evaluation studio with per-card actions

### API
- `POST /api/upload` — auth required, image/video, 25 MB cap, raw storage
- `POST /api/upload/video` — auth required, video only, 200 MB cap, routes
  through `IVideoProvider`. Returns
  `{ provider, externalId, playbackUrl, thumbnailUrl, durationSeconds, contentType, size }`.

Route protection is enforced **twice** — `src/proxy.ts` (Next.js 16 edge
proxy) for redirects, plus `requireAdmin()` / server-component checks for
defence in depth.

---

## Video provider — how to swap

`src/lib/video.ts` ships with three implementations selected by `VIDEO_PROVIDER`:

```env
# .env.local
VIDEO_PROVIDER=bunny
BUNNY_STREAM_LIBRARY_ID=12345
BUNNY_STREAM_API_KEY=...
BUNNY_STREAM_CDN_HOSTNAME=vz-abcdef-123.b-cdn.net
```

```env
VIDEO_PROVIDER=vimeo
VIMEO_ACCESS_TOKEN=...
```

```env
VIDEO_PROVIDER=local        # default — writes to public/uploads/videos/
```

Add a new provider by implementing `IVideoProvider` and adding a `case` in
the factory. **No call-site changes** are required: every `<VideoPlayer>` and
gallery card already understands the four `VideoProvider` enum values.

---

## Storage

`src/lib/storage.ts` exposes `IStorageProvider`. The default
`LocalStorageProvider` writes to `public/uploads/<scope>/<uuid>.<ext>`. Swap
to S3/R2/Supabase Storage by implementing the interface and selecting via
`STORAGE_PROVIDER`.

The local video provider delegates to this storage provider, so configuring
S3 also moves your dev video uploads to S3.

---

## Sanity scripts

Two PowerShell scripts in `scripts/` run end-to-end against the dev server:

```powershell
# Read sweep — every route returns the expected status for each role
powershell -File scripts\sanity.ps1 -Email admin@portal.dev -Password Password123 -Role ADMIN
powershell -File scripts\sanity.ps1 -Email alex@portal.dev  -Password Password123 -Role STUDENT

# Write sweep — image + video upload, role-gated UI, music-domain rendering
powershell -File scripts\sanity-write.ps1
```

## End-to-end tests (Playwright)

A full Playwright suite under `tests/e2e/` exercises both the UI and the
backend on the deployed Netlify site (override with `BASE_URL=...` for local).

```powershell
# Run against the live demo (default)
npm test

# Run against `npm run dev` on localhost
$env:BASE_URL = "http://localhost:3000"
npm test
```

The suite covers:

- **Public** — landing renders, sign-in / sign-up forms, anon redirects from
  `/admin` and `/feed` to `/sign-in`, **dark theme is in effect** (body bg
  lightness < 15, foreground > 85; catches a missing-stylesheet regression).
- **Auth & feed** — student sign-in lands on `/challenges` with seeded data,
  feed shows the Best Performer spotlight, **liking a performance increases
  the like count**.
- **Teacher / admin** — dashboard stats render, `/admin/evaluate` exposes
  Verify / Crown Best / Add feedback, **the new date-time picker** has a
  visible trigger (not a hidden icon-only one) and **closes immediately on
  date selection**, the create-challenge form actually creates a challenge
  and redirects, and an invalid submission shows an inline error rather than
  a 500 page.
- **API health** — `/api/auth/session` returns JSON for anon, `/api/admin/dbinit`
  refuses requests without a valid secret, `/api/upload/video` refuses
  anonymous uploads.

Open the HTML report after a run with `npm run test:report`.

---

## What's done vs. what's next

### Done
- Music-first schema (instruments, skill levels, video metadata, multi-axis
  feedback, top_performers audit table)
- `IVideoProvider` with Local / Bunny.net / Vimeo
- `/api/upload/video` with auth, MIME, and size guards
- Performance uploader (file or embed) tagging instrument + skill
- Filterable feed + per-challenge gallery
- Best Performer spotlight on feed and challenge detail
- Teacher evaluation studio with timestamped feedback (captures playhead)
  and 0–10 scoring on rhythm / technique / musicality
- Verified badge + Best Performer crown with audit trail in `top_performer`
- Dark music-platform theme (default)

### Next
- TikTok-style vertical-scroll feed mode (current is a grid spotlight)
- Likes endpoint + leaderboard view (table + `points` column already exist)
- Email + Google OAuth wiring (env vars are already there)
- Supabase Auth swap (currently Auth.js using Postgres for storage)
- HLS playback through `hls.js` for non-Safari browsers

---

## Known notes

- **PGlite is single-process.** If you mutate the DB from a `tsx` script
  while the dev server is running, the server holds stale in-memory state
  until restart. Use `npm run db:seed` only when the dev server is stopped,
  or prefer Supabase/Neon for parallel-process workflows.
- **`Unhandled Rejection: TypeError: ... Received an instance of URL`**
  during `POST /api/auth/callback/credentials` is upstream noise from
  `next-auth@beta` running under Turbopack. The credentials callback still
  returns 302 and sets the session cookie. Functional sanity is green.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Next dev server |
| `npm run build` / `start` | Production build & serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate SQL migrations from schema diff |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:push` | Push schema directly (great for dev) |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Seed demo users + music challenges + performances |
