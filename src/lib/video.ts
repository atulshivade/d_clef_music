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
    // Reuse the same signed-params builder the client-direct path uses.
    // This keeps the signature logic in exactly one place — the only
    // difference here is that we attach the bytes server-side instead
    // of streaming them straight from the browser.
    const signed = buildCloudinarySignedParams({
      cloudName: this.cloudName,
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      folder: this.folder,
      title,
    });

    const fd = new FormData();
    fd.append("file", file, filename);
    fd.append("api_key", signed.params.api_key);
    fd.append("timestamp", signed.params.timestamp);
    fd.append("folder", signed.params.folder);
    if (signed.params.context) fd.append("context", signed.params.context);
    fd.append("signature", signed.params.signature);

    const res = await fetch(signed.uploadUrl, { method: "POST", body: fd });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Cloudinary upload failed (${res.status}): ${txt.slice(0, 200)}`);
    }
    const j = (await res.json()) as CloudinaryUploadResponse;
    const urls = cloudinaryPlaybackUrls(this.cloudName, j.public_id);

    return {
      provider: "CLOUDINARY",
      externalId: j.public_id,
      playbackUrl: urls.playbackUrl,
      thumbnailUrl: urls.thumbnailUrl,
      durationSeconds:
        typeof j.duration === "number" ? Math.round(j.duration) : null,
      contentType,
      size: j.bytes,
    };
  }
}

/**
 * Shape of the JSON Cloudinary returns from `POST /v1_1/<cloud>/video/upload`.
 *
 * Exported so the browser-direct flow in `performance-uploader.tsx` parses it
 * with the same typings the server does.
 */
export type CloudinaryUploadResponse = {
  public_id: string;
  secure_url: string;
  bytes: number;
  duration?: number;
  format?: string;
  resource_type?: string;
};

/**
 * Signed Cloudinary upload params for a one-shot client-direct upload.
 *
 * The browser POSTs the file to `uploadUrl` with all of `params` as
 * FormData fields. The bytes never traverse our serverless function, so
 * Vercel's 4.5 MB request-body cap does not apply.
 *
 * Returned `params` are minted server-side using `api_secret` and are
 * valid for ~1 hour (Cloudinary's default timestamp window). They cover
 * exactly one upload to the configured folder.
 */
export type CloudinarySignedUpload = {
  uploadUrl: string;
  cloudName: string;
  folder: string;
  params: {
    api_key: string;
    timestamp: string;
    folder: string;
    context?: string;
    signature: string;
  };
};

/**
 * Compute Cloudinary playback + thumbnail URLs for a public_id.
 *
 * Quality-optimised MP4 — `q_auto,f_auto` lets Cloudinary pick the best
 * codec per request and keeps the URL playable in every browser via
 * the native `<video>` tag. To switch to adaptive HLS later, change to
 * `/sp_auto/<id>.m3u8` and add `hls.js` client-side.
 */
export function cloudinaryPlaybackUrls(
  cloudName: string,
  publicId: string,
): { playbackUrl: string; thumbnailUrl: string } {
  return {
    playbackUrl: `https://res.cloudinary.com/${cloudName}/video/upload/q_auto,f_auto/${publicId}.mp4`,
    thumbnailUrl: `https://res.cloudinary.com/${cloudName}/video/upload/so_2,w_960,h_540,c_fill,q_auto,f_jpg/${publicId}.jpg`,
  };
}

/**
 * Build a signed Cloudinary upload payload. Pure function — no I/O.
 *
 * Cloudinary signs an alphabetically-sorted, ampersand-joined string of
 * *every* signed param (except `file`, `api_key`, `signature`,
 * `resource_type`) with the api_secret appended. Adding a form field
 * later that isn't in the signature payload makes Cloudinary reject the
 * upload with `401 Invalid Signature`, so this helper is the single
 * source of truth for both the server-relay and browser-direct paths.
 */
export function buildCloudinarySignedParams(args: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
  title?: string;
}): CloudinarySignedUpload {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedFields: Record<string, string> = {
    folder: args.folder,
    timestamp: String(timestamp),
  };
  if (args.title) {
    // `context` uses key=value pairs separated by `|` per Cloudinary
    // docs; strip `|` and `=` from the caption so we never produce
    // ambiguous input. The full literal must be signed.
    signedFields.context = `caption=${args.title.replace(/[|=]/g, " ")}`;
  }
  const signature = sign(signedFields, args.apiSecret);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${args.cloudName}/video/upload`,
    cloudName: args.cloudName,
    folder: args.folder,
    params: {
      api_key: args.apiKey,
      timestamp: signedFields.timestamp,
      folder: signedFields.folder,
      ...(signedFields.context ? { context: signedFields.context } : {}),
      signature,
    },
  };
}

/**
 * Resolve the active Cloudinary configuration from env, exactly like the
 * factory does — exported so the `/api/upload/sign` route can mint
 * signed params without instantiating the full provider.
 *
 * Returns null when Cloudinary isn't configured (e.g. the deploy is on
 * the local provider). Callers should treat null as "404 — not the
 * active provider".
 */
export function resolveCloudinaryConfig(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
} | null {
  const fromUrl = parseCloudinaryUrl(process.env.CLOUDINARY_URL);
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? fromUrl?.cloudName;
  const apiKey = process.env.CLOUDINARY_API_KEY ?? fromUrl?.apiKey;
  const apiSecret = process.env.CLOUDINARY_API_SECRET ?? fromUrl?.apiSecret;
  const folder =
    process.env.CLOUDINARY_FOLDER ?? "shred-sound-music/performances";
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret, folder };
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

/**
 * Parse Cloudinary's canonical connection URL shape:
 *   cloudinary://<api_key>:<api_secret>@<cloud_name>
 * The dashboard prints this exact string on the "API Keys" page, so we
 * support it as a drop-in alternative to the discrete env-var trio.
 *
 * Returns `null` when the input is missing or malformed — the caller
 * then falls back to the discrete vars (and ultimately raises a clear
 * error if both paths are empty).
 *
 * Exported for unit-style assertions; safe to call with `undefined`.
 */
export function parseCloudinaryUrl(
  raw: string | undefined | null,
):
  | { cloudName: string; apiKey: string; apiSecret: string }
  | null {
  if (!raw) return null;
  try {
    // `URL` happily parses `cloudinary://...` (any scheme is accepted).
    // The hostname becomes the cloud name, username = api key,
    // password = api secret. Cloudinary's docs require URL-encoding any
    // `:` or `@` in the secret; the WHATWG URL parser decodes those for
    // us via `username`/`password` getters.
    const u = new URL(raw.trim());
    if (u.protocol !== "cloudinary:") return null;
    const cloudName = u.hostname;
    const apiKey = decodeURIComponent(u.username);
    const apiSecret = decodeURIComponent(u.password);
    if (!cloudName || !apiKey || !apiSecret) return null;
    return { cloudName, apiKey, apiSecret };
  } catch {
    return null;
  }
}

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
      // Cloudinary accepts two equivalent configuration formats:
      //   1) The discrete trio: CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET
      //   2) A single URL the dashboard hands out:
      //        CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
      // We support both. Discrete vars override URL pieces so power-users
      // can mix-and-match (e.g. pin a non-default cloud while keeping the
      // URL around for the SDK's other consumers).
      const fromUrl = parseCloudinaryUrl(process.env.CLOUDINARY_URL);
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? fromUrl?.cloudName;
      const apiKey = process.env.CLOUDINARY_API_KEY ?? fromUrl?.apiKey;
      const apiSecret = process.env.CLOUDINARY_API_SECRET ?? fromUrl?.apiSecret;
      const folder =
        process.env.CLOUDINARY_FOLDER ?? "shred-sound-music/performances";
      if (!cloudName || !apiKey || !apiSecret) {
        throw new Error(
          "VIDEO_PROVIDER=cloudinary requires either CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET",
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
