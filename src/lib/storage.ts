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

/**
 * Reports whether direct file uploads are usable in the current runtime.
 *
 * The UI uses this to gate its FILE tab and steer students toward the
 * URL/embed flow on hosts where the local filesystem is ephemeral
 * (Netlify Lambda, etc.). The API route uses it to short-circuit with a
 * clean 503 instead of letting the upstream Lambda reject the body with
 * an opaque "Internal Error".
 */
export function getUploadCapabilities(): {
  uploadsEnabled: boolean;
  reason: string | null;
  storageProvider: string;
} {
  const kind = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
  const isEphemeralRuntime =
    process.env.IS_NETLIFY === "true" || process.env.NETLIFY === "true";

  if (kind === "local" && isEphemeralRuntime) {
    return {
      uploadsEnabled: false,
      storageProvider: kind,
      reason:
        "Direct video uploads are disabled on this deployment because the runtime filesystem is ephemeral. Paste a YouTube or Vimeo link instead, or ask the team to configure durable storage (S3) and re-deploy.",
    };
  }
  return { uploadsEnabled: true, reason: null, storageProvider: kind };
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
