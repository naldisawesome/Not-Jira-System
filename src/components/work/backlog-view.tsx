"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronDown, GripVertical, Layers, ListPlus, Zap } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Textarea, NativeSelect } from "@/components/ui/input";
import { TASK_TYPES } from "@/lib/constants";
import { bulkCreateTasks, updateTask } from "@/server/actions/tasks";
import { cn, fmtDate, taskKey } from "@/lib/utils";
import type { TaskRow } from "@/server/queries";
import { PriorityIcon, StatusPill, TypeIcon } from "@/components/tasks/badges";

type Sprint = { id: string; name: string; state: string; startDate: string; endDate: string; goal: string | null };

export function BacklogView({ tasks: initial, sprints, projectId, canEdit }: { tasks: TaskRow[]; sprints: Sprint[]; projectId: string; canEdit: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [bulk, setBulk] = useState("");
  const [bulkType, setBulkType] = useState("task");
  const [busy, setBusy] = useState(false);
  useEffect(() => setTasks(initial), [initial]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const open = sprints.filter((s) => s.state !== "completed");
  const sections = [...open.map((s) => ({ id: s.id, sprint: s })), { id: "backlog", sprint: null as Sprint | null }];

  async function move(id: string, sprintId: string | null) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.sprintId === sprintId) return;
    const prev = tasks;
    setTasks((l) => l.map((x) => (x.id === id ? { ...x, sprintId } : x)));
    const r = await updateTask({ id, patch: { sprintId } });
    if (!r.ok) { setTasks(prev); return toast.error(r.error); }
    toast.success(sprintId ? `Moved to ${sprints.find((s) => s.id === sprintId)?.name}` : "Moved to backlog");
    router.refresh();
  }
  const onDragEnd = (e: DragEndEvent) => e.over && move(String(e.active.id), e.over.id === "backlog" ? null : String(e.over.id));

  async function createBulk() {
    const titles = bulk.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!titles.length) return;
    setBusy(true);
    const r = await bulkCreateTasks({ projectId, titles, type: bulkType as never, sprintId: null });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Created ${r.data.created.length} tasks`);
    setBulk("");
    router.refresh();
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        {sections.map(({ id, sprint }) => {
          const list = tasks.filter((t) => (sprint ? t.sprintId === sprint.id : !t.sprintId));
          const est = list.reduce((a, t) => a + (t.estimateHours ?? 0), 0);
          return (
            <Section key={id} id={id} title={sprint ? sprint.name : "Backlog"} icon={sprint ? Zap : Layers} subtitle={sprint ? `${fmtDate(sprint.startDate, "MMM d")} – ${fmtDate(sprint.endDate, "MMM d")}${sprint.goal ? ` · ${sprint.goal}` : ""}` : "Tasks not planned into a sprint"} badge={sprint?.state === "active" ? <Badge color="#16a34a">Active</Badge> : sprint ? <Badge>Planned</Badge> : null} meta={`${list.length} tasks · ${est}h`}>
              {list.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">{canEdit ? "Drag tasks here" : "No tasks"}</p>}
              {list.map((t) => (
                <Row key={t.id} t={t} disabled={!canEdit}>
                  {canEdit && (
                    <NativeSelect className="h-7 w-36 text-xs" value={t.sprintId ?? ""} onChange={(e) => move(t.id, e.target.value || null)} aria-label="Move to sprint">
                      <option value="">Backlog</option>
                      {open.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </NativeSelect>
                  )}
                </Row>
              ))}
            </Section>
          );
        })}
        {canEdit && (
          <div className="rounded-xl border border-dashed p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><ListPlus className="size-4" /> Bulk create</p>
            <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={3} placeholder={"One task per line\nSet up staging environment\nWrite onboarding copy"} />
            <div className="mt-2 flex items-center gap-2">
              <NativeSelect className="h-8 w-40 text-xs" value={bulkType} onChange={(e) => setBulkType(e.target.value)}>{TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect>
              <Button size="sm" onClick={createBulk} loading={busy} disabled={!bulk.trim()}>Create {bulk.split("\n").filter((s) => s.trim()).length || ""} tasks</Button>
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}

function Section({ id, title, subtitle, badge, meta, icon: Icon, children }: { id: string; title: string; subtitle: string; badge: React.ReactNode; meta: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section ref={setNodeRef} className={cn("rounded-xl border bg-card shadow-soft transition-colors", isOver && "ring-2 ring-primary/30")}>
      <button onClick={() => setCollapsed((c) => !c)} className="flex w-full items-center gap-2 border-b px-4 py-3 text-left">
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{title}</span>
        {badge}
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{subtitle}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{meta}</span>
      </button>
      {!collapsed && <div className="divide-y">{children}</div>}
    </section>
  );
}

function Row({ t, disabled, children }: { t: TaskRow; disabled: boolean; children?: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({ id: t.id, disabled });
  return (
    <div ref={setNodeRef} style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 30, position: "relative" } : undefined} className={cn("flex items-center gap-2.5 bg-card px-3 py-2 text-[13px]", isDragging && "rounded-lg shadow-xl ring-1 ring-primary/30")}>
      {!disabled && <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground/60 hover:text-foreground" aria-label="Drag"><GripVertical className="size-4" /></span>}
      <TypeIcon type={t.type} />
      <span className="task-key w-16 shrink-0">{taskKey(t.projectKey, t.number)}</span>
      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate hover:underline">{t.title}</Link>
      <StatusPill name={t.statusName} color={t.statusColor} category={t.statusCategory} className="hidden md:inline-flex" />
      <PriorityIcon priority={t.priority} />
      <span className="hidden w-10 text-right text-xs tabular-nums text-muted-foreground sm:block">{t.estimateHours ? `${t.estimateHours}h` : "–"}</span>
      <Avatar name={t.assignee?.name} color={t.assignee?.avatarColor} size={20} />
      {children}
    </div>
  );
}
