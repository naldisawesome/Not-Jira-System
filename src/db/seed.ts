/* Demo data seeder: `npm run db:seed` (idempotent: wipes the demo org first). */
import "./env";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { addDays, format, subDays } from "date-fns";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "./schema";
import { DEFAULT_STATUSES } from "../lib/constants";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: s });
const d = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");
const rand = <T,>(arr: T[], i: number) => arr[i % arr.length]!;

/** Tiny dependency-free PNG encoder used to create realistic "screenshot" attachments. */
function png(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function mockScreenshot(accent: [number, number, number], broken: boolean) {
  return png(640, 400, (x, y) => {
    if (y < 36) return [30, 41, 59];
    if (x < 130) return [241, 245, 249];
    if (y > 70 && y < 110 && x > 160 && x < 600) return accent;
    if (broken && y > 140 && y < 300 && x > 160 && x < 420) return (x + y) % 18 < 9 ? [239, 68, 68] : [254, 226, 226];
    if (y > 140 && y < 300 && x > 160 && x < 600 && ((y - 140) % 40 < 26)) return [226, 232, 240];
    return [255, 255, 255];
  });
}

async function main() {
  const existing = await db.select().from(s.organizations).where(eq(s.organizations.slug, "meridian"));
  if (existing[0]) await db.delete(s.organizations).where(eq(s.organizations.id, existing[0].id));

  const [org] = await db.insert(s.organizations).values({ name: "Meridian Studio", slug: "meridian", settings: { dueSoonDays: 2 } }).returning();
  const orgId = org!.id;
  const [wf] = await db.insert(s.workflows).values({ orgId, name: "Standard workflow", isDefault: true }).returning();
  const statuses = await db.insert(s.workflowStatuses).values(DEFAULT_STATUSES.map((st, i) => ({ workflowId: wf!.id, ...st, position: i }))).returning();
  const st = (name: string) => statuses.find((x) => x.name === name)!;

  const hash = await bcrypt.hash("Password123!", 12);
  const people: { name: string; email: string; role: s.Role; title: string; color: string }[] = [
    { name: "Reynald Arro", email: "admin@tessera.dev", role: "super_admin", title: "Head of Product Systems", color: "#0f766e" },
    { name: "Maya Santos", email: "maya@tessera.dev", role: "admin", title: "Engineering Manager", color: "#7c3aed" },
    { name: "Jonah Reyes", email: "pm@tessera.dev", role: "project_manager", title: "Project Manager", color: "#2563eb" },
    { name: "Aiko Tanaka", email: "dev@tessera.dev", role: "member", title: "Frontend Engineer", color: "#db2777" },
    { name: "Liam Cruz", email: "liam@tessera.dev", role: "member", title: "Backend Engineer", color: "#ea580c" },
    { name: "Priya Nair", email: "priya@tessera.dev", role: "member", title: "QA Engineer", color: "#65a30d" },
    { name: "Ethan Lim", email: "ethan@tessera.dev", role: "member", title: "Product Designer", color: "#0891b2" },
    { name: "Sofia Mendoza", email: "viewer@tessera.dev", role: "viewer", title: "Client Stakeholder", color: "#b45309" },
  ];
  const us = await db
    .insert(s.users)
    .values(people.map((p) => ({ orgId, email: p.email, name: p.name, username: p.email.split("@")[0]!, passwordHash: hash, role: p.role, title: p.title, avatarColor: p.color })))
    .returning();
  await db.insert(s.userSettings).values(us.map((u) => ({ userId: u.id })));
  const U = (email: string) => us.find((u) => u.email === email)!;
  const [admin, maya, jonah, aiko, liam, priya, ethan, sofia] = people.map((p) => U(p.email));

  const [tEng, tDesign] = await db.insert(s.teams).values([
    { orgId, name: "Platform Engineering", description: "Web, mobile and API engineering", color: "#2563eb" },
    { orgId, name: "Design & Quality", description: "Product design and QA", color: "#db2777" },
  ]).returning();
  await db.insert(s.teamMembers).values([
    { teamId: tEng!.id, userId: aiko!.id }, { teamId: tEng!.id, userId: liam!.id }, { teamId: tEng!.id, userId: maya!.id },
    { teamId: tDesign!.id, userId: ethan!.id }, { teamId: tDesign!.id, userId: priya!.id },
  ]);

  const lbl = await db.insert(s.labels).values([
    { orgId, name: "frontend", color: "#2563eb" }, { orgId, name: "backend", color: "#ea580c" }, { orgId, name: "design", color: "#db2777" },
    { orgId, name: "performance", color: "#0891b2" }, { orgId, name: "security", color: "#dc2626" }, { orgId, name: "customer", color: "#65a30d" },
  ]).returning();

  const projectDefs = [
    { key: "WEB", name: "Website Revamp", color: "#0f766e", category: "Marketing", owner: jonah!, start: -40, due: 35, members: [aiko, ethan, priya, liam, sofia, admin], desc: "Rebuild the marketing site on the new design system with faster pages, a CMS-driven blog and a self-serve pricing calculator." },
    { key: "APP", name: "Mobile App 2.0", color: "#7c3aed", category: "Product", owner: maya!, start: -25, due: 60, members: [aiko, liam, priya, ethan, jonah, admin], desc: "Second major release of the customer app: offline mode, push notifications and a redesigned onboarding." },
    { key: "CRM", name: "CRM Integration", color: "#2563eb", category: "Internal", owner: jonah!, start: -10, due: 45, members: [liam, priya], desc: "Sync leads, accounts and deal stages between the product and our CRM, with an audit trail." },
    { key: "OPS", name: "Infrastructure Hardening", color: "#ea580c", category: "Operations", owner: maya!, start: -60, due: -2, members: [liam], desc: "Backups, alerting, secrets rotation and SOC 2 groundwork." },
  ];

  const titles: Record<string, [string, s.TaskType][]> = {
    WEB: [["Design new homepage hero", "story"], ["Pricing calculator component", "feature"], ["Blog index pagination broken on Safari", "bug"], ["Migrate content to headless CMS", "task"], ["Lighthouse score below 80 on mobile", "bug"], ["Newsletter signup with double opt-in", "feature"], ["Accessibility audit fixes", "improvement"], ["Footer links 404 after deploy", "bug"], ["Case studies template", "story"], ["Image CDN and responsive srcset", "improvement"], ["Analytics consent banner", "feature"], ["Contact form spam protection", "task"], ["Website launch", "epic"], ["Redirect map for legacy URLs", "task"], ["Dark mode for docs pages", "feature"]],
    APP: [["Offline mode sync engine", "epic"], ["Push notification service", "feature"], ["Onboarding redesign", "story"], ["Crash on Android 14 when opening camera", "bug"], ["Login with Apple", "feature"], ["Reduce cold start time", "improvement"], ["Biometric unlock", "feature"], ["Settings screen layout overlaps on iPhone SE", "bug"], ["In-app feedback form", "support"], ["Deep links from email", "task"], ["Release 2.0 to TestFlight", "task"], ["Localization: Filipino & Japanese", "story"]],
    CRM: [["Map lead fields to CRM objects", "task"], ["OAuth connection flow", "feature"], ["Webhook receiver for deal updates", "feature"], ["Duplicate contacts created on sync", "bug"], ["Sync audit log", "story"], ["Rate limit handling and retries", "improvement"], ["Admin settings page", "task"], ["Customer asked for field-level mapping", "support"]],
    OPS: [["Nightly database backups", "task"], ["PagerDuty alert routing", "task"], ["Rotate production secrets", "task"], ["Disk usage alert misfires", "bug"], ["Document incident runbook", "story"]],
  };
  const statusCycle = ["Done", "Done", "In Progress", "To Do", "In Review", "Backlog", "Testing", "Done", "Blocked", "To Do", "In Progress", "Done", "Backlog", "Cancelled", "To Do"];
  const prioCycle: s.Priority[] = ["high", "medium", "critical", "low", "medium", "high", "medium", "low"];

  const storageRoot = path.resolve(process.cwd(), "storage");
  let commentCount = 0;

  for (const [pi, pd] of projectDefs.entries()) {
    const [p] = await db
      .insert(s.projects)
      .values({ orgId, workflowId: wf!.id, phase: ({ WEB: "staging", APP: "development", CRM: "testing", OPS: "production" } as Record<string, string>)[pd.key] ?? "development", name: pd.name, key: pd.key, description: pd.desc, color: pd.color, category: pd.category, ownerId: pd.owner.id, status: pd.key === "OPS" ? "on_hold" : "active", priority: pi === 0 ? "high" : "medium", startDate: d(pd.start), dueDate: d(pd.due), taskCounter: titles[pd.key]!.length })
      .returning();
    const memberIds = Array.from(new Set([pd.owner.id, ...pd.members.map((m) => m!.id)]));
    await db.insert(s.projectMembers).values(memberIds.map((userId) => ({ projectId: p!.id, userId, role: userId === pd.owner.id ? ("lead" as const) : userId === sofia!.id ? ("viewer" as const) : ("member" as const) })));

    const [sp1, sp2] = await db.insert(s.sprints).values([
      { orgId, projectId: p!.id, name: `${pd.key} Sprint 7`, goal: "Ship the core flows", state: "completed", startDate: d(-28), endDate: d(-15), completedAt: subDays(new Date(), 15) },
      { orgId, projectId: p!.id, name: `${pd.key} Sprint 8`, goal: "Polish, performance and QA sign-off", state: "active", startDate: d(-14), endDate: d(0 + 4) },
    ]).returning();
    await db.insert(s.sprints).values({ orgId, projectId: p!.id, name: `${pd.key} Sprint 9`, state: "planned", startDate: d(5), endDate: d(18) });
    const [m1, m2] = await db.insert(s.milestones).values([
      { orgId, projectId: p!.id, name: "Beta", targetDate: d(pd.start + 30), completedAt: pd.start + 30 < 0 ? new Date() : null },
      { orgId, projectId: p!.id, name: "Launch", targetDate: d(pd.due) },
    ]).returning();

    const assignable = memberIds.filter((id) => id !== sofia!.id);
    const created: s.Task[] = [];
    for (const [i, [title, type]] of titles[pd.key]!.entries()) {
      const status = st(rand(statusCycle, i + pi));
      const startOff = pd.start + i * 3;
      let dueOff = startOff + 4 + (i % 5) * 2;
      if (status.category !== "done" && status.category !== "cancelled" && dueOff < 0 && i % 4 !== 0) dueOff = 2 + ((i * 5) % 24);
      const done = status.category === "done";
      const [t] = await db
        .insert(s.tasks)
        .values({
          orgId, projectId: p!.id, number: i + 1, title, type, statusId: status.id, priority: rand(prioCycle, i + pi),
          assigneeId: i % 7 === 6 ? null : rand(assignable, i + pi), reporterId: rand([pd.owner.id, priya!.id, admin!.id], i),
          sprintId: i % 3 === 0 && done ? sp1!.id : i % 3 !== 2 ? sp2!.id : null, milestoneId: i % 2 ? m2!.id : m1!.id,
          startDate: d(startOff), dueDate: d(dueOff), estimateHours: [2, 4, 6, 8, 12, 16][i % 6],
          position: (i + 1) * 1000,
          completedAt: done ? subDays(new Date(), (i * 3) % 50) : null,
          description: type === "bug" ? null : `## Goal\n${title} for **${pd.name}**.\n\n- Align with design specs\n- Cover edge cases and empty states\n- Add tests where practical\n\n> Ping @${rand(["aiko", "liam", "ethan"], i)} for review once ready.`,
          bug: type === "bug" ? { severity: rand(["blocker", "major", "minor"] as const, i), expected: "The page renders correctly and all links work.", actual: `${title}. Users see a broken layout or error state.`, steps: "1. Open the page on the affected device\n2. Navigate to the section\n3. Observe the issue", environment: rand(["Safari 18 / macOS", "Android 14 / Pixel 8", "Chrome 131 / Windows 11"], i) } : null,
          createdAt: subDays(new Date(), Math.max(1, -startOff + 3)),
          updatedAt: subDays(new Date(), i % 6),
        })
        .returning();
      created.push(t!);
      await db.insert(s.taskWatchers).values([{ taskId: t!.id, userId: t!.reporterId! }]).onConflictDoNothing();
      await db.insert(s.taskLabels).values([{ taskId: t!.id, labelId: rand(lbl, i).id }, ...(i % 3 === 0 ? [{ taskId: t!.id, labelId: rand(lbl, i + 2).id }] : [])]).onConflictDoNothing();
      if (i % 2 === 0) await db.insert(s.checklistItems).values([{ taskId: t!.id, text: "Write acceptance criteria", done: true, position: 1 }, { taskId: t!.id, text: "Implementation", done: done, position: 2 }, { taskId: t!.id, text: "QA sign-off", done: false, position: 3 }]);
      if (status.category !== "backlog" && status.category !== "todo" && t!.assigneeId)
        await db.insert(s.timeLogs).values({ orgId, taskId: t!.id, userId: t!.assigneeId, hours: 1.5 + (i % 4), loggedOn: d(-(i % 10)), note: "Implementation" });
      await db.insert(s.activityLogs).values({ orgId, actorId: t!.reporterId, projectId: p!.id, taskId: t!.id, entity: "task", action: "created", meta: { title }, createdAt: t!.createdAt });
      if (status.name !== "To Do" && status.name !== "Backlog")
        await db.insert(s.activityLogs).values({ orgId, actorId: t!.assigneeId ?? admin!.id, projectId: p!.id, taskId: t!.id, entity: "task", action: "status_changed", meta: { field: "status", from: "To Do", to: status.name }, createdAt: subDays(new Date(), i % 6) });
      if (i % 3 === 1) {
        const [c] = await db.insert(s.comments).values({ orgId, taskId: t!.id, authorId: rand(assignable, i + 1), body: `Picked this up — @${rand(["jonah", "maya", "priya"], i)} can you confirm the scope before I start?`, createdAt: subDays(new Date(), i % 5) }).returning();
        await db.insert(s.comments).values({ orgId, taskId: t!.id, authorId: pd.owner.id, parentId: c!.id, body: "Confirmed. Keep it to the MVP described above.", createdAt: subDays(new Date(), Math.max(0, (i % 5) - 1)) });
        commentCount += 2;
      }
      if (type === "bug") {
        const buf = mockScreenshot(pd.key === "APP" ? [124, 58, 237] : [15, 118, 110], true);
        const key = `${orgId}/${p!.id}/${randomUUID()}.png`;
        fs.mkdirSync(path.dirname(path.join(storageRoot, key)), { recursive: true });
        fs.writeFileSync(path.join(storageRoot, key), buf);
        await db.insert(s.attachments).values({ orgId, projectId: p!.id, taskId: t!.id, context: "bug", uploadedById: priya!.id, fileName: `screenshot-${pd.key.toLowerCase()}-${i + 1}.png`, mimeType: "image/png", sizeBytes: buf.length, storageKey: key, width: 640, height: 400 });
      }
    }
    // A few subtasks and dependencies
    if (created.length > 4) {
      await db.update(s.tasks).set({ parentId: created[0]!.id }).where(eq(s.tasks.id, created[3]!.id));
      await db.insert(s.taskDependencies).values([{ taskId: created[1]!.id, dependsOnId: created[0]!.id }, { taskId: created[4]!.id, dependsOnId: created[1]!.id }]);
    }
    // Project brief attachment
    const brief = Buffer.from(`${pd.name} — project brief\n\n${pd.desc}\n`);
    const bkey = `${orgId}/${p!.id}/${randomUUID()}.txt`;
    fs.writeFileSync(path.join(storageRoot, bkey), brief);
    await db.insert(s.attachments).values({ orgId, projectId: p!.id, context: "project", uploadedById: pd.owner.id, fileName: `${pd.key.toLowerCase()}-brief.txt`, mimeType: "text/plain", sizeBytes: brief.length, storageKey: bkey });
    await db.insert(s.activityLogs).values({ orgId, actorId: pd.owner.id, projectId: p!.id, entity: "project", action: "created", meta: { name: pd.name }, createdAt: subDays(new Date(), -pd.start) });
  }

  await db.insert(s.notifications).values([
    { orgId, userId: admin!.id, actorId: priya!.id, type: "mention", title: "Priya Nair mentioned you on WEB-003", body: "@admin can we prioritise this before launch?", link: "/my-tasks" },
    { orgId, userId: admin!.id, actorId: jonah!.id, type: "project_created", title: "Jonah Reyes created project CRM Integration", link: "/projects" },
    { orgId, userId: admin!.id, actorId: maya!.id, type: "assigned", title: "Maya Santos assigned you APP-006", body: "Reduce cold start time", link: "/my-tasks", readAt: new Date() },
  ]);
  await db.insert(s.savedFilters).values({ orgId, userId: admin!.id, name: "Critical bugs", query: { type: "bug", priority: "critical" } });

  console.log(`✓ seeded Meridian Studio: ${us.length} users, ${projectDefs.length} projects, ${commentCount} comments`);
  console.log("  Sign in with admin@tessera.dev / Password123! (also pm@, dev@, viewer@)");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
