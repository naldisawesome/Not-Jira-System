import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { Check, Minus } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/server/session";
import { can } from "@/server/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ROLES } from "@/lib/constants";

export const metadata = { title: "Roles & Permissions" };

// Mirrors the server-side checks in src/server/rbac.ts (the source of truth).
const MATRIX: [string, ("super_admin" | "admin" | "project_manager" | "member" | "viewer")[], string?][] = [
  ["View projects they belong to", ["super_admin", "admin", "project_manager", "member", "viewer"]],
  ["View every project in the organization", ["super_admin", "admin"]],
  ["Create tasks, comment, upload files", ["super_admin", "admin", "project_manager", "member"], "on projects where they're a member (not project-viewer)"],
  ["Update task status, assignee, dates", ["super_admin", "admin", "project_manager", "member"]],
  ["Delete tasks", ["super_admin", "admin", "project_manager"], "reporters can delete their own tasks"],
  ["Create projects", ["super_admin", "admin", "project_manager"]],
  ["Edit / archive / delete projects", ["super_admin", "admin", "project_manager"], "PMs only for projects they own or lead"],
  ["Manage project members & sprints", ["super_admin", "admin", "project_manager"], "PMs only for projects they own or lead"],
  ["Delete any attachment or comment", ["super_admin", "admin", "project_manager"], "within projects they manage"],
  ["Reports & analytics", ["super_admin", "admin", "project_manager", "member"]],
  ["Invite users & change roles", ["super_admin", "admin"], "only Super Admins can grant Super Admin"],
  ["Configure workflows & statuses", ["super_admin", "admin"]],
  ["Manage teams", ["super_admin", "admin"]],
  ["Organization settings", ["super_admin"]],
];

export default async function RolesPage() {
  const user = await requireUser();
  if (!can.manageUsers(user)) redirect("/");
  const counts = await db.select({ role: users.role, n: count() }).from(users).where(eq(users.orgId, user.orgId)).groupBy(users.role);
  return (
    <div className="mx-auto max-w-[1200px] animate-fade-in space-y-5">
      <PageHeader title="Roles & Permissions" description="Five built-in roles. Every permission below is enforced by the server, not just hidden in the UI. Project-level roles (Lead / Member / Viewer) further narrow access per project." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((r) => (
          <div key={r.value} className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between"><p className="font-semibold">{r.label}</p><span className="rounded-full bg-muted px-2 text-xs tabular-nums">{counts.find((c) => c.role === r.value)?.n ?? 0}</span></div>
            <p className="mt-1.5 text-xs text-muted-foreground">{r.description}</p>
          </div>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <CardContent className="p-0">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="border-b bg-muted/40"><tr><th className="px-4 py-3 text-left text-[11px] uppercase tracking-wide text-muted-foreground">Permission</th>{ROLES.map((r) => <th key={r.value} className="px-3 py-3 text-center text-[11px] uppercase tracking-wide text-muted-foreground">{r.label}</th>)}</tr></thead>
            <tbody>
              {MATRIX.map(([label, roles, note]) => (
                <tr key={label} className="border-b last:border-0">
                  <td className="px-4 py-2.5"><p>{label}</p>{note && <p className="text-[11px] text-muted-foreground">{note}</p>}</td>
                  {ROLES.map((r) => <td key={r.value} className="text-center">{roles.includes(r.value) ? <Check className="mx-auto size-4 text-primary" strokeWidth={2.5} /> : <Minus className="mx-auto size-4 text-muted-foreground/40" />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
