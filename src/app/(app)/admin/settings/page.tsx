import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { can } from "@/server/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { OrgSettingsForm } from "@/components/admin/org-settings";

export const metadata = { title: "General Settings" };

export default async function GeneralSettings() {
  const user = await requireUser();
  if (!can.manageUsers(user)) redirect("/");
  const env = {
    storage: process.env.STORAGE_DRIVER === "s3" ? `S3-compatible (${process.env.S3_BUCKET})` : "Local disk (development only)",
    email: "Not configured — add an SMTP or Resend integration to send email notifications and invites.",
    maxUpload: `${process.env.MAX_UPLOAD_MB ?? 25} MB per file`,
  };
  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-5">
      <PageHeader title="General Settings" description="Organization-wide configuration." />
      <Card><CardHeader title="Organization" description={user.role === "super_admin" ? undefined : "Only Super Admins can change these settings."} /><CardContent><OrgSettingsForm name={user.org.name} dueSoonDays={user.org.settings.dueSoonDays ?? 2} disabled={user.role !== "super_admin"} /></CardContent></Card>
      <Card>
        <CardHeader title="Integrations & environment" description="Read-only status of external services" />
        <CardContent>
          <dl className="divide-y text-[13px]">
            {[["File storage", env.storage], ["Upload limit", env.maxUpload], ["Email delivery", env.email], ["Deadline reminders", "In-app notifications, generated on demand and via /api/cron/deadlines"]].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[160px_1fr] gap-3 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
