import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requireUser } from "@/server/session";
import { buildReports } from "@/server/reports";
import { getProjectsForUser } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState, Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { StackedBars, TrendChart } from "@/components/dashboard/charts";
import { PrintButton } from "@/components/print-button";
import { PhaseBadge } from "@/components/projects/phase-badge";
import { ProjectSwitcher } from "@/components/work/project-switcher";
import { PriorityBadge } from "@/components/tasks/badges";
import { PRIORITIES, SEVERITIES, typeMeta } from "@/lib/constants";
import { cn, fmtDate } from "@/lib/utils";

export const metadata = { title: "Reports" };

function Csv({ k, project }: { k: string; project?: string }) {
  return <Button variant="ghost" size="xs" asChild className="no-print"><a href={`/api/reports/${k}${project ? `?project=${project}` : ""}`}><Download /> CSV</a></Button>;
}
const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const td = "px-3 py-2 tabular-nums";

export default async function ReportsPage({ searchParams }: { searchParams: { project?: string } }) {
  const user = await requireUser();
  if (user.role === "viewer") redirect("/");
  const projects = await getProjectsForUser(user);
  const pid = projects.some((p) => p.project.id === searchParams.project) ? searchParams.project : undefined;
  const r = await buildReports(user, pid);
  if (!r) return <EmptyState title="No data yet" description="Reports appear once you have projects." />;

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in space-y-5">
      <PageHeader title="Reports" description={`Generated ${fmtDate(new Date(), "MMM d, yyyy 'at' h:mm a")}`} actions={<><ProjectSwitcher projects={projects.map((p) => ({ id: p.project.id, name: p.project.name, key: p.project.key, color: p.project.color }))} value={pid ?? ""} allowAll /><PrintButton /></>} />

      <Card>
        <CardHeader title="Project completion" description="Progress excludes cancelled tasks" action={<Csv k="projects" project={pid} />} />
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="border-y bg-muted/40"><tr><th className={th}>Project</th><th className={th}>Phase</th><th className={th}>Status</th><th className={th}>Due</th><th className={th}>Tasks</th><th className={th}>Open</th><th className={th}>Overdue</th><th className={cn(th, "w-[220px]")}>Completion</th></tr></thead>
            <tbody>{r.projects.map((p) => (
              <tr key={p.key} className="border-b last:border-0"><td className="px-3 py-2 font-medium">{p.project} <span className="task-key">{p.key}</span></td><td className="px-3 py-2"><PhaseBadge phase={p.phase} /></td><td className="px-3 py-2"><Badge>{p.status.replace("_", " ")}</Badge></td><td className={td}>{fmtDate(p.due_date)}</td><td className={td}>{p.total}</td><td className={td}>{p.open}</td><td className={cn(td, p.overdue > 0 && "font-medium text-destructive")}>{p.overdue}</td><td className="px-3 py-2"><div className="flex items-center gap-2"><Progress value={p.pct} /><span className="w-9 text-right text-xs font-semibold">{p.pct}%</span></div></td></tr>
            ))}</tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Task completion by type" action={<Csv k="completion" project={pid} />} />
          <CardContent><StackedBars data={r.completion.map((c) => ({ name: typeMeta(c.type).label, Done: c.done, "In progress": c.in_progress, "To do": c.todo }))} keys={[{ key: "Done", label: "Done", color: "#16a34a" }, { key: "In progress", label: "In progress", color: "#2563eb" }, { key: "To do", label: "To do", color: "#cbd5e1" }]} /></CardContent>
        </Card>
        <Card>
          <CardHeader title="Task completion trend" description="Created vs completed per week" />
          <CardContent><TrendChart data={r.trend} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bugs & issues" description="Bugs and support requests by severity and priority" action={<Csv k="bugs" project={pid} />} />
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-[13px]"><thead className="border-y bg-muted/40"><tr><th className={th}>Severity</th><th className={th}>Priority</th><th className={th}>Open</th><th className={th}>Closed</th><th className={th}>Avg age</th></tr></thead>
              <tbody>{r.bugs.map((b, i) => { const sev = SEVERITIES.find((s) => s.value === b.severity); return (
                <tr key={i} className="border-b last:border-0"><td className="px-3 py-2">{sev ? <Badge color={sev.color}>{sev.label}</Badge> : <Badge>Unset</Badge>}</td><td className="px-3 py-2"><PriorityBadge priority={b.priority} /></td><td className={cn(td, b.open > 0 && "font-semibold")}>{b.open}</td><td className={td}>{b.closed}</td><td className={td}>{b.avg_age_days}d</td></tr>
              ); })}{!r.bugs.length && <tr><td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No bugs recorded.</td></tr>}</tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Workload distribution" description="Open tasks per person by priority" action={<Csv k="workload" project={pid} />} />
          <CardContent><StackedBars data={r.workload.map((w) => ({ name: w.name.split(" ")[0]!, Critical: w.critical, High: w.high, Medium: w.medium, Low: w.low }))} keys={PRIORITIES.map((p) => ({ key: p.label, label: p.label, color: p.color }))} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Team productivity" description="Last 30 days" action={<Csv k="productivity" project={pid} />} />
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-[13px]"><thead className="border-y bg-muted/40"><tr><th className={th}>Member</th><th className={th}>Completed (30d)</th><th className={th}>Open</th><th className={th}>Hours logged (30d)</th><th className={th}>On-time rate</th></tr></thead>
            <tbody>{r.productivity.map((p) => (
              <tr key={p.name} className="border-b last:border-0"><td className="px-3 py-2 font-medium">{p.name}</td><td className={td}>{p.completed_30d}</td><td className={td}>{p.open}</td><td className={td}>{p.hours_30d}h</td><td className="px-3 py-2"><div className="flex items-center gap-2"><Progress value={p.on_time_pct} color={p.on_time_pct < 60 ? "#ea580c" : "#16a34a"} className="w-24" /><span className="text-xs">{p.on_time_pct}%</span></div></td></tr>
            ))}</tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Overdue tasks" description={`${r.overdue.length} task(s) past due`} action={<Csv k="overdue" project={pid} />} />
          <CardContent className="scrollbar-thin max-h-[420px] overflow-auto p-0">
            <table className="w-full text-[13px]"><thead className="sticky top-0 border-y bg-muted"><tr><th className={th}>Task</th><th className={th}>Assignee</th><th className={th}>Due</th><th className={th}>Late</th></tr></thead>
              <tbody>{r.overdue.map((o) => (
                <tr key={o.id} className="border-b last:border-0"><td className="max-w-[260px] px-3 py-2"><Link href={`/tasks/${o.id}`} className="block truncate hover:underline"><span className="task-key mr-1.5">{o.key}</span>{o.title}</Link></td><td className="px-3 py-2 text-xs">{o.assignee ?? "—"}</td><td className={td}>{fmtDate(o.due_date, "MMM d")}</td><td className={cn(td, "font-medium text-destructive")}>{o.days_overdue}d</td></tr>
              ))}{!r.overdue.length && <tr><td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">Nothing overdue 🎉</td></tr>}</tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Sprint performance" action={<Csv k="sprints" project={pid} />} />
          <CardContent className="scrollbar-thin max-h-[420px] overflow-auto p-0">
            <table className="w-full text-[13px]"><thead className="sticky top-0 border-y bg-muted"><tr><th className={th}>Sprint</th><th className={th}>State</th><th className={th}>Delivered</th><th className={th}>Hours</th></tr></thead>
              <tbody>{r.sprints.map((s, i) => (
                <tr key={i} className="border-b last:border-0"><td className="px-3 py-2"><p className="font-medium">{s.sprint}</p><p className="text-[11px] text-muted-foreground">{s.project} · {fmtDate(s.start_date, "MMM d")}–{fmtDate(s.end_date, "MMM d")}</p></td><td className="px-3 py-2"><Badge color={s.state === "active" ? "#16a34a" : undefined}>{s.state}</Badge></td><td className="px-3 py-2"><div className="flex items-center gap-2"><Progress value={s.pct} className="w-20" /><span className="text-xs tabular-nums">{s.done}/{s.total}</span></div></td><td className={td}>{s.hours}h</td></tr>
              ))}</tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
