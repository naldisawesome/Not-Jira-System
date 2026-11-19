import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict, isBefore, parseISO, startOfDay } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function taskKey(projectKey: string, number: number) {
  return `${projectKey}-${String(number).padStart(3, "0")}`;
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function toDate(d: string | Date | null | undefined) {
  if (!d) return null;
  return typeof d === "string" ? parseISO(d) : d;
}

export function fmtDate(d: string | Date | null | undefined, pattern = "MMM d, yyyy") {
  const v = toDate(d);
  return v ? format(v, pattern) : "—";
}

export function timeAgo(d: string | Date | null | undefined) {
  const v = toDate(d);
  return v ? `${formatDistanceToNowStrict(v)} ago` : "";
}

export function isOverdue(due: string | null | undefined, category?: string) {
  if (!due || category === "done" || category === "cancelled") return false;
  return isBefore(parseISO(due), startOfDay(new Date()));
}

export function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

export function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: Record<string, unknown>[], headers?: string[]) {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","))].join("\n");
}

const AVATAR_COLORS = ["#0f766e", "#7c3aed", "#db2777", "#ea580c", "#2563eb", "#65a30d", "#0891b2", "#c026d3", "#b45309"];
export function pickColor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!;
}
