"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, isWeekend, max as maxDate, min as minDate, parseISO, startOfDay } from "date-fns";
import { Diamond, ZoomIn, ZoomOut, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { useLookups } from "@/components/shell/app-context";
import { updateTask } from "@/server/actions/tasks";
import { cn, taskKey, fmtDate } from "@/lib/utils";
import type { TaskRow } from "@/server/queries";
import { TypeIcon } from "@/components/tasks/badges";

type Milestone = { id: string; name: string; targetDate: string; completedAt: string | Date | null; projectId: string };
type Dep = { taskId: string; dependsOnId: string };

const ROW = 36;
const progressOf = (t: TaskRow) =>
  t.statusCategory === "done" ? 100 : t.statusCategory === "cancelled" ? 0 : t.subtaskCount ? Math.round((t.subtaskDone / t.subtaskCount) * 100) : t.estimateHours && t.loggedHours ? Math.min(95, Math.round((t.loggedHours / t.estimateHours) * 100)) : t.statusCategory === "in_progress" ? 40 : 0;

export function TimelineView({ tasks: initial, milestones, deps }: { tasks: TaskRow[]; milestones: Milestone[]; deps: Dep[] }) {
  const router = useRouter();
  const { project } = useLookups();
  const [tasks, setTasks] = useState(initial);
  const [dayW, setDayW] = useState(28);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "end" | "start"; x0: number; start: Date; end: Date } | null>(null);
  const [ghost, setGhost] = useState<{ id: string; start: Date; end: Date } | null>(null);
  useEffect(() => setTasks(initial), [initial]);

  const rows = useMemo(
    () =>
      tasks
        .map((t) => {
          const end = t.dueDate ? parseISO(t.dueDate) : null;
          const start = t.startDate ? parseISO(t.startDate) : end ? addDays(end, -Math.max(1, Math.ceil((t.estimateHours ?? 8) / 8))) : null;
          return { t, start: start && end && start > end ? end : start, end };
        })
        .filter((r) => r.start && r.end)
        .sort((a, b) => a.start!.getTime() - b.start!.getTime()) as { t: TaskRow; start: Date; end: Date }[],
    [tasks],
  );
  const today = startOfDay(new Date());
  const range = useMemo(() => {
    const dates = [today, ...rows.flatMap((r) => [r.start, r.end]), ...milestones.map((m) => parseISO(m.targetDate))];
    return { from: addDays(minDate(dates), -5), to: addDays(maxDate(dates), 10) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, milestones]);
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  const x = (d: Date) => differenceInCalendarDays(d, range.from) * dayW;
  const index = new Map(rows.map((r, i) => [r.t.id, i]));

  const scrollToToday = () => scroller.current?.scrollTo({ left: Math.max(0, x(today) - 200), behavior: "smooth" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { scrollToToday(); }, [dayW]);

  function onPointerDown(e: React.PointerEvent, r: { t: TaskRow; start: Date; end: Date }, mode: "move" | "end" | "start") {
    if (!project(r.t.projectId)?.canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: r.t.id, mode, x0: e.clientX, start: r.start, end: r.end };
    setGhost({ id: r.t.id, start: r.start, end: r.end });
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((e.clientX - d.x0) / dayW);
    if (d.mode === "move") setGhost({ id: d.id, start: addDays(d.start, delta), end: addDays(d.end, delta) });
    else if (d.mode === "end") setGhost({ id: d.id, start: d.start, end: maxDate([d.start, addDays(d.end, delta)]) });
    else setGhost({ id: d.id, start: minDate([d.end, addDays(d.start, delta)]), end: d.end });
  }
  async function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    const g = ghost;
    setGhost(null);
    if (!d || !g || (g.start.getTime() === d.start.getTime() && g.end.getTime() === d.end.getTime())) return;
    const patch = { startDate: format(g.start, "yyyy-MM-dd"), dueDate: format(g.end, "yyyy-MM-dd") };
    const prev = tasks;
    setTasks((list) => list.map((t) => (t.id === d.id ? { ...t, ...patch } : t)));
    const r = await updateTask({ id: d.id, patch });
    if (!r.ok) { setTasks(prev); return toast.error(r.error); }
    toast.success(`Scheduled ${fmtDate(patch.startDate, "MMM d")} → ${fmtDate(patch.dueDate, "MMM d")}`);
    router.refresh();
  }

  const width = days.length * dayW;
  const height = rows.length * ROW;
  const unscheduled = tasks.length - rows.length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setDayW((w) => Math.max(8, w - 6))}><ZoomOut /> Zoom out</Button>
        <Button variant="outline" size="sm" onClick={() => setDayW((w) => Math.min(60, w + 6))}><ZoomIn /> Zoom in</Button>
        <Button variant="outline" size="sm" onClick={scrollToToday}><Crosshair /> Today</Button>
        <p className="ml-auto text-xs text-muted-foreground">Drag bars to reschedule · drag edges to change duration{unscheduled > 0 && ` · ${unscheduled} task(s) without dates hidden`}</p>
      </div>
      <div className="flex overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="w-[300px] shrink-0 border-r">
          <div className="flex h-[52px] items-end border-b bg-muted/40 px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Task</div>
          {rows.map(({ t }) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-2 border-b px-3 text-[12.5px] hover:bg-muted/50" style={{ height: ROW }}>
              <TypeIcon type={t.type} />
              <span className="task-key shrink-0">{taskKey(t.projectKey, t.number)}</span>
              <span className={cn("truncate", t.parentId && "pl-2 text-muted-foreground")}>{t.title}</span>
              <Avatar name={t.assignee?.name} color={t.assignee?.avatarColor} size={18} className="ml-auto" />
            </Link>
          ))}
          {!rows.length && <p className="p-6 text-xs text-muted-foreground">No tasks with dates yet. Add start/due dates to see them here.</p>}
        </div>
        <div ref={scroller} className="scrollbar-thin relative flex-1 overflow-x-auto" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div style={{ width }} className="relative">
            <div className="sticky top-0 z-10 h-[52px] border-b bg-muted/40">
              {days.map((d, i) => (
                <div key={i} className={cn("absolute bottom-0 top-0 border-l border-border/60 text-center", d.getDate() === 1 && "border-l-foreground/30")} style={{ left: i * dayW, width: dayW }}>
                  {(d.getDate() === 1 || i === 0 || (dayW >= 20 && d.getDay() === 1 && d.getDate() > 3 && d.getDate() < 28)) && <span className="absolute left-1 top-1 whitespace-nowrap text-[10.5px] font-medium text-foreground/80">{format(d, d.getDate() === 1 || i === 0 ? "MMM yyyy" : "MMM d")}</span>}
                  {dayW >= 18 && <span className={cn("absolute bottom-1 left-0 right-0 text-[10px] tabular-nums text-muted-foreground", differenceInCalendarDays(d, today) === 0 && "font-bold text-primary")}>{format(d, "d")}</span>}
                </div>
              ))}
            </div>
            <div className="relative" style={{ height: Math.max(height, 120) }}>
              {days.map((d, i) => isWeekend(d) && <div key={i} className="absolute bottom-0 top-0 bg-muted/40" style={{ left: i * dayW, width: dayW }} />)}
              {rows.map((_, i) => <div key={i} className="absolute left-0 right-0 border-b border-border/50" style={{ top: (i + 1) * ROW - 1 }} />)}
              <div className="absolute bottom-0 top-0 z-[5] w-0.5 bg-primary" style={{ left: x(today) + dayW / 2 }}><span className="absolute -left-[18px] -top-0 rounded bg-primary px-1 text-[9px] font-bold text-primary-foreground">TODAY</span></div>
              {milestones.map((m) => {
                const d = parseISO(m.targetDate);
                return (
                  <div key={m.id} className="absolute bottom-0 top-0 z-[4]" style={{ left: x(d) + dayW / 2 }}>
                    <div className="h-full w-px border-l border-dashed border-violet-500/70" />
                    <div className="absolute -left-2 top-1 flex items-center gap-1 whitespace-nowrap" title={`${m.name} · ${fmtDate(m.targetDate)}`}>
                      <Diamond className={cn("size-4 fill-violet-500 text-violet-500", m.completedAt && "fill-emerald-500 text-emerald-500")} />
                      <span className="rounded bg-violet-500/10 px-1 text-[10px] font-medium text-violet-700 dark:text-violet-300">{m.name}</span>
                    </div>
                  </div>
                );
              })}
              <svg className="pointer-events-none absolute inset-0 z-[6]" width={width} height={height}>
                <defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" /></marker></defs>
                {deps.map((d) => {
                  const a = index.get(d.dependsOnId);
                  const b = index.get(d.taskId);
                  if (a === undefined || b === undefined) return null;
                  const ra = rows[a]!, rb = rows[b]!;
                  const x1 = x(ra.end) + dayW, y1 = a * ROW + ROW / 2;
                  const x2 = x(rb.start), y2 = b * ROW + ROW / 2;
                  const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 14));
                  return <path key={`${d.taskId}-${d.dependsOnId}`} d={`M${x1},${y1} H${mid} V${y2} H${x2 - 1}`} fill="none" className="stroke-muted-foreground/70" strokeWidth={1.25} markerEnd="url(#arrow)" />;
                })}
              </svg>
              {rows.map((r, i) => {
                const g = ghost?.id === r.t.id ? ghost : null;
                const s = g?.start ?? r.start, e = g?.end ?? r.end;
                const pct = progressOf(r.t);
                const editable = !!project(r.t.projectId)?.canEdit;
                const left = x(s), w = Math.max(dayW, (differenceInCalendarDays(e, s) + 1) * dayW);
                return (
                  <div key={r.t.id} className={cn("group absolute z-[7] flex items-center overflow-hidden rounded-md text-[11px] font-medium text-white shadow-sm", editable && "cursor-grab active:cursor-grabbing", g && "ring-2 ring-primary/50")} style={{ top: i * ROW + 7, height: ROW - 14, left, width: w, background: r.t.statusCategory === "done" ? "#94a3b8" : r.t.projectColor }} onPointerDown={(ev) => onPointerDown(ev, r, "move")} title={`${r.t.title} · ${fmtDate(s, "MMM d")} → ${fmtDate(e, "MMM d")} · ${pct}%`}>
                    <div className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${pct}%` }} />
                    {editable && <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize opacity-0 group-hover:bg-white/40 group-hover:opacity-100" onPointerDown={(ev) => onPointerDown(ev, r, "start")} />}
                    <span className="relative truncate px-2">{w > 70 ? r.t.title : ""}</span>
                    {w > 120 && <span className="relative ml-auto pr-2 tabular-nums opacity-90">{pct}%</span>}
                    {editable && <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize opacity-0 group-hover:bg-white/40 group-hover:opacity-100" onPointerDown={(ev) => onPointerDown(ev, r, "end")} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
