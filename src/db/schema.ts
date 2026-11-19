import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  real,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ───────────────────────── Enums ───────────────────────── */

export const userRole = pgEnum("user_role", ["super_admin", "admin", "project_manager", "member", "viewer"]);
export const projectStatus = pgEnum("project_status", ["planning", "active", "on_hold", "completed", "archived"]);
export const priority = pgEnum("priority", ["critical", "high", "medium", "low"]);
export const taskType = pgEnum("task_type", ["task", "bug", "feature", "improvement", "story", "epic", "support"]);
export const statusCategory = pgEnum("status_category", ["backlog", "todo", "in_progress", "done", "cancelled"]);
export const severity = pgEnum("severity", ["blocker", "major", "minor", "trivial"]);
export const sprintState = pgEnum("sprint_state", ["planned", "active", "completed"]);
export const projectMemberRole = pgEnum("project_member_role", ["lead", "member", "viewer"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const orgRef = () =>
  uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

/* ───────────────────────── Tenancy & users ───────────────────────── */

export const organizations = pgTable("organizations", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  logoAttachmentId: uuid("logo_attachment_id"),
  settings: jsonb("settings").$type<{ weekStartsOn?: 0 | 1; dueSoonDays?: number }>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    orgId: orgRef(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    username: varchar("username", { length: 40 }).notNull(),
    passwordHash: text("password_hash"),
    role: userRole("role").notNull().default("member"),
    title: varchar("title", { length: 120 }),
    avatarColor: varchar("avatar_color", { length: 16 }).notNull().default("#0f766e"),
    isActive: boolean("is_active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    emailUq: uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    usernameUq: uniqueIndex("users_org_username_uq").on(t.orgId, t.username),
    orgIdx: index("users_org_idx").on(t.orgId),
  }),
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: orgRef(),
    email: varchar("email", { length: 255 }).notNull(),
    role: userRole("role").notNull().default("member"),
    token: varchar("token", { length: 80 }).notNull().unique(),
    invitedById: uuid("invited_by_id").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ orgIdx: index("invitations_org_idx").on(t.orgId) }),
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: varchar("theme", { length: 10 }).notNull().default("system"),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  defaultView: varchar("default_view", { length: 20 }).notNull().default("board"),
  updatedAt: updatedAt(),
});

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    orgId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    prefix: varchar("prefix", { length: 12 }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ userIdx: index("api_tokens_user_idx").on(t.userId) }),
);

/* ───────────────────────── Teams ───────────────────────── */

export const teams = pgTable(
  "teams",
  {
    id: id(),
    orgId: orgRef(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    color: varchar("color", { length: 16 }).notNull().default("#0f766e"),
    createdAt: createdAt(),
  },
  (t) => ({ orgIdx: index("teams_org_idx").on(t.orgId) }),
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.teamId, t.userId] }) }),
);

/* ───────────────────────── Workflows ───────────────────────── */

export const workflows = pgTable(
  "workflows",
  {
    id: id(),
    orgId: orgRef(),
    name: varchar("name", { length: 80 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => ({ orgIdx: index("workflows_org_idx").on(t.orgId) }),
);

export const workflowStatuses = pgTable(
  "workflow_statuses",
  {
    id: id(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 40 }).notNull(),
    category: statusCategory("category").notNull(),
    color: varchar("color", { length: 16 }).notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => ({ wfIdx: index("workflow_statuses_wf_idx").on(t.workflowId, t.position) }),
);

/* ───────────────────────── Projects ───────────────────────── */

export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: orgRef(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    key: varchar("key", { length: 10 }).notNull(),
    description: text("description"),
    coverAttachmentId: uuid("cover_attachment_id"),
    color: varchar("color", { length: 16 }).notNull().default("#0f766e"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    category: varchar("category", { length: 60 }),
    status: projectStatus("status").notNull().default("active"),
    // Development phase / environment tag (Planning, Development, Testing, Staging, Production, Maintenance, Retired)
    phase: varchar("phase", { length: 20 }).notNull().default("development"),
    priority: priority("priority").notNull().default("medium"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    taskCounter: integer("task_counter").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    keyUq: uniqueIndex("projects_org_key_uq").on(t.orgId, t.key),
    orgIdx: index("projects_org_idx").on(t.orgId, t.status),
  }),
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectMemberRole("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.projectId, t.userId] }), userIdx: index("project_members_user_idx").on(t.userId) }),
);

/* ───────────────────────── Sprints & milestones ───────────────────────── */

export const sprints = pgTable(
  "sprints",
  {
    id: id(),
    orgId: orgRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    goal: text("goal"),
    state: sprintState("state").notNull().default("planned"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ projectIdx: index("sprints_project_idx").on(t.projectId) }),
);

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    orgId: orgRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    targetDate: date("target_date").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ projectIdx: index("milestones_project_idx").on(t.projectId) }),
);

/* ───────────────────────── Tasks ───────────────────────── */

export type BugDetails = {
  severity?: (typeof severity.enumValues)[number];
  expected?: string | null;
  actual?: string | null;
  steps?: string | null;
  environment?: string | null;
};

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    orgId: orgRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    type: taskType("type").notNull().default("task"),
    statusId: uuid("status_id")
      .notNull()
      .references(() => workflowStatuses.id, { onDelete: "restrict" }),
    priority: priority("priority").notNull().default("medium"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    sprintId: uuid("sprint_id").references(() => sprints.id, { onDelete: "set null" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    estimateHours: real("estimate_hours"),
    position: real("position").notNull().default(0),
    bug: jsonb("bug").$type<BugDetails>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dueReminderSentAt: timestamp("due_reminder_sent_at", { withTimezone: true }),
    overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    numberUq: uniqueIndex("tasks_project_number_uq").on(t.projectId, t.number),
    orgIdx: index("tasks_org_idx").on(t.orgId),
    projectStatusIdx: index("tasks_project_status_idx").on(t.projectId, t.statusId, t.position),
    assigneeIdx: index("tasks_assignee_idx").on(t.assigneeId),
    reporterIdx: index("tasks_reporter_idx").on(t.reporterId),
    dueIdx: index("tasks_due_idx").on(t.orgId, t.dueDate),
    parentIdx: index("tasks_parent_idx").on(t.parentId),
    sprintIdx: index("tasks_sprint_idx").on(t.sprintId),
  }),
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    // "taskId is blocked by dependsOnId"
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.taskId, t.dependsOnId] }) }),
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    text: varchar("text", { length: 300 }).notNull(),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({ taskIdx: index("checklist_task_idx").on(t.taskId) }),
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    orgId: orgRef(),
    name: varchar("name", { length: 40 }).notNull(),
    color: varchar("color", { length: 16 }).notNull(),
  },
  (t) => ({ nameUq: uniqueIndex("labels_org_name_uq").on(t.orgId, t.name) }),
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.taskId, t.labelId] }), labelIdx: index("task_labels_label_idx").on(t.labelId) }),
);

export const taskWatchers = pgTable(
  "task_watchers",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.taskId, t.userId] }) }),
);

export const comments = pgTable(
  "task_comments",
  {
    id: id(),
    orgId: orgRef(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ taskIdx: index("comments_task_idx").on(t.taskId, t.createdAt) }),
);

export const timeLogs = pgTable(
  "time_logs",
  {
    id: id(),
    orgId: orgRef(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    hours: real("hours").notNull(),
    note: varchar("note", { length: 300 }),
    loggedOn: date("logged_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ taskIdx: index("time_logs_task_idx").on(t.taskId), userIdx: index("time_logs_user_idx").on(t.userId, t.loggedOn) }),
);

/* ───────────────────────── Attachments ─────────────────────────
 * One metadata table for every uploaded file. Binary content lives in object
 * storage (S3-compatible or local disk in dev) under `storageKey`; the row only
 * stores metadata and the scope used for authorization checks.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    orgId: orgRef(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    context: varchar("context", { length: 20 }).notNull().default("task"), // task | comment | description | project | cover | bug
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: createdAt(),
  },
  (t) => ({
    taskIdx: index("attachments_task_idx").on(t.taskId),
    projectIdx: index("attachments_project_idx").on(t.projectId),
    commentIdx: index("attachments_comment_idx").on(t.commentId),
  }),
);

/* ───────────────────────── Notifications & audit ───────────────────────── */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    link: varchar("link", { length: 255 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ userIdx: index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt) }),
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: id(),
    orgId: orgRef(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    entity: varchar("entity", { length: 30 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => ({
    orgIdx: index("activity_org_idx").on(t.orgId, t.createdAt),
    taskIdx: index("activity_task_idx").on(t.taskId, t.createdAt),
    projectIdx: index("activity_project_idx").on(t.projectId, t.createdAt),
  }),
);

export const savedFilters = pgTable(
  "saved_filters",
  {
    id: id(),
    orgId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    query: jsonb("query").$type<Record<string, string>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ userIdx: index("saved_filters_user_idx").on(t.userId) }),
);

/* ───────────────────────── Relations ───────────────────────── */

export const usersRelations = relations(users, ({ one }) => ({
  org: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  workflow: one(workflows, { fields: [projects.workflowId], references: [workflows.id] }),
  members: many(projectMembers),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const workflowsRelations = relations(workflows, ({ many }) => ({
  statuses: many(workflowStatuses),
}));

export const workflowStatusesRelations = relations(workflowStatuses, ({ one }) => ({
  workflow: one(workflows, { fields: [workflowStatuses.workflowId], references: [workflows.id] }),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type WorkflowStatus = typeof workflowStatuses.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Role = (typeof userRole.enumValues)[number];
export type Priority = (typeof priority.enumValues)[number];
export type TaskType = (typeof taskType.enumValues)[number];
export type StatusCategory = (typeof statusCategory.enumValues)[number];
