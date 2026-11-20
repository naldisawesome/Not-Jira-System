"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql, max } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  checklistItems,
  labels,
  projects,
  sprints,
  milestones,
  projectMembers,
  taskDependencies,
  taskLabels,
  taskWatchers,
  tasks,
  timeLogs,
  workflowStatuses,
} from "@/db/schema";
import { action } from "../action";
import { AuthzError, NotFoundError, assertUsersInOrg, requireProject, requireTask } from "../rbac";
import { logActivity, notify, watcherIds } from "../activity";
import { taskCreateSchema, taskPatchSchema, zId, zDate } from "@/lib/validators";
import { taskKey } from "@/lib/utils";
import { priorityMeta } from "@/lib/constants";

async function assertStatusInWorkflow(statusId: string, workflowId: string) {
  const [s] = await db.select().from(workflowStatuses).where(and(eq(workflowStatuses.id, statusId), eq(workflowStatuses.workflowId, workflowId))).limit(1);
  if (!s) throw new AuthzError("That status doesn't belong to this project's workflow.");
  return s;
}

async function assertInProject(projectId: string, refs: { parentId?: string | null; sprintId?: string | null; milestoneId?: string | null }) {
  if (refs.parentId) {
    const [p] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, refs.parentId), eq(tasks.projectId, projectId))).limit(1);
    if (!p) throw new AuthzError("Parent task must be in the same project.");
  }
  if (refs.sprintId) {
    const [s] = await db.select({ id: sprints.id }).from(sprints).where(and(eq(sprints.id, refs.sprintId), eq(sprints.projectId, projectId))).limit(1);
    if (!s) throw new AuthzError("Sprint must be in the same project.");
  }
  if (refs.milestoneId) {
    const [m] = await db.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.id, refs.milestoneId), eq(milestones.projectId, projectId))).limit(1);
    if (!m) throw new AuthzError("Milestone must be in the same project.");
  }
}

function revalidateTaskViews(taskId?: string) {
  revalidatePath("/", "layout");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

export const createTask = action(taskCreateSchema, async (input, user) => {
  const { project } = await requireProject(user, input.projectId, "edit");
  await assertUsersInOrg(user.orgId, [input.assigneeId]);
  await assertInProject(project.id, input);

  let statusId = input.statusId;
  if (statusId) await assertStatusInWorkflow(statusId, project.workflowId);
  else {
    const [first] = await db
      .select()
      .from(workflowStatuses)
      .where(and(eq(workflowStatuses.workflowId, project.workflowId), inArray(workflowStatuses.category, ["todo", "backlog"])))
      .orderBy(sql`case when ${workflowStatuses.category} = 'todo' then 0 else 1 end`, workflowStatuses.position)
      .limit(1);
    if (!first) throw new Error("Workflow has no statuses");
    statusId = first.id;
  }

  const created = await db.transaction(async (tx) => {
    const [counter] = await tx
      .update(projects)
      .set({ taskCounter: sql`${projects.taskCounter} + 1`, updatedAt: new Date() })
      .where(eq(projects.id, project.id))
      .returning({ n: projects.taskCounter });
    const [pos] = await tx.select({ p: max(tasks.position) }).from(tasks).where(and(eq(tasks.projectId, project.id), eq(tasks.statusId, statusId!)));
    const [task] = await tx
      .insert(tasks)
      .values({
        orgId: user.orgId,
        projectId: project.id,
        number: counter!.n,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        statusId: statusId!,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        reporterId: user.id,
        parentId: input.parentId ?? null,
        sprintId: input.sprintId ?? null,
        milestoneId: input.milestoneId ?? null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        estimateHours: input.estimateHours ?? null,
        bug: input.type === "bug" && input.bug ? input.bug : null,
        position: (pos?.p ?? 0) + 1000,
      })
      .returning();
    if (input.labelIds.length) {
      const valid = await tx.select({ id: labels.id }).from(labels).where(and(eq(labels.orgId, user.orgId), inArray(labels.id, input.labelIds)));
      if (valid.length) await tx.insert(taskLabels).values(valid.map((l) => ({ taskId: task!.id, labelId: l.id })));
    }
    if (input.attachmentIds.length) {
      // Claim files uploaded during creation (e.g. bug screenshots) — only the uploader's own, unclaimed files in this project.
      await tx
        .update(attachments)
        .set({ taskId: task!.id })
        .where(
          and(
            inArray(attachments.id, input.attachmentIds),
            eq(attachments.uploadedById, user.id),
            eq(attachments.projectId, project.id),
            isNull(attachments.taskId),
          ),
        );
    }
    await tx.insert(taskWatchers).values([{ taskId: task!.id, userId: user.id }]).onConflictDoNothing();
    if (task!.assigneeId && task!.assigneeId !== user.id)
      await tx.insert(taskWatchers).values([{ taskId: task!.id, userId: task!.assigneeId }]).onConflictDoNothing();
    await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "task", action: "created", projectId: project.id, taskId: task!.id, meta: { title: task!.title } });
    await notify(tx, {
      orgId: user.orgId,
      actorId: user.id,
      userIds: [task!.assigneeId],
      type: "assigned",
      title: `${user.name} assigned you ${taskKey(project.key, task!.number)}`,
      body: task!.title,
      link: `/tasks/${task!.id}`,
    });
    return task!;
  });
  revalidateTaskViews();
  return { id: created.id, key: taskKey(project.key, created.number) };
});

const FIELD_LABELS: Record<string, string> = {
  title: "title", description: "description", type: "type", statusId: "status", priority: "priority", assigneeId: "assignee",
  reporterId: "reporter", parentId: "parent", sprintId: "sprint", milestoneId: "milestone", startDate: "start date",
  dueDate: "due date", estimateHours: "estimate", bug: "bug details",
};

export const updateTask = action(taskPatchSchema, async ({ id, patch }, user) => {
  const { task, access } = await requireTask(user, id, "edit");
  const project = access.project;
  if (patch.reporterId !== undefined && !access.canManage) throw new AuthzError("Only project managers can change the reporter.");
  await assertUsersInOrg(user.orgId, [patch.assigneeId, patch.reporterId]);
  await assertInProject(project.id, patch);
  if (patch.parentId === id) throw new AuthzError("A task can't be its own parent.");

  let newStatus: typeof workflowStatuses.$inferSelect | undefined;
  if (patch.statusId && patch.statusId !== task.statusId) newStatus = await assertStatusInWorkflow(patch.statusId, project.workflowId);

  const changed = Object.entries(patch).filter(([k, v]) => JSON.stringify((task as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null));
  if (!changed.length) return { id };

  const set: Partial<typeof tasks.$inferInsert> = { ...patch, updatedAt: new Date() } as Partial<typeof tasks.$inferInsert>;
  if (newStatus) set.completedAt = newStatus.category === "done" ? new Date() : null;
  if (patch.dueDate !== undefined) {
    set.dueReminderSentAt = null;
    set.overdueNotifiedAt = null;
  }

  await db.transaction(async (tx) => {
    await tx.update(tasks).set(set).where(eq(tasks.id, id));
    const key = taskKey(project.key, task.number);
    for (const [field, value] of changed) {
      const meta: Record<string, unknown> = { field: FIELD_LABELS[field] ?? field };
      if (field === "statusId") {
        const [from] = await tx.select({ name: workflowStatuses.name }).from(workflowStatuses).where(eq(workflowStatuses.id, task.statusId));
        meta.from = from?.name;
        meta.to = newStatus?.name;
      } else if (field === "priority") {
        meta.from = priorityMeta(task.priority).label;
        meta.to = priorityMeta(String(value)).label;
      } else if (field !== "description" && field !== "bug" && !field.endsWith("Id")) {
        meta.from = (task as Record<string, unknown>)[field] ?? null;
        meta.to = value ?? null;
      }
      await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "task", action: field === "statusId" ? "status_changed" : "updated", projectId: project.id, taskId: id, meta });
    }
    if (patch.assigneeId && patch.assigneeId !== task.assigneeId) {
      await tx.insert(taskWatchers).values({ taskId: id, userId: patch.assigneeId }).onConflictDoNothing();
      await notify(tx, { orgId: user.orgId, actorId: user.id, userIds: [patch.assigneeId], type: "assigned", title: `${user.name} assigned you ${key}`, body: patch.title ?? task.title, link: `/tasks/${id}` });
    }
    const watchers = await watcherIds(id);
    const summary = newStatus ? `moved ${key} to ${newStatus.name}` : `updated ${changed.map(([k]) => FIELD_LABELS[k] ?? k).join(", ")} on ${key}`;
    await notify(tx, {
      orgId: user.orgId,
      actorId: user.id,
      userIds: [...watchers, task.assigneeId, task.reporterId].filter((u) => u !== patch.assigneeId),
      type: "updated",
      title: `${user.name} ${summary}`,
      body: task.title,
      link: `/tasks/${id}`,
    });
  });
  revalidateTaskViews(id);
  return { id };
});

export const moveTask = action(
  z.object({ id: zId, statusId: zId, beforeId: zId.nullable().optional(), afterId: zId.nullable().optional() }),
  async ({ id, statusId, beforeId, afterId }, user) => {
    const { task, access } = await requireTask(user, id, "edit");
    const status = await assertStatusInWorkflow(statusId, access.project.workflowId);
    const neighbours = await db
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.projectId, task.projectId), inArray(tasks.id, [beforeId, afterId].filter((x): x is string => !!x))));
    const before = neighbours.find((n) => n.id === beforeId)?.position;
    const after = neighbours.find((n) => n.id === afterId)?.position;
    const position = before !== undefined && after !== undefined ? (before + after) / 2 : before !== undefined ? before + 1000 : after !== undefined ? after - 1000 : 1000;
    if (status.id !== task.statusId) {
      const res = await updateTask({ id, patch: { statusId } });
      if (!res.ok) throw new AuthzError(res.error);
    }
    await db.update(tasks).set({ position }).where(eq(tasks.id, id));
    revalidateTaskViews();
    return { id, position };
  },
);

export const bulkUpdateTasks = action(
  z.object({
    ids: z.array(zId).min(1).max(200),
    patch: z.object({ statusId: zId, priority: taskPatchSchema.shape.patch.shape.priority, assigneeId: zId.nullable(), sprintId: zId.nullable(), dueDate: zDate }).partial(),
  }),
  async ({ ids, patch }, user) => {
    let updated = 0;
    const errors: string[] = [];
    for (const id of ids) {
      // Re-uses single-task path so every change is authorized, validated and audited individually.
      const res = await updateTask({ id, patch });
      if (res.ok) updated++;
      else errors.push(res.error);
    }
    if (!updated && errors.length) throw new AuthzError(errors[0]);
    return { updated, failed: errors.length };
  },
);

export const deleteTasks = action(z.object({ ids: z.array(zId).min(1).max(200) }), async ({ ids }, user) => {
  const rows = await db.select().from(tasks).where(and(eq(tasks.orgId, user.orgId), inArray(tasks.id, ids)));
  if (rows.length !== ids.length) throw new NotFoundError("Some tasks were not found.");
  for (const t of rows) {
    const { access } = await requireTask(user, t.id, "edit");
    if (!access.canManage && t.reporterId !== user.id) throw new AuthzError("Only the reporter or a project manager can delete a task.");
  }
  await db.transaction(async (tx) => {
    for (const t of rows) await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "task", action: "deleted", projectId: t.projectId, meta: { title: t.title, number: t.number } });
    await tx.delete(tasks).where(inArray(tasks.id, ids));
  });
  // Files are removed from storage asynchronously by cascade cleanup (rows deleted via FK); best-effort storage cleanup:
  revalidateTaskViews();
  return { deleted: rows.length };
});

export const cloneTask = action(z.object({ id: zId }), async ({ id }, user) => {
  const { task } = await requireTask(user, id, "edit");
  const lbls = await db.select({ id: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.taskId, id));
  const res = await createTask({
    projectId: task.projectId,
    title: `${task.title} (copy)`.slice(0, 240),
    description: task.description,
    type: task.type,
    statusId: task.statusId,
    priority: task.priority,
    assigneeId: task.assigneeId,
    parentId: task.parentId,
    sprintId: task.sprintId,
    milestoneId: task.milestoneId,
    startDate: task.startDate,
    dueDate: task.dueDate,
    estimateHours: task.estimateHours,
    labelIds: lbls.map((l) => l.id),
    bug: task.bug ?? undefined,
  });
  if (!res.ok) throw new AuthzError(res.error);
  const items = await db.select().from(checklistItems).where(eq(checklistItems.taskId, id));
  if (items.length) await db.insert(checklistItems).values(items.map((i) => ({ taskId: res.data.id, text: i.text, position: i.position })));
  return res.data;
});

export const bulkCreateTasks = action(
  z.object({ projectId: zId, titles: z.array(z.string().trim().min(1).max(240)).min(1).max(100), type: taskCreateSchema.shape.type, sprintId: zId.nullable().optional() }),
  async ({ projectId, titles, type, sprintId }) => {
    const created: string[] = [];
    for (const title of titles) {
      const r = await createTask({ projectId, title, type, sprintId });
      if (!r.ok) throw new AuthzError(r.error);
      created.push(r.data.key);
    }
    return { created };
  },
);

/* ───── labels ───── */

export const setTaskLabels = action(z.object({ taskId: zId, labelIds: z.array(zId).max(30) }), async ({ taskId, labelIds }, user) => {
  const { task } = await requireTask(user, taskId, "edit");
  const valid = labelIds.length ? await db.select({ id: labels.id, name: labels.name }).from(labels).where(and(eq(labels.orgId, user.orgId), inArray(labels.id, labelIds))) : [];
  await db.transaction(async (tx) => {
    await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
    if (valid.length) await tx.insert(taskLabels).values(valid.map((l) => ({ taskId, labelId: l.id })));
    await tx.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId));
    await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "task", action: "updated", projectId: task.projectId, taskId, meta: { field: "labels", to: valid.map((l) => l.name).join(", ") || "none" } });
  });
  revalidateTaskViews(taskId);
  return { count: valid.length };
});

export const createLabel = action(
  z.object({ name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  async ({ name, color }, user) => {
    if (user.role === "viewer") throw new AuthzError();
    const [l] = await db.insert(labels).values({ orgId: user.orgId, name, color }).returning();
    revalidatePath("/", "layout");
    return l!;
  },
);

/* ───── dependencies ───── */

export const addDependency = action(z.object({ taskId: zId, dependsOnId: zId }), async ({ taskId, dependsOnId }, user) => {
  if (taskId === dependsOnId) throw new AuthzError("A task can't depend on itself.");
  const { task } = await requireTask(user, taskId, "edit");
  const { task: other } = await requireTask(user, dependsOnId, "view");
  // Prevent simple cycles (A blocked by B while B blocked by A, transitively).
  const cycle = await db.execute(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT depends_on_id FROM task_dependencies WHERE task_id = ${dependsOnId}
      UNION SELECT d.depends_on_id FROM task_dependencies d JOIN chain c ON d.task_id = c.id
    ) SELECT 1 FROM chain WHERE id = ${taskId} LIMIT 1`);
  if (cycle.rows.length) throw new AuthzError("That would create a circular dependency.");
  await db.insert(taskDependencies).values({ taskId, dependsOnId }).onConflictDoNothing();
  await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "task", action: "dependency_added", projectId: task.projectId, taskId, meta: { otherId: other.id, otherTitle: other.title } });
  revalidateTaskViews(taskId);
  return { ok: true };
});

export const removeDependency = action(z.object({ taskId: zId, dependsOnId: zId }), async ({ taskId, dependsOnId }, user) => {
  await requireTask(user, taskId, "edit");
  await db.delete(taskDependencies).where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnId, dependsOnId)));
  revalidateTaskViews(taskId);
  return { ok: true };
});

/* ───── checklist ───── */

export const addChecklistItem = action(z.object({ taskId: zId, text: z.string().trim().min(1).max(300) }), async ({ taskId, text }, user) => {
  await requireTask(user, taskId, "edit");
  const [p] = await db.select({ p: max(checklistItems.position) }).from(checklistItems).where(eq(checklistItems.taskId, taskId));
  const [item] = await db.insert(checklistItems).values({ taskId, text, position: (p?.p ?? 0) + 1 }).returning();
  revalidateTaskViews(taskId);
  return item!;
});

export const updateChecklistItem = action(
  z.object({ id: zId, done: z.boolean().optional(), text: z.string().trim().min(1).max(300).optional(), remove: z.boolean().optional() }),
  async ({ id, done, text, remove }, user) => {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, id)).limit(1);
    if (!item) throw new NotFoundError();
    await requireTask(user, item.taskId, "edit");
    if (remove) await db.delete(checklistItems).where(eq(checklistItems.id, id));
    else await db.update(checklistItems).set({ ...(done !== undefined && { done }), ...(text && { text }) }).where(eq(checklistItems.id, id));
    revalidateTaskViews(item.taskId);
    return { ok: true };
  },
);

/* ───── watchers ───── */

export const toggleWatch = action(z.object({ taskId: zId }), async ({ taskId }, user) => {
  await requireTask(user, taskId, "view");
  const [w] = await db.select().from(taskWatchers).where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.userId, user.id)));
  if (w) await db.delete(taskWatchers).where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.userId, user.id)));
  else await db.insert(taskWatchers).values({ taskId, userId: user.id });
  revalidateTaskViews(taskId);
  return { watching: !w };
});

/* ───── time tracking ───── */

export const logTime = action(
  z.object({ taskId: zId, hours: z.coerce.number().positive().max(24), note: z.string().trim().max(300).optional(), loggedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  async ({ taskId, hours, note, loggedOn }, user) => {
    const { task } = await requireTask(user, taskId, "edit");
    await db.transaction(async (tx) => {
      await tx.insert(timeLogs).values({ orgId: user.orgId, taskId, userId: user.id, hours, note, loggedOn });
      await tx.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId));
      await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "time", action: "logged", projectId: task.projectId, taskId, meta: { hours } });
    });
    revalidateTaskViews(taskId);
    return { ok: true };
  },
);

export const deleteTimeLog = action(z.object({ id: zId }), async ({ id }, user) => {
  const [log] = await db.select().from(timeLogs).where(and(eq(timeLogs.id, id), eq(timeLogs.orgId, user.orgId)));
  if (!log) throw new NotFoundError();
  const { access } = await requireTask(user, log.taskId, "edit");
  if (log.userId !== user.id && !access.canManage) throw new AuthzError();
  await db.delete(timeLogs).where(eq(timeLogs.id, id));
  revalidateTaskViews(log.taskId);
  return { ok: true };
});

/* ───── assign all to me ───── */

export const assignAllToMe = action(
  z.object({ projectId: zId, scope: z.enum(["unassigned", "open", "all"]) }),
  async ({ projectId, scope }, user) => {
    const { project, memberRole, canManage } = await requireProject(user, projectId, "edit");
    if (user.role === "viewer" || memberRole === "viewer") throw new AuthzError("Viewers can't be assigned tasks.");
    // Make sure the person can actually work on the project (admins/PMs who manage it may not be listed yet).
    if (!memberRole && project.ownerId !== user.id) {
      if (!canManage) throw new AuthzError("You need to be a member of this project.");
      await db.insert(projectMembers).values({ projectId, userId: user.id, role: "member" }).onConflictDoNothing();
    }
    const where = and(
      eq(tasks.projectId, projectId),
      sql`(${tasks.assigneeId} IS NULL OR ${tasks.assigneeId} <> ${user.id})`,
      scope === "unassigned" ? isNull(tasks.assigneeId) : undefined,
      scope !== "all" ? sql`${tasks.statusId} IN (SELECT id FROM workflow_statuses WHERE category NOT IN ('done','cancelled'))` : undefined,
    );
    const affected = await db.select({ id: tasks.id, assigneeId: tasks.assigneeId }).from(tasks).where(where);
    if (!affected.length) return { updated: 0 };
    const ids = affected.map((t) => t.id);
    await db.transaction(async (tx) => {
      await tx.update(tasks).set({ assigneeId: user.id, updatedAt: new Date() }).where(inArray(tasks.id, ids));
      await tx.insert(taskWatchers).values(ids.map((taskId) => ({ taskId, userId: user.id }))).onConflictDoNothing();
      await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "project", action: "assigned_all", projectId, meta: { count: ids.length, scope } });
      // Tell anyone who lost tasks, once per person.
      const lost = affected.reduce<Record<string, number>>((m, t) => (t.assigneeId ? ((m[t.assigneeId] = (m[t.assigneeId] ?? 0) + 1), m) : m), {});
      for (const [uid, n] of Object.entries(lost))
        await notify(tx, { orgId: user.orgId, actorId: user.id, userIds: [uid], type: "updated", title: `${user.name} took over ${n} of your task${n > 1 ? "s" : ""} in ${project.name}`, link: `/projects/${projectId}/list?assignee=${user.id}` });
    });
    revalidateTaskViews();
    return { updated: ids.length };
  },
);
