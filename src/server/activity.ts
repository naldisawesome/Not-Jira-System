import "server-only";
import { and, eq, inArray, isNull, lte, gte, sql } from "drizzle-orm";
import { addDays, format } from "date-fns";
import { db } from "@/db";
import { activityLogs, notifications, organizations, tasks, workflowStatuses, projects, taskWatchers } from "@/db/schema";
import { taskKey } from "@/lib/utils";

type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function logActivity(
  tx: Tx,
  a: { orgId: string; actorId: string | null; entity: string; action: string; projectId?: string | null; taskId?: string | null; meta?: Record<string, unknown> },
) {
  await tx.insert(activityLogs).values({
    orgId: a.orgId,
    actorId: a.actorId,
    entity: a.entity,
    action: a.action,
    projectId: a.projectId ?? null,
    taskId: a.taskId ?? null,
    meta: a.meta ?? {},
  });
}

export async function notify(
  tx: Tx,
  n: { orgId: string; actorId: string | null; userIds: (string | null | undefined)[]; type: string; title: string; body?: string; link?: string },
) {
  const ids = Array.from(new Set(n.userIds.filter((x): x is string => !!x && x !== n.actorId)));
  if (!ids.length) return;
  await tx.insert(notifications).values(
    ids.map((userId) => ({ orgId: n.orgId, userId, actorId: n.actorId, type: n.type, title: n.title, body: n.body, link: n.link })),
  );
}

export async function watcherIds(taskId: string) {
  const rows = await db.select({ userId: taskWatchers.userId }).from(taskWatchers).where(eq(taskWatchers.taskId, taskId));
  return rows.map((r) => r.userId);
}

/**
 * Generates "due soon" and "overdue" notifications exactly once per task.
 * Called opportunistically when notifications are read, and by /api/cron/deadlines.
 */
export async function scanDeadlines(orgId: string) {
  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  const today = format(new Date(), "yyyy-MM-dd");
  const soon = format(addDays(new Date(), org?.settings.dueSoonDays ?? 2), "yyyy-MM-dd");
  const open = sql`${workflowStatuses.category} NOT IN ('done','cancelled')`;
  const base = db
    .select({ id: tasks.id, number: tasks.number, title: tasks.title, assigneeId: tasks.assigneeId, dueDate: tasks.dueDate, key: projects.key, projectId: tasks.projectId })
    .from(tasks)
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId));

  const dueSoon = await base.where(
    and(eq(tasks.orgId, orgId), open, isNull(tasks.dueReminderSentAt), gte(tasks.dueDate, today), lte(tasks.dueDate, soon), sql`${tasks.assigneeId} IS NOT NULL`),
  );
  const overdue = await db
    .select({ id: tasks.id, number: tasks.number, title: tasks.title, assigneeId: tasks.assigneeId, reporterId: tasks.reporterId, key: projects.key, projectId: tasks.projectId })
    .from(tasks)
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.orgId, orgId), open, isNull(tasks.overdueNotifiedAt), sql`${tasks.dueDate} < ${today}`));

  if (!dueSoon.length && !overdue.length) return;
  await db.transaction(async (tx) => {
    for (const t of dueSoon) {
      await notify(tx, {
        orgId, actorId: null, userIds: [t.assigneeId], type: "deadline",
        title: `${taskKey(t.key, t.number)} is due ${t.dueDate === today ? "today" : "soon"}`, body: t.title, link: `/tasks/${t.id}`,
      });
    }
    for (const t of overdue) {
      await notify(tx, {
        orgId, actorId: null, userIds: [t.assigneeId, t.reporterId], type: "overdue",
        title: `${taskKey(t.key, t.number)} is overdue`, body: t.title, link: `/tasks/${t.id}`,
      });
    }
    if (dueSoon.length) await tx.update(tasks).set({ dueReminderSentAt: new Date() }).where(inArray(tasks.id, dueSoon.map((t) => t.id)));
    if (overdue.length) await tx.update(tasks).set({ overdueNotifiedAt: new Date() }).where(inArray(tasks.id, overdue.map((t) => t.id)));
  });
}
