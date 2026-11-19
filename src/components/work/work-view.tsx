import { eq, inArray, sql } from "drizzle-orm";
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { FolderKanban } from "lucide-react";
import { db } from "@/db";
import { milestones, taskDependencies, projectMembers } from "@/db/schema";
import type { SessionUser } from "@/server/session";
import { computeAccess } from "@/server/rbac";
import { getProjectContext, getProjectsForUser, getSavedFilters, listTasks } from "@/server/queries";
import { EmptyState } from "@/components/ui/misc";
import { FilterBar } from "./filter-bar";
import { Board } from "./board";
import { ListView } from "./list-view";
import { CalendarView } from "./calendar-view";
import { TimelineView } from "./timeline-view";
import { BacklogView } from "./backlog-view";
import { SprintsView, type SprintStat, type MilestoneStat } from "./sprints-view";
import { ProjectSwitcher } from "./project-switcher";
import { ListTools } from "./list-tools";
import { filtersFrom } from "./filters";
export { filtersFrom };

export type ViewName = "board" | "list" | "calendar" | "timeline" | "backlog" | "sprints";
const NEEDS_PROJECT: ViewName[] = ["board", "backlog", "sprints"];
type SP = Record<string, string | undefined>;

export async function WorkView({ user, view, projectId: fixedProject, sp }: { user: SessionUser; view: ViewName; projectId?: string; sp: SP }) {
  const all = (await getProjectsForUser(user)).filter((p) => !p.project.archivedAt || p.project.id === fixedProject);
  const memberships = await db.select().from(projectMembers).where(eq(projectMembers.userId, user.id));
  let projectId = fixedProject ?? (sp.project && all.some((p) => p.project.id === sp.project) ? sp.project : undefined);
  if (!projectId && NEEDS_PROJECT.includes(view)) projectId = all[0]?.project.id;
  const row = all.find((p) => p.project.id === projectId);
  const access = row ? computeAccess(user, row.project, memberships.find((m) => m.projectId === row.project.id)?.role ?? null) : null;

  if (!all.length) return <EmptyState icon={FolderKanban} title="No projects available" description="Create a project or ask to be added to one to start tracking work." />;

  const switcher = !fixedProject ? <ProjectSwitcher projects={all.map((p) => ({ id: p.project.id, name: p.project.name, key: p.project.key, color: p.project.color }))} value={projectId ?? ""} allowAll={!NEEDS_PROJECT.includes(view)} /> : null;
  const saved = view !== "sprints" ? await getSavedFilters(user.id) : [];
  const f = { ...filtersFrom(sp), projectId };

  let body: React.ReactNode = null;
  if (view === "board") {
    const ctx = await getProjectContext(row!.project.id, row!.project.workflowId);
    const { rows } = await listTasks(user, { ...f, topLevel: sp.subtasks !== "1" }, { sort: "position", dir: "asc", pageSize: 1000 });
    body = <Board tasks={rows} statuses={ctx.statuses} projectId={row!.project.id} canEdit={!!access?.canEdit} />;
  } else if (view === "list") {
    const size = [25, 50, 100].includes(Number(sp.size)) ? Number(sp.size) : 50;
    const page = Math.max(1, Number(sp.page) || 1);
    const { rows, total } = await listTasks(user, f, { sort: sp.sort, dir: sp.dir === "asc" || sp.dir === "desc" ? sp.dir : undefined, page, pageSize: size });
    body = <ListView tasks={rows} total={total} page={page} pageSize={size} singleProject={projectId} />;
  } else if (view === "calendar") {
    const mode = sp.mode === "week" ? "week" : "month";
    const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : format(new Date(), "yyyy-MM-dd");
    const d = parseISO(anchor);
    const from = mode === "month" ? startOfWeek(startOfMonth(d), { weekStartsOn: 1 }) : startOfWeek(d, { weekStartsOn: 1 });
    const to = mode === "month" ? endOfWeek(endOfMonth(d), { weekStartsOn: 1 }) : endOfWeek(d, { weekStartsOn: 1 });
    const [{ rows }, { rows: unscheduled }] = await Promise.all([
      listTasks(user, { ...f, dueFrom: format(from, "yyyy-MM-dd"), dueTo: format(to, "yyyy-MM-dd") }, { sort: "priority", pageSize: 1000 }),
      listTasks(user, { ...f, due: "none", category: f.category ?? "open" }, { sort: "priority", pageSize: 100 }),
    ]);
    body = <CalendarView tasks={rows} unscheduled={unscheduled} anchor={anchor} mode={mode} />;
  } else if (view === "timeline") {
    const { rows } = await listTasks(user, f, { sort: "due", pageSize: 400 });
    const ids = rows.map((r) => r.id);
    const projIds = projectId ? [projectId] : all.map((p) => p.project.id);
    const [ms, deps] = await Promise.all([
      db.select({ id: milestones.id, name: milestones.name, targetDate: milestones.targetDate, completedAt: milestones.completedAt, projectId: milestones.projectId }).from(milestones).where(inArray(milestones.projectId, projIds)),
      ids.length ? db.select({ taskId: taskDependencies.taskId, dependsOnId: taskDependencies.dependsOnId }).from(taskDependencies).where(inArray(taskDependencies.taskId, ids)) : [],
    ]);
    body = <TimelineView tasks={rows} milestones={ms} deps={deps} />;
  } else if (view === "backlog") {
    const ctx = await getProjectContext(row!.project.id, row!.project.workflowId);
    const { rows } = await listTasks(user, { ...f, category: f.category ?? "open", topLevel: true }, { sort: "priority", pageSize: 1000 });
    body = <BacklogView tasks={rows} sprints={ctx.sprints} projectId={row!.project.id} canEdit={!!access?.canEdit} />;
  } else if (view === "sprints") {
    const pid = row!.project.id;
    const sprintStats = (await db.execute(sql`
      SELECT sp.id, sp.name, sp.goal, sp.state, sp.start_date AS "startDate", sp.end_date AS "endDate", sp.completed_at AS "completedAt",
        count(t.id)::int AS total,
        count(t.id) FILTER (WHERE s.category = 'done')::int AS done,
        count(t.id) FILTER (WHERE s.category = 'in_progress')::int AS "inProgress",
        coalesce(sum(t.estimate_hours), 0)::float AS estimate,
        coalesce(sum(t.estimate_hours) FILTER (WHERE s.category = 'done'), 0)::float AS "doneEstimate"
      FROM sprints sp LEFT JOIN tasks t ON t.sprint_id = sp.id LEFT JOIN workflow_statuses s ON s.id = t.status_id
      WHERE sp.project_id = ${pid} GROUP BY sp.id
      ORDER BY CASE sp.state WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, sp.start_date`)).rows as SprintStat[];
    const msStats = (await db.execute(sql`
      SELECT m.id, m.name, m.description, m.target_date AS "targetDate", m.completed_at AS "completedAt",
        count(t.id)::int AS total, count(t.id) FILTER (WHERE s.category = 'done')::int AS done
      FROM milestones m LEFT JOIN tasks t ON t.milestone_id = m.id LEFT JOIN workflow_statuses s ON s.id = t.status_id
      WHERE m.project_id = ${pid} GROUP BY m.id ORDER BY m.target_date`)).rows as MilestoneStat[];
    body = <SprintsView projectId={pid} sprints={sprintStats} milestones={msStats} canManage={!!access?.canManage} />;
  }

  return (
    <div>
      {view !== "sprints" ? (
        <FilterBar saved={saved} projectScoped={projectId} show={view === "backlog" ? ["assignee", "priority", "type", "label"] : undefined}>
          {switcher}
          {view === "list" && <ListTools projectId={projectId} canImport={!!access?.canEdit} />}
        </FilterBar>
      ) : switcher && <div className="mb-4 flex justify-end">{switcher}</div>}
      {body}
    </div>
  );
}
