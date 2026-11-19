import { requireUser } from "@/server/session";
import { getActivity } from "@/server/stats";
import { getProjectsForUser } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ActivityFeed } from "@/components/activity-feed";
import { AutoRefresh } from "@/components/auto-refresh";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: { project?: string } }) {
  const user = await requireUser();
  const projects = await getProjectsForUser(user);
  const pid = projects.some((p) => p.project.id === searchParams.project) ? searchParams.project : undefined;
  const items = await getActivity(user, { projectId: pid, limit: 100 });
  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <AutoRefresh every={30} />
      <PageHeader title="Activity" description="A live audit trail of everything happening in your projects." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/activity" className={cn("rounded-full border px-3 py-1 text-xs", !pid && "border-primary bg-accent text-accent-foreground")}>All projects</Link>
        {projects.map((p) => <Link key={p.project.id} href={`/activity?project=${p.project.id}`} className={cn("rounded-full border px-3 py-1 text-xs", pid === p.project.id && "border-primary bg-accent text-accent-foreground")}>{p.project.name}</Link>)}
      </div>
      <Card><CardContent className="pt-5"><ActivityFeed items={items} /></CardContent></Card>
    </div>
  );
}
