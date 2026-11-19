import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { listTasks } from "@/server/queries";
import { filtersFrom } from "@/components/work/filters";
import { toCSV, taskKey } from "@/lib/utils";
import { priorityMeta, typeMeta } from "@/lib/constants";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { rows } = await listTasks(user, { ...filtersFrom(sp), projectId: sp.project || undefined }, { sort: sp.sort ?? "key", dir: "asc", pageSize: 1000 });
  const csv = toCSV(
    rows.map((t) => ({
      id: taskKey(t.projectKey, t.number),
      title: t.title,
      project: t.projectName,
      type: typeMeta(t.type).label,
      status: t.statusName,
      priority: priorityMeta(t.priority).label,
      assignee: t.assignee?.name ?? "",
      labels: t.labels.map((l) => l.name).join("; "),
      start_date: t.startDate ?? "",
      due_date: t.dueDate ?? "",
      estimate_hours: t.estimateHours ?? "",
      logged_hours: t.loggedHours,
      created: new Date(t.createdAt).toISOString(),
      updated: new Date(t.updatedAt).toISOString(),
      completed: t.completedAt ? new Date(t.completedAt).toISOString() : "",
    })),
  );
  return new NextResponse("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tasks-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
