import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { milestones, sprints } from "@/db/schema";
import { requireUser } from "@/server/session";
import { can, computeAccess } from "@/server/rbac";
import { getAllStatuses, getLabels, getOrgMembers, getProjectsForUser } from "@/server/queries";
import { AppProvider, type AppData } from "@/components/shell/app-context";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { QuickCreateDialog } from "@/components/tasks/task-create-dialog";
import { projectMembers } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [projectRows, members, labels, statuses, memberships] = await Promise.all([
    getProjectsForUser(user),
    getOrgMembers(user.orgId),
    getLabels(user.orgId),
    getAllStatuses(user.orgId),
    db.select().from(projectMembers).where(eq(projectMembers.userId, user.id)),
  ]);
  const projectIds = projectRows.map((r) => r.project.id);
  const [sprintRows, milestoneRows] = projectIds.length
    ? await Promise.all([
        db.select({ id: sprints.id, name: sprints.name, projectId: sprints.projectId, state: sprints.state }).from(sprints).where(and(eq(sprints.orgId, user.orgId), inArray(sprints.projectId, projectIds))),
        db.select({ id: milestones.id, name: milestones.name, projectId: milestones.projectId }).from(milestones).where(and(eq(milestones.orgId, user.orgId), inArray(milestones.projectId, projectIds))),
      ])
    : [[], []];

  const data: AppData = {
    me: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, avatarColor: user.avatarColor, orgName: user.org.name },
    perms: {
      createProject: can.createProject(user),
      manageUsers: can.manageUsers(user),
      manageWorkflows: can.manageWorkflows(user),
      manageOrg: can.manageOrgSettings(user),
      manageTeams: can.manageTeams(user),
      isViewer: user.role === "viewer",
    },
    projects: projectRows.map(({ project: p }) => {
      const a = computeAccess(user, p, memberships.find((m) => m.projectId === p.id)?.role ?? null);
      return { id: p.id, name: p.name, key: p.key, color: p.color, workflowId: p.workflowId, canEdit: a.canEdit, canManage: a.canManage, archived: !!p.archivedAt };
    }),
    members: members.map((m) => ({ ...m })),
    labels,
    statuses: statuses.map(({ status: s }) => ({ id: s.id, name: s.name, color: s.color, category: s.category, position: s.position, workflowId: s.workflowId })),
    sprints: sprintRows,
    milestones: milestoneRows,
  };

  return (
    <AppProvider data={data}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
      <QuickCreateDialog />
    </AppProvider>
  );
}
