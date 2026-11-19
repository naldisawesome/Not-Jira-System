import "server-only";
import { db } from "@/db";
import { workflows, workflowStatuses } from "@/db/schema";
import { DEFAULT_STATUSES } from "@/lib/constants";

export async function createDefaultWorkflow(tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0], orgId: string) {
  const [wf] = await tx.insert(workflows).values({ orgId, name: "Standard workflow", isDefault: true }).returning();
  await tx.insert(workflowStatuses).values(DEFAULT_STATUSES.map((s, i) => ({ workflowId: wf!.id, ...s, position: i })));
  return wf!;
}

