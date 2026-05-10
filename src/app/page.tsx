import Link from "next/link";
import {
  AudioLines,
  Music2,
  BadgeCheck,
  Crown,
  ArrowRight,
  Headphones,
  Upload,
  Play,
} from "lucide-react";
import { InstagramGlyph } from "@/components/icons/instagram-glyph";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export default async function LandingPage() {
  const session = await auth();
  const ctaHref = session?.user
    ? session.user.role === "ADMIN"
      ? "/admin"
      : "/challenges"
    : "/sign-in";

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar — sits on the cream hero so it stays unframed. Uses the
          wide container so it lines up with the hero copy on laptop. */}
      <header className="band-cream w-full">
        <div className="band-inner-wide flex items-center justify-between px-4 pt-5 sm:px-6 sm:pt-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
            aria-label="Shred Sound Music — home"
          >
            <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <AudioLines className="h-5 w-5" />
            </span>
            <span className="text-base sm:text-lg">Shred Sound Music</span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Top">
            {session?.user ? (
              <Button asChild size="sm" className="sm:size-default">
                <Link href={ctaHref}>
                  <span className="hidden sm:inline">Open studio</span>
                  <span className="sm:hidden">Studio</span>
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="sm:size-default">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="sm" className="sm:size-default">
                  <Link href="/sign-up">
                    <span className="hidden sm:inline">Get started</span>
                    <span className="sm:hidden">Sign up</span>
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Band 1 — Hero (cream). 2-column at lg+, single column on mobile. */}
      <section className="band band-cream pt-6 sm:pt-8">
        <div className="band-inner-wide band-split">
          <div className="text-center lg:text-left">
            <span className="section-eyebrow">Shred Sound Music · Student Portal</span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Premium <span className="text-primary">Music</span> Platform
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
              Discover top performances, latest student takes, and timestamped
              teacher feedback — a stage where every player gets heard.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Button asChild size="lg">
                <Link href={ctaHref}>
                  {session?.user ? "Continue" : "Join the stage"}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/feed">
                  <Play className="mr-1 h-4 w-4" />
                  Browse performances
                </Link>
              </Button>
            </div>
          </div>

          {/* Hero artwork — gold framed mock player card */}
          <div className="grid place-items-center">
            <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/35 to-primary/10 p-2 shadow-[0_30px_60px_-24px_rgba(0,0,0,0.25)] sm:max-w-md">
              <div className="aspect-[4/5] w-full rounded-2xl bg-[url('https://images.unsplash.com/photo-1519508234439-4f23643125c1?auto=format&fit=crop&w=900&q=70')] bg-cover bg-center" />
              <div className="absolute inset-x-4 bottom-4 rounded-xl bg-card/95 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary">
                  <Music2 className="h-3.5 w-3.5" /> Featured · Acoustic guitar
                </div>
                <div className="mt-1 truncate font-semibold">Sweet Child O&apos; Mine — opener</div>
                <div className="mt-3 flex h-6 items-end gap-1">
                  {[0.4, 0.7, 1, 0.55, 0.85, 0.35, 0.95, 0.6, 0.45, 0.75, 1, 0.5, 0.7, 0.9].map(
                    (h, i) => (
                      <span
                        key={i}
                        className="eq-bar inline-block w-1.5 rounded-t bg-primary"
                        style={{ height: `${h * 100}%`, animationDelay: `${i * 80}ms` }}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Band 2 — Submit Your Video (ink). 2-column on lg with copy on left. */}
      <section className="band band-ink">
        <div className="band-inner-wide band-split">
          <div className="text-center lg:text-left">
            <span className="section-eyebrow">Open mic</span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Submit Your Video
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-ink-foreground/70 sm:text-base lg:mx-0">
              Upload a clip or paste a YouTube / Vimeo link. Your teacher and
              peers can leave feedback pinned to specific moments — so the
              note &ldquo;watch the wrist at 0:42&rdquo; actually points to 0:42.
            </p>
            <ul className="mx-auto mt-6 max-w-md space-y-2 text-sm text-ink-foreground/70 lg:mx-0">
              <li className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                MP4, MOV or WebM up to 200&nbsp;MB.
              </li>
              <li className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                YouTube, Vimeo and TikTok embeds — auto-detected.
              </li>
              <li className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                Tagged by instrument and skill level for filtering.
              </li>
            </ul>
          </div>

          <div className="form-card mx-auto w-full max-w-md text-left lg:mx-0">
            <div className="text-center text-base font-semibold">Upload Video</div>
            <div className="mt-5 space-y-3">
              <div className="rounded-md border border-input bg-background px-3 py-2.5 text-sm text-muted-foreground">
                Name of song
              </div>
              <div className="rounded-md border border-input bg-background px-3 py-2.5 text-sm text-muted-foreground">
                Student Name<span className="text-destructive">*</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <Upload className="h-4 w-4" />
                  Upload Video
                </span>
                <span className="text-muted-foreground">Attachments (0)</span>
              </div>
            </div>
            <Button asChild size="lg" className="mt-6 w-full rounded-full">
              <Link href={ctaHref}>Submit</Link>
            </Button>
            <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
              Sign in to actually post — this is a preview of the upload card.
            </p>
          </div>
        </div>
      </section>

      {/* Band 3 — Why Shred Sound Music (white) */}
      <section className="band band-white">
        <div className="band-inner-wide">
          <div className="text-center">
            <span className="section-eyebrow">What you get</span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Built for the student stage
            </h2>
          </div>
          <div className="mt-8 grid gap-5 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Music2 className="h-5 w-5" />}
              title="Tagged performances"
              desc="Upload short videos, tag your instrument and skill level. Teachers and peers filter to exactly what they want to hear."
            />
            <FeatureCard
              icon={<BadgeCheck className="h-5 w-5" />}
              title="Timestamped feedback"
              desc="Teachers leave notes pinned to specific moments — rhythm, technique, musicality, scored 0–10."
            />
            <FeatureCard
              icon={<Crown className="h-5 w-5" />}
              title="Best Performer crown"
              desc="Curated picks per challenge with audit trail, plus a public spotlight on the feed."
            />
          </div>
        </div>
      </section>

      {/* Footer — cream */}
      <footer className="band-cream border-t border-border/60">
        <div className="band-inner-wide flex flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span className="flex items-center gap-1.5">
            <Headphones className="h-4 w-4" />© {new Date().getFullYear()} Shred Sound Music
          </span>
          <a
            href="https://www.instagram.com/shred_sound_music/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Follow Shred Sound Music on Instagram"
          >
            <InstagramGlyph className="h-4 w-4" />
            @shred_sound_music
          </a>
          <span className="hidden sm:inline">Built with Next.js · Drizzle · shadcn/ui</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
