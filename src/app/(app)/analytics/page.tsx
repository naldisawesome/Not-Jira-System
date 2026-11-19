import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { buildReports } from "@/server/reports";
import { getProjectsForUser } from "@/server/queries";
import { getTaskStats } from "@/server/stats";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { DonutChart, HBarChart, StackedBars, TrendChart } from "@/components/dashboard/charts";
import { ProjectSwitcher } from "@/components/work/project-switcher";
import { PRIORITIES, typeMeta } from "@/lib/constants";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: { project?: string } }) {
  const user = await requireUser();
  if (user.role === "viewer") redirect("/");
  const projects = await getProjectsForUser(user);
  const pid = projects.some((p) => p.project.id === searchParams.project) ? searchParams.project : undefined;
  const [r, stats] = await Promise.all([buildReports(user, pid), getTaskStats(user, pid ? [pid] : undefined)]);
  if (!r || !stats) return <EmptyState title="No data yet" />;
  const totalDone = r.trend.reduce((a, w) => a + w.completed, 0);
  const totalNew = r.trend.reduce((a, w) => a + w.created, 0);
  const avgCycle = r.cycle.length ? (r.cycle.reduce((a, c) => a + c.avg_days * c.n, 0) / Math.max(1, r.cycle.reduce((a, c) => a + c.n, 0))).toFixed(1) : "—";
  const kpis = [
    ["Throughput (12 wks)", `${totalDone}`, "tasks completed"],
    ["Intake (12 wks)", `${totalNew}`, "tasks created"],
    ["Avg cycle time", `${avgCycle}d`, "created → done"],
    ["Completion rate", `${stats.totals.total ? Math.round((stats.totals.done / stats.totals.total) * 100) : 0}%`, "of all tasks"],
  ];
  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in space-y-5">
      <PageHeader title="Analytics" description="Trends and flow metrics across your work." actions={<ProjectSwitcher projects={projects.map((p) => ({ id: p.project.id, name: p.project.name, key: p.project.key, color: p.project.color }))} value={pid ?? ""} allowAll />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([l, v, h]) => <div key={l} className="rounded-xl border bg-card p-4 shadow-soft"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p><p className="text-[11px] text-muted-foreground">{h}</p></div>)}
      </div>
      <Card><CardHeader title="Created vs completed" description="Weekly flow over the last 12 weeks" /><CardContent><TrendChart data={r.trend} height={280} /></CardContent></Card>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card><CardHeader title="Tasks by type" /><CardContent><DonutChart data={r.byType.map((t) => ({ name: typeMeta(t.type).label, value: t.count, color: typeMeta(t.type).color }))} centerLabel="tasks" /></CardContent></Card>
        <Card><CardHeader title="Open by priority" /><CardContent><HBarChart data={PRIORITIES.map((p) => ({ name: p.label, value: stats.byPriority.find((x) => x.priority === p.value)?.count ?? 0, color: p.color }))} /></CardContent></Card>
        <Card><CardHeader title="Cycle time by type" description="Average days from creation to done" /><CardContent><HBarChart data={r.cycle.map((c) => ({ name: typeMeta(c.type).label, value: c.avg_days, color: typeMeta(c.type).color }))} /></CardContent></Card>
      </div>
      <Card><CardHeader title="Status distribution by project" /><CardContent><StackedBars data={r.projects.map((p) => ({ name: p.key, Done: p.done, Open: p.open - p.overdue, Overdue: p.overdue }))} keys={[{ key: "Done", label: "Done", color: "#16a34a" }, { key: "Open", label: "Open", color: "#2563eb" }, { key: "Overdue", label: "Overdue", color: "#dc2626" }]} height={260} /></CardContent></Card>
    </div>
  );
}
