"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, invitations, organizations, projects, teamMembers, teams, userSettings, users, workflows, workflowStatuses, tasks } from "@/db/schema";
import { action, type ActionResult } from "../action";
import { AuthzError, NotFoundError, can } from "../rbac";
import { logActivity } from "../activity";
import { getCurrentUser } from "../session";
import { zId, zRole } from "@/lib/validators";
import { DEFAULT_STATUSES } from "@/lib/constants";
import { createDefaultWorkflow } from "../workflow-defaults";
import { pickColor } from "@/lib/utils";

const passwordSchema = z.string().min(8, "At least 8 characters").max(200);
const usernameFrom = (email: string) => email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 30) || "user";

async function uniqueUsername(orgId: string, base: string) {
  let name = base;
  for (let i = 2; i < 200; i++) {
    const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, orgId), eq(users.username, name)));
    if (!u) return name;
    name = `${base}${i}`;
  }
  return `${base}${Date.now()}`;
}

/* ───── public: sign-up & invitations (no session required) ───── */

const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: passwordSchema,
  orgName: z.string().trim().min(2).max(120),
});

export async function signUp(input: z.input<typeof signupSchema>): Promise<ActionResult<{ email: string }>> {
  const p = signupSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const email = p.data.email.toLowerCase();
  const [exists] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (exists) return { ok: false, error: "An account with that email already exists." };
  const slugBase = p.data.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
  try {
    await db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({ name: p.data.orgName, slug: `${slugBase}-${randomBytes(3).toString("hex")}` }).returning();
      await createDefaultWorkflow(tx, org!.id);
      const [u] = await tx
        .insert(users)
        .values({ orgId: org!.id, email, name: p.data.name, username: usernameFrom(email), passwordHash: await bcrypt.hash(p.data.password, 12), role: "super_admin", avatarColor: pickColor(email) })
        .returning();
      await tx.insert(userSettings).values({ userId: u!.id });
      await logActivity(tx, { orgId: org!.id, actorId: u!.id, entity: "organization", action: "created", meta: { name: org!.name } });
    });
  } catch (e) {
    console.error("[signup]", e);
    return { ok: false, error: "Couldn't create your workspace. Please try again." };
  }
  return { ok: true, data: { email } };
}

const acceptSchema = z.object({ token: z.string().min(20).max(80), name: z.string().trim().min(2).max(120), password: passwordSchema });

export async function acceptInvite(input: z.input<typeof acceptSchema>): Promise<ActionResult<{ email: string }>> {
  const p = acceptSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const [inv] = await db.select().from(invitations).where(and(eq(invitations.token, p.data.token), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
  if (!inv) return { ok: false, error: "This invitation is invalid or has expired." };
  const email = inv.email.toLowerCase();
  const [exists] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (exists) return { ok: false, error: "An account with that email already exists." };
  await db.transaction(async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({ orgId: inv.orgId, email, name: p.data.name, username: await uniqueUsername(inv.orgId, usernameFrom(email)), passwordHash: await bcrypt.hash(p.data.password, 12), role: inv.role, avatarColor: pickColor(email) })
      .returning();
    await tx.insert(userSettings).values({ userId: u!.id });
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    await logActivity(tx, { orgId: inv.orgId, actorId: u!.id, entity: "user", action: "joined", meta: { name: u!.name } });
  });
  return { ok: true, data: { email } };
}

/* ───── user management ───── */

export const inviteUser = action(z.object({ email: z.string().trim().email().max(255), role: zRole }), async ({ email, role }, user) => {
  if (!can.manageUsers(user) || !can.assignRole(user, role)) throw new AuthzError("You can't invite users with that role.");
  const lower = email.toLowerCase();
  const [exists] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${lower}`);
  if (exists) throw new AuthzError("That person already has an account.");
  const token = randomBytes(24).toString("base64url");
  const [inv] = await db
    .insert(invitations)
    .values({ orgId: user.orgId, email: lower, role, token, invitedById: user.id, expiresAt: new Date(Date.now() + 7 * 864e5) })
    .returning();
  await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "user", action: "invited", meta: { email: lower, role } });
  revalidatePath("/admin/users");
  // Email delivery requires an SMTP/Resend integration; the link is returned so an admin can share it.
  return { id: inv!.id, link: `/invite/${token}` };
});

export const revokeInvite = action(z.object({ id: zId }), async ({ id }, user) => {
  if (!can.manageUsers(user)) throw new AuthzError();
  await db.delete(invitations).where(and(eq(invitations.id, id), eq(invitations.orgId, user.orgId)));
  revalidatePath("/admin/users");
  return { ok: true };
});

export const createUser = action(
  z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email(), role: zRole, title: z.string().max(120).optional(), password: passwordSchema }),
  async (input, user) => {
    if (!can.manageUsers(user) || !can.assignRole(user, input.role)) throw new AuthzError();
    const email = input.email.toLowerCase();
    const [u] = await db
      .insert(users)
      .values({ orgId: user.orgId, email, name: input.name, title: input.title, username: await uniqueUsername(user.orgId, usernameFrom(email)), role: input.role, passwordHash: await bcrypt.hash(input.password, 12), avatarColor: pickColor(email) })
      .returning();
    await db.insert(userSettings).values({ userId: u!.id });
    await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "user", action: "created", meta: { name: u!.name, role: input.role } });
    revalidatePath("/", "layout");
    return { id: u!.id };
  },
);

export const updateUser = action(
  z.object({ id: zId, data: z.object({ role: zRole, isActive: z.boolean(), title: z.string().max(120).nullable(), name: z.string().trim().min(2).max(120) }).partial() }),
  async ({ id, data }, user) => {
    const [target] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, user.orgId)));
    if (!target) throw new NotFoundError("User not found.");
    const self = id === user.id;
    if (!self && !can.manageUsers(user)) throw new AuthzError();
    if (self && (data.role || data.isActive === false)) throw new AuthzError("You can't change your own role or deactivate yourself.");
    if (data.role && !can.assignRole(user, data.role)) throw new AuthzError("Only a Super Admin can grant that role.");
    if (target.role === "super_admin" && user.role !== "super_admin" && !self) throw new AuthzError("Only a Super Admin can modify another Super Admin.");
    if (target.role === "super_admin" && (data.role || data.isActive === false)) {
      const [{ n }] = (await db.select({ n: count() }).from(users).where(and(eq(users.orgId, user.orgId), eq(users.role, "super_admin"), eq(users.isActive, true)))) as [{ n: number }];
      if (n <= 1) throw new AuthzError("The organization needs at least one active Super Admin.");
    }
    await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id));
    await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "user", action: "updated", meta: { userId: id, name: target.name, ...data } });
    revalidatePath("/", "layout");
    return { id };
  },
);

export const changePassword = action(z.object({ current: z.string().min(1), next: passwordSchema }), async ({ current, next }, user) => {
  if (!user.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) throw new AuthzError("Current password is incorrect.");
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 12), updatedAt: new Date() }).where(eq(users.id, user.id));
  return { ok: true };
});

export const updateMySettings = action(z.object({ emailNotifications: z.boolean().optional(), theme: z.enum(["light", "dark", "system"]).optional() }), async (data, user) => {
  await db.insert(userSettings).values({ userId: user.id, ...data }).onConflictDoUpdate({ target: userSettings.userId, set: { ...data, updatedAt: new Date() } });
  return { ok: true };
});

/* ───── teams ───── */

export const createTeam = action(z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(500).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }), async (input, user) => {
  if (!can.manageTeams(user)) throw new AuthzError();
  const [t] = await db.insert(teams).values({ orgId: user.orgId, ...input }).returning();
  revalidatePath("/teams");
  return t!;
});

export const deleteTeam = action(z.object({ id: zId }), async ({ id }, user) => {
  if (!can.manageTeams(user)) throw new AuthzError();
  await db.delete(teams).where(and(eq(teams.id, id), eq(teams.orgId, user.orgId)));
  revalidatePath("/teams");
  return { ok: true };
});

export const setTeamMember = action(z.object({ teamId: zId, userId: zId, member: z.boolean() }), async ({ teamId, userId, member }, user) => {
  if (!can.manageTeams(user)) throw new AuthzError();
  const [t] = await db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.orgId, user.orgId)));
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.orgId, user.orgId)));
  if (!t || !u) throw new NotFoundError();
  if (member) await db.insert(teamMembers).values({ teamId, userId }).onConflictDoNothing();
  else await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  revalidatePath("/teams");
  return { ok: true };
});

/* ───── workflows ───── */

export const createWorkflow = action(z.object({ name: z.string().trim().min(2).max(80) }), async ({ name }, user) => {
  if (!can.manageWorkflows(user)) throw new AuthzError();
  const [wf] = await db.insert(workflows).values({ orgId: user.orgId, name }).returning();
  await db.insert(workflowStatuses).values(DEFAULT_STATUSES.filter((s) => ["To Do", "In Progress", "Done"].includes(s.name)).map((s, i) => ({ workflowId: wf!.id, ...s, position: i })));
  revalidatePath("/admin/workflows");
  return wf!;
});

async function ownWorkflow(orgId: string, workflowId: string) {
  const [wf] = await db.select().from(workflows).where(and(eq(workflows.id, workflowId), eq(workflows.orgId, orgId)));
  if (!wf) throw new NotFoundError("Workflow not found.");
  return wf;
}

export const upsertStatus = action(
  z.object({ workflowId: zId, id: zId.optional(), name: z.string().trim().min(1).max(40), category: z.enum(["backlog", "todo", "in_progress", "done", "cancelled"]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  async ({ workflowId, id, ...data }, user) => {
    if (!can.manageWorkflows(user)) throw new AuthzError();
    await ownWorkflow(user.orgId, workflowId);
    if (id) await db.update(workflowStatuses).set(data).where(and(eq(workflowStatuses.id, id), eq(workflowStatuses.workflowId, workflowId)));
    else {
      const [{ n }] = (await db.select({ n: count() }).from(workflowStatuses).where(eq(workflowStatuses.workflowId, workflowId))) as [{ n: number }];
      await db.insert(workflowStatuses).values({ workflowId, ...data, position: n });
    }
    await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "workflow", action: id ? "status_updated" : "status_added", meta: data });
    revalidatePath("/", "layout");
    return { ok: true };
  },
);

export const reorderStatuses = action(z.object({ workflowId: zId, ids: z.array(zId).min(1).max(30) }), async ({ workflowId, ids }, user) => {
  if (!can.manageWorkflows(user)) throw new AuthzError();
  await ownWorkflow(user.orgId, workflowId);
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(workflowStatuses).set({ position: i }).where(and(eq(workflowStatuses.id, id), eq(workflowStatuses.workflowId, workflowId)));
  });
  revalidatePath("/", "layout");
  return { ok: true };
});

export const deleteStatus = action(z.object({ workflowId: zId, id: zId, moveTo: zId }), async ({ workflowId, id, moveTo }, user) => {
  if (!can.manageWorkflows(user)) throw new AuthzError();
  await ownWorkflow(user.orgId, workflowId);
  if (id === moveTo) throw new AuthzError("Pick a different status to move tasks to.");
  const [target] = await db.select().from(workflowStatuses).where(and(eq(workflowStatuses.id, moveTo), eq(workflowStatuses.workflowId, workflowId)));
  if (!target) throw new NotFoundError("Target status not found.");
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ statusId: moveTo }).where(eq(tasks.statusId, id));
    await tx.delete(workflowStatuses).where(and(eq(workflowStatuses.id, id), eq(workflowStatuses.workflowId, workflowId)));
  });
  revalidatePath("/", "layout");
  return { ok: true };
});

export const setDefaultWorkflow = action(z.object({ id: zId }), async ({ id }, user) => {
  if (!can.manageWorkflows(user)) throw new AuthzError();
  await ownWorkflow(user.orgId, id);
  await db.transaction(async (tx) => {
    await tx.update(workflows).set({ isDefault: false }).where(eq(workflows.orgId, user.orgId));
    await tx.update(workflows).set({ isDefault: true }).where(eq(workflows.id, id));
  });
  revalidatePath("/admin/workflows");
  return { ok: true };
});

export const deleteWorkflow = action(z.object({ id: zId }), async ({ id }, user) => {
  if (!can.manageWorkflows(user)) throw new AuthzError();
  const wf = await ownWorkflow(user.orgId, id);
  if (wf.isDefault) throw new AuthzError("You can't delete the default workflow.");
  const [{ n }] = (await db.select({ n: count() }).from(projects).where(eq(projects.workflowId, id))) as [{ n: number }];
  if (n > 0) throw new AuthzError("Move projects off this workflow before deleting it.");
  await db.delete(workflows).where(eq(workflows.id, id));
  revalidatePath("/admin/workflows");
  return { ok: true };
});

/* ───── organization & API tokens ───── */

export const updateOrganization = action(z.object({ name: z.string().trim().min(2).max(120), dueSoonDays: z.coerce.number().int().min(1).max(14).optional() }), async ({ name, dueSoonDays }, user) => {
  if (!can.manageOrgSettings(user)) throw new AuthzError("Only a Super Admin can change organization settings.");
  await db.update(organizations).set({ name, settings: { ...user.org.settings, ...(dueSoonDays && { dueSoonDays }) }, updatedAt: new Date() }).where(eq(organizations.id, user.orgId));
  revalidatePath("/", "layout");
  return { ok: true };
});

export const createApiToken = action(z.object({ name: z.string().trim().min(1).max(80) }), async ({ name }, user) => {
  if (user.role === "viewer") throw new AuthzError();
  const raw = `tsk_${randomBytes(24).toString("base64url")}`;
  await db.insert(apiTokens).values({ orgId: user.orgId, userId: user.id, name, prefix: raw.slice(0, 10), tokenHash: createHash("sha256").update(raw).digest("hex") });
  revalidatePath("/settings");
  return { token: raw };
});

export const revokeApiToken = action(z.object({ id: zId }), async ({ id }, user) => {
  await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)));
  revalidatePath("/settings");
  return { ok: true };
});

export async function whoAmI() {
  const u = await getCurrentUser();
  return u ? { id: u.id, name: u.name, role: u.role } : null;
}
