"use client";
import { useRouter } from "next/navigation";
import { Dropzone } from "./dropzone";
import { useUploader } from "./use-uploader";
import { toast } from "sonner";

/** Dropzone that uploads immediately and refreshes server data when each file lands. */
export function FileUploaderPanel({ target, imagesOnly, compact, label, onUploaded }: { target: { context: string; taskId?: string; projectId?: string }; imagesOnly?: boolean; compact?: boolean; label?: string; onUploaded?: (id: string) => void }) {
  const router = useRouter();
  const up = useUploader(target, {
    imagesOnly,
    onUploaded: (f) => {
      toast.success(`Uploaded ${f.fileName}`);
      onUploaded?.(f.id);
      router.refresh();
    },
  });
  return (
    <Dropzone
      items={up.items.filter((i) => i.status !== "done")}
      onFiles={up.add}
      onRetry={up.retry}
      onRemove={up.remove}
      imagesOnly={imagesOnly}
      compact={compact}
      label={label}
    />
  );
}
