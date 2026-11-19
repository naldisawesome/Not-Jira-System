import type { Priority, Role, TaskType, StatusCategory } from "@/db/schema";

export const PRIORITIES: { value: Priority; label: string; color: string; weight: number }[] = [
  { value: "critical", label: "Critical", color: "#dc2626", weight: 4 },
  { value: "high", label: "High", color: "#ea580c", weight: 3 },
  { value: "medium", label: "Medium", color: "#ca8a04", weight: 2 },
  { value: "low", label: "Low", color: "#64748b", weight: 1 },
];
export const priorityMeta = (p: string) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[2]!;

export const TASK_TYPES: { value: TaskType; label: string; color: string }[] = [
  { value: "task", label: "Task", color: "#0f766e" },
  { value: "bug", label: "Bug", color: "#dc2626" },
  { value: "feature", label: "Feature", color: "#7c3aed" },
  { value: "improvement", label: "Improvement", color: "#2563eb" },
  { value: "story", label: "Story", color: "#16a34a" },
  { value: "epic", label: "Epic", color: "#c026d3" },
  { value: "support", label: "Support Request", color: "#ea580c" },
];
export const typeMeta = (t: string) => TASK_TYPES.find((x) => x.value === t) ?? TASK_TYPES[0]!;

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "super_admin", label: "Super Admin", description: "Full system access, manages users, organization and system settings." },
  { value: "admin", label: "Admin", description: "Manages all projects, team members, workflows and project permissions." },
  { value: "project_manager", label: "Project Manager", description: "Creates projects, assigns tasks, manages members of projects they lead." },
  { value: "member", label: "Team Member", description: "Works on assigned projects: updates tasks, uploads files, comments." },
  { value: "viewer", label: "Viewer", description: "Read-only access to projects they are added to." },
];
export const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

export const STATUS_CATEGORIES: { value: StatusCategory; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

export const DEFAULT_STATUSES: { name: string; category: StatusCategory; color: string }[] = [
  { name: "Backlog", category: "backlog", color: "#94a3b8" },
  { name: "To Do", category: "todo", color: "#64748b" },
  { name: "In Progress", category: "in_progress", color: "#2563eb" },
  { name: "In Review", category: "in_progress", color: "#7c3aed" },
  { name: "Testing", category: "in_progress", color: "#0891b2" },
  { name: "Blocked", category: "in_progress", color: "#dc2626" },
  { name: "Done", category: "done", color: "#16a34a" },
  { name: "Cancelled", category: "cancelled", color: "#a1a1aa" },
];

export const PROJECT_STATUSES = [
  { value: "planning", label: "Planning", color: "#64748b" },
  { value: "active", label: "Active", color: "#0f766e" },
  { value: "on_hold", label: "On hold", color: "#ca8a04" },
  { value: "completed", label: "Completed", color: "#16a34a" },
  { value: "archived", label: "Archived", color: "#a1a1aa" },
] as const;

export const SEVERITIES = [
  { value: "blocker", label: "Blocker", color: "#b91c1c" },
  { value: "major", label: "Major", color: "#ea580c" },
  { value: "minor", label: "Minor", color: "#ca8a04" },
  { value: "trivial", label: "Trivial", color: "#64748b" },
] as const;

export const PROJECT_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#65a30d", "#0891b2", "#b45309"];
