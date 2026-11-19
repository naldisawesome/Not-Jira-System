import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitations, organizations } from "@/db/schema";
import { AcceptInviteForm } from "./form";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const [inv] = await db
    .select({ email: invitations.email, role: invitations.role, org: organizations.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(and(eq(invitations.token, params.token), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
  if (!inv)
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invitation unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">This link is invalid, already used or expired. Ask your admin for a new invite.</p>
      </div>
    );
  return <AcceptInviteForm token={params.token} email={inv.email} org={inv.org} />;
}
