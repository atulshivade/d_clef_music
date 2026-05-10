import { createHash } from "node:crypto";
import { getStorage } from "@/lib/storage";
import type { VideoProvider } from "@/db/schema";

/**
 * Video provider abstraction.
 *
 * Music portal video upload always goes through this interface, so the
 * UI layer never has to care whether the file ends up on disk (dev),
 * Bunny.net Stream (cost-effective HLS for production), Vimeo (drop-in
 * private hosting), or Cloudinary (generous free tier + auto adaptive
 * streaming + thumbnails). Add a new provider by implementing
 * `IVideoProvider` and selecting it via the `VIDEO_PROVIDER` env var.
 *
 * The default `LocalVideoProvider` delegates to the existing storage
 * provider so dev keeps working without any third-party accounts.
 */

export interface UploadedVideo {
  provider: VideoProvider;
  /** External id, e.g. Bunny GUID or Vimeo numeric id. Null for LOCAL/EMBED. */
  externalId: string | null;
  /** Playback URL — direct file, HLS manifest, or embed src. */
  playbackUrl: string;
  /** Optional poster image URL. Providers may generate this asynchronously. */
  thumbnailUrl: string | null;
  /** Best-effort duration if the provider returns it synchronously. */
  durationSeconds: number | null;
  contentType: string;
  size: number;
}

export interface IVideoProvider {
  readonly kind: VideoProvider;
  upload(args: {
    file: Blob;
    filename: string;
    contentType: string;
    title?: string;
  }): Promise<UploadedVideo>;
}

/* ------------------------------------------------------------------ */
/* LocalVideoProvider — dev-friendly, no third-party account needed.   */
/* Writes the file to public/uploads/videos/ via the storage provider. */
/* ------------------------------------------------------------------ */

class LocalVideoProvider implements IVideoProvider {
  readonly kind = "LOCAL" as const;

  async upload({
    file,
    filename,
    contentType,
  }: {
    file: Blob;
    filename: string;
    contentType: string;
  }): Promise<UploadedVideo> {
    const stored = await getStorage().upload({
      file,
      filename,
      contentType,
      scope: "videos",
    });
    return {
      provider: "LOCAL",
      externalId: null,
      playbackUrl: stored.url,
      thumbnailUrl: null,
      durationSeconds: null,
      contentType: stored.contentType,
      size: stored.size,
    };
  }
}

/* ------------------------------------------------------------------ */
/* BunnyVideoProvider — uploads to Bunny.net Stream and returns the    */
/* HLS playback URL. Requires BUNNY_STREAM_LIBRARY_ID and              */
/* BUNNY_STREAM_API_KEY. Two-step protocol: create a video, then PUT   */
/* the bytes.                                                          */
/* ------------------------------------------------------------------ */

class BunnyVideoProvider implements IVideoProvider {
  readonly kind = "BUNNY" as const;

  constructor(
    private readonly libraryId: string,
    private readonly apiKey: string,
    private readonly cdnHostname: string,
  ) {}

  async upload({
    file,
    filename,
    contentType,
    title,
  }: {
    file: Blob;
    filename: string;
    contentType: string;
    title?: string;
  }): Promise<UploadedVideo> {
    const base = `https://video.bunnycdn.com/library/${this.libraryId}/videos`;

    // 1. Create the video object
    const createRes = await fetch(base, {
      method: "POST",
      headers: {
        AccessKey: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: title || filename }),
    });
    if (!createRes.ok) {
      throw new Error(`Bunny create failed: ${createRes.status}`);
    }
    const created = (await createRes.json()) as { guid: string };
    const guid = created.guid;

    // 2. Upload the bytes
    const arrayBuf = await file.arrayBuffer();
    const putRes = await fetch(`${base}/${guid}`, {
      method: "PUT",
      headers: { AccessKey: this.apiKey, "Content-Type": contentType },
      body: arrayBuf,
    });
    if (!putRes.ok) {
      throw new Error(`Bunny upload failed: ${putRes.status}`);
    }

    return {
      provider: "BUNNY",
      externalId: guid,
      // HLS manifest — modern browsers + hls.js handle this directly.
      playbackUrl: `https://${this.cdnHostname}/${guid}/playlist.m3u8`,
      // Bunny's auto-thumbnail naming convention.
      thumbnailUrl: `https://${this.cdnHostname}/${guid}/thumbnail.jpg`,
      durationSeconds: null,
      contentType,
      size: arrayBuf.byteLength,
    };
  }
}

/* ------------------------------------------------------------------ */
/* VimeoVideoProvider — pull-based upload via TUS would be ideal in    */
/* production; this stub uses Vimeo's simple POST /me/videos endpoint  */
/* for files <= 200 MB.                                                */
/* ------------------------------------------------------------------ */

class VimeoVideoProvider implements IVideoProvider {
  readonly kind = "VIMEO" as const;

  constructor(private readonly accessToken: string) {}

  async upload({
    file,
    filename,
    contentType,
    title,
  }: {
    file: Blob;
    filename: string;
    contentType: string;
    title?: string;
  }): Promise<UploadedVideo> {
    const arrayBuf = await file.arrayBuffer();

    // Simple upload approach (POST upload + PATCH metadata).
    const createRes = await fetch("https://api.vimeo.com/me/videos", {
      method: "POST",
      headers: {
        Authorization: `bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
      body: JSON.stringify({
        upload: { approach: "post", size: String(arrayBuf.byteLength) },
        name: title || filename,
        privacy: { view: "unlisted" },
      }),
    });
    if (!createRes.ok) {
      throw new Error(`Vimeo create failed: ${createRes.status}`);
    }
    const created = (await createRes.json()) as {
      uri: string;
      link: string;
      upload: { upload_link: string };
      pictures?: { sizes?: { link: string }[] };
    };

    const putRes = await fetch(created.upload.upload_link, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: arrayBuf,
    });
    if (!putRes.ok) {
      throw new Error(`Vimeo upload failed: ${putRes.status}`);
    }

    const externalId = created.uri.split("/").pop() ?? null;
    return {
      provider: "VIMEO",
      externalId,
      // Embed URL for the standard Vimeo player.
      playbackUrl: `https://player.vimeo.com/video/${externalId}`,
      thumbnailUrl: created.pictures?.sizes?.[0]?.link ?? null,
      durationSeconds: null,
      contentType,
      size: arrayBuf.byteLength,
    };
  }
}

/* ------------------------------------------------------------------ */
/* CloudinaryVideoProvider — uploads to Cloudinary's video pipeline.   */
/* Generous free tier (25 GB storage + bandwidth/month), automatic     */
/* adaptive streaming (HLS), thumbnails, transformations. Requires:    */
/*   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. */
/*                                                                     */
/* Uses signed server-side upload (no unsigned presets, no client      */
/* exposure of secrets). The signature covers `timestamp` plus any     */
/* optional eager-transform params we send.                            */
/* ------------------------------------------------------------------ */

class CloudinaryVideoProvider implements IVideoProvider {
  readonly kind = "CLOUDINARY" as const;

  constructor(
    private readonly cloudName: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly folder: string,
  ) {}

  async upload({
    file,
    filename,
    contentType,
    title,
  }: {
    file: Blob;
    filename: string;
    contentType: string;
    title?: string;
  }): Promise<UploadedVideo> {
    const timestamp = Math.floor(Date.now() / 1000);
    // Cloudinary signs an alphabetically-sorted, ampersand-joined
    // string of all signed params with the api_secret appended. Keep
    // the param set tiny so we never get out of sync with the docs.
    const params: Record<string, string> = {
      folder: this.folder,
      timestamp: String(timestamp),
    };
    const signature = sign(params, this.apiSecret);

    const fd = new FormData();
    fd.append("file", file, filename);
    fd.append("api_key", this.apiKey);
    fd.append("timestamp", params.timestamp);
    fd.append("folder", params.folder);
    fd.append("signature", signature);
    if (title) fd.append("context", `caption=${title.replace(/[|=]/g, " ")}`);

    const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/video/upload`;
    const res = await fetch(url, { method: "POST", body: fd });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Cloudinary upload failed (${res.status}): ${txt.slice(0, 200)}`);
    }
    const j = (await res.json()) as {
      public_id: string;
      secure_url: string;
      bytes: number;
      duration?: number;
      format?: string;
      resource_type?: string;
    };

    // Quality-optimized MP4 — `q_auto,f_auto` lets Cloudinary pick the
    // best codec per request and keeps the URL playable in every
    // browser via the native <video> tag (the existing VideoPlayer).
    // To switch to adaptive HLS later, change to `/sp_auto/<id>.m3u8`
    // and add hls.js client-side.
    const playbackUrl = `https://res.cloudinary.com/${this.cloudName}/video/upload/q_auto,f_auto/${j.public_id}.mp4`;
    const thumbnailUrl = `https://res.cloudinary.com/${this.cloudName}/video/upload/so_2,w_960,h_540,c_fill,q_auto,f_jpg/${j.public_id}.jpg`;

    return {
      provider: "CLOUDINARY",
      externalId: j.public_id,
      playbackUrl,
      thumbnailUrl,
      durationSeconds:
        typeof j.duration === "number" ? Math.round(j.duration) : null,
      contentType,
      size: j.bytes,
    };
  }
}

/** Cloudinary's documented signature scheme: SHA-1 over sorted
 *  `key=value&key=value` joined string + api_secret. */
function sign(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(sorted + secret).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

let _provider: IVideoProvider | null = null;

export function getVideoProvider(): IVideoProvider {
  if (_provider) return _provider;
  const kind = (process.env.VIDEO_PROVIDER ?? "local").toLowerCase();

  switch (kind) {
    case "bunny": {
      const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
      const apiKey = process.env.BUNNY_STREAM_API_KEY;
      const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
      if (!libraryId || !apiKey || !cdnHostname) {
        throw new Error(
          "VIDEO_PROVIDER=bunny but BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_API_KEY / BUNNY_STREAM_CDN_HOSTNAME are missing",
        );
      }
      _provider = new BunnyVideoProvider(libraryId, apiKey, cdnHostname);
      return _provider;
    }
    case "vimeo": {
      const token = process.env.VIMEO_ACCESS_TOKEN;
      if (!token) {
        throw new Error("VIDEO_PROVIDER=vimeo but VIMEO_ACCESS_TOKEN is missing");
      }
      _provider = new VimeoVideoProvider(token);
      return _provider;
    }
    case "cloudinary": {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      const folder = process.env.CLOUDINARY_FOLDER ?? "shred-sound-music/performances";
      if (!cloudName || !apiKey || !apiSecret) {
        throw new Error(
          "VIDEO_PROVIDER=cloudinary but CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are missing",
        );
      }
      _provider = new CloudinaryVideoProvider(cloudName, apiKey, apiSecret, folder);
      return _provider;
    }
    case "local":
    default:
      _provider = new LocalVideoProvider();
      return _provider;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function isVideoContentType(contentType: string): boolean {
  return contentType.startsWith("video/");
}

/** For embedding pasted URLs (YouTube / Vimeo / Bunny) without an upload. */
export function classifyEmbedUrl(
  url: string,
): { provider: VideoProvider; embedUrl: string; thumbnailUrl: string | null } | null {
  try {
    const u = new URL(url);

    // YouTube
    if (u.hostname.endsWith("youtube.com") || u.hostname === "youtu.be") {
      const id =
        u.hostname === "youtu.be"
          ? u.pathname.slice(1)
          : u.searchParams.get("v") ?? "";
      if (!id) return null;
      return {
        provider: "EMBED",
        embedUrl: `https://www.youtube.com/embed/${id}`,
        thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      };
    }

    // Vimeo
    if (u.hostname.endsWith("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (!id) return null;
      return {
        provider: "VIMEO",
        embedUrl: `https://player.vimeo.com/video/${id}`,
        thumbnailUrl: null,
      };
    }

    // Generic — let the user paste any embed src.
    return { provider: "EMBED", embedUrl: url, thumbnailUrl: null };
  } catch {
    return null;
  }
}
