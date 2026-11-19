"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarX2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLookups } from "@/components/shell/app-context";
import { updateTask } from "@/server/actions/tasks";
import { cn, isOverdue, taskKey } from "@/lib/utils";
import type { TaskRow } from "@/server/queries";
import { PriorityIcon, TypeIcon } from "@/components/tasks/badges";

export function CalendarView({ tasks: initial, unscheduled, anchor, mode }: { tasks: TaskRow[]; unscheduled: TaskRow[]; anchor: string; mode: "month" | "week" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { project } = useLookups();
  const [tasks, setTasks] = useState([...initial, ...unscheduled]);
  const [dragging, setDragging] = useState<TaskRow | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setTasks([...initial, ...unscheduled]), [initial, unscheduled]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const date = parseISO(anchor);
  const days = useMemo(() => {
    const s = mode === "month" ? startOfWeek(startOfMonth(date), { weekStartsOn: 1 }) : startOfWeek(date, { weekStartsOn: 1 });
    const e = mode === "month" ? endOfWeek(endOfMonth(date), { weekStartsOn: 1 }) : endOfWeek(date, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: s, end: e });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, mode]);
  const byDay = useMemo(() => {
    const m: Record<string, TaskRow[]> = {};
    for (const t of tasks) if (t.dueDate) (m[t.dueDate] ??= []).push(t);
    return m;
  }, [tasks]);
  const noDate = tasks.filter((t) => !t.dueDate);

  const nav = (to: Date | null, m = mode) => {
    const next = new URLSearchParams(sp.toString());
    if (to) next.set("date", format(to, "yyyy-MM-dd")); else next.delete("date");
    next.set("mode", m);
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const id = String(e.active.id);
    const day = e.over?.id ? String(e.over.id) : null;
    const t = tasks.find((x) => x.id === id);
    if (!t || !day || t.dueDate === day) return;
    const newDue = day === "none" ? null : day;
    const prev = tasks;
    // keep duration when rescheduling a task that has a start date
    const patch: Record<string, string | null> = { dueDate: newDue };
    if (newDue && t.startDate && t.dueDate) {
      const span = (parseISO(t.dueDate).getTime() - parseISO(t.startDate).getTime()) / 864e5;
      patch.startDate = format(addDays(parseISO(newDue), -span), "yyyy-MM-dd");
    }
    setTasks((list) => list.map((x) => (x.id === id ? { ...x, dueDate: newDue, startDate: patch.startDate ?? x.startDate } : x)));
    const r = await updateTask({ id, patch });
    if (!r.ok) { setTasks(prev); return toast.error(r.error); }
    toast.success(newDue ? `Rescheduled to ${format(parseISO(newDue), "MMM d")}` : "Due date cleared");
    router.refresh();
  }

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className={cn("min-w-0 flex-1 transition-opacity", pending && "opacity-60")}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-lg font-semibold tracking-tight">{mode === "month" ? format(date, "MMMM yyyy") : `${format(days[0]!, "MMM d")} – ${format(days[days.length - 1]!, "MMM d, yyyy")}`}</h2>
            <Button variant="outline" size="icon" onClick={() => nav(mode === "month" ? addMonths(date, -1) : addWeeks(date, -1))} aria-label="Previous"><ChevronLeft /></Button>
            <Button variant="outline" size="sm" onClick={() => nav(null)}>Today</Button>
            <Button variant="outline" size="icon" onClick={() => nav(mode === "month" ? addMonths(date, 1) : addWeeks(date, 1))} aria-label="Next"><ChevronRight /></Button>
            <Tabs value={mode} onValueChange={(v) => nav(date, v as "month" | "week")} className="ml-auto">
              <TabsList><TabsTrigger value="month">Month</TabsTrigger><TabsTrigger value="week">Week</TabsTrigger></TabsList>
            </Tabs>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                return <Day key={key} id={key} date={d} muted={mode === "month" && !isSameMonth(d, date)} tall={mode === "week"} tasks={byDay[key] ?? []} canEdit={(t) => !!project(t.projectId)?.canEdit} />;
              })}
            </div>
          </div>
        </div>
        <Unscheduled tasks={noDate} canEdit={(t) => !!project(t.projectId)?.canEdit} />
      </div>
      <DragOverlay>{dragging ? <Chip t={dragging} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Day({ id, date, muted, tall, tasks, canEdit }: { id: string; date: Date; muted: boolean; tall: boolean; tasks: TaskRow[]; canEdit: (t: TaskRow) => boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [expanded, setExpanded] = useState(false);
  const max = tall ? 50 : 3;
  const shown = expanded ? tasks : tasks.slice(0, max);
  return (
    <div ref={setNodeRef} className={cn("min-h-[112px] border-b border-r p-1.5 transition-colors [&:nth-child(7n)]:border-r-0", tall && "min-h-[420px]", muted && "bg-muted/30", isOver && "bg-accent/60")}>
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span className={cn("flex size-6 items-center justify-center rounded-full text-xs tabular-nums", muted && "text-muted-foreground", isToday(date) && "bg-primary font-semibold text-primary-foreground")}>{format(date, "d")}</span>
        {tasks.length > 0 && <span className="text-[10px] text-muted-foreground">{tasks.length}</span>}
      </div>
      <div className="space-y-1">
        {shown.map((t) => <DraggableChip key={t.id} t={t} disabled={!canEdit(t)} />)}
        {tasks.length > max && !expanded && <button onClick={() => setExpanded(true)} className="w-full rounded px-1 text-left text-[11px] text-muted-foreground hover:bg-muted">+{tasks.length - max} more</button>}
      </div>
    </div>
  );
}

function DraggableChip({ t, disabled }: { t: TaskRow; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled });
  return <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && "opacity-30")}><Chip t={t} /></div>;
}

function Chip({ t, overlay }: { t: TaskRow; overlay?: boolean }) {
  const overdue = isOverdue(t.dueDate, t.statusCategory);
  const done = t.statusCategory === "done";
  return (
    <Link href={`/tasks/${t.id}`} draggable={false} onClick={(e) => overlay && e.preventDefault()} className={cn("flex items-center gap-1 truncate rounded-md border-l-[3px] bg-surface px-1.5 py-1 text-[11.5px] shadow-sm ring-1 ring-border hover:ring-foreground/20", overdue && "bg-destructive/[0.06] ring-destructive/30", done && "opacity-60", overlay && "w-44 shadow-xl")} style={{ borderLeftColor: overdue ? "#dc2626" : t.projectColor }} title={`${taskKey(t.projectKey, t.number)} ${t.title}`}>
      <TypeIcon type={t.type} className="size-3" />
      <span className={cn("truncate", done && "line-through")}>{t.title}</span>
    </Link>
  );
}

function Unscheduled({ tasks, canEdit }: { tasks: TaskRow[]; canEdit: (t: TaskRow) => boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "none" });
  return (
    <aside ref={setNodeRef} className={cn("w-full shrink-0 rounded-xl border bg-card p-3 shadow-soft transition-colors xl:w-64", isOver && "bg-accent/60")}>
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><CalendarX2 className="size-4 text-muted-foreground" /> Unscheduled <span className="ml-auto text-xs font-normal text-muted-foreground">{tasks.length}</span></div>
      <p className="mb-2 text-[11px] text-muted-foreground">Drag onto a day to set a due date. Drop here to clear it.</p>
      <div className="scrollbar-thin max-h-[560px] space-y-1.5 overflow-y-auto">
        {tasks.map((t) => (
          <DraggableRow key={t.id} t={t} disabled={!canEdit(t)} />
        ))}
        {!tasks.length && <p className="py-6 text-center text-[11px] text-muted-foreground">Everything has a date.</p>}
      </div>
    </aside>
  );
}

function DraggableRow({ t, disabled }: { t: TaskRow; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("flex cursor-grab items-center gap-2 rounded-md border bg-surface px-2 py-1.5 text-xs hover:border-foreground/20", isDragging && "opacity-30")}>
      <PriorityIcon priority={t.priority} />
      <span className="task-key">{taskKey(t.projectKey, t.number)}</span>
      <span className="truncate">{t.title}</span>
      <Avatar name={t.assignee?.name} color={t.assignee?.avatarColor} size={18} className="ml-auto" />
    </div>
  );
}
