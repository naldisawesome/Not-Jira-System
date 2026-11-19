import Link from "next/link";
import { eq } from "drizzle-orm";
import { CalendarRange, FolderKanban, AlarmClock } from "lucide-react";
import { db } from "@/db";
import { projectMembers, workflows } from "@/db/schema";
import { requireUser } from "@/server/session";
import { can, computeAccess } from "@/server/rbac";
import { getProjectsForUser, progressOf } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { AvatarStack, Badge, EmptyState, Progress } from "@/components/ui/misc";
import { PriorityBadge } from "@/components/tasks/badges";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProjectActions } from "@/components/projects/project-actions";
import { ImportDialog } from "@/components/work/import-dialog";
import { PROJECT_STATUSES } from "@/lib/constants";
import { cn, fmtDate } from "@/lib/utils";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: { view?: string; q?: string } }) {
  const user = await requireUser();
  const view = searchParams.view === "archived" ? "archived" : searchParams.view === "active" ? "active" : "all";
  const [all, wfs, memberships] = await Promise.all([
    getProjectsForUser(user),
    db.select({ id: workflows.id, name: workflows.name, isDefault: workflows.isDefault }).from(workflows).where(eq(workflows.orgId, user.orgId)),
    db.select().from(projectMembers).where(eq(projectMembers.userId, user.id)),
  ]);
  const q = (searchParams.q ?? "").toLowerCase();
  const rows = all
    .filter((r) => (view === "archived" ? !!r.project.archivedAt : view === "active" ? !r.project.archivedAt && r.project.status === "active" : !r.project.archivedAt))
    .filter((r) => !q || r.project.name.toLowerCase().includes(q) || r.project.key.toLowerCase().includes(q) || (r.project.category ?? "").toLowerCase().includes(q));
  const tabs = [
    { v: "all", label: "All projects", count: all.filter((r) => !r.project.archivedAt).length },
    { v: "active", label: "Active", count: all.filter((r) => !r.project.archivedAt && r.project.status === "active").length },
    { v: "archived", label: "Archived", count: all.filter((r) => r.project.archivedAt).length },
  ];

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in">
      <PageHeader title="Projects" description="Every project has its own workspace with board, list, calendar, timeline, sprints and files." actions={<>{user.role !== "viewer" && <ImportDialog size="default" />}{can.createProject(user) && <NewProjectButton workflows={wfs} />}</>} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
          {tabs.map((t) => (
            <Link key={t.v} href={t.v === "all" ? "/projects" : `/projects?view=${t.v}`} className={cn("rounded-md px-3 py-1 text-[13px] font-medium text-muted-foreground transition", view === t.v && "bg-surface text-foreground shadow-soft")}>
              {t.label} <span className="ml-1 text-xs tabular-nums opacity-60">{t.count}</span>
            </Link>
          ))}
        </div>
        <form className="w-full sm:w-64"><input type="hidden" name="view" value={view === "all" ? "" : view} /><input name="q" defaultValue={searchParams.q} placeholder="Filter projects…" className="h-9 w-full rounded-md border bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30" /></form>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={FolderKanban} title={view === "archived" ? "No archived projects" : "No projects found"} description={view === "archived" ? "Archived projects are read-only and appear here." : "Create a project or ask to be added to one."} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const p = r.project;
            const pct = progressOf(r);
            const st = PROJECT_STATUSES.find((s) => s.value === p.status)!;
            const access = computeAccess(user, p, memberships.find((m) => m.projectId === p.id)?.role ?? null);
            return (
              <div key={p.id} className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <div className="h-16 w-full" style={p.coverAttachmentId ? { backgroundImage: `url(/api/files/${p.coverAttachmentId})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: `linear-gradient(120deg, ${p.color}, ${p.color}aa 60%, ${p.color}55)` }} />
                <div className="flex flex-1 flex-col p-4 pt-0">
                  <div className="-mt-5 mb-2 flex items-end justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg border-2 border-card text-xs font-bold text-white shadow-soft" style={{ background: p.color }}>{p.key.slice(0, 3)}</span>
                    <div className="relative z-10"><ProjectActions id={p.id} projectKey={p.key} name={p.name} archived={!!p.archivedAt} canManage={access.canManage} /></div>
                  </div>
                  <Link href={`/projects/${p.id}`} className="after:absolute after:inset-0">
                    <h3 className="text-[15px] font-semibold tracking-tight">{p.name}</h3>
                  </Link>
                  <p className="mt-0.5 line-clamp-2 min-h-[2.5em] text-xs text-muted-foreground">{p.description?.replace(/[#*_>`[\]()!-]/g, "").slice(0, 160) || "No description"}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge color={st.color}>{st.label}</Badge>
                    <PriorityBadge priority={p.priority} />
                    {p.category && <Badge>{p.category}</Badge>}
                    <span className="task-key ml-auto">{p.key}</span>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground"><span>{r.done} of {r.total - r.cancelled} done</span><span className="font-semibold text-foreground">{pct}%</span></div>
                    <Progress value={pct} color={p.color} />
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
                    <AvatarStack users={r.members} size={22} />
                    <div className="flex items-center gap-3">
                      {r.overdue > 0 && <span className="flex items-center gap-1 text-destructive"><AlarmClock className="size-3" />{r.overdue}</span>}
                      <span className="flex items-center gap-1"><CalendarRange className="size-3" />{p.dueDate ? fmtDate(p.dueDate, "MMM d") : "No due date"}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
