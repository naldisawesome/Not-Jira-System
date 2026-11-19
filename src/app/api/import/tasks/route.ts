import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { labels, users } from "@/db/schema";
import { getCurrentUser } from "@/server/session";
import { requireProject } from "@/server/rbac";
import { createTask } from "@/server/actions/tasks";
import { parseCSV } from "@/lib/csv";
import { PRIORITIES, TASK_TYPES } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const projectId = String(form.get("projectId") ?? "");
  if (!(file instanceof File) || file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Upload a CSV file up to 2 MB." }, { status: 400 });
  try {
    await requireProject(user, projectId, "edit");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const rows = parseCSV(await file.text());
  if (rows.length < 2) return NextResponse.json({ error: "The CSV has no data rows." }, { status: 400 });
  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (r: string[], name: string) => (header.indexOf(name) >= 0 ? (r[header.indexOf(name)] ?? "").trim() : "");
  if (!header.includes("title")) return NextResponse.json({ error: "Missing required 'title' column." }, { status: 400 });
  if (rows.length > 501) return NextResponse.json({ error: "Import up to 500 rows at a time." }, { status: 400 });

  const emails = Array.from(new Set(rows.slice(1).map((r) => col(r, "assignee_email").toLowerCase()).filter(Boolean)));
  const people = emails.length ? await db.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.orgId, user.orgId), inArray(sql`lower(${users.email})`, emails))) : [];
  const orgLabels = await db.select().from(labels).where(eq(labels.orgId, user.orgId));
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  let created = 0;
  const errors: string[] = [];
  for (const [i, r] of rows.slice(1).entries()) {
    const title = col(r, "title");
    if (!title) { errors.push(`Row ${i + 2}: missing title`); continue; }
    const type = TASK_TYPES.find((t) => t.value === col(r, "type").toLowerCase() || t.label.toLowerCase() === col(r, "type").toLowerCase())?.value ?? "task";
    const priority = PRIORITIES.find((p) => p.value === col(r, "priority").toLowerCase())?.value ?? "medium";
    const est = Number(col(r, "estimate_hours"));
    const labelIds = col(r, "labels").split(/[;|]/).map((s) => s.trim().toLowerCase()).filter(Boolean).map((n) => orgLabels.find((l) => l.name.toLowerCase() === n)?.id).filter((x): x is string => !!x);
    const res = await createTask({
      projectId,
      title: title.slice(0, 240),
      description: col(r, "description") || null,
      type,
      priority,
      startDate: date(col(r, "start_date")),
      dueDate: date(col(r, "due_date")),
      estimateHours: Number.isFinite(est) && est > 0 ? est : null,
      assigneeId: people.find((p) => p.email.toLowerCase() === col(r, "assignee_email").toLowerCase())?.id ?? null,
      labelIds,
    });
    if (res.ok) created++;
    else errors.push(`Row ${i + 2}: ${res.error}`);
  }
  return NextResponse.json({ created, skipped: errors.length, errors: errors.slice(0, 20) });
}
