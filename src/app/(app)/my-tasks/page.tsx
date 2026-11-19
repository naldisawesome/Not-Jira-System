import Link from "next/link";
import { addDays, format, subDays } from "date-fns";
import { CircleCheckBig, AlarmClock, CalendarCheck2, CalendarRange, Megaphone, CheckCheck } from "lucide-react";
import { requireUser } from "@/server/session";
import { listTasks, type TaskRow } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TaskLine } from "@/components/tasks/task-line";
import { cn } from "@/lib/utils";

export const metadata = { title: "My Tasks" };

const TABS = [
  { v: "assigned", label: "Assigned to me", icon: CircleCheckBig },
  { v: "reported", label: "Reported by me", icon: Megaphone },
  { v: "overdue", label: "Overdue", icon: AlarmClock },
  { v: "today", label: "Due today", icon: CalendarCheck2 },
  { v: "upcoming", label: "Upcoming", icon: CalendarRange },
  { v: "completed", label: "Recently completed", icon: CheckCheck },
] as const;

export default async function MyTasksPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await requireUser();
  const [assigned, reported, overdue, dueToday, upcoming, completed] = await Promise.all([
    listTasks(user, { assignee: "me", category: "open" }, { sort: "priority", pageSize: 200 }),
    listTasks(user, { reporter: "me", category: "open" }, { sort: "updated", pageSize: 200 }),
    listTasks(user, { assignee: "me", due: "overdue" }, { sort: "due", pageSize: 200 }),
    listTasks(user, { assignee: "me", due: "today", category: "open" }, { sort: "priority", pageSize: 200 }),
    listTasks(user, { assignee: "me", category: "open", dueFrom: format(addDays(new Date(), 1), "yyyy-MM-dd"), dueTo: format(addDays(new Date(), 21), "yyyy-MM-dd") }, { sort: "due", pageSize: 200 }),
    listTasks(user, { assignee: "me", category: "done", completedSince: format(subDays(new Date(), 14), "yyyy-MM-dd") }, { sort: "updated", pageSize: 200 }),
  ]);
  const data: Record<string, TaskRow[]> = { assigned: assigned.rows, reported: reported.rows, overdue: overdue.rows, today: dueToday.rows, upcoming: upcoming.rows, completed: completed.rows };
  const tab = (TABS.find((t) => t.v === searchParams.tab)?.v ?? "assigned") as keyof typeof data;
  const rows = data[tab]!;

  // group the main list by project for scanability
  const groups = rows.reduce<Record<string, TaskRow[]>>((g, r) => ((g[r.projectName] ??= []).push(r), g), {});

  return (
    <div className="mx-auto max-w-[1200px] animate-fade-in">
      <PageHeader title="My Tasks" description="Your personal workspace across every project." />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {TABS.map((t) => (
          <Link key={t.v} href={`/my-tasks?tab=${t.v}`} className={cn("rounded-xl border bg-card p-3 shadow-soft transition hover:shadow-lift", tab === t.v && "border-primary/50 ring-2 ring-primary/15")}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><t.icon className={cn("size-3.5", t.v === "overdue" && data.overdue!.length && "text-destructive")} />{t.label}</div>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums", t.v === "overdue" && data.overdue!.length > 0 && "text-destructive")}>{data[t.v]!.length}</p>
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center"><CircleCheckBig className="mx-auto mb-2 size-6 text-primary" /><p className="text-sm font-medium">Nothing here</p><p className="text-xs text-muted-foreground">{tab === "overdue" ? "You're on top of your deadlines." : "No tasks in this view."}</p></div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([name, list]) => (
            <Card key={name}>
              <CardHeader title={<span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: list[0]!.projectColor }} />{name}</span>} description={`${list.length} task${list.length > 1 ? "s" : ""}`} />
              <CardContent className="px-3">{list.map((r) => <TaskLine key={r.id} t={r} showProject={false} />)}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
