"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, CheckCircle2, Plus, Trash2, Diamond, Zap, Target, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Progress, EmptyState, Checkbox } from "@/components/ui/misc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { createMilestone, createSprint, deleteSprint, updateMilestone, updateSprint } from "@/server/actions/projects";
import { cn, fmtDate } from "@/lib/utils";
import { differenceInCalendarDays, parseISO, addDays, format } from "date-fns";

export type SprintStat = { id: string; name: string; goal: string | null; state: string; startDate: string; endDate: string; completedAt: string | Date | null; total: number; done: number; estimate: number; doneEstimate: number; inProgress: number };
export type MilestoneStat = { id: string; name: string; description: string | null; targetDate: string; completedAt: string | Date | null; total: number; done: number };

export function SprintsView({ projectId, sprints, milestones, canManage }: { projectId: string; sprints: SprintStat[]; milestones: MilestoneStat[]; canManage: boolean }) {
  const router = useRouter();
  const [newSprint, setNewSprint] = useState(false);
  const [newMs, setNewMs] = useState(false);
  const [completing, setCompleting] = useState<SprintStat | null>(null);
  const planned = sprints.filter((s) => s.state === "planned");

  const act = async (p: Promise<{ ok: boolean; error?: string }>, msg: string) => {
    const r = await p;
    if (!r.ok) return toast.error(r.error);
    toast.success(msg);
    router.refresh();
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sprints</h2>
          {canManage && <Button size="sm" onClick={() => setNewSprint(true)}><Plus /> New sprint</Button>}
        </div>
        {sprints.length === 0 && <EmptyState icon={Zap} title="No sprints yet" description="Sprints are time-boxed iterations. Plan work into them from the Backlog." />}
        {sprints.map((s) => {
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
          const daysLeft = differenceInCalendarDays(parseISO(s.endDate), new Date());
          const totalDays = Math.max(1, differenceInCalendarDays(parseISO(s.endDate), parseISO(s.startDate)));
          const elapsed = Math.min(100, Math.max(0, Math.round(((totalDays - daysLeft) / totalDays) * 100)));
          return (
            <Card key={s.id} className={cn(s.state === "active" && "ring-1 ring-primary/30")}>
              <CardContent className="pt-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{s.name}</h3>
                      <Badge color={s.state === "active" ? "#16a34a" : s.state === "completed" ? "#64748b" : "#2563eb"}>{s.state === "active" ? "Active" : s.state === "completed" ? "Completed" : "Planned"}</Badge>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><CalendarRange className="size-3" />{fmtDate(s.startDate, "MMM d")} – {fmtDate(s.endDate, "MMM d, yyyy")}{s.state === "active" && <span className={cn("ml-1", daysLeft < 0 && "text-destructive")}>· {daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days over`}</span>}</p>
                    {s.goal && <p className="mt-1.5 flex items-start gap-1.5 text-[13px]"><Target className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />{s.goal}</p>}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      {s.state === "planned" && <Button size="sm" variant="outline" onClick={() => act(updateSprint({ id: s.id, data: { state: "active" } }), `${s.name} started`)}><Play /> Start</Button>}
                      {s.state === "active" && <Button size="sm" onClick={() => setCompleting(s)}><CheckCircle2 /> Complete</Button>}
                      {s.state !== "active" && <Button size="icon" variant="ghost" onClick={() => confirm(`Delete ${s.name}? Tasks return to the backlog.`) && act(deleteSprint({ id: s.id }), "Sprint deleted")} aria-label="Delete sprint"><Trash2 /></Button>}
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                  {[["Tasks", s.total], ["Done", s.done], ["In progress", s.inProgress], ["Hours", `${s.doneEstimate}/${s.estimate}`]].map(([l, v]) => (
                    <div key={l as string} className="rounded-lg bg-muted/50 py-2"><p className="text-lg font-semibold tabular-nums">{v}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>
                  ))}
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-[11px] text-muted-foreground"><span>Completion</span><span className="font-medium text-foreground">{pct}%</span></div>
                  <Progress value={pct} />
                  {s.state === "active" && <><div className="flex justify-between text-[11px] text-muted-foreground"><span>Time elapsed</span><span>{elapsed}%</span></div><Progress value={elapsed} color="#94a3b8" /></>}
                </div>
                <div className="mt-3 flex gap-3 text-xs">
                  <Link href={`/projects/${projectId}/list?sprint=${s.id}`} className="font-medium text-primary hover:underline">View tasks</Link>
                  {s.state === "completed" && <span className="text-muted-foreground">Completed {fmtDate(s.completedAt, "MMM d")} · {s.done} of {s.total} delivered</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="h-fit">
        <CardHeader title="Milestones" description="Key dates linked to tasks" action={canManage && <Button size="sm" variant="outline" onClick={() => setNewMs(true)}><Plus /> Add</Button>} />
        <CardContent className="space-y-3">
          {milestones.length === 0 && <p className="text-xs text-muted-foreground">No milestones yet.</p>}
          {milestones.map((m) => {
            const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
            const late = !m.completedAt && differenceInCalendarDays(parseISO(m.targetDate), new Date()) < 0;
            return (
              <div key={m.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  {canManage ? <Checkbox checked={!!m.completedAt} onCheckedChange={(v) => act(updateMilestone({ id: m.id, data: { completed: !!v } }), v ? "Milestone completed" : "Milestone reopened")} aria-label="Complete" /> : <Diamond className="size-4 text-violet-500" />}
                  <span className={cn("flex-1 text-[13px] font-medium", m.completedAt && "text-muted-foreground line-through")}>{m.name}</span>
                  <span className={cn("text-xs tabular-nums text-muted-foreground", late && "font-medium text-destructive")}>{fmtDate(m.targetDate, "MMM d")}</span>
                  {canManage && <button onClick={() => confirm("Delete milestone?") && act(updateMilestone({ id: m.id, data: { remove: true } }), "Milestone deleted")} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Delete"><Trash2 className="size-3.5" /></button>}
                </div>
                <div className="mt-2 flex items-center gap-2"><Progress value={pct} color="#8b5cf6" /><span className="w-16 text-right text-[11px] tabular-nums text-muted-foreground">{m.done}/{m.total} · {pct}%</span></div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <SprintDialog open={newSprint} onOpenChange={setNewSprint} projectId={projectId} next={sprints.length + 1} lastEnd={sprints.at(-1)?.endDate} />
      <MilestoneDialog open={newMs} onOpenChange={setNewMs} projectId={projectId} />
      <Dialog open={!!completing} onOpenChange={(o) => !o && setCompleting(null)}>
        {completing && <CompleteDialog sprint={completing} planned={planned} onDone={() => setCompleting(null)} />}
      </Dialog>
    </div>
  );
}

function CompleteDialog({ sprint, planned, onDone }: { sprint: SprintStat; planned: SprintStat[]; onDone: () => void }) {
  const router = useRouter();
  const [target, setTarget] = useState(planned[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const open = sprint.total - sprint.done;
  return (
    <DialogContent title={`Complete ${sprint.name}`} description={`${sprint.done} of ${sprint.total} tasks done.`}>
      {open > 0 ? (
        <Field label={`Move ${open} unfinished task(s) to`}>
          <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Backlog</option>
            {planned.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
      ) : <p className="text-sm">All tasks are done — nice work.</p>}
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          const r = await updateSprint({ id: sprint.id, data: { state: "completed" }, moveOpenTo: target || null });
          setBusy(false);
          if (!r.ok) return toast.error(r.error);
          toast.success(`${sprint.name} completed`);
          onDone();
          router.refresh();
        }}>Complete sprint</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SprintDialog({ open, onOpenChange, projectId, next, lastEnd }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string; next: number; lastEnd?: string }) {
  const router = useRouter();
  const start = lastEnd ? addDays(parseISO(lastEnd), 1) : new Date();
  const [v, setV] = useState({ name: `Sprint ${next}`, goal: "", startDate: format(start, "yyyy-MM-dd"), endDate: format(addDays(start, 13), "yyyy-MM-dd") });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New sprint">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await createSprint({ projectId, ...v, goal: v.goal || null });
          setBusy(false);
          if (!r.ok) return toast.error(r.error);
          toast.success("Sprint created");
          onOpenChange(false);
          router.refresh();
        }}>
          <Field label="Name"><Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Goal"><Textarea rows={2} value={v.goal} onChange={(e) => setV({ ...v, goal: e.target.value })} placeholder="What should this sprint achieve?" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><Input type="date" required value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field>
            <Field label="End"><Input type="date" required value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy}>Create sprint</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneDialog({ open, onOpenChange, projectId }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string }) {
  const router = useRouter();
  const [v, setV] = useState({ name: "", targetDate: format(addDays(new Date(), 30), "yyyy-MM-dd"), description: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New milestone">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await createMilestone({ projectId, ...v, description: v.description || null });
          setBusy(false);
          if (!r.ok) return toast.error(r.error);
          toast.success("Milestone created");
          setV({ ...v, name: "" });
          onOpenChange(false);
          router.refresh();
        }}>
          <Field label="Name"><Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Public beta" /></Field>
          <Field label="Target date"><Input type="date" required value={v.targetDate} onChange={(e) => setV({ ...v, targetDate: e.target.value })} /></Field>
          <Field label="Description"><Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy}>Create milestone</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
