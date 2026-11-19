import { NextResponse } from "next/server";
import { withApiUser, apiError } from "@/server/api-auth";
import { listTasks } from "@/server/queries";
import { deleteTasks, updateTask } from "@/server/actions/tasks";
import { taskKey } from "@/lib/utils";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withApiUser(req, async (user) => {
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { rows } = await listTasks(user, { ids: [params.id] });
    return rows[0] ? NextResponse.json({ data: { ...rows[0], key: taskKey(rows[0].projectKey, rows[0].number) } }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  });
}

/** PATCH /api/v1/tasks/:id  { title?, statusId?, priority?, assigneeId?, dueDate?, ... } */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return withApiUser(req, async () => {
    const patch = await req.json().catch(() => null);
    if (!patch) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    const r = await updateTask({ id: params.id, patch });
    return r.ok ? NextResponse.json({ data: r.data }) : apiError(r);
  });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return withApiUser(req, async () => {
    const r = await deleteTasks({ ids: [params.id] });
    return r.ok ? NextResponse.json({ data: r.data }) : apiError(r);
  });
}
