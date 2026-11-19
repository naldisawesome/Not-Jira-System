"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { useApp, useLookups } from "@/components/shell/app-context";
import { MarkdownEditor } from "@/components/files/markdown-editor";
import { Dropzone } from "@/components/files/dropzone";
import { useUploader } from "@/components/files/use-uploader";
import { ImageViewer } from "@/components/files/image-viewer";
import { PRIORITIES, TASK_TYPES, SEVERITIES } from "@/lib/constants";
import { createTask } from "@/server/actions/tasks";
import { LabelPicker, MemberSelect } from "./pickers";

const schema = z
  .object({
    projectId: z.string().uuid({ message: "Choose a project" }),
    title: z.string().trim().min(1, "Give the task a title").max(240),
    description: z.string().max(50000).optional(),
    type: z.string(),
    statusId: z.string().optional(),
    priority: z.string(),
    assigneeId: z.string().nullable().optional(),
    sprintId: z.string().optional(),
    milestoneId: z.string().optional(),
    parentId: z.string().optional(),
    startDate: z.string().optional(),
    dueDate: z.string().optional(),
    estimateHours: z.string().optional().refine((v) => !v || (!isNaN(Number(v)) && Number(v) >= 0), "Must be a positive number"),
    labelIds: z.array(z.string()),
    severity: z.string().optional(),
    expected: z.string().optional(),
    actual: z.string().optional(),
    steps: z.string().optional(),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, { message: "Due date must be after start", path: ["dueDate"] });
type FormValues = z.infer<typeof schema>;

export function QuickCreateDialog() {
  const app = useApp();
  return (
    <>
      <ImageViewer />
      <Dialog open={app.quick.open} onOpenChange={(o) => !o && app.closeQuickCreate()}>
        {app.quick.open && <TaskForm defaults={app.quick.defaults} onDone={app.closeQuickCreate} />}
      </Dialog>
    </>
  );
}

function TaskForm({ defaults, onDone }: { defaults: Record<string, string | undefined>; onDone: () => void }) {
  const app = useApp();
  const { statusesFor } = useLookups();
  const router = useRouter();
  const editable = app.projects.filter((p) => p.canEdit);
  const [createMore, setCreateMore] = useState(false);
  const [extraIds, setExtraIds] = useState<string[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectId: defaults.projectId && editable.some((p) => p.id === defaults.projectId) ? defaults.projectId : editable[0]?.id ?? "",
      title: "",
      description: "",
      type: defaults.type ?? "task",
      statusId: defaults.statusId ?? "",
      priority: "medium",
      assigneeId: defaults.assigneeId ?? null,
      sprintId: defaults.sprintId ?? "",
      milestoneId: "",
      parentId: defaults.parentId ?? "",
      startDate: "",
      dueDate: defaults.dueDate ?? "",
      estimateHours: "",
      labelIds: [],
      severity: "major",
    },
  });
  const { register, control, handleSubmit, watch, setValue, formState, reset } = form;
  const projectId = watch("projectId");
  const type = watch("type");
  const statuses = useMemo(() => statusesFor(projectId), [statusesFor, projectId]);
  const sprints = app.sprints.filter((s) => s.projectId === projectId && s.state !== "completed");
  const milestones = app.milestones.filter((m) => m.projectId === projectId);
  const uploader = useUploader({ context: "task", projectId });

  useEffect(() => {
    if (!statuses.some((s) => s.id === form.getValues("statusId"))) setValue("statusId", "");
    setValue("sprintId", defaults.sprintId && sprints.some((s) => s.id === defaults.sprintId) ? defaults.sprintId : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!editable.length)
    return (
      <DialogContent title="Create task">
        <p className="text-sm text-muted-foreground">You don&apos;t have edit access to any project yet. Ask a project manager to add you to a project.</p>
      </DialogContent>
    );

  const onSubmit = handleSubmit(async (v) => {
    if (uploader.busy) return toast.error("Wait for uploads to finish.");
    const res = await createTask({
      projectId: v.projectId,
      title: v.title,
      description: v.description || null,
      type: v.type as never,
      statusId: v.statusId || undefined,
      priority: v.priority as never,
      assigneeId: v.assigneeId || null,
      sprintId: v.sprintId || null,
      milestoneId: v.milestoneId || null,
      parentId: v.parentId || null,
      startDate: v.startDate || null,
      dueDate: v.dueDate || null,
      estimateHours: v.estimateHours ? Number(v.estimateHours) : null,
      labelIds: v.labelIds,
      attachmentIds: [...uploader.uploaded.map((u) => u.id), ...extraIds],
      bug: v.type === "bug" ? { severity: (v.severity || "major") as never, expected: v.expected || null, actual: v.actual || null, steps: v.steps || null } : undefined,
    });
    if (!res.ok) return toast.error(res.error);
    toast.success(`Created ${res.data.key}`, { action: { label: "Open", onClick: () => router.push(`/tasks/${res.data.id}`) } });
    router.refresh();
    if (createMore) {
      reset({ ...form.getValues(), title: "", description: "", expected: "", actual: "", steps: "" });
      uploader.clear();
      setExtraIds([]);
    } else onDone();
  });

  const e = formState.errors;
  return (
    <DialogContent title={defaults.parentId ? "Add subtask" : "Create task"} description="Tasks get a unique key like WEB-042 automatically." wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Project" error={e.projectId?.message}>
            <NativeSelect {...register("projectId")} disabled={!!defaults.parentId}>
              {editable.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
            </NativeSelect>
          </Field>
          <Field label="Type">
            <NativeSelect {...register("type")}>{TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect {...register("statusId")}>
              <option value="">Default (To Do)</option>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Title" error={e.title?.message}>
          <Input {...register("title")} autoFocus placeholder="What needs to be done?" className="h-10 text-[15px]" />
        </Field>
        <Field label="Description">
          <Controller control={control} name="description" render={({ field }) => (
            <MarkdownEditor value={field.value ?? ""} onChange={field.onChange} minRows={5} upload={{ context: "description", projectId }} onUploaded={(f) => setExtraIds((x) => [...x, f.id])} onSubmitShortcut={onSubmit} />
          )} />
        </Field>
        {type === "bug" && (
          <div className="grid gap-3 rounded-lg border border-destructive/20 bg-destructive/[0.03] p-3 sm:grid-cols-2">
            <Field label="Severity"><NativeSelect {...register("severity")}>{SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</NativeSelect></Field>
            <div className="hidden sm:block" />
            <Field label="Expected behavior"><Textarea rows={2} {...register("expected")} /></Field>
            <Field label="Actual behavior"><Textarea rows={2} {...register("actual")} /></Field>
            <Field label="Steps to reproduce" className="sm:col-span-2"><Textarea rows={3} {...register("steps")} placeholder={"1. Go to…\n2. Click…\n3. See error"} /></Field>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Priority"><NativeSelect {...register("priority")}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</NativeSelect></Field>
          <Field label="Assignee">
            <Controller control={control} name="assigneeId" render={({ field }) => <MemberSelect value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="Estimate (hours)" error={e.estimateHours?.message}><Input type="number" step="0.5" min="0" {...register("estimateHours")} /></Field>
          <Field label="Start date"><Input type="date" {...register("startDate")} /></Field>
          <Field label="Due date" error={e.dueDate?.message}><Input type="date" {...register("dueDate")} /></Field>
          <Field label="Sprint">
            <NativeSelect {...register("sprintId")}><option value="">Backlog (no sprint)</option>{sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state === "active" ? " · active" : ""}</option>)}</NativeSelect>
          </Field>
          <Field label="Milestone">
            <NativeSelect {...register("milestoneId")}><option value="">None</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
          </Field>
          <Field label="Labels" className="sm:col-span-2">
            <Controller control={control} name="labelIds" render={({ field }) => <LabelPicker value={field.value} onChange={field.onChange} />} />
          </Field>
        </div>
        <Field label={type === "bug" ? "Screenshots & attachments" : "Attachments"}>
          <Dropzone items={uploader.items} onFiles={uploader.add} onRetry={uploader.retry} onRemove={uploader.remove} compact={type !== "bug"} />
        </Field>
        <DialogFooter>
          <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={createMore} onCheckedChange={setCreateMore} /> Create another</label>
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={formState.isSubmitting} disabled={uploader.busy}>Create task</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
