import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, projects, tasks, users } from "@/db/schema";
import type { SessionUser } from "./session";
import { visibleProjectIds } from "./rbac";

export async function getActivity(user: SessionUser, opts: { projectId?: string; taskId?: string; actorId?: string; limit?: number } = {}) {
  const ids = await visibleProjectIds(user);
  const scope = sql`(${activityLogs.projectId} IS NULL OR ${activityLogs.projectId} IN ${ids.length ? sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql`(NULL)`})`;
  const where = [eq(activityLogs.orgId, user.orgId), scope];
  if (opts.projectId) where.push(eq(activityLogs.projectId, opts.projectId));
  if (opts.taskId) where.push(eq(activityLogs.taskId, opts.taskId));
  if (opts.actorId) where.push(eq(activityLogs.actorId, opts.actorId));
  return db
    .select({
      id: activityLogs.id,
      entity: activityLogs.entity,
      action: activityLogs.action,
      meta: activityLogs.meta,
      createdAt: activityLogs.createdAt,
      taskId: activityLogs.taskId,
      projectId: activityLogs.projectId,
      actorName: users.name,
      actorColor: users.avatarColor,
      taskTitle: tasks.title,
      taskNumber: tasks.number,
      projectKey: projects.key,
      projectName: projects.name,
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.actorId))
    .leftJoin(tasks, eq(tasks.id, activityLogs.taskId))
    .leftJoin(projects, eq(projects.id, activityLogs.projectId))
    .where(and(...where))
    .orderBy(desc(activityLogs.createdAt))
    .limit(opts.limit ?? 30);
}
export type ActivityRow = Awaited<ReturnType<typeof getActivity>>[number];

/** Aggregate task metrics scoped to the projects the user can see. */
export async function getTaskStats(user: SessionUser, projectIds?: string[]) {
  const visible = await visibleProjectIds(user);
  const ids = projectIds ? projectIds.filter((p) => visible.includes(p)) : visible;
  if (!ids.length) return null;
  const inScope = inArray(tasks.projectId, ids);

  const [totals] = (await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE s.category = 'done')::int AS done,
      count(*) FILTER (WHERE s.category NOT IN ('done','cancelled') AND t.due_date < current_date)::int AS overdue,
      count(*) FILTER (WHERE t.type IN ('bug','support') AND s.category NOT IN ('done','cancelled'))::int AS open_issues,
      count(*) FILTER (WHERE s.category NOT IN ('done','cancelled'))::int AS open
    FROM tasks t JOIN workflow_statuses s ON s.id = t.status_id
    WHERE t.org_id = ${user.orgId} AND t.project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)).rows as { total: number; done: number; overdue: number; open_issues: number; open: number }[];

  const byStatus = await db.execute<{ name: string; color: string; category: string; count: number }>(sql`
    SELECT s.name, s.color, s.category, min(s.position) AS pos, count(*)::int AS count
    FROM tasks t JOIN workflow_statuses s ON s.id = t.status_id
    WHERE t.project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    GROUP BY s.name, s.color, s.category ORDER BY pos`);

  const byPriority = await db
    .select({ priority: tasks.priority, count: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(sql`workflow_statuses s`, sql`s.id = ${tasks.statusId}`)
    .where(and(inScope, sql`s.category NOT IN ('done','cancelled')`))
    .groupBy(tasks.priority);

  const byType = await db.select({ type: tasks.type, count: sql<number>`count(*)::int` }).from(tasks).where(inScope).groupBy(tasks.type);

  const workload = await db.execute<{ id: string; name: string; avatar_color: string; open: number; done: number; overdue: number; estimate: number }>(sql`
    SELECT u.id, u.name, u.avatar_color,
      count(*) FILTER (WHERE s.category NOT IN ('done','cancelled'))::int AS open,
      count(*) FILTER (WHERE s.category = 'done')::int AS done,
      count(*) FILTER (WHERE s.category NOT IN ('done','cancelled') AND t.due_date < current_date)::int AS overdue,
      coalesce(sum(t.estimate_hours) FILTER (WHERE s.category NOT IN ('done','cancelled')), 0)::float AS estimate
    FROM users u
    JOIN tasks t ON t.assignee_id = u.id AND t.project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    JOIN workflow_statuses s ON s.id = t.status_id
    WHERE u.org_id = ${user.orgId}
    GROUP BY u.id ORDER BY open DESC, u.name`);

  const trend = await db.execute<{ week: string; created: number; completed: number }>(sql`
    WITH weeks AS (SELECT generate_series(date_trunc('week', now()) - interval '9 weeks', date_trunc('week', now()), interval '1 week') AS wk)
    SELECT to_char(w.wk, 'Mon DD') AS week,
      (SELECT count(*)::int FROM tasks t WHERE t.project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND date_trunc('week', t.created_at) = w.wk) AS created,
      (SELECT count(*)::int FROM tasks t WHERE t.project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND date_trunc('week', t.completed_at) = w.wk) AS completed
    FROM weeks w ORDER BY w.wk`);

  return { totals: totals!, byStatus: byStatus.rows, byPriority, byType, workload: workload.rows, trend: trend.rows, projectIds: ids };
}
