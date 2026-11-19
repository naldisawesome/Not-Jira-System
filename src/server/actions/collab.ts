"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachments, comments, notifications, projects, savedFilters } from "@/db/schema";
import { action } from "../action";
import { AuthzError, NotFoundError, atLeast, getProjectAccess, requireTask } from "../rbac";
import { logActivity, notify, watcherIds } from "../activity";
import { storage } from "../storage";
import { commentSchema, zId } from "@/lib/validators";
import { taskKey } from "@/lib/utils";

/** Users who can see a project: admins + owner + members. Used to scope @mentions. */
async function projectAudience(orgId: string, projectId: string) {
  const rows = await db.execute<{ id: string; username: string }>(sql`
    SELECT u.id, u.username FROM users u
    WHERE u.org_id = ${orgId} AND u.is_active
      AND (u.role IN ('admin','super_admin')
        OR u.id = (SELECT owner_id FROM projects WHERE id = ${projectId})
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${projectId} AND pm.user_id = u.id))`);
  return rows.rows;
}

export const addComment = action(commentSchema, async (input, user) => {
  const { task, access } = await requireTask(user, input.taskId, "edit");
  if (input.parentId) {
    const [parent] = await db.select().from(comments).where(and(eq(comments.id, input.parentId), eq(comments.taskId, task.id))).limit(1);
    if (!parent) throw new NotFoundError("The comment you replied to no longer exists.");
  }
  const audience = await projectAudience(user.orgId, task.projectId);
  const mentioned = Array.from(new Set(Array.from(input.body.matchAll(/@([a-z0-9_.-]{2,40})/gi)).map((m) => m[1]!.toLowerCase())));
  const mentionedIds = audience.filter((u) => mentioned.includes(u.username.toLowerCase())).map((u) => u.id);
  const key = taskKey(access.project.key, task.number);

  const comment = await db.transaction(async (tx) => {
    const [c] = await tx.insert(comments).values({ orgId: user.orgId, taskId: task.id, authorId: user.id, parentId: input.parentId ?? null, body: input.body }).returning();
    if (input.attachmentIds.length)
      await tx
        .update(attachments)
        .set({ commentId: c!.id, taskId: task.id })
        .where(and(inArray(attachments.id, input.attachmentIds), eq(attachments.uploadedById, user.id), isNull(attachments.commentId), eq(attachments.projectId, task.projectId)));
    await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "comment", action: input.parentId ? "replied" : "commented", projectId: task.projectId, taskId: task.id, meta: { excerpt: input.body.slice(0, 140) } });
    await notify(tx, { orgId: user.orgId, actorId: user.id, userIds: mentionedIds, type: "mention", title: `${user.name} mentioned you on ${key}`, body: input.body.slice(0, 200), link: `/tasks/${task.id}#comment-${c!.id}` });
    const watchers = await watcherIds(task.id);
    await notify(tx, {
      orgId: user.orgId,
      actorId: user.id,
      userIds: [task.assigneeId, task.reporterId, ...watchers].filter((id) => id && !mentionedIds.includes(id)),
      type: "comment",
      title: `${user.name} commented on ${key}`,
      body: input.body.slice(0, 200),
      link: `/tasks/${task.id}#comment-${c!.id}`,
    });
    return c!;
  });
  revalidatePath(`/tasks/${task.id}`);
  return { id: comment.id };
});

export const editComment = action(z.object({ id: zId, body: z.string().trim().min(1).max(20000) }), async ({ id, body }, user) => {
  const [c] = await db.select().from(comments).where(and(eq(comments.id, id), eq(comments.orgId, user.orgId))).limit(1);
  if (!c) throw new NotFoundError();
  await requireTask(user, c.taskId, "edit");
  if (c.authorId !== user.id) throw new AuthzError("You can only edit your own comments.");
  await db.update(comments).set({ body, editedAt: new Date() }).where(eq(comments.id, id));
  revalidatePath(`/tasks/${c.taskId}`);
  return { ok: true };
});

export const deleteComment = action(z.object({ id: zId }), async ({ id }, user) => {
  const [c] = await db.select().from(comments).where(and(eq(comments.id, id), eq(comments.orgId, user.orgId))).limit(1);
  if (!c) throw new NotFoundError();
  const { access } = await requireTask(user, c.taskId, "view");
  if (c.authorId !== user.id && !access.canManage) throw new AuthzError("You can only delete your own comments.");
  const files = await db.select().from(attachments).where(eq(attachments.commentId, id));
  await db.delete(comments).where(eq(comments.id, id));
  await Promise.allSettled(files.map((f) => storage().remove(f.storageKey)));
  revalidatePath(`/tasks/${c.taskId}`);
  return { ok: true };
});

export const deleteAttachment = action(z.object({ id: zId }), async ({ id }, user) => {
  const [file] = await db.select().from(attachments).where(and(eq(attachments.id, id), eq(attachments.orgId, user.orgId))).limit(1);
  if (!file) throw new NotFoundError("Attachment not found.");
  if (file.projectId) {
    const access = await getProjectAccess(user, file.projectId);
    const own = file.uploadedById === user.id && access.canEdit;
    if (!own && !access.canManage) throw new AuthzError("Only the uploader or a project manager can delete this file.");
  } else if (!atLeast(user.role, "admin")) throw new AuthzError();
  await db.transaction(async (tx) => {
    await tx.delete(attachments).where(eq(attachments.id, id));
    if (file.taskId) await logActivity(tx, { orgId: user.orgId, actorId: user.id, entity: "attachment", action: "deleted", projectId: file.projectId, taskId: file.taskId, meta: { fileName: file.fileName } });
    if (file.context === "cover" && file.projectId) await tx.update(projects).set({ coverAttachmentId: null }).where(and(eq(projects.id, file.projectId), eq(projects.coverAttachmentId, id)));
  });
  await storage().remove(file.storageKey).catch((e) => console.error("[storage] remove failed", e));
  revalidatePath("/", "layout");
  return { ok: true };
});

/* ───── notifications ───── */

export const markNotificationsRead = action(z.object({ ids: z.array(zId).max(500).optional(), all: z.boolean().optional() }), async ({ ids, all }, user) => {
  const where = all
    ? and(eq(notifications.userId, user.id), isNull(notifications.readAt))
    : and(eq(notifications.userId, user.id), inArray(notifications.id, ids ?? []));
  if (!all && !ids?.length) return { count: 0 };
  const res = await db.update(notifications).set({ readAt: new Date() }).where(where).returning({ id: notifications.id });
  revalidatePath("/inbox");
  return { count: res.length };
});

export const markNotificationUnread = action(z.object({ id: zId }), async ({ id }, user) => {
  await db.update(notifications).set({ readAt: null }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
  revalidatePath("/inbox");
  return { ok: true };
});

/* ───── saved filters ───── */

export const saveFilter = action(z.object({ name: z.string().trim().min(1).max(60), query: z.record(z.string().max(500)) }), async ({ name, query }, user) => {
  const [f] = await db.insert(savedFilters).values({ orgId: user.orgId, userId: user.id, name, query }).returning();
  revalidatePath("/", "layout");
  return f!;
});

export const deleteFilter = action(z.object({ id: zId }), async ({ id }, user) => {
  await db.delete(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, user.id)));
  revalidatePath("/", "layout");
  return { ok: true };
});

