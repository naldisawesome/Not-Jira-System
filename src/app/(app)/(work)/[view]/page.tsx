import { notFound } from "next/navigation";
import { Columns3, List, CalendarDays, GanttChart, Layers, Zap } from "lucide-react";
import { requireUser } from "@/server/session";
import { WorkView, type ViewName } from "@/components/work/work-view";
import { PageHeader } from "@/components/page-header";

const VIEWS: Record<ViewName, { title: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  board: { title: "Board", description: "Drag cards between workflow columns.", icon: Columns3 },
  list: { title: "List", description: "Sort, filter, edit inline and update tasks in bulk.", icon: List },
  calendar: { title: "Calendar", description: "Tasks by due date. Drag to reschedule.", icon: CalendarDays },
  timeline: { title: "Timeline", description: "Durations, milestones and dependencies over time.", icon: GanttChart },
  backlog: { title: "Backlog", description: "Plan unscheduled work into sprints.", icon: Layers },
  sprints: { title: "Sprints", description: "Iterations, progress and milestones.", icon: Zap },
};

export function generateMetadata({ params }: { params: { view: string } }) {
  return { title: VIEWS[params.view as ViewName]?.title ?? "Not found" };
}

export default async function GlobalViewPage({ params, searchParams }: { params: { view: string }; searchParams: Record<string, string | undefined> }) {
  const meta = VIEWS[params.view as ViewName];
  if (!meta) notFound();
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-[1600px] animate-fade-in">
      <PageHeader title={<span className="flex items-center gap-2"><meta.icon className="size-5 text-primary" />{meta.title}</span>} description={meta.description} />
      <WorkView user={user} view={params.view as ViewName} sp={searchParams} />
    </div>
  );
}
