import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { workflows, workflowStatuses } from "@/db/schema";
import { requireUser } from "@/server/session";
import { can } from "@/server/rbac";
import { PageHeader } from "@/components/page-header";
import { WorkflowsAdmin } from "@/components/admin/workflows-admin";

export const metadata = { title: "Workflow Settings" };

export default async function WorkflowsPage() {
  const user = await requireUser();
  if (!can.manageWorkflows(user)) redirect("/");
  const wfs = await db.select({ wf: workflows, projects: sql<number>`(SELECT count(*)::int FROM projects p WHERE p.workflow_id = ${workflows.id})` }).from(workflows).where(eq(workflows.orgId, user.orgId)).orderBy(asc(workflows.createdAt));
  const statuses = await db.select({ s: workflowStatuses, tasks: sql<number>`(SELECT count(*)::int FROM tasks t WHERE t.status_id = ${workflowStatuses.id})` }).from(workflowStatuses).innerJoin(workflows, eq(workflows.id, workflowStatuses.workflowId)).where(eq(workflows.orgId, user.orgId)).orderBy(asc(workflowStatuses.position));
  return (
    <div className="mx-auto max-w-[1100px] animate-fade-in">
      <PageHeader title="Workflow Settings" description="Customize the statuses tasks move through. Board columns follow this order. Each status maps to a category used for progress and reporting." />
      <WorkflowsAdmin workflows={wfs.map((w) => ({ ...w.wf, projects: w.projects, statuses: statuses.filter((s) => s.s.workflowId === w.wf.id).map((s) => ({ ...s.s, tasks: s.tasks })) }))} />
    </div>
  );
}
