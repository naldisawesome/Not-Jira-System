import { NextResponse } from "next/server";
import { and, eq, ilike, inArray, or, desc } from "drizzle-orm";
import { db } from "@/db";
import { comments, projects, tasks, users } from "@/db/schema";
import { getCurrentUser } from "@/server/session";
import { visibleProjectIds } from "@/server/rbac";
import { listTasks } from "@/server/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 1) return NextResponse.json({ tasks: [], projects: [], users: [], comments: [] });
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const ids = await visibleProjectIds(user);
  const [t, p, u, c] = await Promise.all([
    listTasks(user, { q }, { sort: "updated", pageSize: 8 }),
    ids.length ? db.select({ id: projects.id, name: projects.name, key: projects.key, color: projects.color }).from(projects).where(and(inArray(projects.id, ids), or(ilike(projects.name, like), ilike(projects.key, like)))).limit(5) : [],
    db.select({ id: users.id, name: users.name, username: users.username, avatarColor: users.avatarColor, title: users.title }).from(users).where(and(eq(users.orgId, user.orgId), or(ilike(users.name, like), ilike(users.username, like), ilike(users.email, like)))).limit(5),
    ids.length
      ? db
          .select({ id: comments.id, body: comments.body, taskId: comments.taskId, number: tasks.number, key: projects.key, author: users.name })
          .from(comments)
          .innerJoin(tasks, eq(tasks.id, comments.taskId))
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .leftJoin(users, eq(users.id, comments.authorId))
          .where(and(eq(comments.orgId, user.orgId), inArray(tasks.projectId, ids), ilike(comments.body, like)))
          .orderBy(desc(comments.createdAt))
          .limit(5)
      : [],
  ]);
  return NextResponse.json({
    tasks: t.rows.map((r) => ({ id: r.id, title: r.title, key: `${r.projectKey}-${String(r.number).padStart(3, "0")}`, type: r.type, statusName: r.statusName, statusColor: r.statusColor })),
    projects: p,
    users: u,
    comments: c.map((x) => ({ ...x, key: `${x.key}-${String(x.number).padStart(3, "0")}`, body: x.body.slice(0, 120) })),
  });
}
