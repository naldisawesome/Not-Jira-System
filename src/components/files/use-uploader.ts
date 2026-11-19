"use client";
import { useCallback, useRef, useState } from "react";
import { clientValidate } from "@/lib/files";

export type UploadedFile = { id: string; fileName: string; mimeType: string; sizeBytes: number; url: string; width?: number | null; height?: number | null; uploadedByName?: string; createdAt?: string };
export type UploadItem = { key: string; file: File; preview?: string; progress: number; status: "uploading" | "done" | "error"; error?: string; result?: UploadedFile };

type Target = { context: string; taskId?: string; projectId?: string; commentId?: string };

function uploadOne(file: File, target: Target, onProgress: (p: number) => void): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(target).forEach(([k, v]) => v && fd.append(k, v));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { attachment?: UploadedFile; error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.attachment) resolve(body.attachment);
      else reject(new Error(body.error ?? (xhr.status === 413 ? "File is too large for the server." : `Upload failed (${xhr.status})`)));
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection and retry."));
    xhr.send(fd);
  });
}

/** Uploads files with per-file progress, client-side pre-validation, previews and retry. */
export function useUploader(target: Target, opts: { imagesOnly?: boolean; onUploaded?: (f: UploadedFile) => void } = {}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const targetRef = useRef(target);
  targetRef.current = target;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const patch = (key: string, p: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const run = useCallback(async (item: UploadItem) => {
    patch(item.key, { status: "uploading", progress: 0, error: undefined });
    try {
      const result = await uploadOne(item.file, targetRef.current, (progress) => patch(item.key, { progress }));
      patch(item.key, { status: "done", progress: 100, result });
      optsRef.current.onUploaded?.(result);
      return result;
    } catch (e) {
      patch(item.key, { status: "error", error: (e as Error).message });
      return null;
    }
  }, []);

  const add = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).map((file, i) => {
        // Pasted screenshots arrive as "image.png" — give them a meaningful, unique name.
        const named = /^image\.(png|jpe?g|gif|webp)$/i.test(file.name) ? new File([file], `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}-${i}.${file.name.split(".").pop()}`, { type: file.type }) : file;
        const err = clientValidate(named, optsRef.current.imagesOnly);
        const item: UploadItem = { key: `${Date.now()}-${i}-${named.name}`, file: named, progress: 0, status: err ? "error" : "uploading", error: err ?? undefined, preview: named.type.startsWith("image/") && named.type !== "image/svg+xml" ? URL.createObjectURL(named) : undefined };
        return item;
      });
      setItems((prev) => [...prev, ...list]);
      const results = await Promise.all(list.filter((i) => i.status !== "error").map(run));
      return results.filter((r): r is UploadedFile => !!r);
    },
    [run],
  );

  const retry = (key: string) => { const it = items.find((i) => i.key === key); if (it) run(it); };
  const remove = (key: string) => setItems((list) => { const it = list.find((i) => i.key === key); if (it?.preview) URL.revokeObjectURL(it.preview); return list.filter((i) => i.key !== key); });
  const clear = () => setItems((list) => { list.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)); return []; });
  const busy = items.some((i) => i.status === "uploading");
  const uploaded = items.filter((i) => i.status === "done" && i.result).map((i) => i.result!);
  return { items, add, retry, remove, clear, busy, uploaded };
}
