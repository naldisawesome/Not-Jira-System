"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Trash2, X, MessageSquare, Paperclip, Copy } from "lucide-react";
import { toast } from "sonner";
import { Checkbox, Avatar, Badge, Tip } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { useApp, useLookups } from "@/components/shell/app-context";
import { PRIORITIES } from "@/lib/constants";
import { bulkUpdateTasks, cloneTask, deleteTasks, updateTask } from "@/server/actions/tasks";
import { cn, fmtDate, isOverdue, taskKey } from "@/lib/utils";
import type { TaskRow } from "@/server/queries";
import { PriorityIcon, StatusIcon, TypeIcon } from "@/components/tasks/badges";

const COLS: { key: string; label: string; className?: string }[] = [
  { key: "key", label: "ID", className: "w-[90px]" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status", className: "w-[150px]" },
  { key: "priority", label: "Priority", className: "w-[120px]" },
  { key: "assignee", label: "Assignee", className: "w-[170px]" },
  { key: "due", label: "Due", className: "w-[140px]" },
  { key: "updated", label: "Updated", className: "w-[100px] hidden xl:table-cell" },
];

export function ListView({ tasks, total, page, pageSize, singleProject }: { tasks: TaskRow[]; total: number; page: number; pageSize: number; singleProject?: string }) {
  const app = useApp();
  const { statusesFor, project } = useLookups();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState(tasks);
  const [pending, start] = useTransition();
  useEffect(() => { setRows(tasks); setSelected((s) => s.filter((id) => tasks.some((t) => t.id === id))); }, [tasks]);

  const sort = sp.get("sort") ?? "updated";
  const dir = sp.get("dir") ?? (sort === "updated" ? "desc" : "asc");
  const setParam = (pairs: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(pairs).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };
  const toggleSort = (k: string) => setParam({ sort: k, dir: sort === k && dir === "asc" ? "desc" : "asc", page: null });

  async function patch(t: TaskRow, p: Record<string, unknown>) {
    const before = rows;
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, ...optimistic(p) } : x)));
    const res = await updateTask({ id: t.id, patch: p });
    if (!res.ok) { setRows(before); return toast.error(res.error); }
    router.refresh();
  }
  const optimistic = (p: Record<string, unknown>): Partial<TaskRow> => {
    const o: Partial<TaskRow> = { ...(p as Partial<TaskRow>) };
    if (p.statusId) { const s = app.statuses.find((x) => x.id === p.statusId); if (s) Object.assign(o, { statusName: s.name, statusColor: s.color, statusCategory: s.category }); }
    if ("assigneeId" in p) { const m = app.members.find((x) => x.id === p.assigneeId); o.assignee = m ? { id: m.id, name: m.name, avatarColor: m.avatarColor, username: m.username } : { id: null, name: null, avatarColor: null, username: null } as never; }
    return o;
  };

  const selTasks = rows.filter((r) => selected.includes(r.id));
  const sameProject = selTasks.length > 0 && selTasks.every((t) => t.projectId === selTasks[0]!.projectId) ? selTasks[0]!.projectId : null;
  async function bulk(p: Record<string, unknown>) {
    const r = await bulkUpdateTasks({ ids: selected, patch: p });
    if (!r.ok) return toast.error(r.error);
    toast.success(`Updated ${r.data.updated} task${r.data.updated === 1 ? "" : "s"}${r.data.failed ? ` · ${r.data.failed} skipped (no permission)` : ""}`);
    setSelected([]);
    router.refresh();
  }
  async function bulkDelete() {
    if (!confirm(`Delete ${selected.length} task(s)? This cannot be undone.`)) return;
    const r = await deleteTasks({ ids: selected });
    if (!r.ok) return toast.error(r.error);
    toast.success(`Deleted ${r.data.deleted} task(s)`);
    setSelected([]);
    router.refresh();
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const allChecked = rows.length > 0 && selected.length === rows.length;

  return (
    <div className="relative">
      <div className={cn("overflow-hidden rounded-xl border bg-card shadow-soft transition-opacity", pending && "opacity-60")}>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11.5px] font-medium text-muted-foreground">
                <th className="w-10 px-3 py-2.5"><Checkbox checked={allChecked ? true : selected.length ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])} aria-label="Select all" /></th>
                {COLS.map((c) => (
                  <th key={c.key} className={cn("px-2 py-2.5", c.className)}>
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.label}
                      {sort === c.key && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="py-16 text-center text-sm text-muted-foreground">No tasks match these filters.</td></tr>}
              {rows.map((t) => {
                const p = project(t.projectId);
                const editable = !!p?.canEdit;
                const statuses = statusesFor(t.projectId);
                const overdue = isOverdue(t.dueDate, t.statusCategory);
                return (
                  <tr key={t.id} className={cn("group border-b last:border-0 hover:bg-muted/40", selected.includes(t.id) && "bg-accent/40")}>
                    <td className="px-3 py-1.5"><Checkbox checked={selected.includes(t.id)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, t.id] : s.filter((x) => x !== t.id)))} aria-label={`Select ${t.title}`} /></td>
                    <td className="px-2 py-1.5"><span className="flex items-center gap-1.5"><TypeIcon type={t.type} /><span className="task-key">{taskKey(t.projectKey, t.number)}</span></span></td>
                    <td className="max-w-0 px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <Link href={`/tasks/${t.id}`} className="min-w-0 truncate font-medium hover:underline" title={t.title}>{t.title}</Link>
                        {t.labels.slice(0, 1).map((l) => <Badge key={l.id} color={l.color} className="hidden shrink-0 2xl:inline-flex">{l.name}</Badge>)}
                        <span className="ml-auto hidden shrink-0 items-center gap-2 text-[11px] text-muted-foreground md:flex">
                          {t.attachmentCount > 0 && <span className="flex items-center gap-0.5"><Paperclip className="size-3" />{t.attachmentCount}</span>}
                          {t.commentCount > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="size-3" />{t.commentCount}</span>}
                          {!singleProject && <span className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: t.projectColor }} />{t.projectKey}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="relative flex items-center">
                        <StatusIcon category={t.statusCategory} color={t.statusColor} className="pointer-events-none absolute left-2" />
                        <select disabled={!editable} value={t.statusId} onChange={(e) => patch(t, { statusId: e.target.value })} className="h-7 w-full cursor-pointer appearance-none rounded-md border border-transparent bg-transparent pl-7 pr-2 text-[12.5px] hover:border-input focus:border-input focus:outline-none disabled:cursor-default" aria-label="Status">
                          {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="relative flex items-center">
                        <PriorityIcon priority={t.priority} className="pointer-events-none absolute left-2" />
                        <select disabled={!editable} value={t.priority} onChange={(e) => patch(t, { priority: e.target.value })} className="h-7 w-full cursor-pointer appearance-none rounded-md border border-transparent bg-transparent pl-7 pr-2 text-[12.5px] hover:border-input focus:border-input focus:outline-none disabled:cursor-default" aria-label="Priority">
                          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="relative flex items-center">
                        <Avatar name={t.assignee?.name} color={t.assignee?.avatarColor} size={18} className="pointer-events-none absolute left-1.5" />
                        <select disabled={!editable} value={t.assignee?.id ?? ""} onChange={(e) => patch(t, { assigneeId: e.target.value || null })} className="h-7 w-full cursor-pointer appearance-none truncate rounded-md border border-transparent bg-transparent pl-7 pr-2 text-[12.5px] hover:border-input focus:border-input focus:outline-none disabled:cursor-default" aria-label="Assignee">
                          <option value="">Unassigned</option>
                          {app.members.filter((m) => m.isActive || m.id === t.assignee?.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <input type="date" disabled={!editable} value={t.dueDate ?? ""} onChange={(e) => patch(t, { dueDate: e.target.value || null })} className={cn("h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[12.5px] tabular-nums hover:border-input focus:border-input focus:outline-none", overdue && "font-medium text-destructive", !t.dueDate && "text-muted-foreground")} aria-label="Due date" />
                    </td>
                    <td className="hidden px-2 py-1.5 text-xs text-muted-foreground xl:table-cell">{fmtDate(t.updatedAt, "MMM d")}</td>
                    <td className="px-2">
                      {editable && (
                        <Tip content="Clone task">
                          <button className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100" onClick={async () => { const r = await cloneTask({ id: t.id }); if (!r.ok) toast.error(r.error); else { toast.success(`Cloned as ${r.data.key}`); router.refresh(); } }} aria-label="Clone"><Copy className="size-3.5" /></button>
                        </Tip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>{total === 0 ? "0 tasks" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} tasks`}</span>
          <div className="flex items-center gap-2">
            <NativeSelect value={String(pageSize)} onChange={(e) => setParam({ size: e.target.value, page: null })} className="h-7 w-auto text-xs" aria-label="Page size">
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </NativeSelect>
            <Button variant="outline" size="icon" className="size-7" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft /></Button>
            <span className="tabular-nums">Page {page} / {pages}</span>
            <Button variant="outline" size="icon" className="size-7" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })} aria-label="Next page"><ChevronRight /></Button>
          </div>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-2xl animate-in slide-in-from-bottom-4">
          <span className="text-[13px] font-medium">{selected.length} selected</span>
          <span className="h-5 w-px bg-border" />
          {sameProject && (
            <NativeSelect className="h-8 w-36 text-xs" value="" onChange={(e) => e.target.value && bulk({ statusId: e.target.value })} aria-label="Set status">
              <option value="">Set status…</option>
              {statusesFor(sameProject).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
          )}
          <NativeSelect className="h-8 w-36 text-xs" value="" onChange={(e) => e.target.value && bulk({ priority: e.target.value })} aria-label="Set priority">
            <option value="">Set priority…</option>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </NativeSelect>
          <NativeSelect className="h-8 w-40 text-xs" value="" onChange={(e) => e.target.value && bulk({ assigneeId: e.target.value === "none" ? null : e.target.value })} aria-label="Assign to">
            <option value="">Assign to…</option>
            <option value="none">Unassigned</option>
            {app.members.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </NativeSelect>
          <input type="date" className="h-8 rounded-md border bg-surface px-2 text-xs" onChange={(e) => e.target.value && bulk({ dueDate: e.target.value })} aria-label="Set due date" />
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={bulkDelete}><Trash2 /> Delete</Button>
          <Button variant="ghost" size="icon" onClick={() => setSelected([])} aria-label="Clear selection"><X /></Button>
        </div>
      )}
    </div>
  );
}
