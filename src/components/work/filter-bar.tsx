"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Bookmark, BookmarkPlus, Trash2, SlidersHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NativeSelect, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { useApp, useLookups } from "@/components/shell/app-context";
import { PRIORITIES, TASK_TYPES, STATUS_CATEGORIES } from "@/lib/constants";
import { saveFilter, deleteFilter } from "@/server/actions/collab";
import { cn } from "@/lib/utils";

export const FILTER_KEYS = ["q", "assignee", "reporter", "priority", "type", "label", "status", "category", "due", "sprint", "project"] as const;

export function FilterBar({ saved, projectScoped, show = ["assignee", "priority", "type", "label", "status", "due"], children }: { saved: { id: string; name: string; query: Record<string, string> }[]; projectScoped?: string; show?: string[]; children?: React.ReactNode }) {
  const app = useApp();
  const { statusesFor } = useLookups();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [name, setName] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set("q", q || null); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = FILTER_KEYS.filter((k) => k !== "project" && sp.get(k));
  const projectId = projectScoped ?? sp.get("project");
  const statuses = projectId ? statusesFor(projectId) : [];

  async function save() {
    const query: Record<string, string> = {};
    FILTER_KEYS.forEach((k) => { const v = sp.get(k); if (v) query[k] = v; });
    if (!Object.keys(query).length) return toast.error("Set some filters first.");
    const r = await saveFilter({ name: name.trim() || "Untitled filter", query });
    if (!r.ok) return toast.error(r.error);
    setName("");
    toast.success("Filter saved");
    router.refresh();
  }
  const apply = (query: Record<string, string>) => {
    const next = new URLSearchParams();
    if (sp.get("project")) next.set("project", sp.get("project")!);
    Object.entries(query).forEach(([k, v]) => (k !== "project" || !projectScoped) && next.set(k, v));
    setQ(query.q ?? "");
    start(() => router.replace(`${pathname}?${next.toString()}`));
  };

  const sel = "h-8 w-auto min-w-[120px] text-[13px]";
  const controls = (
    <>
      {show.includes("assignee") && (
        <NativeSelect className={sel} value={sp.get("assignee") ?? ""} onChange={(e) => set("assignee", e.target.value)} aria-label="Assignee">
          <option value="">Any assignee</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {app.members.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </NativeSelect>
      )}
      {show.includes("reporter") && (
        <NativeSelect className={sel} value={sp.get("reporter") ?? ""} onChange={(e) => set("reporter", e.target.value)} aria-label="Reporter">
          <option value="">Any reporter</option>
          <option value="me">Reported by me</option>
          {app.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </NativeSelect>
      )}
      {show.includes("priority") && (
        <NativeSelect className={sel} value={sp.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </NativeSelect>
      )}
      {show.includes("type") && (
        <NativeSelect className={sel} value={sp.get("type") ?? ""} onChange={(e) => set("type", e.target.value)} aria-label="Type">
          <option value="">Any type</option>
          <option value="bug,support">Issues (bugs & support)</option>
          {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </NativeSelect>
      )}
      {show.includes("label") && (
        <NativeSelect className={sel} value={sp.get("label") ?? ""} onChange={(e) => set("label", e.target.value)} aria-label="Label">
          <option value="">Any label</option>
          {app.labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </NativeSelect>
      )}
      {show.includes("status") && (
        statuses.length ? (
          <NativeSelect className={sel} value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        ) : (
          <NativeSelect className={sel} value={sp.get("category") ?? ""} onChange={(e) => set("category", e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            <option value="open">Open (not done)</option>
            {STATUS_CATEGORIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </NativeSelect>
        )
      )}
      {show.includes("due") && (
        <NativeSelect className={sel} value={sp.get("due") ?? ""} onChange={(e) => set("due", e.target.value)} aria-label="Due date">
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due in 7 days</option>
          <option value="upcoming">Upcoming</option>
          <option value="none">No due date</option>
        </NativeSelect>
      )}
    </>
  );

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or WEB-012…" className="h-8 pl-8 text-[13px]" />
        </div>
        <Button variant="outline" size="sm" className="md:hidden" onClick={() => setMobileOpen((v) => !v)}><SlidersHorizontal /> Filters {active.length > 0 && `(${active.length})`}</Button>
        <div className="hidden flex-wrap items-center gap-2 md:flex">{controls}</div>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {active.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setQ(""); apply({}); }}><X /> Clear</Button>}
        <div className="ml-auto flex items-center gap-2">
          {children}
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm"><Bookmark /> Saved</Button></PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Saved filters</p>
              {saved.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No saved filters yet.</p>}
              <ul>
                {saved.map((f) => (
                  <li key={f.id} className="group flex items-center rounded hover:bg-muted">
                    <button className="flex-1 px-2 py-1.5 text-left text-[13px]" onClick={() => apply(f.query)}>{f.name}</button>
                    <button className="p-1.5 opacity-0 group-hover:opacity-100" aria-label="Delete filter" onClick={async () => { const r = await deleteFilter({ id: f.id }); if (!r.ok) toast.error(r.error); else router.refresh(); }}><Trash2 className="size-3.5 text-muted-foreground" /></button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-1.5 border-t pt-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name current filters" className="h-8 text-xs" />
                <Button size="sm" onClick={save} disabled={!active.length}><BookmarkPlus /></Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className={cn("flex flex-wrap gap-2 md:hidden", !mobileOpen && "hidden")}>{controls}</div>
    </div>
  );
}
