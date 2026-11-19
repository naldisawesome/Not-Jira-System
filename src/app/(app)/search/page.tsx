import Link from "next/link";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { comments, projects, tasks, users } from "@/db/schema";
import { requireUser } from "@/server/session";
import { visibleProjectIds } from "@/server/rbac";
import { listTasks } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { TaskLine } from "@/components/tasks/task-line";
import { taskKey } from "@/lib/utils";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireUser();
  const q = (searchParams.q ?? "").trim().slice(0, 100);
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const ids = await visibleProjectIds(user);
  const [t, bugs, p, u, c] = q
    ? await Promise.all([
        listTasks(user, { q }, { sort: "updated", pageSize: 50 }),
        listTasks(user, { q, type: "bug" }, { sort: "updated", pageSize: 20 }),
        ids.length ? db.select().from(projects).where(and(inArray(projects.id, ids), or(ilike(projects.name, like), ilike(projects.key, like), ilike(projects.description, like)))) : [],
        db.select().from(users).where(and(eq(users.orgId, user.orgId), or(ilike(users.name, like), ilike(users.username, like), ilike(users.email, like)))),
        ids.length ? db.select({ id: comments.id, body: comments.body, taskId: comments.taskId, number: tasks.number, key: projects.key, author: users.name, color: users.avatarColor }).from(comments).innerJoin(tasks, eq(tasks.id, comments.taskId)).innerJoin(projects, eq(projects.id, tasks.projectId)).leftJoin(users, eq(users.id, comments.authorId)).where(and(inArray(tasks.projectId, ids), ilike(comments.body, like))).orderBy(desc(comments.createdAt)).limit(20) : [],
      ])
    : [null, null, [], [], []];
  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-5">
      <PageHeader title="Search" description={q ? `Results for “${q}”` : "Search tasks, bugs, projects, people and comments."} />
      <form><input name="q" defaultValue={q} autoFocus placeholder="Search everything…" className="h-11 w-full rounded-xl border bg-surface px-4 text-[15px] shadow-soft outline-none focus:ring-2 focus:ring-ring/30" /></form>
      {q && (
        <>
          <Card><CardHeader title={`Tasks (${t!.total})`} action={<Link href={`/list?q=${encodeURIComponent(q)}`} className="text-xs text-primary hover:underline">Open in List</Link>} /><CardContent className="px-3">{t!.rows.length ? t!.rows.map((r) => <TaskLine key={r.id} t={r} />) : <p className="py-4 text-center text-xs text-muted-foreground">No tasks.</p>}</CardContent></Card>
          {bugs!.rows.length > 0 && <Card><CardHeader title={`Bugs & issues (${bugs!.total})`} /><CardContent className="px-3">{bugs!.rows.map((r) => <TaskLine key={r.id} t={r} />)}</CardContent></Card>}
          <div className="grid gap-5 md:grid-cols-2">
            <Card><CardHeader title={`Projects (${p.length})`} /><CardContent className="space-y-1">{p.map((x) => <Link key={x.id} href={`/projects/${x.id}`} className="flex items-center gap-2 rounded px-1 py-1.5 text-[13px] hover:bg-muted"><span className="size-2.5 rounded-sm" style={{ background: x.color }} />{x.name} <span className="task-key">{x.key}</span></Link>)}{!p.length && <p className="text-xs text-muted-foreground">None</p>}</CardContent></Card>
            <Card><CardHeader title={`People (${u.length})`} /><CardContent className="space-y-1">{u.map((x) => <Link key={x.id} href={`/members/${x.id}`} className="flex items-center gap-2 rounded px-1 py-1.5 text-[13px] hover:bg-muted"><Avatar name={x.name} color={x.avatarColor} size={22} />{x.name} <span className="text-xs text-muted-foreground">@{x.username}</span></Link>)}{!u.length && <p className="text-xs text-muted-foreground">None</p>}</CardContent></Card>
          </div>
          <Card><CardHeader title={`Comments (${c.length})`} /><CardContent className="space-y-2">{c.map((x) => <Link key={x.id} href={`/tasks/${x.taskId}#comment-${x.id}`} className="flex gap-2.5 rounded-md p-2 hover:bg-muted"><Avatar name={x.author} color={x.color} size={22} /><div className="min-w-0 text-[13px]"><p><span className="font-medium">{x.author}</span> on <span className="task-key">{taskKey(x.key, x.number)}</span></p><p className="line-clamp-2 text-muted-foreground">{x.body}</p></div></Link>)}{!c.length && <p className="text-xs text-muted-foreground">None</p>}</CardContent></Card>
        </>
      )}
    </div>
  );
}
