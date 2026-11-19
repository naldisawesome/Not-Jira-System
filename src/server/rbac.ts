import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers, projects, tasks } from "@/db/schema";
import type { Role } from "@/db/schema";
import type { SessionUser } from "./session";

export class AuthzError extends Error {
  status = 403;
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}
export class NotFoundError extends Error {
  status = 404;
  constructor(message = "Not found.") {
    super(message);
  }
}

const RANK: Record<Role, number> = { viewer: 0, member: 1, project_manager: 2, admin: 3, super_admin: 4 };
export const atLeast = (role: Role, min: Role) => RANK[role] >= RANK[min];

/** Org-level capabilities. Every one of these is checked on the server. */
export const can = {
  createProject: (u: SessionUser) => atLeast(u.role, "project_manager"),
  manageUsers: (u: SessionUser) => atLeast(u.role, "admin"),
  manageWorkflows: (u: SessionUser) => atLeast(u.role, "admin"),
  manageTeams: (u: SessionUser) => atLeast(u.role, "admin"),
  manageOrgSettings: (u: SessionUser) => u.role === "super_admin",
  seeAllProjects: (u: SessionUser) => atLeast(u.role, "admin"),
  assignRole: (u: SessionUser, target: Role) => (target === "super_admin" ? u.role === "super_admin" : atLeast(u.role, "admin")),
  viewReports: (u: SessionUser) => atLeast(u.role, "member"),
};

export type ProjectAccess = {
  project: typeof projects.$inferSelect;
  memberRole: "lead" | "member" | "viewer" | null;
  canView: boolean;
  canEdit: boolean; // create/update tasks, comment, upload
  canManage: boolean; // edit project, members, sprints, delete tasks
};

export function computeAccess(user: SessionUser, project: typeof projects.$inferSelect, memberRole: ProjectAccess["memberRole"]): ProjectAccess {
  const admin = atLeast(user.role, "admin");
  const isOwner = project.ownerId === user.id;
  const canView = admin || isOwner || memberRole !== null;
  const canManage = admin || (user.role === "project_manager" && (isOwner || memberRole === "lead"));
  // Archived projects are read-only for everyone until a manager restores them.
  const canEdit = !project.archivedAt && (canManage || (canView && user.role !== "viewer" && memberRole !== "viewer"));
  return { project, memberRole, canView, canEdit, canManage };
}

export async function getProjectAccess(user: SessionUser, projectId: string): Promise<ProjectAccess> {
  const rows = await db
    .select({ project: projects, memberRole: projectMembers.role })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, user.id)))
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Project not found.");
  const access = computeAccess(user, row.project, row.memberRole);
  if (!access.canView) throw new NotFoundError("Project not found.");
  return access;
}

export async function requireProject(user: SessionUser, projectId: string, need: "view" | "edit" | "manage") {
  const a = await getProjectAccess(user, projectId);
  if (need === "edit" && !a.canEdit) throw new AuthzError(a.project.archivedAt ? "This project is archived." : undefined);
  if (need === "manage" && !a.canManage) throw new AuthzError();
  return a;
}

export async function requireTask(user: SessionUser, taskId: string, need: "view" | "edit" | "manage") {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId))).limit(1);
  if (!task) throw new NotFoundError("Task not found.");
  const access = await requireProject(user, task.projectId, need);
  return { task, access };
}

/** IDs of projects the user may view — used to scope every list query. */
export async function visibleProjectIds(user: SessionUser): Promise<string[]> {
  if (can.seeAllProjects(user)) {
    const rows = await db.select({ id: projects.id }).from(projects).where(eq(projects.orgId, user.orgId));
    return rows.map((r) => r.id);
  }
  const rows = await db
    .selectDistinct({ id: projects.id })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, user.id)))
    .where(and(eq(projects.orgId, user.orgId), sql`(${projects.ownerId} = ${user.id} OR ${projectMembers.userId} IS NOT NULL)`));
  return rows.map((r) => r.id);
}

export async function assertUsersInOrg(orgId: string, ids: (string | null | undefined)[]) {
  const list = ids.filter((x): x is string => !!x);
  if (!list.length) return;
  const { users } = await import("@/db/schema");
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, orgId), inArray(users.id, list)));
  if (rows.length !== new Set(list).size) throw new AuthzError("Unknown user.");
}
