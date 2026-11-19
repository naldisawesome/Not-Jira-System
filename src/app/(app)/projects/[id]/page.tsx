import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { requireUser } from "@/server/session";
import { getProjectAccess } from "@/server/rbac";
import { getAttachments, getProjectContext, listTasks } from "@/server/queries";
import { getActivity, getTaskStats } from "@/server/stats";
import { attachments } from "@/db/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, Progress } from "@/components/ui/misc";
import { Markdown } from "@/components/files/markdown";
import { AttachmentGrid } from "@/components/files/attachment-list";
import { FileUploaderPanel } from "@/components/files/file-uploader-panel";
import { ActivityFeed } from "@/components/activity-feed";
import { DonutChart } from "@/components/dashboard/charts";
import { TaskLine } from "@/components/tasks/task-line";
import { roleLabel } from "@/lib/constants";
import { fmtDate } from "@/lib/utils";

export default async function ProjectOverview({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const access = await getProjectAccess(user, params.id);
  const p = access.project;
  const [ctx, stats, activity, files, recent] = await Promise.all([
    getProjectContext(p.id, p.workflowId),
    getTaskStats(user, [p.id]),
    getActivity(user, { projectId: p.id, limit: 15 }),
    getAttachments(and(eq(attachments.projectId, p.id), isNull(attachments.taskId), sql`${attachments.context} IN ('project','cover')`)!),
    listTasks(user, { projectId: p.id, category: "open" }, { sort: "priority", pageSize: 8 }),
  ]);
  const t = stats?.totals ?? { total: 0, done: 0, overdue: 0, open_issues: 0, open: 0 };
  const pct = t.total ? Math.round((t.done / Math.max(1, t.total - (stats?.byStatus.filter((s) => s.category === "cancelled").reduce((a, s) => a + s.count, 0) ?? 0))) * 100) : 0;
  const owner = ctx.members.find((m) => m.id === p.ownerId);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="About this project" />
          <CardContent>{p.description ? <Markdown>{p.description}</Markdown> : <p className="text-sm text-muted-foreground">No description yet.{access.canManage && <> Add one in <Link className="text-primary hover:underline" href={`/projects/${p.id}/settings`}>settings</Link>.</>}</p>}</CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-4">
          {[["Progress", `${pct}%`], ["Open tasks", t.open], ["Overdue", t.overdue], ["Open issues", t.open_issues]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border bg-card p-4 shadow-soft"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>{l === "Progress" && <Progress value={pct} color={p.color} className="mt-2" />}</div>
          ))}
        </div>
        <Card>
          <CardHeader title="Top open work" action={<Link href={`/projects/${p.id}/list?category=open&sort=priority`} className="text-xs font-medium text-primary hover:underline">View all</Link>} />
          <CardContent className="px-3">{recent.rows.length ? recent.rows.map((r) => <TaskLine key={r.id} t={r} showProject={false} />) : <p className="py-6 text-center text-xs text-muted-foreground">No open tasks.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader title="Project files" description="Briefs, specs, designs and other shared documents" />
          <CardContent className="space-y-3">
            {access.canEdit && <FileUploaderPanel target={{ context: "project", projectId: p.id }} compact />}
            <AttachmentGrid files={files.map((f) => ({ ...f, canDelete: access.canManage || (access.canEdit && f.uploadedById === user.id) }))} emptyText="No project files yet." />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Status breakdown" />
          <CardContent><DonutChart data={(stats?.byStatus ?? []).map((s) => ({ name: s.name, value: s.count, color: s.color }))} centerLabel="tasks" /></CardContent>
        </Card>
        <Card>
          <CardHeader title="Team" description={owner ? `Owner: ${owner.name}` : undefined} action={access.canManage && <Link href={`/projects/${p.id}/settings#members`} className="text-xs font-medium text-primary hover:underline">Manage</Link>} />
          <CardContent className="space-y-2.5">
            {ctx.members.map((m) => (
              <Link key={m.id} href={`/members/${m.id}`} className="flex items-center gap-2.5 rounded-md hover:bg-muted/60">
                <Avatar name={m.name} color={m.avatarColor} size={28} />
                <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{m.name}</p><p className="truncate text-[11px] text-muted-foreground">{m.title ?? roleLabel(m.orgRole)}</p></div>
                <span className="text-[11px] capitalize text-muted-foreground">{m.role}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Milestones" action={<Link href={`/projects/${p.id}/sprints`} className="text-xs font-medium text-primary hover:underline">Sprints</Link>} />
          <CardContent className="space-y-2">
            {ctx.milestones.length === 0 && <p className="text-xs text-muted-foreground">No milestones.</p>}
            {ctx.milestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-[13px]"><span className={m.completedAt ? "text-muted-foreground line-through" : ""}>◆ {m.name}</span><span className="text-xs text-muted-foreground">{fmtDate(m.targetDate, "MMM d")}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Activity" />
          <CardContent className="scrollbar-thin max-h-[420px] overflow-y-auto"><ActivityFeed items={activity} compact /></CardContent>
        </Card>
      </div>
    </div>
  );
}
