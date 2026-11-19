import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { format, addDays } from "date-fns";
import { db } from "@/db";
import {
  attachments,
  labels,
  milestones,
  projectMembers,
  projects,
  savedFilters,
  sprints,
  tasks,
  users,
  workflowStatuses,
  workflows,
} from "@/db/schema";
import type { SessionUser } from "./session";
import { visibleProjectIds } from "./rbac";

export type TaskFilters = {
  projectId?: string;
  projectIds?: string[];
  status?: string; // status id
  category?: string; // backlog|todo|in_progress|done|cancelled|open
  priority?: string;
  type?: string;
  assignee?: string; // "me" | "none" | uuid
  reporter?: string;
  label?: string;
  due?: string; // overdue | today | week | none | upcoming
  sprint?: string; // uuid | "none"
  milestone?: string;
  q?: string;
  topLevel?: boolean;
  parentId?: string;
  ids?: string[];
  dueFrom?: string;
  dueTo?: string;
  completedSince?: string;
};

export type TaskRow = Awaited<ReturnType<typeof listTasks>>["rows"][number];

const userCols = (alias: typeof users) => ({ id: alias.id, name: alias.name, avatarColor: alias.avatarColor, username: alias.username });

export async function listTasks(
  user: SessionUser,
  f: TaskFilters,
  opts: { sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number } = {},
) {
  const allowed = await visibleProjectIds(user);
  if (!allowed.length) return { rows: [], total: 0 };
  const scope = f.projectId ? (allowed.includes(f.projectId) ? [f.projectId] : []) : f.projectIds ? f.projectIds.filter((p) => allowed.includes(p)) : allowed;
  if (!scope.length) return { rows: [], total: 0 };

  const today = format(new Date(), "yyyy-MM-dd");
  const where: SQL[] = [eq(tasks.orgId, user.orgId), inArray(tasks.projectId, scope)];
  if (f.status) where.push(eq(tasks.statusId, f.status));
  if (f.category === "open") where.push(sql`${workflowStatuses.category} NOT IN ('done','cancelled')`);
  else if (f.category) where.push(sql`${workflowStatuses.category} = ${f.category}`);
  if (f.priority) where.push(sql`${tasks.priority} = ${f.priority}`);
  if (f.type) where.push(sql`${tasks.type} = ${f.type}`);
  if (f.assignee === "me") where.push(eq(tasks.assigneeId, user.id));
  else if (f.assignee === "none") where.push(isNull(tasks.assigneeId));
  else if (f.assignee) where.push(eq(tasks.assigneeId, f.assignee));
  if (f.reporter === "me") where.push(eq(tasks.reporterId, user.id));
  else if (f.reporter) where.push(eq(tasks.reporterId, f.reporter));
  if (f.label) where.push(sql`EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = ${tasks.id} AND tl.label_id = ${f.label})`);
  if (f.sprint === "none") where.push(isNull(tasks.sprintId));
  else if (f.sprint) where.push(eq(tasks.sprintId, f.sprint));
  if (f.milestone) where.push(eq(tasks.milestoneId, f.milestone));
  if (f.topLevel) where.push(isNull(tasks.parentId));
  if (f.parentId) where.push(eq(tasks.parentId, f.parentId));
  if (f.ids) where.push(f.ids.length ? inArray(tasks.id, f.ids) : sql`false`);
  if (f.dueFrom) where.push(sql`${tasks.dueDate} >= ${f.dueFrom}`);
  if (f.dueTo) where.push(sql`${tasks.dueDate} <= ${f.dueTo}`);
  if (f.completedSince) where.push(sql`${tasks.completedAt} >= ${f.completedSince}`);
  const openCat = sql`${workflowStatuses.category} NOT IN ('done','cancelled')`;
  if (f.due === "overdue") where.push(and(sql`${tasks.dueDate} < ${today}`, openCat)!);
  if (f.due === "today") where.push(sql`${tasks.dueDate} = ${today}`);
  if (f.due === "week") where.push(sql`${tasks.dueDate} BETWEEN ${today} AND ${format(addDays(new Date(), 7), "yyyy-MM-dd")}`);
  if (f.due === "upcoming") where.push(and(sql`${tasks.dueDate} > ${today}`, openCat)!);
  if (f.due === "none") where.push(isNull(tasks.dueDate));
  if (f.q) {
    const q = `%${f.q.replace(/[%_]/g, "\\$&")}%`;
    const m = f.q.match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/);
    where.push(or(ilike(tasks.title, q), ilike(tasks.description, q), m ? and(sql`${projects.key} = ${m[1]!.toUpperCase()}`, eq(tasks.number, Number(m[2]))) : sql`false`)!);
  }

  const sortMap: Record<string, SQL | unknown> = {
    key: sql`${projects.key}, ${tasks.number}`,
    title: tasks.title,
    status: workflowStatuses.position,
    priority: sql`array_position(array['critical','high','medium','low']::text[], ${tasks.priority}::text)`,
    due: tasks.dueDate,
    updated: tasks.updatedAt,
    created: tasks.createdAt,
    assignee: users.name,
    position: tasks.position,
  };
  const sortExpr = (sortMap[opts.sort ?? "updated"] ?? tasks.updatedAt) as SQL;
  const order = (opts.dir ?? (opts.sort && opts.sort !== "updated" ? "asc" : "desc")) === "asc" ? asc(sortExpr) : desc(sortExpr);
  const pageSize = Math.min(opts.pageSize ?? 500, 1000);
  const page = Math.max(1, opts.page ?? 1);

  const base = db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      type: tasks.type,
      priority: tasks.priority,
      statusId: tasks.statusId,
      projectId: tasks.projectId,
      parentId: tasks.parentId,
      sprintId: tasks.sprintId,
      milestoneId: tasks.milestoneId,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      estimateHours: tasks.estimateHours,
      position: tasks.position,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      completedAt: tasks.completedAt,
      reporterId: tasks.reporterId,
      projectKey: projects.key,
      projectName: projects.name,
      projectColor: projects.color,
      statusName: workflowStatuses.name,
      statusColor: workflowStatuses.color,
      statusCategory: workflowStatuses.category,
      assignee: userCols(users),
      labels: sql<{ id: string; name: string; color: string }[]>`coalesce((SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY l.name) FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = ${tasks.id}), '[]')`,
      attachmentCount: sql<number>`(SELECT count(*)::int FROM attachments a WHERE a.task_id = ${tasks.id})`,
      commentCount: sql<number>`(SELECT count(*)::int FROM task_comments c WHERE c.task_id = ${tasks.id})`,
      subtaskCount: sql<number>`(SELECT count(*)::int FROM tasks s WHERE s.parent_id = ${tasks.id})`,
      subtaskDone: sql<number>`(SELECT count(*)::int FROM tasks s JOIN workflow_statuses ws ON ws.id = s.status_id WHERE s.parent_id = ${tasks.id} AND ws.category = 'done')`,
      loggedHours: sql<number>`(SELECT coalesce(sum(hours),0)::float FROM time_logs t WHERE t.task_id = ${tasks.id})`,
      total: sql<number>`count(*) OVER()::int`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(...where))
    .orderBy(...(opts.sort === "due" ? [sql`${tasks.dueDate} IS NULL`] : []), order, desc(tasks.number))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const rows = await base;
  return { rows: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0 };
}

export async function getOrgMembers(orgId: string) {
  return db
    .select({ id: users.id, name: users.name, username: users.username, avatarColor: users.avatarColor, role: users.role, title: users.title, email: users.email, isActive: users.isActive })
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(asc(users.name));
}

export async function getLabels(orgId: string) {
  return db.select().from(labels).where(eq(labels.orgId, orgId)).orderBy(asc(labels.name));
}

export async function getProjectsForUser(user: SessionUser, opts: { archived?: boolean; status?: string } = {}) {
  const ids = await visibleProjectIds(user);
  if (!ids.length) return [];
  const where: SQL[] = [inArray(projects.id, ids)];
  if (opts.archived === true) where.push(sql`${projects.archivedAt} IS NOT NULL`);
  if (opts.archived === false) where.push(isNull(projects.archivedAt));
  if (opts.status) where.push(sql`${projects.status} = ${opts.status}`);
  const owner = users;
  return db
    .select({
      project: projects,
      owner: { id: owner.id, name: owner.name, avatarColor: owner.avatarColor },
      total: sql<number>`(SELECT count(*)::int FROM tasks t WHERE t.project_id = ${projects.id})`,
      done: sql<number>`(SELECT count(*)::int FROM tasks t JOIN workflow_statuses s ON s.id = t.status_id WHERE t.project_id = ${projects.id} AND s.category = 'done')`,
      cancelled: sql<number>`(SELECT count(*)::int FROM tasks t JOIN workflow_statuses s ON s.id = t.status_id WHERE t.project_id = ${projects.id} AND s.category = 'cancelled')`,
      overdue: sql<number>`(SELECT count(*)::int FROM tasks t JOIN workflow_statuses s ON s.id = t.status_id WHERE t.project_id = ${projects.id} AND s.category NOT IN ('done','cancelled') AND t.due_date < current_date)`,
      members: sql<{ id: string; name: string; avatarColor: string }[]>`coalesce((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'avatarColor', u.avatar_color)) FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ${projects.id}), '[]')`,
    })
    .from(projects)
    .leftJoin(owner, eq(owner.id, projects.ownerId))
    .where(and(...where))
    .orderBy(desc(projects.updatedAt));
}

export const progressOf = (r: { total: number; done: number; cancelled: number }) => {
  const denom = r.total - r.cancelled;
  return denom > 0 ? Math.round((r.done / denom) * 100) : 0;
};

export async function getProjectContext(projectId: string, workflowId: string) {
  const [statuses, sprintRows, milestoneRows, members] = await Promise.all([
    db.select().from(workflowStatuses).where(eq(workflowStatuses.workflowId, workflowId)).orderBy(asc(workflowStatuses.position)),
    db.select().from(sprints).where(eq(sprints.projectId, projectId)).orderBy(asc(sprints.startDate)),
    db.select().from(milestones).where(eq(milestones.projectId, projectId)).orderBy(asc(milestones.targetDate)),
    db
      .select({ id: users.id, name: users.name, username: users.username, avatarColor: users.avatarColor, role: projectMembers.role, orgRole: users.role, title: users.title })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(users.name)),
  ]);
  return { statuses, sprints: sprintRows, milestones: milestoneRows, members };
}

/** Statuses for every workflow used by the visible projects (for cross-project views). */
export async function getAllStatuses(orgId: string) {
  return db
    .select({ status: workflowStatuses, workflowName: workflows.name, isDefault: workflows.isDefault })
    .from(workflowStatuses)
    .innerJoin(workflows, eq(workflows.id, workflowStatuses.workflowId))
    .where(eq(workflows.orgId, orgId))
    .orderBy(asc(workflowStatuses.position));
}

export async function getSavedFilters(userId: string) {
  return db.select().from(savedFilters).where(eq(savedFilters.userId, userId)).orderBy(asc(savedFilters.name));
}

export async function getAttachments(where: SQL) {
  return db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      context: attachments.context,
      createdAt: attachments.createdAt,
      width: attachments.width,
      height: attachments.height,
      commentId: attachments.commentId,
      uploadedById: attachments.uploadedById,
      uploadedByName: users.name,
    })
    .from(attachments)
    .leftJoin(users, eq(users.id, attachments.uploadedById))
    .where(where)
    .orderBy(desc(attachments.createdAt));
}

