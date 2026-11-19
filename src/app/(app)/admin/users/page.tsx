import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitations, users } from "@/db/schema";
import { requireUser } from "@/server/session";
import { can } from "@/server/rbac";
import { PageHeader } from "@/components/page-header";
import { UsersAdmin } from "@/components/admin/users-admin";

export const metadata = { title: "User Management" };

export default async function UsersAdminPage() {
  const user = await requireUser();
  if (!can.manageUsers(user)) redirect("/");
  const [rows, invites] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, username: users.username, role: users.role, title: users.title, isActive: users.isActive, avatarColor: users.avatarColor, createdAt: users.createdAt }).from(users).where(eq(users.orgId, user.orgId)).orderBy(users.name),
    db.select().from(invitations).where(and(eq(invitations.orgId, user.orgId), isNull(invitations.acceptedAt))).orderBy(desc(invitations.createdAt)),
  ]);
  return (
    <div className="mx-auto max-w-[1200px] animate-fade-in">
      <PageHeader title="User Management" description="Invite people, assign roles and deactivate accounts. Permissions are enforced on the server." />
      <UsersAdmin users={rows} invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, token: i.token, expiresAt: i.expiresAt }))} myRole={user.role} myId={user.id} />
    </div>
  );
}
