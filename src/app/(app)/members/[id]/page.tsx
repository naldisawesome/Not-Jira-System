import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { Mail, Briefcase, CalendarDays } from "lucide-react";
import { db } from "@/db";
import { users, teams, teamMembers } from "@/db/schema";
import { requireUser } from "@/server/session";
import { listTasks } from "@/server/queries";
import { getActivity } from "@/server/stats";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, Badge } from "@/components/ui/misc";
import { TaskLine } from "@/components/tasks/task-line";
import { ActivityFeed } from "@/components/activity-feed";
import { StackedBars } from "@/components/dashboard/charts";
import { roleLabel } from "@/lib/constants";
import { fmtDate } from "@/lib/utils";

export default async function MemberPage({ params }: { params: { id: string } }) {
  const me = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const [u] = await db.select().from(users).where(and(eq(users.id, params.id), eq(users.orgId, me.orgId)));
  if (!u) notFound();
  const [open, done, activity, teamRows, weekly] = await Promise.all([
    listTasks(me, { assignee: u.id, category: "open" }, { sort: "due", pageSize: 50 }),
    listTasks(me, { assignee: u.id, category: "done" }, { sort: "updated", pageSize: 10 }),
    getActivity(me, { actorId: u.id, limit: 20 }),
    db.select({ id: teams.id, name: teams.name, color: teams.color }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(eq(teamMembers.userId, u.id)),
    db.execute<{ week: string; completed: number; hours: number }>(sql`
      WITH weeks AS (SELECT generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS wk)
      SELECT to_char(w.wk, 'Mon DD') AS week,
        (SELECT count(*)::int FROM tasks t WHERE t.assignee_id = ${u.id} AND date_trunc('week', t.completed_at) = w.wk) AS completed,
        (SELECT coalesce(sum(hours),0)::float FROM time_logs l WHERE l.user_id = ${u.id} AND date_trunc('week', l.logged_on::timestamp) = w.wk) AS hours
      FROM weeks w ORDER BY w.wk`),
  ]);
  return (
    <div className="mx-auto max-w-[1300px] animate-fade-in space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-5 pt-5">
          <Avatar name={u.name} color={u.avatarColor} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{u.name}</h1>
            <p className="text-sm text-muted-foreground">@{u.username}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Briefcase className="size-3.5" />{u.title ?? "No title"}</span>
              <span className="flex items-center gap-1"><Mail className="size-3.5" />{u.email}</span>
              <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />Joined {fmtDate(u.createdAt, "MMM yyyy")}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5"><Badge color="#0f766e">{roleLabel(u.role)}</Badge>{teamRows.map((t) => <Badge key={t.id} color={t.color}>{t.name}</Badge>)}{!u.isActive && <Badge color="#dc2626">Deactivated</Badge>}</div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div><p className="text-2xl font-semibold tabular-nums">{open.total}</p><p className="text-xs text-muted-foreground">Open</p></div>
            <div><p className="text-2xl font-semibold tabular-nums">{done.total}</p><p className="text-xs text-muted-foreground">Completed</p></div>
            <div><p className="text-2xl font-semibold tabular-nums text-destructive">{open.rows.filter((r) => r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10)).length}</p><p className="text-xs text-muted-foreground">Overdue</p></div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card><CardHeader title="Assigned tasks" description="Open work, soonest due first" /><CardContent className="px-3">{open.rows.length ? open.rows.map((r) => <TaskLine key={r.id} t={r} />) : <p className="py-6 text-center text-xs text-muted-foreground">No open tasks.</p>}</CardContent></Card>
          <Card><CardHeader title="Recently completed" /><CardContent className="px-3">{done.rows.length ? done.rows.map((r) => <TaskLine key={r.id} t={r} />) : <p className="py-6 text-center text-xs text-muted-foreground">Nothing completed yet.</p>}</CardContent></Card>
        </div>
        <div className="space-y-5">
          <Card><CardHeader title="Productivity" description="Tasks completed and hours logged per week" /><CardContent><StackedBars data={weekly.rows} xKey="week" keys={[{ key: "completed", label: "Completed", color: "#0d9488" }, { key: "hours", label: "Hours", color: "#a5b4fc" }]} height={220} /></CardContent></Card>
          <Card><CardHeader title="Recent activity" /><CardContent className="scrollbar-thin max-h-[420px] overflow-y-auto"><ActivityFeed items={activity} compact /></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
