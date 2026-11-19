"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, FileText, FileSpreadsheet, FileArchive, File, Eye } from "lucide-react";
import { toast } from "sonner";
import { deleteAttachment } from "@/server/actions/collab";
import { cn, fmtDate, formatBytes } from "@/lib/utils";
import { extOf } from "@/lib/files";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { openImage } from "./image-viewer";

export type AttachmentT = { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string | Date; uploadedByName: string | null; uploadedById?: string | null; width?: number | null; height?: number | null; canDelete?: boolean };

const iconFor = (name: string) => {
  const e = extOf(name);
  if (["xlsx", "csv"].includes(e)) return FileSpreadsheet;
  if (e === "zip") return FileArchive;
  if (["pdf", "docx", "txt"].includes(e)) return FileText;
  return File;
};

export function AttachmentGrid({ files, emptyText }: { files: AttachmentT[]; emptyText?: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<AttachmentT | null>(null);
  const images = files.filter((f) => f.mimeType.startsWith("image/"));
  const docs = files.filter((f) => !f.mimeType.startsWith("image/"));

  async function remove(f: AttachmentT) {
    if (!confirm(`Delete “${f.fileName}”? This can't be undone.`)) return;
    const r = await deleteAttachment({ id: f.id });
    if (!r.ok) return toast.error(r.error);
    toast.success("Attachment deleted");
    router.refresh();
  }

  if (!files.length) return emptyText ? <p className="text-xs text-muted-foreground">{emptyText}</p> : null;
  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((f, idx) => (
            <figure key={f.id} className="group relative overflow-hidden rounded-lg border bg-muted/40">
              <button type="button" className="block aspect-[16/10] w-full" onClick={() => openImage(images.map((i) => ({ url: `/api/files/${i.id}`, name: i.fileName })), idx)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${f.id}`} alt={f.fileName} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              </button>
              <figcaption className="flex items-center gap-1 border-t bg-surface px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium">{f.fileName}</p>
                  <p className="truncate text-[10.5px] text-muted-foreground">{formatBytes(f.sizeBytes)} · {f.uploadedByName ?? "Unknown"} · {fmtDate(f.createdAt, "MMM d")}</p>
                </div>
                <a href={`/api/files/${f.id}?download=1`} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Download"><Download className="size-3.5" /></a>
                {f.canDelete && <button type="button" onClick={() => remove(f)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete"><Trash2 className="size-3.5" /></button>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {docs.map((f) => {
            const Icon = iconFor(f.fileName);
            const previewable = f.mimeType === "application/pdf" || f.mimeType === "text/plain" || f.mimeType === "text/csv";
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex size-8 items-center justify-center rounded-md bg-muted"><Icon className="size-4 text-muted-foreground" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{f.fileName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{extOf(f.fileName).toUpperCase()} · {formatBytes(f.sizeBytes)} · {f.uploadedByName ?? "Unknown"} · {fmtDate(f.createdAt)}</p>
                </div>
                {previewable && <Tip content="Preview"><Button variant="ghost" size="icon" onClick={() => setPreview(f)}><Eye /></Button></Tip>}
                <Tip content="Download"><Button variant="ghost" size="icon" asChild><a href={`/api/files/${f.id}?download=1`}><Download /></a></Button></Tip>
                {f.canDelete && <Tip content="Delete"><Button variant="ghost" size="icon" onClick={() => remove(f)} className="hover:text-destructive"><Trash2 /></Button></Tip>}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview && (
          <DialogContent title={preview.fileName} wide className="max-w-5xl">
            {preview.mimeType === "application/pdf" ? (
              <iframe src={`/api/files/${preview.id}`} className={cn("h-[70vh] w-full rounded border")} title={preview.fileName} />
            ) : (
              <TextPreview id={preview.id} />
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function TextPreview({ id }: { id: string }) {
  const [text, setText] = useState<string | null>(null);
  if (text === null) fetch(`/api/files/${id}`).then((r) => r.text()).then((t) => setText(t.slice(0, 200_000))).catch(() => setText("Could not load preview."));
  return <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs">{text ?? "Loading…"}</pre>;
}
