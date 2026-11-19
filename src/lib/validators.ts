import { z } from "zod";
import { PRIORITIES, TASK_TYPES, ROLES, SEVERITIES, PROJECT_PHASES } from "./constants";

const enumOf = <T extends { value: string }>(arr: readonly T[]) => z.enum(arr.map((a) => a.value) as [T["value"], ...T["value"][]]);

export const zPriority = enumOf(PRIORITIES);
export const zTaskType = enumOf(TASK_TYPES);
export const zRole = enumOf(ROLES);
export const zSeverity = enumOf(SEVERITIES);
export const zPhase = enumOf(PROJECT_PHASES);
export const zId = z.string().uuid();
export const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

export const projectSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(120),
    key: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 letters/numbers, starting with a letter"),
    description: optText(20000),
    category: optText(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f766e"),
    status: z.enum(["planning", "active", "on_hold", "completed"]).default("active"),
    priority: zPriority.default("medium"),
    phase: zPhase.default("development"),
    ownerId: zId.nullable().optional(),
    startDate: zDate,
    dueDate: zDate,
    memberIds: z.array(zId).max(200).default([]),
    workflowId: zId.optional(),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, { message: "Due date must be after start date", path: ["dueDate"] });

export const bugSchema = z.object({
  severity: zSeverity.default("major"),
  expected: optText(5000),
  actual: optText(5000),
  steps: optText(10000),
  environment: optText(500),
});

export const taskCreateSchema = z.object({
  projectId: zId,
  title: z.string().trim().min(1, "Title is required").max(240),
  description: optText(50000),
  type: zTaskType.default("task"),
  statusId: zId.optional(),
  priority: zPriority.default("medium"),
  assigneeId: zId.nullable().optional(),
  parentId: zId.nullable().optional(),
  sprintId: zId.nullable().optional(),
  milestoneId: zId.nullable().optional(),
  startDate: zDate,
  dueDate: zDate,
  estimateHours: z.coerce.number().min(0).max(10000).nullable().optional(),
  labelIds: z.array(zId).max(30).default([]),
  attachmentIds: z.array(zId).max(50).default([]),
  bug: bugSchema.optional(),
});

export const taskPatchSchema = z.object({
  id: zId,
  patch: z
    .object({
      title: z.string().trim().min(1).max(240),
      description: optText(50000),
      type: zTaskType,
      statusId: zId,
      priority: zPriority,
      assigneeId: zId.nullable(),
      reporterId: zId.nullable(),
      parentId: zId.nullable(),
      sprintId: zId.nullable(),
      milestoneId: zId.nullable(),
      startDate: zDate,
      dueDate: zDate,
      estimateHours: z.coerce.number().min(0).max(10000).nullable(),
      bug: bugSchema.nullable(),
    })
    .partial(),
});

export const commentSchema = z.object({
  taskId: zId,
  body: z.string().trim().min(1, "Comment can't be empty").max(20000),
  parentId: zId.nullable().optional(),
  attachmentIds: z.array(zId).max(20).default([]),
});
