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
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  bucket = process.env.S3_BUCKET!;
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

let instance: Storage | null = null;
export function storage(): Storage {
  if (!instance) {
    if (process.env.STORAGE_DRIVER === "s3") {
      if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY)
        throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
      instance = new S3Storage();
    } else instance = new LocalStorage();
  }
  return instance;
}
