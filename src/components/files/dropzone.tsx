"use client";
import { useEffect, useRef, useState } from "react";
import { UploadCloud, X, RotateCw, FileText, Loader2, CheckCircle2, AlertCircle, ClipboardPaste } from "lucide-react";
import { ACCEPT_ATTR, ACCEPT_IMAGES, MAX_UPLOAD_MB } from "@/lib/files";
import { cn, formatBytes } from "@/lib/utils";
import type { UploadItem } from "./use-uploader";

type Props = {
  items: UploadItem[];
  onFiles: (files: File[]) => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
  imagesOnly?: boolean;
  compact?: boolean;
  /** listen for clipboard paste on the whole document while mounted */
  pasteTarget?: "document" | "self";
  label?: string;
  disabled?: boolean;
};

export function Dropzone({ items, onFiles, onRetry, onRemove, imagesOnly, compact, pasteTarget = "self", label, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (pasteTarget === "self" && !root.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) { e.preventDefault(); onFiles(files); }
    };
    const target = pasteTarget === "document" ? document : root.current;
    target?.addEventListener("paste", onPaste as EventListener);
    return () => target?.removeEventListener("paste", onPaste as EventListener);
  }, [onFiles, pasteTarget, disabled]);

  return (
    <div ref={root} tabIndex={-1} className="space-y-2 outline-none">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files)); }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/30 text-center transition-all hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          compact ? "px-3 py-3" : "px-4 py-6",
          over && "border-primary bg-accent/60 ring-2 ring-primary/20",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <UploadCloud className={cn("text-muted-foreground", compact ? "size-4" : "size-6")} />
        <p className="text-[13px] font-medium">{label ?? (imagesOnly ? "Drop images, browse, or paste a screenshot" : "Drop files here or click to browse")}</p>
        {!compact && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <ClipboardPaste className="size-3" /> Paste with Ctrl/⌘+V · {imagesOnly ? "PNG, JPG, GIF, WEBP, SVG" : "Images, PDF, DOCX, XLSX, CSV, ZIP, TXT"} · up to {MAX_UPLOAD_MB} MB each
          </p>
        )}
        <input ref={input} type="file" multiple hidden accept={imagesOnly ? ACCEPT_IMAGES : ACCEPT_ATTR} onChange={(e) => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = ""; }} />
      </div>
      {items.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.key} className={cn("relative flex items-center gap-2.5 overflow-hidden rounded-lg border bg-surface p-2", i.status === "error" && "border-destructive/40 bg-destructive/5")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.preview ? <img src={i.preview} alt="" className="size-10 shrink-0 rounded object-cover" /> : <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted"><FileText className="size-4 text-muted-foreground" /></div>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{i.file.name}</p>
                <p className={cn("truncate text-[11px]", i.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {i.status === "error" ? i.error : i.status === "done" ? `${formatBytes(i.file.size)} · uploaded` : `${i.progress}% of ${formatBytes(i.file.size)}`}
                </p>
              </div>
              {i.status === "uploading" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              {i.status === "done" && <CheckCircle2 className="size-4 text-emerald-600" />}
              {i.status === "error" && (
                <>
                  <AlertCircle className="size-4 text-destructive" />
                  {!/supported|allowed|Larger|empty/.test(i.error ?? "") && <button type="button" onClick={() => onRetry(i.key)} className="rounded p-1 hover:bg-muted" aria-label="Retry"><RotateCw className="size-3.5" /></button>}
                </>
              )}
              {i.status !== "uploading" && <button type="button" onClick={() => onRemove(i.key)} className="rounded p-1 hover:bg-muted" aria-label="Dismiss"><X className="size-3.5" /></button>}
              {i.status === "uploading" && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${i.progress}%` }} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
