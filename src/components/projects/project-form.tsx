"use client";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/misc";
import { MarkdownEditor } from "@/components/files/markdown-editor";
import { useApp } from "@/components/shell/app-context";
import { PRIORITIES, PROJECT_COLORS, PROJECT_STATUSES } from "@/lib/constants";
import { createProject, updateProject } from "@/server/actions/projects";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters").max(120),
    key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 letters/numbers, starting with a letter"),
    description: z.string().max(20000).optional(),
    category: z.string().max(60).optional(),
    color: z.string(),
    status: z.enum(["planning", "active", "on_hold", "completed"]),
    priority: z.enum(["critical", "high", "medium", "low"]),
    ownerId: z.string().optional(),
    startDate: z.string().optional(),
    dueDate: z.string().optional(),
    memberIds: z.array(z.string()),
    workflowId: z.string().optional(),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, { message: "Due date must be after start date", path: ["dueDate"] });
export type ProjectFormValues = z.infer<typeof schema>;

export function ProjectForm({ initial, projectId, workflows, onDone }: { initial?: Partial<ProjectFormValues>; projectId?: string; workflows: { id: string; name: string; isDefault: boolean }[]; onDone?: () => void }) {
  const app = useApp();
  const router = useRouter();
  const { register, handleSubmit, control, watch, setValue, formState } = useForm<ProjectFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", key: "", description: "", category: "", color: PROJECT_COLORS[0], status: "active", priority: "medium", ownerId: app.me.id, startDate: "", dueDate: "", memberIds: [], workflowId: workflows.find((w) => w.isDefault)?.id, ...initial },
  });
  const color = watch("color");
  const memberIds = watch("memberIds");
  const editing = !!projectId;

  const onSubmit = handleSubmit(async (v) => {
    const res = editing
      ? await updateProject({ id: projectId!, data: { name: v.name, description: v.description || null, category: v.category || null, color: v.color, status: v.status, priority: v.priority, ownerId: v.ownerId || null, startDate: v.startDate || null, dueDate: v.dueDate || null, workflowId: v.workflowId } })
      : await createProject({ ...v, description: v.description || null, category: v.category || null, ownerId: v.ownerId || null, startDate: v.startDate || null, dueDate: v.dueDate || null });
    if (!res.ok) return toast.error(res.error);
    toast.success(editing ? "Project updated" : "Project created");
    router.refresh();
    onDone?.();
    if (!editing) router.push(`/projects/${res.data.id}`);
  });
  const e = formState.errors;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Project name" error={e.name?.message}>
          <Input {...register("name")} autoFocus placeholder="Website Revamp" onChange={(ev) => {
            register("name").onChange(ev);
            if (!editing && !formState.dirtyFields.key) setValue("key", ev.target.value.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 4).toUpperCase() || "");
          }} />
        </Field>
        <Field label="Key" error={e.key?.message} hint={editing ? "Keys can't change" : "Used in task IDs"}>
          <Input {...register("key")} disabled={editing} className="font-mono uppercase" placeholder="WEB" />
        </Field>
      </div>
      <Field label="Description">
        <Controller control={control} name="description" render={({ field }) => <MarkdownEditor value={field.value ?? ""} onChange={field.onChange} minRows={4} upload={projectId ? { context: "project", projectId } : undefined} placeholder="Goals, scope and links. Images can be added after the project is created." />} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Status"><NativeSelect {...register("status")}>{PROJECT_STATUSES.filter((s) => s.value !== "archived").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</NativeSelect></Field>
        <Field label="Priority"><NativeSelect {...register("priority")}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</NativeSelect></Field>
        <Field label="Category"><Input {...register("category")} placeholder="Marketing, Product…" /></Field>
        <Field label="Owner"><NativeSelect {...register("ownerId")}>{app.members.filter((m) => m.isActive && m.role !== "viewer").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field>
        <Field label="Start date"><Input type="date" {...register("startDate")} /></Field>
        <Field label="Due date" error={e.dueDate?.message}><Input type="date" {...register("dueDate")} /></Field>
        <Field label="Workflow" className="sm:col-span-2" hint={editing ? "Changing workflow remaps task statuses by category" : undefined}>
          <NativeSelect {...register("workflowId")}>{workflows.map((w) => <option key={w.id} value={w.id}>{w.name}{w.isDefault ? " (default)" : ""}</option>)}</NativeSelect>
        </Field>
        <Field label="Color">
          <div className="flex h-9 items-center gap-1.5">
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setValue("color", c, { shouldDirty: true })} className={cn("flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition", color === c && "ring-2 ring-foreground/40")} style={{ background: c }} aria-label={`Color ${c}`}>
                {color === c && <Check className="size-3 text-white" />}
              </button>
            ))}
          </div>
        </Field>
      </div>
      {!editing && (
        <Field label="Members" hint="Owner and you are added automatically. Manage roles later in project settings.">
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
            {app.members.filter((m) => m.isActive && m.id !== app.me.id).map((m) => {
              const on = memberIds.includes(m.id);
              return (
                <button key={m.id} type="button" onClick={() => setValue("memberIds", on ? memberIds.filter((x) => x !== m.id) : [...memberIds, m.id])} className={cn("flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition", on ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}>
                  <Avatar name={m.name} color={m.avatarColor} size={20} /> {m.name}
                </button>
              );
            })}
          </div>
        </Field>
      )}
      <DialogFooter>
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>}
        <Button type="submit" loading={formState.isSubmitting}>{editing ? "Save changes" : "Create project"}</Button>
      </DialogFooter>
    </form>
  );
}
