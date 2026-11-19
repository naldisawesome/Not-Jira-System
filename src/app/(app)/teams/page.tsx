import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { requireUser } from "@/server/session";
import { can } from "@/server/rbac";
import { PageHeader } from "@/components/page-header";
import { TeamsManager } from "@/components/teams-manager";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  const user = await requireUser();
  const teamRows = await db.select().from(teams).where(eq(teams.orgId, user.orgId)).orderBy(teams.name);
  const members = (await db.execute(sql`
    SELECT tm.team_id AS "teamId", u.id, u.name, u.avatar_color AS "avatarColor", u.title,
      (SELECT count(*)::int FROM tasks t JOIN workflow_statuses s ON s.id = t.status_id WHERE t.assignee_id = u.id AND s.category NOT IN ('done','cancelled')) AS open,
      (SELECT count(*)::int FROM tasks t JOIN workflow_statuses s ON s.id = t.status_id WHERE t.assignee_id = u.id AND s.category = 'done') AS done
    FROM team_members tm JOIN users u ON u.id = tm.user_id JOIN teams te ON te.id = tm.team_id
    WHERE te.org_id = ${user.orgId} ORDER BY u.name`)).rows as { teamId: string; id: string; name: string; avatarColor: string; title: string | null; open: number; done: number }[];
  return (
    <div className="mx-auto max-w-[1300px] animate-fade-in">
      <PageHeader title="Teams" description="Group people by discipline to see workload and throughput together." />
      <TeamsManager teams={teamRows.map((t) => ({ ...t, members: members.filter((m) => m.teamId === t.id) }))} canManage={can.manageTeams(user)} />
    </div>
  );
}
