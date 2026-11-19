import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { requireUser } from "@/server/session";
import { requireProject } from "@/server/rbac";
import { getProjectContext } from "@/server/queries";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";
import { CoverPicker, MembersManager } from "@/components/projects/project-settings";

export default async function ProjectSettingsPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  let access;
  try { access = await requireProject(user, params.id, "manage"); } catch { notFound(); }
  const p = access.project;
  const [ctx, wfs] = await Promise.all([getProjectContext(p.id, p.workflowId), db.select({ id: workflows.id, name: workflows.name, isDefault: workflows.isDefault }).from(workflows).where(eq(workflows.orgId, user.orgId))]);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader title="Project details" />
        <CardContent>
          <ProjectForm projectId={p.id} workflows={wfs} initial={{ name: p.name, key: p.key, description: p.description ?? "", category: p.category ?? "", color: p.color, status: p.status === "archived" ? "active" : p.status, priority: p.priority, ownerId: p.ownerId ?? undefined, startDate: p.startDate ?? "", dueDate: p.dueDate ?? "", memberIds: [], workflowId: p.workflowId }} />
        </CardContent>
      </Card>
      <div className="space-y-5">
        <Card><CardHeader title="Logo / cover image" /><CardContent><CoverPicker projectId={p.id} coverId={p.coverAttachmentId} /></CardContent></Card>
        <Card id="members"><CardHeader title="Members" description={`${ctx.members.length} people`} /><CardContent><MembersManager projectId={p.id} ownerId={p.ownerId} members={ctx.members} /></CardContent></Card>
      </div>
    </div>
  );
}
