import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Object storage abstraction. Binary content never goes in Postgres.
 *  - STORAGE_DRIVER=s3    → any S3-compatible service (AWS S3, Supabase Storage S3 endpoint, Cloudflare R2, MinIO)
 *  - STORAGE_DRIVER=local → ./storage on disk (development / single-server deployments only)
 */
interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements Storage {
  root = path.resolve(process.cwd(), "storage");
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

class S3Storage implements Storage {
  client = new S3Client({
    region: env("S3_REGION") || "auto",
    endpoint: env("S3_ENDPOINT")?.replace(/\/+$/, "") || undefined,
    forcePathStyle: env("S3_FORCE_PATH_STYLE") !== "false",
    credentials: { accessKeyId: env("S3_ACCESS_KEY_ID")!, secretAccessKey: env("S3_SECRET_ACCESS_KEY")! },
    // S3-compatible stores (Supabase Storage, R2, MinIO) reject the CRC32 checksum headers that
    // @aws-sdk/client-s3 >= 3.729 sends by default; only send checksums when an API requires them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  bucket = env("S3_BUCKET")!;
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** Env values pasted into dashboards often carry stray spaces or quotes. */
const env = (k: string) => process.env[k]?.trim().replace(/^["']|["']$/g, "") || undefined;

export class StorageConfigError extends Error {}

let instance: Storage | null = null;
export function storage(): Storage {
  if (!instance) {
    const driver = (env("STORAGE_DRIVER") ?? "local").toLowerCase();
    if (driver === "s3") {
      const missing = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT"].filter((k) => !env(k) && !(k === "S3_ENDPOINT" && env("S3_REGION")));
      if (missing.length) throw new StorageConfigError(`File storage is misconfigured: missing ${missing.join(", ")}.`);
      instance = new S3Storage();
    } else {
      // Serverless hosts (Vercel) have a read-only filesystem, so local storage can never work there.
      if (process.env.VERCEL) throw new StorageConfigError("File storage isn't configured. Set STORAGE_DRIVER=s3 and the S3_* variables in Vercel, then redeploy.");
      instance = new LocalStorage();
    }
  }
  return instance;
}

/** Turns SDK/storage failures into a message an admin can act on. */
export function describeStorageError(e: unknown): string {
  if (e instanceof StorageConfigError) return e.message;
  const err = e as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const code = err.Code ?? err.name ?? "Error";
  const status = err.$metadata?.httpStatusCode;
  const hints: Record<string, string> = {
    NoSuchBucket: "The bucket in S3_BUCKET doesn't exist — check the name (case-sensitive).",
    InvalidAccessKeyId: "S3_ACCESS_KEY_ID is wrong or was revoked.",
    SignatureDoesNotMatch: "S3_SECRET_ACCESS_KEY or S3_REGION is wrong.",
    AccessDenied: "The access key isn't allowed to write to this bucket.",
    ENOTFOUND: "S3_ENDPOINT host can't be reached — check the URL.",
    EROFS: "The server filesystem is read-only. Set STORAGE_DRIVER=s3.",
  };
  const hint = hints[code] ?? Object.entries(hints).find(([k]) => err.message?.includes(k))?.[1];
  return `Storage error ${code}${status ? ` (${status})` : ""}${hint ? `: ${hint}` : err.message ? `: ${err.message.slice(0, 200)}` : ""}`;
}
