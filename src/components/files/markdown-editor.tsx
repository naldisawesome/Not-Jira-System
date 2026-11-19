"use client";
import { useRef, useState } from "react";
import { Bold, Italic, Heading2, List, ListChecks, Code, Link2, ImagePlus, Quote, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPT_IMAGES } from "@/lib/files";
import { Tip } from "@/components/ui/misc";
import { useApp } from "@/components/shell/app-context";
import { Markdown } from "./markdown";
import { useUploader, type UploadedFile } from "./use-uploader";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  /** where pasted / inserted images are uploaded; omit to disable inline uploads */
  upload?: { context: string; taskId?: string; projectId?: string };
  onUploaded?: (f: UploadedFile) => void;
  autoFocus?: boolean;
  onSubmitShortcut?: () => void;
  className?: string;
};

/** Markdown rich-text editor: formatting toolbar, live preview, @mention suggestions, pasted/dropped inline images. */
export function MarkdownEditor({ value, onChange, placeholder, minRows = 6, upload, onUploaded, autoFocus, onSubmitShortcut, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [mention, setMention] = useState<{ q: string; start: number } | null>(null);
  const app = useApp();
  const uploader = useUploader(upload ?? { context: "description" }, { imagesOnly: false, onUploaded });

  const wrap = (before: string, after = before, placeholderText = "text") => {
    const el = ref.current!;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || placeholderText;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const linePrefix = (prefix: string) => {
    const el = ref.current!;
    const s = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length); });
  };
  const insertAtCursor = (text: string) => {
    const el = ref.current;
    const s = el?.selectionStart ?? value.length;
    const v = el?.value ?? value;
    onChange(v.slice(0, s) + text + v.slice(s));
  };

  async function uploadImages(files: File[]) {
    if (!upload) return toast.error("Save first, then add images.");
    const placeholderTag = `\n![Uploading ${files.length} file(s)…]()\n`;
    insertAtCursor(placeholderTag);
    const results = await uploader.add(files);
    const md = results.map((r) => (r.mimeType.startsWith("image/") ? `![${r.fileName}](${r.url})` : `[${r.fileName}](${r.url})`)).join("\n");
    const cur = ref.current?.value ?? value;
    onChange(cur.replace(placeholderTag, md ? `\n${md}\n` : ""));
    const failed = uploader.items.filter((i) => i.status === "error");
    if (results.length < files.length) toast.error(failed[failed.length - 1]?.error ?? "Some files failed to upload");
  }

  const members = mention ? app.members.filter((m) => m.isActive && (m.username.toLowerCase().startsWith(mention.q.toLowerCase()) || m.name.toLowerCase().includes(mention.q.toLowerCase()))).slice(0, 6) : [];
  const pickMention = (username: string) => {
    if (!mention) return;
    const el = ref.current!;
    const end = el.selectionStart;
    const next = value.slice(0, mention.start) + `@${username} ` + value.slice(end);
    onChange(next);
    setMention(null);
    requestAnimationFrame(() => { el.focus(); const p = mention.start + username.length + 2; el.setSelectionRange(p, p); });
  };

  const tools = [
    { icon: Bold, label: "Bold", run: () => wrap("**") },
    { icon: Italic, label: "Italic", run: () => wrap("_") },
    { icon: Heading2, label: "Heading", run: () => linePrefix("## ") },
    { icon: Quote, label: "Quote", run: () => linePrefix("> ") },
    { icon: List, label: "Bulleted list", run: () => linePrefix("- ") },
    { icon: ListChecks, label: "Checklist", run: () => linePrefix("- [ ] ") },
    { icon: Code, label: "Code", run: () => wrap("`") },
    { icon: Link2, label: "Link", run: () => wrap("[", "](https://)", "link text") },
  ];

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-surface focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20", className)}>
      <div className="flex items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1">
        <button type="button" onClick={() => setTab("write")} className={cn("rounded px-2 py-1 text-xs font-medium", tab === "write" ? "bg-surface shadow-soft" : "text-muted-foreground")}>Write</button>
        <button type="button" onClick={() => setTab("preview")} className={cn("rounded px-2 py-1 text-xs font-medium", tab === "preview" ? "bg-surface shadow-soft" : "text-muted-foreground")}>Preview</button>
        <span className="mx-1 h-4 w-px bg-border" />
        {tab === "write" && tools.map((t) => (
          <Tip key={t.label} content={t.label}>
            <button type="button" onClick={t.run} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t.label}><t.icon className="size-3.5" /></button>
          </Tip>
        ))}
        {tab === "write" && upload && (
          <Tip content="Insert image or file (or paste a screenshot)">
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Insert image">
              {uploader.busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
            </button>
          </Tip>
        )}
        <input ref={fileRef} type="file" hidden multiple accept={ACCEPT_IMAGES + ",.pdf,.docx,.xlsx,.csv,.zip,.txt"} onChange={(e) => { if (e.target.files?.length) uploadImages(Array.from(e.target.files)); e.target.value = ""; }} />
      </div>
      {tab === "write" ? (
        <div className="relative">
          <textarea
            ref={ref}
            value={value}
            autoFocus={autoFocus}
            rows={minRows}
            placeholder={placeholder ?? "Write in Markdown. Paste screenshots directly, @mention teammates…"}
            onChange={(e) => {
              onChange(e.target.value);
              const s = e.target.selectionStart;
              const m = e.target.value.slice(0, s).match(/(^|\s)@([a-z0-9_.-]*)$/i);
              setMention(m ? { q: m[2]!, start: s - m[2]!.length - 1 } : null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onSubmitShortcut?.(); }
              if (mention && members.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pickMention(members[0]!.username); }
              if (e.key === "Escape") setMention(null);
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) { e.preventDefault(); uploadImages(files); }
            }}
            onDrop={(e) => {
              if (e.dataTransfer.files.length) { e.preventDefault(); uploadImages(Array.from(e.dataTransfer.files)); }
            }}
            className="block w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          {mention && members.length > 0 && (
            <ul className="absolute bottom-2 left-3 z-10 w-64 overflow-hidden rounded-lg border bg-popover p-1 shadow-lift">
              {members.map((m) => (
                <li key={m.id}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(m.username); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted">
                    <span className="font-medium">{m.name}</span><span className="text-xs text-muted-foreground">@{m.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="min-h-[120px] px-3 py-2.5">{value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}</div>
      )}
    </div>
  );
}
