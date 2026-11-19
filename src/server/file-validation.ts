import "server-only";
import { ALLOWED_FILES, extOf } from "@/lib/files";

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

const startsWith = (buf: Buffer, sig: number[], offset = 0) => sig.every((b, i) => buf[offset + i] === b);

/** Verifies the file's actual bytes match its claimed extension (blocks renamed executables etc). */
function magicMatches(ext: string, buf: Buffer): boolean {
  switch (ext) {
    case "png":
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case "gif":
      return buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a";
    case "webp":
      return buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
    case "pdf":
      return buf.subarray(0, 5).toString("ascii") === "%PDF-";
    case "zip":
    case "docx":
    case "xlsx":
      return startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06]);
    case "txt":
    case "csv":
    case "svg":
      // text formats: reject binary content (NUL bytes in the first 8KB)
      return !buf.subarray(0, 8192).includes(0);
    default:
      return false;
  }
}

/**
 * SVG can carry script. We reject anything active instead of trying to "clean" it,
 * and additionally serve SVGs with a sandboxing CSP (see /api/files/[id]).
 */
function svgIsSafe(buf: Buffer) {
  const s = buf.toString("utf8");
  if (!/<svg[\s>]/i.test(s)) return false;
  const banned = [
    /<script/i,
    /<foreignObject/i,
    /\son[a-z]+\s*=/i,
    /javascript:/i,
    /data:text\/html/i,
    /<iframe|<embed|<object/i,
    /<!ENTITY/i,
    /xlink:href\s*=\s*["']\s*(?!#)/i,
    /href\s*=\s*["']\s*(?!#|data:image\/)/i,
  ];
  return !banned.some((r) => r.test(s));
}

export function sanitizeFileName(name: string) {
  const base = name.replace(/[/\\]/g, "_").replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return (base || "file").slice(0, 200);
}

export type Validated = { ext: string; mime: string; name: string };

export function validateUpload(name: string, claimedMime: string, buf: Buffer, imagesOnly = false): Validated {
  const ext = extOf(name);
  const allowed = ALLOWED_FILES[ext];
  if (!allowed) throw new UploadError(`File type .${ext || "unknown"} is not allowed.`);
  if (imagesOnly && !allowed[0]!.startsWith("image/")) throw new UploadError("Only image files are allowed here.");
  if (buf.length === 0) throw new UploadError("File is empty.");
  if (buf.length > MAX_BYTES) throw new UploadError(`File exceeds the ${MAX_BYTES / 1024 / 1024} MB limit.`);
  const mime = (claimedMime || "").toLowerCase().split(";")[0]!.trim();
  if (mime && mime !== "application/octet-stream" && !allowed.includes(mime)) throw new UploadError(`MIME type ${mime} doesn't match .${ext}.`);
  if (!magicMatches(ext, buf)) throw new UploadError(`File content doesn't look like a valid .${ext} file.`);
  if (ext === "svg" && !svgIsSafe(buf)) throw new UploadError("SVG contains scripts or external references and was rejected.");
  return { ext, mime: allowed[0]!, name: sanitizeFileName(name) };
}

export class UploadError extends Error {}

/** Reads pixel dimensions for PNG/GIF/JPEG/WEBP without native deps. */
export function imageSize(ext: string, b: Buffer): { width: number; height: number } | null {
  try {
    if (ext === "png") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (ext === "gif") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (ext === "webp") {
      const chunk = b.subarray(12, 16).toString("ascii");
      if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
    if (ext === "jpg" || ext === "jpeg") {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1]!;
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
