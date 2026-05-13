import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Storage provider abstraction.
 *
 * Today we ship a `LocalStorageProvider` that writes uploads to
 * `public/uploads/<scope>/<id>.<ext>` and serves them via Next's static
 * file handling at `/uploads/...`.
 *
 * To swap to S3/R2/Supabase Storage later, implement IStorageProvider
 * and select via the STORAGE_PROVIDER env var. No call-site changes
 * are required in feature code.
 */

export interface StoredFile {
  url: string;
  key: string;
  contentType: string;
  size: number;
}

export interface IStorageProvider {
  upload(args: {
    file: Blob | Buffer;
    filename: string;
    contentType: string;
    scope?: string;
  }): Promise<StoredFile>;
}

class LocalStorageProvider implements IStorageProvider {
  constructor(private readonly publicBaseUrl = "/uploads") {}

  async upload({
    file,
    filename,
    contentType,
    scope = "misc",
  }: {
    file: Blob | Buffer;
    filename: string;
    contentType: string;
    scope?: string;
  }): Promise<StoredFile> {
    const ext = path.extname(filename) || guessExt(contentType);
    const key = `${scope}/${randomUUID()}${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads", scope);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const buffer =
      file instanceof Buffer
        ? file
        : Buffer.from(await (file as Blob).arrayBuffer());

    await writeFile(path.join(process.cwd(), "public", "uploads", key), buffer);

    return {
      url: `${this.publicBaseUrl}/${key}`,
      key,
      contentType,
      size: buffer.byteLength,
    };
  }
}

function guessExt(contentType: string): string {
  if (contentType.startsWith("image/")) {
    return "." + contentType.split("/")[1];
  }
  if (contentType.startsWith("video/")) {
    return "." + contentType.split("/")[1];
  }
  return "";
}

/**
 * Refuses uploads with a clear message. Used on Netlify (or any other
 * serverless host) where the filesystem is ephemeral, so writing to disk
 * would silently lose files on the next cold start.
 */
class EphemeralFsGuardProvider implements IStorageProvider {
  async upload(): Promise<StoredFile> {
    throw new Error(
      "File uploads are disabled on this deployment because the runtime " +
        "filesystem is ephemeral. Configure STORAGE_PROVIDER=s3 (or another " +
        "durable provider) and re-deploy to enable uploads.",
    );
  }
}

let _provider: IStorageProvider | null = null;

/** Video providers whose bytes never touch our local filesystem. */
const REMOTE_VIDEO_PROVIDERS = new Set(["cloudinary", "bunny", "vimeo"]);

/**
 * Reports whether direct file uploads are usable in the current runtime.
 *
 * The UI uses this to gate its FILE tab and steer students toward the
 * URL/embed flow on hosts where the local filesystem is ephemeral
 * (Netlify Lambda, etc.). The API route uses it to short-circuit with a
 * clean 503 instead of letting the upstream Lambda reject the body with
 * an opaque "Internal Error".
 *
 * Important: a remote video provider (Cloudinary, Bunny.net, Vimeo)
 * streams the bytes directly from the Lambda to its own storage — the
 * ephemeral filesystem is never touched. In that case uploads are safe
 * even on Netlify, regardless of `STORAGE_PROVIDER`.
 */
export function getUploadCapabilities(): {
  uploadsEnabled: boolean;
  reason: string | null;
  storageProvider: string;
  videoProvider: string;
} {
  const storageKind = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
  const videoKind = (process.env.VIDEO_PROVIDER ?? "local").toLowerCase();
  const isEphemeralRuntime =
    process.env.IS_NETLIFY === "true" || process.env.NETLIFY === "true";

  // A remote video provider sidesteps the ephemeral FS entirely. Even if
  // STORAGE_PROVIDER is the local stub, no file ever lands on disk for
  // video uploads — Cloudinary/Bunny/Vimeo accept the multipart stream
  // and we just store the playback URL.
  const remoteVideo = REMOTE_VIDEO_PROVIDERS.has(videoKind);

  if (!remoteVideo && storageKind === "local" && isEphemeralRuntime) {
    return {
      uploadsEnabled: false,
      storageProvider: storageKind,
      videoProvider: videoKind,
      reason:
        "Direct video uploads are disabled on this deployment because the runtime filesystem is ephemeral. " +
        "Configure a remote video provider (e.g. VIDEO_PROVIDER=cloudinary plus CLOUDINARY_URL) and re-deploy, " +
        "or paste a YouTube / Vimeo link instead.",
    };
  }
  return {
    uploadsEnabled: true,
    reason: null,
    storageProvider: storageKind,
    videoProvider: videoKind,
  };
}

export function getStorage(): IStorageProvider {
  if (_provider) return _provider;
  const kind = process.env.STORAGE_PROVIDER ?? "local";
  // On Netlify (or any serverless host that sets IS_NETLIFY/NETLIFY) the
  // local filesystem is ephemeral — uploads would silently disappear on the
  // next cold start. Refuse loudly unless an explicit durable provider is set.
  const caps = getUploadCapabilities();
  if (!caps.uploadsEnabled) {
    _provider = new EphemeralFsGuardProvider();
    return _provider;
  }
  switch (kind) {
    case "local":
      _provider = new LocalStorageProvider(
        process.env.STORAGE_PUBLIC_BASE_URL ?? "/uploads",
      );
      return _provider;
    case "s3":
      throw new Error(
        "S3 provider stub — implement using @aws-sdk/client-s3 and return a StoredFile.",
      );
    default:
      throw new Error(`Unknown STORAGE_PROVIDER: ${kind}`);
  }
}

/** MIME prefix → submission type discriminator. */
export function classifySubmissionType(
  contentType: string,
): "IMAGE" | "VIDEO" | null {
  if (contentType.startsWith("image/")) return "IMAGE";
  if (contentType.startsWith("video/")) return "VIDEO";
  return null;
}
