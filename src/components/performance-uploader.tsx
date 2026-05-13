"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Upload,
  Link as LinkIcon,
  Send,
  Music2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPerformanceAction } from "@/lib/actions";
import {
  INSTRUMENT_VALUES,
  SKILL_LEVEL_VALUES,
} from "@/lib/validators";
import {
  formatInstrument,
  formatSkillLevel,
} from "@/lib/utils";
import type {
  Instrument,
  SkillLevel,
  VideoProvider,
} from "@/db/schema";

type Mode = "FILE" | "EMBED";

type Defaults = {
  instrument?: Instrument | null;
  skillLevel?: SkillLevel | null;
};

type UploadCapabilities = {
  uploadsEnabled: boolean;
  reason: string | null;
  storageProvider: string;
  videoProvider: string;
};

export function PerformanceUploader({
  challengeId,
  defaults,
}: {
  challengeId: string;
  defaults?: Defaults;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [caps, setCaps] = useState<UploadCapabilities | null>(null);
  // Default to EMBED until we hear back from the server. If direct uploads
  // are disabled (e.g. on the Netlify demo) the user never sees a broken
  // FILE tab.
  const [mode, setMode] = useState<Mode>("EMBED");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/upload/capabilities")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: UploadCapabilities | null) => {
        if (cancelled || !j) return;
        setCaps(j);
        // Only flip into FILE mode by default if uploads work.
        if (j.uploadsEnabled) setMode("FILE");
      })
      .catch(() => {
        // If the capability probe fails we assume uploads work — local dev
        // path. The API call itself will surface any real failure.
        if (!cancelled) {
          setCaps({
            uploadsEnabled: true,
            reason: null,
            storageProvider: "local",
            videoProvider: "local",
          });
          setMode("FILE");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const uploadsEnabled = caps?.uploadsEnabled ?? true;
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [instrument, setInstrument] = useState<Instrument>(
    defaults?.instrument ?? "ACOUSTIC_GUITAR",
  );
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(
    defaults?.skillLevel ?? "INTERMEDIATE",
  );
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFile(null);
    setFilePreview(null);
    setEmbedUrl("");
    setTitle("");
    setCaption("");
  }

  function pickFile(f: File | null) {
    setFile(f);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(f ? URL.createObjectURL(f) : null);
  }

  async function uploadFile(): Promise<{
    provider: VideoProvider;
    videoUrl: string;
    videoExternalId: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
  } | null> {
    if (!file) return null;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (title.trim()) fd.append("title", title.trim());
      const res = await fetch("/api/upload/video", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        // Try to parse a JSON error body (our route always returns one).
        // If the response is plain text (e.g. an upstream gateway 500 from
        // exceeding Netlify's request body limit), fall back to a friendly
        // message that points at the embed flow.
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Upload failed (${res.status})`);
        }
        const txt = (await res.text()).slice(0, 200);
        throw new Error(
          `Upload rejected by the server (${res.status}). The file may be too ` +
            `large for this deployment's request limit. Try the "Paste link" tab ` +
            `with a YouTube or Vimeo URL instead. Server said: ${txt}`,
        );
      }
      const j = (await res.json()) as {
        provider: VideoProvider;
        externalId: string | null;
        playbackUrl: string;
        thumbnailUrl: string | null;
        durationSeconds: number | null;
      };
      // Best-effort duration sniff from the local <video> we used to preview.
      const sniffedDuration =
        j.durationSeconds ??
        (videoRef.current && Number.isFinite(videoRef.current.duration)
          ? Math.round(videoRef.current.duration)
          : null);
      return {
        provider: j.provider,
        videoUrl: j.playbackUrl,
        videoExternalId: j.externalId,
        thumbnailUrl: j.thumbnailUrl,
        durationSeconds: sniffedDuration,
      };
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let payload: {
      challengeId: string;
      title?: string;
      caption?: string;
      instrument: Instrument;
      skillLevel: SkillLevel;
      videoProvider: VideoProvider;
      videoUrl: string;
      videoExternalId?: string | null;
      videoDurationSeconds?: number | null;
      thumbnailUrl?: string | null;
    };

    try {
      if (mode === "FILE") {
        if (!file) {
          toast.error("Pick a video file first");
          return;
        }
        const uploaded = await uploadFile();
        if (!uploaded) return;
        payload = {
          challengeId,
          title: title.trim() || undefined,
          caption: caption.trim() || undefined,
          instrument,
          skillLevel,
          videoProvider: uploaded.provider,
          videoUrl: uploaded.videoUrl,
          videoExternalId: uploaded.videoExternalId,
          videoDurationSeconds: uploaded.durationSeconds,
          thumbnailUrl: uploaded.thumbnailUrl,
        };
      } else {
        const url = embedUrl.trim();
        if (!url) {
          toast.error("Paste an embed URL first");
          return;
        }
        // Light client-side classification — the server trusts the URL
        // because the validator only requires it to be non-empty.
        let provider: VideoProvider = "EMBED";
        let resolvedUrl = url;
        try {
          const u = new URL(url);
          if (u.hostname.endsWith("vimeo.com")) {
            const id = u.pathname.split("/").filter(Boolean)[0];
            if (id) {
              provider = "VIMEO";
              resolvedUrl = `https://player.vimeo.com/video/${id}`;
            }
          } else if (
            u.hostname.endsWith("youtube.com") ||
            u.hostname === "youtu.be"
          ) {
            const id =
              u.hostname === "youtu.be"
                ? u.pathname.slice(1)
                : u.searchParams.get("v") ?? "";
            if (id) {
              provider = "EMBED";
              resolvedUrl = `https://www.youtube.com/embed/${id}`;
            }
          }
        } catch {
          /* leave as-is */
        }
        payload = {
          challengeId,
          title: title.trim() || undefined,
          caption: caption.trim() || undefined,
          instrument,
          skillLevel,
          videoProvider: provider,
          videoUrl: resolvedUrl,
        };
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return;
    }

    startTransition(async () => {
      const res = await createPerformanceAction(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Performance posted to the gallery");
      reset();
      router.refresh();
    });
  }

  const busy = uploading || pending;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {caps && !caps.uploadsEnabled && caps.reason && (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          role="status"
          data-testid="uploads-disabled-banner"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Direct file uploads are off on this deployment</div>
            <p className="mt-0.5 text-amber-900/80">{caps.reason}</p>
          </div>
        </div>
      )}
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList>
          <TabsTrigger value="FILE" disabled={!uploadsEnabled}>
            <Upload className="h-4 w-4" /> Upload video
          </TabsTrigger>
          <TabsTrigger value="EMBED">
            <LinkIcon className="h-4 w-4" /> Paste link (YouTube / Vimeo)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="FILE" className="space-y-3">
          <Label htmlFor="file">
            Performance video (max 200 MB)
            {!uploadsEnabled && (
              <span className="ml-2 text-xs text-amber-700">
                — disabled on this deployment
              </span>
            )}
          </Label>
          <Input
            id="file"
            type="file"
            accept="video/*"
            disabled={!uploadsEnabled}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {filePreview && (
            <video
              ref={videoRef}
              src={filePreview}
              controls
              className="aspect-video w-full rounded-md bg-black"
              preload="metadata"
            />
          )}
        </TabsContent>

        <TabsContent value="EMBED" className="space-y-2">
          <Label htmlFor="embed">YouTube or Vimeo URL</Label>
          <Input
            id="embed"
            type="url"
            placeholder="https://youtu.be/dQw4w9WgXcQ"
            value={embedUrl}
            onChange={(e) => setEmbedUrl(e.target.value)}
          />
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="instrument">
            <Music2 className="mr-1 inline h-3.5 w-3.5" /> Instrument
          </Label>
          <Select
            value={instrument}
            onValueChange={(v) => setInstrument(v as Instrument)}
          >
            <SelectTrigger id="instrument">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSTRUMENT_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {formatInstrument(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="skill">Skill level</Label>
          <Select
            value={skillLevel}
            onValueChange={(v) => setSkillLevel(v as SkillLevel)}
          >
            <SelectTrigger id="skill">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKILL_LEVEL_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {formatSkillLevel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title (optional)</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`e.g. "Sweet Child O' Mine — opening riff"`}
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="caption">Notes for your teacher (optional)</Label>
        <Textarea
          id="caption"
          rows={3}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Where would you like feedback? What were you working on?"
          maxLength={2000}
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full rounded-full uppercase tracking-wide"
        disabled={busy || (mode === "FILE" && !uploadsEnabled)}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {uploading ? "Uploading…" : pending ? "Posting…" : "Submit"}
      </Button>
    </form>
  );
}
