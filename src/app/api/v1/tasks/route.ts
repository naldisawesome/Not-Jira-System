import { NextResponse } from "next/server";
import { withApiUser, apiError } from "@/server/api-auth";
import { listTasks } from "@/server/queries";
import { createTask } from "@/server/actions/tasks";
import { filtersFrom } from "@/components/work/filters";
import { taskKey } from "@/lib/utils";

/** GET /api/v1/tasks?project=&assignee=&priority=&type=&category=&q=&page=&size= */
export async function GET(req: Request) {
  return withApiUser(req, async (user) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const page = Math.max(1, Number(sp.page) || 1);
    const size = Math.min(200, Math.max(1, Number(sp.size) || 50));
    const { rows, total } = await listTasks(user, { ...filtersFrom(sp), projectId: sp.project || undefined }, { sort: sp.sort, dir: sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : undefined, page, pageSize: size });
    return NextResponse.json({ data: rows.map((t) => ({ ...t, key: taskKey(t.projectKey, t.number) })), page, size, total });
  });
}

/** POST /api/v1/tasks  { projectId, title, type?, priority?, assigneeId?, dueDate?, description?, ... } */
export async function POST(req: Request) {
  return withApiUser(req, async () => {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    const r = await createTask(body);
    return r.ok ? NextResponse.json({ data: r.data }, { status: 201 }) : apiError(r);
  });
}
