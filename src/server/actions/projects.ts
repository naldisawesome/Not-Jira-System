"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachments, milestones, projectMembers, projects, sprints, tasks, users, workflows, workflowStatuses } from "@/db/schema";
import { action } from "../action";
import { AuthzError, NotFoundError, assertUsersInOrg, can, requireProject } from "../rbac";
import { logActivity, notify } from "../activity";
import { storage } from "../storage";
import { projectSchema, zId, zDate, zPriority } from "@/lib/validators";

async function defaultWorkflowId(orgId: string) {
  const [wf] = await db.select().from(workflows).where(and(eq(workflows.orgId, orgId), eq(workflows.isDefault, true))).limit(1);
  if (wf) return wf.id;
  const [any] = await db.select().from(workflows).where(eq(workflows.orgId, orgId)).limit(1);
  if (!any) throw new Error("Organization has no workflow configured");
  return any.id;
}

export const createProject = action(projectSchema, async (input, user) => {
  if (!can.createProject(user)) throw new AuthzError("Only project managers and admins can create projects.");
  const ownerId = input.ownerId ?? user.id;
  await assertUsersInOrg(user.orgId, [ownerId, ...input.memberIds]);
  let workflowId = input.workflowId;
  if (workflowId) {
    const [wf] = await db.select().from(workflows).where(and(eq(workflows.id, workflowId), eq(workflows.orgId, user.orgId)));
    if (!wf) throw new NotFoundError("Workflow not found.");
  } else workflowId = await defaultWorkflowId(user.orgId);

  const project = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(projects)
      .values({
        orgId: user.orgId,
        workflowId: workflowId!,
        name: input.name,
        key: input.key,
        description: input.description ?? null,
        category: input.category ?? null,
        color: input.color,
        status: input.status,
        priority: input.priority,
        ownerId,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
      })
      .returning();
    const memberIds = Array.from(new Set([user.id, ownerId, ...input.memberIds]));
    await tx.insert(projectMembers).values(memberIds.map((userId) => ({ projectId: p!.id, userId, role: userId === ownerId ? ("lead" as const) : ("member" as const) })));
    await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "project", action: "created", projectId: p!.id, meta: { name: p!.name } });
    await notify(tx, { orgId: user.orgId, actorId: user.id, userIds: memberIds, type: "project_added", title: `${user.name} added you to ${p!.name}`, link: `/projects/${p!.id}` });
    const admins = await tx.select({ id: users.id }).from(users).where(and(eq(users.orgId, user.orgId), inArray(users.role, ["admin", "super_admin"])));
    await notify(tx, { orgId: user.orgId, actorId: user.id, userIds: admins.map((a) => a.id).filter((id) => !memberIds.includes(id)), type: "project_created", title: `${user.name} created project ${p!.name}`, link: `/projects/${p!.id}` });
    return p!;
  });
  revalidatePath("/", "layout");
  return { id: project.id };
});

export const updateProject = action(
  z.object({ id: zId, data: z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(20000).nullable(), category: z.string().max(60).nullable(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), status: z.enum(["planning", "active", "on_hold", "completed"]), priority: zPriority, ownerId: zId.nullable(), startDate: zDate, dueDate: zDate, coverAttachmentId: zId.nullable(), workflowId: zId }).partial() }),
  async ({ id, data }, user) => {
    const { project } = await requireProject(user, id, "manage");
    await assertUsersInOrg(user.orgId, [data.ownerId]);
    if (data.startDate && data.dueDate && data.startDate > data.dueDate) throw new AuthzError("Due date must be after start date.");
    if (data.coverAttachmentId) {
      const [a] = await db.select().from(attachments).where(and(eq(attachments.id, data.coverAttachmentId), eq(attachments.projectId, id)));
      if (!a || !a.mimeType.startsWith("image/")) throw new AuthzError("Cover must be an image uploaded to this project.");
    }
    if (data.workflowId && data.workflowId !== project.workflowId) {
      const [wf] = await db.select().from(workflows).where(and(eq(workflows.id, data.workflowId), eq(workflows.orgId, user.orgId)));
      if (!wf) throw new NotFoundError("Workflow not found.");
      // Remap tasks to the first status of the same category in the new workflow.
      const [oldS, newS] = await Promise.all([
        db.select().from(workflowStatuses).where(eq(workflowStatuses.workflowId, project.workflowId)),
        db.select().from(workflowStatuses).where(eq(workflowStatuses.workflowId, data.workflowId)).orderBy(workflowStatuses.position),
      ]);
      await db.transaction(async (tx) => {
        for (const s of oldS) {
          const target = newS.find((n) => n.category === s.category) ?? newS[0];
          if (target) await tx.update(tasks).set({ statusId: target.id }).where(and(eq(tasks.projectId, id), eq(tasks.statusId, s.id)));
        }
      });
    }
    await db.transaction(async (tx) => {
      await tx.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id));
      if (data.ownerId) await tx.insert(projectMembers).values({ projectId: id, userId: data.ownerId, role: "lead" }).onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: "lead" } });
      await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "project", action: "updated", projectId: id, meta: { fields: Object.keys(data) } });
    });
    revalidatePath("/", "layout");
    return { id };
  },
);

export const setProjectArchived = action(z.object({ id: zId, archived: z.boolean() }), async ({ id, archived }, user) => {
  await requireProject(user, id, "manage");
  await db.update(projects).set({ archivedAt: archived ? new Date() : null, status: archived ? "archived" : "active", updatedAt: new Date() }).where(eq(projects.id, id));
  await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "project", action: archived ? "archived" : "restored", projectId: id });
  revalidatePath("/", "layout");
  return { id };
});

export const deleteProject = action(z.object({ id: zId, confirmKey: z.string() }), async ({ id, confirmKey }, user) => {
  const { project } = await requireProject(user, id, "manage");
  if (confirmKey.trim().toUpperCase() !== project.key) throw new AuthzError("Type the project key to confirm deletion.");
  const files = await db.select({ key: attachments.storageKey }).from(attachments).where(eq(attachments.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
  await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "project", action: "deleted", meta: { name: project.name, key: project.key } });
  await Promise.allSettled(files.map((f) => storage().remove(f.key)));
  revalidatePath("/", "layout");
  return { ok: true };
});

export const setProjectMember = action(
  z.object({ projectId: zId, userId: zId, role: z.enum(["lead", "member", "viewer"]).nullable() }),
  async ({ projectId, userId, role }, user) => {
    const { project } = await requireProject(user, projectId, "manage");
    await assertUsersInOrg(user.orgId, [userId]);
    if (role === null) {
      if (userId === project.ownerId) throw new AuthzError("Change the project owner before removing them.");
      await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    } else {
      const existing = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
      await db.insert(projectMembers).values({ projectId, userId, role }).onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role } });
      if (!existing.length) await notify(db, { orgId: user.orgId, actorId: user.id, userIds: [userId], type: "project_added", title: `${user.name} added you to ${project.name}`, link: `/projects/${projectId}` });
    }
    await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "project", action: role ? "member_set" : "member_removed", projectId, meta: { userId, role } });
    revalidatePath("/", "layout");
    return { ok: true };
  },
);

/* ───── sprints ───── */

const sprintSchema = z
  .object({ name: z.string().trim().min(1).max(80), goal: z.string().max(2000).nullable().optional(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .refine((s) => s.startDate <= s.endDate, { message: "End date must be after start date", path: ["endDate"] });

export const createSprint = action(sprintSchema.and(z.object({ projectId: zId })), async (input, user) => {
  await requireProject(user, input.projectId, "manage");
  const [s] = await db.insert(sprints).values({ orgId: user.orgId, projectId: input.projectId, name: input.name, goal: input.goal ?? null, startDate: input.startDate, endDate: input.endDate }).returning();
  await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "sprint", action: "created", projectId: input.projectId, meta: { name: input.name } });
  revalidatePath("/", "layout");
  return s!;
});

export const updateSprint = action(
  z.object({ id: zId, data: z.object({ name: z.string().trim().min(1).max(80), goal: z.string().max(2000).nullable(), startDate: z.string(), endDate: z.string(), state: z.enum(["planned", "active", "completed"]) }).partial(), moveOpenTo: zId.nullable().optional() }),
  async ({ id, data, moveOpenTo }, user) => {
    const [s] = await db.select().from(sprints).where(and(eq(sprints.id, id), eq(sprints.orgId, user.orgId)));
    if (!s) throw new NotFoundError("Sprint not found.");
    await requireProject(user, s.projectId, "manage");
    if (data.state === "active") {
      const [other] = await db.select().from(sprints).where(and(eq(sprints.projectId, s.projectId), eq(sprints.state, "active")));
      if (other && other.id !== id) throw new AuthzError(`Complete "${other.name}" before starting another sprint.`);
    }
    await db.transaction(async (tx) => {
      await tx.update(sprints).set({ ...data, ...(data.state === "completed" && { completedAt: new Date() }) }).where(eq(sprints.id, id));
      if (data.state === "completed") {
        // Carry unfinished work to the next sprint (or back to the backlog).
        await tx.execute(sql`
          UPDATE tasks SET sprint_id = ${moveOpenTo ?? null}
          WHERE sprint_id = ${id} AND status_id IN (SELECT id FROM workflow_statuses WHERE category NOT IN ('done','cancelled'))`);
      }
      await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "sprint", action: data.state ? `sprint_${data.state}` : "updated", projectId: s.projectId, meta: { name: s.name } });
    });
    revalidatePath("/", "layout");
    return { id };
  },
);

export const deleteSprint = action(z.object({ id: zId }), async ({ id }, user) => {
  const [s] = await db.select().from(sprints).where(and(eq(sprints.id, id), eq(sprints.orgId, user.orgId)));
  if (!s) throw new NotFoundError();
  await requireProject(user, s.projectId, "manage");
  await db.delete(sprints).where(eq(sprints.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
});

/* ───── milestones ───── */

export const createMilestone = action(
  z.object({ projectId: zId, name: z.string().trim().min(1).max(80), description: z.string().max(2000).nullable().optional(), targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  async (input, user) => {
    await requireProject(user, input.projectId, "manage");
    const [m] = await db.insert(milestones).values({ orgId: user.orgId, ...input, description: input.description ?? null }).returning();
    revalidatePath("/", "layout");
    return m!;
  },
);

export const updateMilestone = action(
  z.object({ id: zId, data: z.object({ name: z.string().trim().min(1).max(80), targetDate: z.string(), completed: z.boolean(), remove: z.boolean() }).partial() }),
  async ({ id, data }, user) => {
    const [m] = await db.select().from(milestones).where(and(eq(milestones.id, id), eq(milestones.orgId, user.orgId)));
    if (!m) throw new NotFoundError();
    await requireProject(user, m.projectId, "manage");
    if (data.remove) await db.delete(milestones).where(eq(milestones.id, id));
    else
      await db
        .update(milestones)
        .set({ ...(data.name && { name: data.name }), ...(data.targetDate && { targetDate: data.targetDate }), ...(data.completed !== undefined && { completedAt: data.completed ? new Date() : null }) })
        .where(eq(milestones.id, id));
    revalidatePath("/", "layout");
    return { ok: true };
  },
);
