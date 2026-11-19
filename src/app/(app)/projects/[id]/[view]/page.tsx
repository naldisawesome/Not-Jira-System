import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getProjectAccess } from "@/server/rbac";
import { WorkView, type ViewName } from "@/components/work/work-view";

const VIEWS = ["board", "list", "calendar", "timeline", "backlog", "sprints"];

export default async function ProjectViewPage({ params, searchParams }: { params: { id: string; view: string }; searchParams: Record<string, string | undefined> }) {
  if (!VIEWS.includes(params.view)) notFound();
  const user = await requireUser();
  try { await getProjectAccess(user, params.id); } catch { notFound(); }
  return <WorkView user={user} view={params.view as ViewName} projectId={params.id} sp={searchParams} />;
}
