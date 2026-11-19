import Link from "next/link";
import { addDays, format } from "date-fns";
import { FolderKanban, FolderOpen, ListTodo, CircleCheckBig, AlarmClock, Bug, Users, ArrowUpRight, Sparkles } from "lucide-react";
import { requireUser } from "@/server/session";
import { getProjectsForUser, listTasks, progressOf, getOrgMembers } from "@/server/queries";
import { getActivity, getTaskStats } from "@/server/stats";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, EmptyState, Progress } from "@/components/ui/misc";
import { ActivityFeed } from "@/components/activity-feed";
import { DonutChart, HBarChart } from "@/components/dashboard/charts";
import { TaskLine } from "@/components/tasks/task-line";
import { AutoRefresh } from "@/components/auto-refresh";
import { PhaseBadge } from "@/components/projects/phase-badge";
import { PRIORITIES, STATUS_CATEGORIES } from "@/lib/constants";
import { cn, fmtDate } from "@/lib/utils";

export const metadata = { title: "Overview" };

function Stat({ label, value, icon: Icon, tone, href, hint }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string; href: string; hint?: string }) {
  return (
    <Link href={href} className="group rounded-xl border bg-card p-4 shadow-soft transition-all hover:-translate-y-px hover:shadow-lift">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="rounded-md p-1.5" style={{ background: tone + "18", color: tone }}><Icon className="size-3.5" /></span>
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </Link>
  );
}

export default async function OverviewPage() {
  const user = await requireUser();
  const today = format(new Date(), "yyyy-MM-dd");
  const [projects, stats, recent, mine, upcoming, activity, members] = await Promise.all([
    getProjectsForUser(user),
    getTaskStats(user),
    listTasks(user, {}, { sort: "updated", dir: "desc", pageSize: 7 }),
    listTasks(user, { assignee: "me", category: "open" }, { sort: "due", pageSize: 7 }),
    listTasks(user, { category: "open", dueFrom: today, dueTo: format(addDays(new Date(), 14), "yyyy-MM-dd") }, { sort: "due", pageSize: 7 }),
    getActivity(user, { limit: 12 }),
    getOrgMembers(user.orgId),
  ]);
  const active = projects.filter((p) => !p.project.archivedAt && p.project.status === "active");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (!projects.length)
    return (
      <div className="mx-auto max-w-3xl pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">{greeting}, {user.name.split(" ")[0]}</h1>
        <EmptyState className="mt-6" icon={Sparkles} title="No projects yet" description={user.role === "member" || user.role === "viewer" ? "Ask a project manager to add you to a project." : "Create your first project to start tracking work."} action={user.role !== "member" && user.role !== "viewer" ? <Link href="/projects?new=1" className="text-sm font-medium text-primary hover:underline">Create a project →</Link> : undefined} />
      </div>
    );

  const t = stats!.totals;
  const catData = STATUS_CATEGORIES.map((c) => ({
    key: c.value,
    name: c.label,
    value: stats!.byStatus.filter((s) => s.category === c.value).reduce((a, s) => a + s.count, 0),
    color: { backlog: "#94a3b8", todo: "#64748b", in_progress: "#2563eb", done: "#16a34a", cancelled: "#d4d4d8" }[c.value],
  })).filter((d) => d.value > 0);
  const prioData = PRIORITIES.map((p) => ({ name: p.label, value: stats!.byPriority.find((x) => x.priority === p.value)?.count ?? 0, color: p.color }));
  const maxLoad = Math.max(1, ...stats!.workload.map((w) => w.open));

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in space-y-5">
      <AutoRefresh every={60} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, MMMM d")}</p>
          <h1 className="text-[22px] font-semibold tracking-tight">{greeting}, {user.name.split(" ")[0]}</h1>
        </div>
        <p className="text-xs text-muted-foreground">{t.open} open · {t.overdue} overdue across {projects.length} projects</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Stat label="Total projects" value={projects.length} icon={FolderKanban} tone="#0f766e" href="/projects" />
        <Stat label="Active projects" value={active.length} icon={FolderOpen} tone="#2563eb" href="/projects?view=active" />
        <Stat label="Total tasks" value={t.total} icon={ListTodo} tone="#7c3aed" href="/list" />
        <Stat label="Completed" value={t.done} icon={CircleCheckBig} tone="#16a34a" href="/list?category=done" hint={t.total ? `${Math.round((t.done / t.total) * 100)}% of all tasks` : undefined} />
        <Stat label="Overdue" value={t.overdue} icon={AlarmClock} tone="#dc2626" href="/list?due=overdue" />
        <Stat label="Open issues" value={t.open_issues} icon={Bug} tone="#ea580c" href="/list?type=bug,support&category=open" />
        <Stat label="Team members" value={members.filter((m) => m.isActive).length} icon={Users} tone="#0891b2" href="/members" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Project progress" description="Completion of non-cancelled tasks" action={<Link href="/projects" className="text-xs font-medium text-primary hover:underline">All projects</Link>} />
          <CardContent className="space-y-3.5">
            {projects.filter((p) => !p.project.archivedAt).slice(0, 6).map((p) => {
              const pct = progressOf(p);
              return (
                <Link key={p.project.id} href={`/projects/${p.project.id}`} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,220px)_1fr_auto]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: p.project.color }}>{p.project.key.slice(0, 2)}</span>
                    <span className="truncate text-[13px] font-medium group-hover:underline">{p.project.name}</span>
                    <PhaseBadge phase={p.project.phase} className="hidden px-1.5 text-[9.5px] xl:inline-flex" />
                  </div>
                  <Progress value={pct} color={p.project.color} className="order-3 col-span-2 h-2 sm:order-none sm:col-span-1" />
                  <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                    {p.overdue > 0 && <span className="text-destructive">{p.overdue} overdue</span>}
                    <span>{p.done}/{p.total - p.cancelled}</span>
                    <span className="w-9 text-right font-semibold text-foreground">{pct}%</span>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Tasks by status" description="Click a segment to drill in" />
          <CardContent><DonutChart data={catData} centerLabel="tasks" hrefPrefix="/list?category=" /></CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="My assigned tasks" action={<Link href="/my-tasks" className="text-xs font-medium text-primary hover:underline">Open My Tasks</Link>} />
          <CardContent className="px-3">{mine.rows.length ? mine.rows.map((r) => <TaskLine key={r.id} t={r} showProject={false} compact />) : <p className="py-6 text-center text-xs text-muted-foreground">Nothing assigned to you. Nice.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader title="Upcoming deadlines" description="Next 14 days" />
          <CardContent className="px-3">
            {upcoming.rows.length ? upcoming.rows.map((r) => <TaskLine key={r.id} t={r} showProject={false} compact />) : <p className="py-6 text-center text-xs text-muted-foreground">No upcoming deadlines.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Open tasks by priority" />
          <CardContent><HBarChart data={prioData} height={190} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recently updated" action={<Link href="/list?sort=updated" className="text-xs font-medium text-primary hover:underline">View list</Link>} />
          <CardContent className="px-3">{recent.rows.map((r) => <TaskLine key={r.id} t={r} />)}</CardContent>
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={<Link href="/activity" className="text-xs font-medium text-primary hover:underline"><ArrowUpRight className="size-3.5" /></Link>} />
          <CardContent className="scrollbar-thin max-h-[380px] overflow-y-auto"><ActivityFeed items={activity} compact /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Team workload" description="Open tasks and remaining estimate per person" action={<Link href="/members" className="text-xs font-medium text-primary hover:underline">Members</Link>} />
        <CardContent>
          {stats!.workload.length === 0 ? <p className="text-xs text-muted-foreground">No assigned work yet.</p> : (
            <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
              {stats!.workload.map((w) => (
                <Link key={w.id} href={`/members/${w.id}`} className="flex items-center gap-3 rounded-md p-1 hover:bg-muted/60">
                  <Avatar name={w.name} color={w.avatar_color} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[13px]"><span className="truncate font-medium">{w.name}</span><span className="text-xs tabular-nums text-muted-foreground">{w.open} open · {w.estimate}h</span></div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full", w.open / maxLoad > 0.8 ? "bg-orange-500" : "bg-primary")} style={{ width: `${((w.open - w.overdue) / maxLoad) * 100}%` }} />
                      <div className="h-full bg-destructive" style={{ width: `${(w.overdue / maxLoad) * 100}%` }} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Red segment = overdue. Updated {fmtDate(new Date(), "h:mm a")}.</p>
        </CardContent>
      </Card>
    </div>
  );
}
