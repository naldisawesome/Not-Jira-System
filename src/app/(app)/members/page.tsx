import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/server/session";
import { can } from "@/server/rbac";
import { PageHeader } from "@/components/page-header";
import { Avatar, Badge, Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/constants";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const user = await requireUser();
  const rows = (await db.execute(sql`
    SELECT u.id, u.name, u.username, u.title, u.role, u.avatar_color AS "avatarColor", u.is_active AS "isActive",
      count(t.id) FILTER (WHERE s.category NOT IN ('done','cancelled'))::int AS open,
      count(t.id) FILTER (WHERE s.category = 'done')::int AS done,
      count(t.id) FILTER (WHERE s.category NOT IN ('done','cancelled') AND t.due_date < current_date)::int AS overdue,
      (SELECT count(*)::int FROM project_members pm WHERE pm.user_id = u.id) AS projects
    FROM users u LEFT JOIN tasks t ON t.assignee_id = u.id LEFT JOIN workflow_statuses s ON s.id = t.status_id
    WHERE u.org_id = ${user.orgId} GROUP BY u.id ORDER BY u.is_active DESC, u.name`)).rows as { id: string; name: string; username: string; title: string | null; role: string; avatarColor: string; isActive: boolean; open: number; done: number; overdue: number; projects: number }[];
  const max = Math.max(1, ...rows.map((r) => r.open));
  return (
    <div className="mx-auto max-w-[1300px] animate-fade-in">
      <PageHeader title="Members" description={`${rows.filter((r) => r.isActive).length} active people in ${user.org.name}`} actions={can.manageUsers(user) && <Button asChild><Link href="/admin/users">Invite & manage users</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((m) => (
          <Link key={m.id} href={`/members/${m.id}`} className={`group rounded-xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift ${!m.isActive ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-3">
              <Avatar name={m.name} color={m.avatarColor} size={40} />
              <div className="min-w-0"><p className="truncate font-medium">{m.name}</p><p className="truncate text-xs text-muted-foreground">{m.title ?? "—"} · @{m.username}</p></div>
            </div>
            <div className="mt-3 flex items-center gap-1.5"><Badge>{roleLabel(m.role)}</Badge>{!m.isActive && <Badge color="#dc2626">Deactivated</Badge>}</div>
            <div className="mt-4 grid grid-cols-4 text-center">
              {[["Open", m.open], ["Done", m.done], ["Overdue", m.overdue], ["Projects", m.projects]].map(([l, v]) => <div key={l as string}><p className={`text-base font-semibold tabular-nums ${l === "Overdue" && (v as number) > 0 ? "text-destructive" : ""}`}>{v}</p><p className="text-[10.5px] text-muted-foreground">{l}</p></div>)}
            </div>
            <div className="mt-3"><p className="mb-1 text-[10.5px] text-muted-foreground">Workload</p><Progress value={(m.open / max) * 100} color={m.open / max > 0.8 ? "#ea580c" : undefined} /></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
