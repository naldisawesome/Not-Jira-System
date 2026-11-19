import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { SessionUser } from "./session";
import { visibleProjectIds } from "./rbac";

const inList = (ids: string[]) => sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`;

export type ReportKey = "projects" | "completion" | "bugs" | "productivity" | "workload" | "overdue" | "sprints";

export async function buildReports(user: SessionUser, projectId?: string) {
  const visible = await visibleProjectIds(user);
  const ids = projectId ? visible.filter((v) => v === projectId) : visible;
  if (!ids.length) return null;
  const P = inList(ids);
  const q = async <T,>(s: ReturnType<typeof sql>) => (await db.execute(s)).rows as T[];

  const [projects, completion, bugs, productivity, workload, overdue, sprintPerf, trend, byType, cycle] = await Promise.all([
    q<{ project: string; key: string; status: string; due_date: string | null; total: number; done: number; open: number; overdue: number; pct: number }>(sql`
      SELECT p.name AS project, p.key, p.status, p.due_date,
        count(t.id)::int AS total,
        count(t.id) FILTER (WHERE s.category = 'done')::int AS done,
        count(t.id) FILTER (WHERE s.category NOT IN ('done','cancelled'))::int AS open,
        count(t.id) FILTER (WHERE s.category NOT IN ('done','cancelled') AND t.due_date < current_date)::int AS overdue,
        coalesce(round(100.0 * count(t.id) FILTER (WHERE s.category = 'done') / nullif(count(t.id) FILTER (WHERE s.category <> 'cancelled'), 0)), 0)::int AS pct
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id LEFT JOIN workflow_statuses s ON s.id = t.status_id
      WHERE p.id IN ${P} GROUP BY p.id ORDER BY p.name`),
    q<{ type: string; total: number; done: number; in_progress: number; todo: number; pct: number }>(sql`
      SELECT t.type, count(*)::int AS total,
        count(*) FILTER (WHERE s.category = 'done')::int AS done,
        count(*) FILTER (WHERE s.category = 'in_progress')::int AS in_progress,
        count(*) FILTER (WHERE s.category IN ('todo','backlog'))::int AS todo,
        coalesce(round(100.0 * count(*) FILTER (WHERE s.category = 'done') / nullif(count(*), 0)), 0)::int AS pct
      FROM tasks t JOIN workflow_statuses s ON s.id = t.status_id WHERE t.project_id IN ${P} GROUP BY t.type ORDER BY total DESC`),
    q<{ severity: string; priority: string; open: number; closed: number; avg_age_days: number }>(sql`
      SELECT coalesce(t.bug->>'severity', 'unset') AS severity, t.priority::text AS priority,
        count(*) FILTER (WHERE s.category NOT IN ('done','cancelled'))::int AS open,
        count(*) FILTER (WHERE s.category IN ('done','cancelled'))::int AS closed,
        coalesce(round(avg(extract(epoch FROM (coalesce(t.completed_at, now()) - t.created_at)) / 86400)::numeric, 1), 0)::float AS avg_age_days
      FROM tasks t JOIN workflow_statuses s ON s.id = t.status_id
      WHERE t.project_id IN ${P} AND t.type IN ('bug','support')
      GROUP BY 1, 2 ORDER BY array_position(array['blocker','major','minor','trivial','unset'], coalesce(t.bug->>'severity','unset')), 2`),
    q<{ name: string; completed_30d: number; open: number; hours_30d: number; on_time_pct: number }>(sql`
      SELECT u.name,
        count(t.id) FILTER (WHERE t.completed_at > now() - interval '30 days')::int AS completed_30d,
        count(t.id) FILTER (WHERE s.category NOT IN ('done','cancelled'))::int AS open,
        coalesce((SELECT sum(l.hours) FROM time_logs l JOIN tasks lt ON lt.id = l.task_id WHERE l.user_id = u.id AND lt.project_id IN ${P} AND l.logged_on > current_date - 30), 0)::float AS hours_30d,
        coalesce(round(100.0 * count(t.id) FILTER (WHERE t.completed_at IS NOT NULL AND (t.due_date IS NULL OR t.completed_at::date <= t.due_date)) / nullif(count(t.id) FILTER (WHERE t.completed_at IS NOT NULL), 0)), 0)::int AS on_time_pct
      FROM users u LEFT JOIN tasks t ON t.assignee_id = u.id AND t.project_id IN ${P} LEFT JOIN workflow_statuses s ON s.id = t.status_id
      WHERE u.org_id = ${user.orgId} AND u.is_active GROUP BY u.id ORDER BY completed_30d DESC, u.name`),
    q<{ name: string; critical: number; high: number; medium: number; low: number; estimate: number }>(sql`
      SELECT u.name,
        count(*) FILTER (WHERE t.priority = 'critical')::int AS critical,
        count(*) FILTER (WHERE t.priority = 'high')::int AS high,
        count(*) FILTER (WHERE t.priority = 'medium')::int AS medium,
        count(*) FILTER (WHERE t.priority = 'low')::int AS low,
        coalesce(sum(t.estimate_hours), 0)::float AS estimate
      FROM tasks t JOIN users u ON u.id = t.assignee_id JOIN workflow_statuses s ON s.id = t.status_id
      WHERE t.project_id IN ${P} AND s.category NOT IN ('done','cancelled') GROUP BY u.id ORDER BY count(*) DESC`),
    q<{ id: string; key: string; title: string; project: string; assignee: string | null; priority: string; due_date: string; days_overdue: number }>(sql`
      SELECT t.id, p.key || '-' || lpad(t.number::text, 3, '0') AS key, t.title, p.name AS project, u.name AS assignee, t.priority::text AS priority, t.due_date, (current_date - t.due_date)::int AS days_overdue
      FROM tasks t JOIN projects p ON p.id = t.project_id JOIN workflow_statuses s ON s.id = t.status_id LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id IN ${P} AND s.category NOT IN ('done','cancelled') AND t.due_date < current_date ORDER BY t.due_date LIMIT 200`),
    q<{ sprint: string; project: string; state: string; start_date: string; end_date: string; total: number; done: number; pct: number; hours: number }>(sql`
      SELECT sp.name AS sprint, p.name AS project, sp.state, sp.start_date, sp.end_date, count(t.id)::int AS total,
        count(t.id) FILTER (WHERE s.category = 'done')::int AS done,
        coalesce(round(100.0 * count(t.id) FILTER (WHERE s.category = 'done') / nullif(count(t.id), 0)), 0)::int AS pct,
        coalesce(sum(t.estimate_hours) FILTER (WHERE s.category = 'done'), 0)::float AS hours
      FROM sprints sp JOIN projects p ON p.id = sp.project_id LEFT JOIN tasks t ON t.sprint_id = sp.id LEFT JOIN workflow_statuses s ON s.id = t.status_id
      WHERE sp.project_id IN ${P} GROUP BY sp.id, p.name ORDER BY sp.start_date DESC LIMIT 30`),
    q<{ week: string; created: number; completed: number }>(sql`
      WITH weeks AS (SELECT generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS wk)
      SELECT to_char(w.wk, 'Mon DD') AS week,
        (SELECT count(*)::int FROM tasks t WHERE t.project_id IN ${P} AND date_trunc('week', t.created_at) = w.wk) AS created,
        (SELECT count(*)::int FROM tasks t WHERE t.project_id IN ${P} AND date_trunc('week', t.completed_at) = w.wk) AS completed
      FROM weeks w ORDER BY w.wk`),
    q<{ type: string; count: number }>(sql`SELECT type::text, count(*)::int FROM tasks WHERE project_id IN ${P} GROUP BY type ORDER BY 2 DESC`),
    q<{ type: string; avg_days: number; n: number }>(sql`
      SELECT type::text, round(avg(extract(epoch FROM (completed_at - created_at)) / 86400)::numeric, 1)::float AS avg_days, count(*)::int AS n
      FROM tasks WHERE project_id IN ${P} AND completed_at IS NOT NULL GROUP BY type ORDER BY 2`),
  ]);
  return { projects, completion, bugs, productivity, workload, overdue, sprints: sprintPerf, trend, byType, cycle };
}
export type Reports = NonNullable<Awaited<ReturnType<typeof buildReports>>>;
