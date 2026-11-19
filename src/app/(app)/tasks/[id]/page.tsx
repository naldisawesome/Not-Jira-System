import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, checklistItems, comments, labels, taskDependencies, taskLabels, taskWatchers, tasks, timeLogs, users } from "@/db/schema";
import { requireUser } from "@/server/session";
import { requireTask } from "@/server/rbac";
import { getAttachments, getProjectContext, listTasks } from "@/server/queries";
import { getActivity } from "@/server/stats";
import { TaskDetail } from "@/components/tasks/task-detail";
import { taskKey } from "@/lib/utils";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const [t] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, params.id)).limit(1).catch(() => []);
  return { title: t?.title ?? "Task" };
}

export default async function TaskPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  let res;
  try { res = await requireTask(user, params.id, "view"); } catch { notFound(); }
  const { task, access } = res;
  const p = access.project;

  const [ctx, [row], subtasks, blockedBy, blocking, checklist, commentRows, files, history, logs, watchers, taskLabelRows, parent] = await Promise.all([
    getProjectContext(p.id, p.workflowId),
    listTasks(user, { ids: [task.id] }).then((r) => r.rows),
    listTasks(user, { parentId: task.id }, { sort: "created", dir: "asc" }).then((r) => r.rows),
    db.select({ id: taskDependencies.dependsOnId }).from(taskDependencies).where(eq(taskDependencies.taskId, task.id)),
    db.select({ id: taskDependencies.taskId }).from(taskDependencies).where(eq(taskDependencies.dependsOnId, task.id)),
    db.select().from(checklistItems).where(eq(checklistItems.taskId, task.id)).orderBy(asc(checklistItems.position), asc(checklistItems.createdAt)),
    db
      .select({ id: comments.id, body: comments.body, parentId: comments.parentId, createdAt: comments.createdAt, editedAt: comments.editedAt, authorId: comments.authorId, authorName: users.name, authorColor: users.avatarColor, authorUsername: users.username })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.taskId, task.id))
      .orderBy(asc(comments.createdAt)),
    getAttachments(eq(attachments.taskId, task.id)),
    getActivity(user, { taskId: task.id, limit: 100 }),
    db.select({ id: timeLogs.id, hours: timeLogs.hours, note: timeLogs.note, loggedOn: timeLogs.loggedOn, userId: timeLogs.userId, userName: users.name, userColor: users.avatarColor }).from(timeLogs).leftJoin(users, eq(users.id, timeLogs.userId)).where(eq(timeLogs.taskId, task.id)).orderBy(desc(timeLogs.loggedOn), desc(timeLogs.createdAt)),
    db.select({ id: users.id, name: users.name, avatarColor: users.avatarColor }).from(taskWatchers).innerJoin(users, eq(users.id, taskWatchers.userId)).where(eq(taskWatchers.taskId, task.id)),
    db.select({ id: labels.id }).from(taskLabels).innerJoin(labels, eq(labels.id, taskLabels.labelId)).where(eq(taskLabels.taskId, task.id)),
    task.parentId ? listTasks(user, { ids: [task.parentId] }).then((r) => r.rows[0] ?? null) : Promise.resolve(null),
  ]);
  const depIds = [...blockedBy.map((d) => d.id), ...blocking.map((d) => d.id)];
  const depRows = depIds.length ? (await listTasks(user, { ids: depIds })).rows : [];

  const canDeleteFile = (f: { uploadedById: string | null }) => access.canManage || (access.canEdit && f.uploadedById === user.id);
  return (
    <TaskDetail
      task={{ ...row!, description: task.description, bug: task.bug, reporterId: task.reporterId, key: taskKey(p.key, task.number) }}
      project={{ id: p.id, name: p.name, key: p.key, color: p.color }}
      statuses={ctx.statuses}
      sprints={ctx.sprints.filter((s) => s.state !== "completed" || s.id === task.sprintId)}
      milestones={ctx.milestones}
      memberIds={ctx.members.map((m) => m.id)}
      labelIds={taskLabelRows.map((l) => l.id)}
      subtasks={subtasks}
      parent={parent}
      blockedBy={depRows.filter((d) => blockedBy.some((b) => b.id === d.id))}
      blocking={depRows.filter((d) => blocking.some((b) => b.id === d.id))}
      checklist={checklist}
      comments={commentRows.map((c) => ({ ...c, files: files.filter((f) => f.commentId === c.id).map((f) => ({ ...f, canDelete: canDeleteFile(f) })) }))}
      files={files.filter((f) => !f.commentId).map((f) => ({ ...f, canDelete: canDeleteFile(f) }))}
      history={history}
      timeLogs={logs}
      watchers={watchers}
      perms={{ canEdit: access.canEdit, canManage: access.canManage, canDelete: access.canManage || (access.canEdit && task.reporterId === user.id) }}
    />
  );
}
