import Link from "next/link";
import { BadgeCheck, Crown, Music } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { VideoPlayer } from "@/components/video-player";
import { InstrumentIcon } from "@/components/instrument-icon";
import { LikeButton } from "@/components/like-button";
import type { Performance } from "@/db/schema";
import {
  formatInstrument,
  formatSkillLevel,
  formatSeconds,
  getInitials,
} from "@/lib/utils";

type Props = {
  performance: Performance;
  student: { id: string; name: string | null; image: string | null };
  challenge: { id: string; title: string };
  /** True when the current viewer has liked this performance. */
  likedByMe?: boolean;
  /** False when no user is signed in — the heart becomes read-only. */
  canLike?: boolean;
};

export function PerformanceCard({
  performance,
  student,
  challenge,
  likedByMe = false,
  canLike = true,
}: Props) {
  return (
    <Card className="group overflow-hidden rounded-2xl border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl">
      <div className="relative">
        <VideoPlayer
          provider={performance.videoProvider}
          url={performance.videoUrl}
          poster={performance.thumbnailUrl}
        />
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1.5">
          {performance.isBestPerformer && (
            <Badge variant="warning" className="shadow-md shadow-amber-500/30">
              <Crown className="mr-1 h-3 w-3" />
              Best Performer
            </Badge>
          )}
          {performance.isVerified && (
            <Badge variant="success" className="shadow-md shadow-emerald-500/30">
              <BadgeCheck className="mr-1 h-3 w-3" />
              Verified
            </Badge>
          )}
        </div>
        {performance.videoDurationSeconds != null && (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
            {formatSeconds(performance.videoDurationSeconds)}
          </span>
        )}
      </div>

      <CardContent className="space-y-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/challenges/${challenge.id}`}
            className="truncate text-xs font-medium uppercase tracking-wide text-primary hover:underline"
            title={challenge.title}
          >
            {challenge.title}
          </Link>
          <Badge variant="outline" className="shrink-0 gap-1">
            <InstrumentIcon
              instrument={performance.instrument}
              className="h-3 w-3"
            />
            <span>{formatInstrument(performance.instrument)}</span>
          </Badge>
        </div>
        {performance.title && (
          <h3 className="font-semibold leading-snug">{performance.title}</h3>
        )}
        {performance.caption && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {performance.caption}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="secondary" className="gap-1">
            <Music className="h-3 w-3" />
            {formatSkillLevel(performance.skillLevel)}
          </Badge>
        </div>
      </CardContent>
      <CardFooter className="justify-between pt-0">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            {student.image && <AvatarImage src={student.image} alt={student.name ?? ""} />}
            <AvatarFallback>{getInitials(student.name)}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground">
            {student.name ?? "Anonymous"}
          </span>
        </div>
        <LikeButton
          performanceId={performance.id}
          initialLikesCount={performance.likesCount}
          initialLikedByMe={likedByMe}
          enabled={canLike}
        />
      </CardFooter>
    </Card>
  );
}
