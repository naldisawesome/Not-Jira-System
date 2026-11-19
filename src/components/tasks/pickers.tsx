"use client";
import { useState } from "react";
import { Check, Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { createLabel } from "@/server/actions/tasks";
import { useApp } from "@/components/shell/app-context";
import { cn } from "@/lib/utils";
import { PROJECT_COLORS } from "@/lib/constants";

export function MemberSelect({ value, onChange, memberIds, allowNone = true, className, disabled, placeholder = "Unassigned" }: { value: string | null | undefined; onChange: (v: string | null) => void; memberIds?: string[]; allowNone?: boolean; className?: string; disabled?: boolean; placeholder?: string }) {
  const app = useApp();
  const list = app.members.filter((m) => m.isActive && (!memberIds || memberIds.includes(m.id) || m.id === value));
  return (
    <NativeSelect value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={className}>
      {allowNone && <option value="">{placeholder}</option>}
      {list.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === app.me.id ? " (you)" : ""}</option>)}
    </NativeSelect>
  );
}

export function LabelPicker({ value, onChange, disabled }: { value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const app = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const selected = app.labels.filter((l) => value.includes(l.id));
  const filtered = app.labels.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  async function create() {
    setCreating(true);
    const r = await createLabel({ name: q.trim(), color: PROJECT_COLORS[app.labels.length % PROJECT_COLORS.length]! });
    setCreating(false);
    if (!r.ok) return toast.error(r.error);
    onChange([...value, r.data.id]);
    setQ("");
    router.refresh();
  }

  return (
    <Popover>
      <PopoverTrigger disabled={disabled} className={cn("flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-surface px-2 py-1.5 text-left text-sm shadow-sm hover:border-foreground/20 disabled:opacity-50")}>
        {selected.length ? selected.map((l) => <Badge key={l.id} color={l.color}>{l.name}</Badge>) : <span className="flex items-center gap-1.5 text-muted-foreground"><Tag className="size-3.5" /> Add labels</span>}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or create…" className="mb-1 h-8" onKeyDown={(e) => { if (e.key === "Enter" && q.trim() && !filtered.length) { e.preventDefault(); create(); } }} />
        <ul className="max-h-56 overflow-y-auto">
          {filtered.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => toggle(l.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-muted">
                <span className="size-2.5 rounded-full" style={{ background: l.color }} />
                {l.name}
                {value.includes(l.id) && <Check className="ml-auto size-3.5 text-primary" />}
              </button>
            </li>
          ))}
          {q.trim() && !app.labels.some((l) => l.name.toLowerCase() === q.trim().toLowerCase()) && !app.perms.isViewer && (
            <li><button type="button" disabled={creating} onClick={create} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[13px] text-primary hover:bg-muted"><Plus className="size-3.5" /> Create “{q.trim()}”</button></li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
