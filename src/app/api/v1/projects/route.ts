import { NextResponse } from "next/server";
import { withApiUser } from "@/server/api-auth";
import { getProjectsForUser, progressOf } from "@/server/queries";

export async function GET(req: Request) {
  return withApiUser(req, async (user) => {
    const rows = await getProjectsForUser(user);
    return NextResponse.json({
      data: rows.map((r) => ({ id: r.project.id, key: r.project.key, name: r.project.name, status: r.project.status, phase: r.project.phase, priority: r.project.priority, startDate: r.project.startDate, dueDate: r.project.dueDate, archived: !!r.project.archivedAt, tasks: r.total, done: r.done, progress: progressOf(r) })),
    });
  });
}
