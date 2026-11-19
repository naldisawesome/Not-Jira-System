"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCorners,
  type DragStartEvent, type DragOverEvent, type DragEndEvent, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Paperclip, MessageSquare, CalendarClock, ListTree, Columns3, Settings2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Switch } from "@/components/ui/misc";
import { useApp } from "@/components/shell/app-context";
import { moveTask } from "@/server/actions/tasks";
import { cn, fmtDate, isOverdue, taskKey } from "@/lib/utils";
import type { TaskRow } from "@/server/queries";
import { PriorityIcon, StatusIcon, TypeIcon } from "@/components/tasks/badges";

type Status = { id: string; name: string; color: string; category: string };

export function Board({ tasks: initial, statuses, projectId, canEdit }: { tasks: TaskRow[]; statuses: Status[]; projectId: string; canEdit: boolean }) {
  const app = useApp();
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => setTasks(initial), [initial]);
  useEffect(() => {
    try { setHidden(JSON.parse(localStorage.getItem(`board-hidden-${projectId}`) ?? "[]")); } catch { /* storage unavailable */ }
  }, [projectId]);
  const toggleHidden = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    setHidden(next);
    try { localStorage.setItem(`board-hidden-${projectId}`, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const columns = useMemo(() => {
    const map: Record<string, TaskRow[]> = Object.fromEntries(statuses.map((s) => [s.id, []]));
    for (const t of tasks) (map[t.statusId] ??= []).push(t);
    for (const k in map) map[k]!.sort((a, b) => a.position - b.position);
    return map;
  }, [tasks, statuses]);
  const visible = statuses.filter((s) => !hidden.includes(s.id));
  const active = tasks.find((t) => t.id === activeId);
  const columnOf = (id: string) => (statuses.some((s) => s.id === id) ? id : tasks.find((t) => t.id === id)?.statusId);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = columnOf(String(active.id));
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;
    const s = statuses.find((x) => x.id === to)!;
    setTasks((list) => list.map((t) => (t.id === active.id ? { ...t, statusId: to, statusName: s.name, statusColor: s.color, statusCategory: s.category as TaskRow["statusCategory"] } : t)));
  };
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return setTasks(initial);
    const id = String(active.id);
    const to = columnOf(String(over.id))!;
    const col = columns[to] ?? [];
    let ordered = col;
    const oldIndex = col.findIndex((t) => t.id === id);
    const overIndex = col.findIndex((t) => t.id === over.id);
    if (oldIndex !== -1 && overIndex !== -1 && oldIndex !== overIndex) ordered = arrayMove(col, oldIndex, overIndex);
    const idx = ordered.findIndex((t) => t.id === id);
    const before = ordered[idx - 1]?.id ?? null;
    const after = ordered[idx + 1]?.id ?? null;
    const moved = initial.find((t) => t.id === id);
    if (moved?.statusId === to && oldIndex === overIndex) return;
    // optimistic local order
    const tmpPos = ((ordered[idx - 1]?.position ?? (ordered[idx + 1]?.position ?? 1000) - 2000) + (ordered[idx + 1]?.position ?? (ordered[idx - 1]?.position ?? 0) + 2000)) / 2;
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, position: tmpPos } : t)));
    const r = await moveTask({ id, statusId: to, beforeId: before, afterId: after });
    if (!r.ok) {
      toast.error(r.error);
      setTasks(initial);
    } else router.refresh();
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2">
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" size="sm"><Columns3 /> Columns</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-60">
            <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Show columns</p>
            {statuses.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-muted">
                <StatusIcon category={s.category} color={s.color} /> <span className="flex-1">{s.name}</span>
                <Switch checked={!hidden.includes(s.id)} onCheckedChange={() => toggleHidden(s.id)} />
              </label>
            ))}
            {app.perms.manageWorkflows && <Link href="/admin/workflows" className="mt-1 flex items-center gap-1.5 border-t px-1.5 pt-2 text-xs text-primary hover:underline"><Settings2 className="size-3.5" /> Edit workflow statuses</Link>}
          </PopoverContent>
        </Popover>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); setTasks(initial); }}>
        <div className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {visible.map((s) => (
            <Column key={s.id} status={s} tasks={columns[s.id] ?? []} canEdit={canEdit} onAdd={() => app.openQuickCreate({ projectId, statusId: s.id })} />
          ))}
          {hidden.length > 0 && (
            <button onClick={() => { setHidden([]); try { localStorage.removeItem(`board-hidden-${projectId}`); } catch { /* ignore */ } }} className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
              <EyeOff className="size-3.5" /> {hidden.length} hidden <Eye className="size-3.5" />
            </button>
          )}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>{active ? <Card t={active} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ status, tasks, canEdit, onAdd }: { status: Status; tasks: TaskRow[]; canEdit: boolean; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id, disabled: !canEdit });
  return (
    <div className="flex w-[290px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <StatusIcon category={status.category} color={status.color} />
        <span className="text-[13px] font-semibold">{status.name}</span>
        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{tasks.length}</span>
        {canEdit && <button onClick={onAdd} className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Add task to ${status.name}`}><Plus className="size-3.5" /></button>}
      </div>
      <div ref={setNodeRef} className={cn("flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl bg-muted/50 p-1.5 transition-colors", isOver && "bg-accent/70 ring-2 ring-primary/20")}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => <SortableCard key={t.id} t={t} disabled={!canEdit} />)}
        </SortableContext>
        {tasks.length === 0 && <p className="py-6 text-center text-[11px] text-muted-foreground">Drop tasks here</p>}
      </div>
    </div>
  );
}

function SortableCard({ t, disabled }: { t: TaskRow; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={cn(isDragging && "opacity-40")}>
      <Card t={t} />
    </div>
  );
}

function Card({ t, overlay }: { t: TaskRow; overlay?: boolean }) {
  const overdue = isOverdue(t.dueDate, t.statusCategory);
  return (
    <Link href={`/tasks/${t.id}`} onClick={(e) => overlay && e.preventDefault()} draggable={false} className={cn("block rounded-lg border bg-card p-2.5 shadow-soft transition-shadow hover:border-foreground/15 hover:shadow-lift", overlay && "rotate-[1.5deg] cursor-grabbing shadow-2xl ring-1 ring-primary/30")}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <TypeIcon type={t.type} />
        <span className="task-key">{taskKey(t.projectKey, t.number)}</span>
        <PriorityIcon priority={t.priority} className="ml-auto" />
      </div>
      <p className={cn("text-[13px] font-medium leading-snug", t.statusCategory === "done" && "text-muted-foreground")}>{t.title}</p>
      {t.labels.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{t.labels.slice(0, 3).map((l) => <Badge key={l.id} color={l.color}>{l.name}</Badge>)}</div>}
      <div className="mt-2.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
        {t.dueDate && <span className={cn("flex items-center gap-1", overdue && "rounded bg-destructive/10 px-1 font-medium text-destructive")}><CalendarClock className="size-3" />{fmtDate(t.dueDate, "MMM d")}</span>}
        {t.subtaskCount > 0 && <span className="flex items-center gap-0.5"><ListTree className="size-3" />{t.subtaskDone}/{t.subtaskCount}</span>}
        {t.attachmentCount > 0 && <span className="flex items-center gap-0.5"><Paperclip className="size-3" />{t.attachmentCount}</span>}
        {t.commentCount > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="size-3" />{t.commentCount}</span>}
        <Avatar name={t.assignee?.name} color={t.assignee?.avatarColor} size={20} className="ml-auto" />
      </div>
    </Link>
  );
}
