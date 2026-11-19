/** Allowed upload types — shared by client (pre-validation) and server (authoritative validation). */
export const ALLOWED_FILES: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  zip: ["application/zip", "application/x-zip-compressed"],
  txt: ["text/plain"],
};
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
export const ACCEPT_ATTR = Object.keys(ALLOWED_FILES).map((e) => "." + e).join(",");
export const ACCEPT_IMAGES = IMAGE_EXTS.map((e) => "." + e).join(",");
export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 25);

export const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();
export const isImageMime = (m: string) => m.startsWith("image/");

export function clientValidate(file: File, imagesOnly = false): string | null {
  const ext = extOf(file.name);
  if (!ALLOWED_FILES[ext]) return `.${ext || "?"} files aren't supported`;
  if (imagesOnly && !IMAGE_EXTS.includes(ext)) return "Only images are allowed here";
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `Larger than ${MAX_UPLOAD_MB} MB`;
  if (file.size === 0) return "File is empty";
  return null;
}
