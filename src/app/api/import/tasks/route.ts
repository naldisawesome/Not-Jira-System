import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { labels, projects, tasks, users, workflowStatuses } from "@/db/schema";
import { getCurrentUser } from "@/server/session";
import { can, getProjectAccess, visibleProjectIds } from "@/server/rbac";
import { createTask } from "@/server/actions/tasks";
import { createProject } from "@/server/actions/projects";
import { parseCSV } from "@/lib/csv";
import { PRIORITIES, PROJECT_COLORS, PROJECT_PHASES, TASK_TYPES } from "@/lib/constants";
import { logActivity } from "@/server/activity";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ROWS = 1000;
const STATUS_ALIASES: Record<string, string[]> = {
  done: ["done", "completed", "complete", "fixed", "shipped", "released", "closed", "resolved"],
  backlog: ["backlog", "future", "planned", "idea", "later", "someday"],
  todo: ["todo", "to do", "open", "new", "pending", "not started"],
  in_progress: ["in progress", "doing", "wip", "started", "in review", "testing", "blocked"],
  cancelled: ["cancelled", "canceled", "won't do", "wont do", "dropped", "rejected"],
};
const date = (v: string) => {
  const m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}` : null;
};

/**
 * CSV import. Columns (header names are case-insensitive, spaces = underscores):
 *   title (required), type, status, priority, description, labels (separated by ; or |), assignee_email,
 *   start_date, due_date, estimate_hours, date / completed_date (when it was done), created_date,
 *   project_key + project_name (optional: route each row to a project; created if missing and you may create projects).
 * Rows whose title already exists in the same project are skipped, so re-uploading an updated log is safe.
 * `dryRun=1` returns the plan without writing anything.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const fallbackProjectId = String(form.get("projectId") ?? "") || null;
  const dryRun = form.get("dryRun") === "1";
  if (!(file instanceof File) || file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "Upload a CSV file up to 3 MB." }, { status: 400 });
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain|excel/i.test(file.type)) return NextResponse.json({ error: "Only .csv files can be imported. In Excel or Google Sheets use File → Download / Save as → CSV." }, { status: 400 });

  const rows = parseCSV(await file.text());
  if (rows.length < 2) return NextResponse.json({ error: "The CSV has no data rows." }, { status: 400 });
  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const idx = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const col = (r: string[], ...names: string[]) => { const i = idx(...names); return i >= 0 ? (r[i] ?? "").trim() : ""; };
  if (idx("title", "summary", "name") < 0) return NextResponse.json({ error: "Missing a 'title' column." }, { status: 400 });
  const data = rows.slice(1);
  if (data.length > MAX_ROWS) return NextResponse.json({ error: `Import up to ${MAX_ROWS} rows at a time.` }, { status: 400 });

  // ── Resolve target projects ──
  const visible = await visibleProjectIds(user);
  const orgProjects = visible.length ? await db.select().from(projects).where(and(eq(projects.orgId, user.orgId), inArray(projects.id, visible))) : [];
  const byKey = new Map(orgProjects.map((p) => [p.key.toUpperCase(), p]));
  const wantedKeys = new Map<string, string>(); // key -> name
  const wantedPhase = new Map<string, string>(); // key -> phase
  for (const r of data) {
    const key = col(r, "project_key", "project").toUpperCase();
    if (key) wantedKeys.set(key, wantedKeys.get(key) || col(r, "project_name") || key);
    const ph = col(r, "project_phase", "phase").toLowerCase();
    const phase = PROJECT_PHASES.find((x) => x.value === ph || x.label.toLowerCase() === ph || (ph === "uat" && x.value === "testing") || (ph === "live" && x.value === "production"));
    if (key && phase && !wantedPhase.has(key)) wantedPhase.set(key, phase.value);
  }
  const toCreate = [...wantedKeys].filter(([k]) => !byKey.has(k));
  const errors: string[] = [];
  if (toCreate.length) {
    if (!can.createProject(user)) return NextResponse.json({ error: `Project(s) ${toCreate.map(([k]) => k).join(", ")} don't exist and you can't create projects. Ask a project manager.` }, { status: 403 });
    const bad = toCreate.filter(([k]) => !/^[A-Z][A-Z0-9]{1,9}$/.test(k));
    if (bad.length) return NextResponse.json({ error: `Invalid project key(s): ${bad.map(([k]) => k).join(", ")}. Use 2–10 letters/numbers starting with a letter.` }, { status: 400 });
  }
  if (!wantedKeys.size && !fallbackProjectId) return NextResponse.json({ error: "Choose a project, or add a project_key column to the file." }, { status: 400 });

  const plan: { row: number; key: string; title: string; skip?: string }[] = [];
  const existingTitles = new Map<string, Set<string>>();
  const loadTitles = async (projectId: string) => {
    if (!existingTitles.has(projectId)) {
      const t = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.projectId, projectId));
      existingTitles.set(projectId, new Set(t.map((x) => x.title.trim().toLowerCase())));
    }
    return existingTitles.get(projectId)!;
  };
  const fallback = fallbackProjectId ? orgProjects.find((p) => p.id === fallbackProjectId) : undefined;
  if (fallbackProjectId && !fallback) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const seen = new Set<string>();
  for (const [i, r] of data.entries()) {
    const title = col(r, "title", "summary", "name");
    const key = col(r, "project_key", "project").toUpperCase() || fallback?.key || "";
    if (!title) { plan.push({ row: i + 2, key, title, skip: "missing title" }); continue; }
    const target = byKey.get(key);
    const dupKey = `${key}::${title.toLowerCase()}`;
    if (seen.has(dupKey)) plan.push({ row: i + 2, key, title, skip: "duplicate row in file" });
    else if (target && (await loadTitles(target.id)).has(title.toLowerCase())) plan.push({ row: i + 2, key, title, skip: "already in project" });
    else plan.push({ row: i + 2, key, title });
    seen.add(dupKey);
  }
  const summary = {
    rows: data.length,
    toImport: plan.filter((p) => !p.skip).length,
    skipped: plan.filter((p) => p.skip).length,
    newProjects: toCreate.map(([key, name]) => ({ key, name })),
    byProject: Object.entries(plan.filter((p) => !p.skip).reduce<Record<string, number>>((a, p) => ((a[p.key] = (a[p.key] ?? 0) + 1), a), {})).map(([key, count]) => ({ key, name: byKey.get(key)?.name ?? wantedKeys.get(key) ?? key, count })),
    skippedRows: plan.filter((p) => p.skip).slice(0, 15),
  };
  if (dryRun) return NextResponse.json({ dryRun: true, ...summary });

  // ── Create missing projects ──
  for (const [i, [key, name]] of toCreate.entries()) {
    const r = await createProject({ name: name.length >= 2 ? name : `${key} project`, key, color: PROJECT_COLORS[(orgProjects.length + i) % PROJECT_COLORS.length]!, status: "active", priority: "medium", phase: (wantedPhase.get(key) ?? "development") as never, memberIds: [] });
    if (!r.ok) return NextResponse.json({ error: `Couldn't create project ${key}: ${r.error}` }, { status: r.status ?? 400 });
    const [p] = await db.select().from(projects).where(eq(projects.id, r.data.id));
    byKey.set(key, p!);
  }

  // ── Lookups ──
  const emails = Array.from(new Set(data.map((r) => col(r, "assignee_email", "assignee").toLowerCase()).filter((e) => e.includes("@"))));
  const people = emails.length ? await db.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.orgId, user.orgId), inArray(sql`lower(${users.email})`, emails))) : [];
  const orgLabels = await db.select().from(labels).where(eq(labels.orgId, user.orgId));
  const labelId = async (name: string) => {
    const found = orgLabels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    if (user.role === "viewer") return null;
    const [l] = await db.insert(labels).values({ orgId: user.orgId, name: name.slice(0, 40), color: PROJECT_COLORS[orgLabels.length % PROJECT_COLORS.length]! }).onConflictDoNothing().returning();
    if (l) orgLabels.push(l);
    return l?.id ?? null;
  };
  const statusCache = new Map<string, (typeof workflowStatuses.$inferSelect)[]>();
  const statusFor = async (workflowId: string, raw: string) => {
    if (!statusCache.has(workflowId)) statusCache.set(workflowId, await db.select().from(workflowStatuses).where(eq(workflowStatuses.workflowId, workflowId)).orderBy(workflowStatuses.position));
    const list = statusCache.get(workflowId)!;
    const v = raw.trim().toLowerCase();
    if (!v) return undefined;
    const exact = list.find((s) => s.name.toLowerCase() === v);
    if (exact) return exact;
    const cat = Object.entries(STATUS_ALIASES).find(([, a]) => a.includes(v))?.[0];
    return cat ? list.find((s) => s.category === cat) : undefined;
  };

  // ── Import ──
  let created = 0;
  const access = new Map<string, boolean>();
  for (const [i, r] of data.entries()) {
    const p = plan[i]!;
    if (p.skip) continue;
    const project = byKey.get(p.key);
    if (!project) { errors.push(`Row ${p.row}: no project`); continue; }
    if (!access.has(project.id)) access.set(project.id, await getProjectAccess(user, project.id).then((a) => a.canEdit).catch(() => false));
    if (!access.get(project.id)) { errors.push(`Row ${p.row}: no edit access to ${project.key}`); continue; }
    const typeRaw = col(r, "type", "kind").toLowerCase();
    const type = TASK_TYPES.find((t) => t.value === typeRaw || t.label.toLowerCase() === typeRaw || (typeRaw === "fix" && t.value === "bug") || (typeRaw === "change" && t.value === "improvement"))?.value ?? "task";
    const priority = PRIORITIES.find((x) => x.value === col(r, "priority").toLowerCase())?.value ?? "medium";
    const status = await statusFor(project.workflowId, col(r, "status"));
    const est = Number(col(r, "estimate_hours", "estimate"));
    const labelIds: string[] = [];
    for (const n of col(r, "labels", "label", "tags").split(/[;|]/).map((s) => s.trim()).filter(Boolean)) { const id = await labelId(n); if (id) labelIds.push(id); }
    const res = await createTask({
      projectId: project.id,
      title: p.title.slice(0, 240),
      description: col(r, "description", "details", "notes") || null,
      type,
      priority,
      statusId: status?.id,
      startDate: date(col(r, "start_date")),
      dueDate: date(col(r, "due_date")),
      estimateHours: Number.isFinite(est) && est > 0 ? est : null,
      assigneeId: people.find((x) => x.email.toLowerCase() === col(r, "assignee_email", "assignee").toLowerCase())?.id ?? null,
      labelIds,
      bug: type === "bug" ? { severity: "major" } : undefined,
    });
    if (!res.ok) { errors.push(`Row ${p.row}: ${res.error}`); continue; }
    // Back-date the record so the log keeps its real history.
    const doneOn = date(col(r, "completed_date", "date", "done_date"));
    const createdOn = date(col(r, "created_date", "logged_date")) ?? doneOn;
    const patch: Partial<typeof tasks.$inferInsert> = {};
    if (createdOn) patch.createdAt = new Date(`${createdOn}T09:00:00`);
    if (status?.category === "done") patch.completedAt = doneOn ? new Date(`${doneOn}T17:00:00`) : new Date();
    if (Object.keys(patch).length) await db.update(tasks).set({ ...patch, updatedAt: patch.completedAt ?? patch.createdAt }).where(eq(tasks.id, res.data.id));
    created++;
  }
  for (const pr of summary.byProject) {
    const project = byKey.get(pr.key);
    if (project) await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "project", action: "imported", projectId: project.id, meta: { count: pr.count, file: file.name } });
  }
  return NextResponse.json({ created, skipped: summary.skipped, errors: errors.slice(0, 20), newProjects: summary.newProjects, byProject: summary.byProject });
}
