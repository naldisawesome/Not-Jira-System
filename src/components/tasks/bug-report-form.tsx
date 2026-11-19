"use client";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Bug, Send } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { useApp } from "@/components/shell/app-context";
import { Dropzone } from "@/components/files/dropzone";
import { useUploader } from "@/components/files/use-uploader";
import { PRIORITIES, SEVERITIES } from "@/lib/constants";
import { createTask } from "@/server/actions/tasks";
import { LabelPicker, MemberSelect } from "./pickers";

const schema = z.object({
  projectId: z.string().uuid({ message: "Choose a project" }),
  title: z.string().trim().min(5, "Summarise the bug in a few words").max(240),
  severity: z.enum(["blocker", "major", "minor", "trivial"]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  assigneeId: z.string().nullable().optional(),
  environment: z.string().max(500).optional(),
  description: z.string().max(20000).optional(),
  expected: z.string().trim().min(1, "Describe what should happen").max(5000),
  actual: z.string().trim().min(1, "Describe what actually happens").max(5000),
  steps: z.string().trim().min(1, "Add steps so others can reproduce it").max(10000),
  dueDate: z.string().optional(),
  labelIds: z.array(z.string()),
});
type V = z.infer<typeof schema>;

export function BugReportForm({ defaultProject }: { defaultProject?: string }) {
  const app = useApp();
  const router = useRouter();
  const editable = app.projects.filter((p) => p.canEdit && !p.archived);
  const { register, handleSubmit, control, watch, formState } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { projectId: editable.find((p) => p.id === defaultProject)?.id ?? editable[0]?.id ?? "", title: "", severity: "major", priority: "high", assigneeId: null, environment: "", expected: "", actual: "", steps: "1. \n2. \n3. ", labelIds: [] },
  });
  const projectId = watch("projectId");
  const up = useUploader({ context: "bug", projectId }, { imagesOnly: false });

  if (!editable.length) return <EmptyState icon={Bug} title="No project to report into" description="You need edit access to a project to report bugs. Ask a project manager to add you." />;

  const onSubmit = handleSubmit(async (v) => {
    if (up.busy) return toast.error("Wait for screenshots to finish uploading.");
    const res = await createTask({
      projectId: v.projectId,
      title: v.title,
      type: "bug",
      priority: v.priority,
      assigneeId: v.assigneeId || null,
      description: v.description || null,
      dueDate: v.dueDate || null,
      labelIds: v.labelIds,
      attachmentIds: up.uploaded.map((u) => u.id),
      bug: { severity: v.severity, expected: v.expected, actual: v.actual, steps: v.steps, environment: v.environment || null },
    });
    if (!res.ok) return toast.error(res.error);
    toast.success(`Bug ${res.data.key} reported`);
    router.push(`/tasks/${res.data.id}`);
    router.refresh();
  });
  const e = formState.errors;

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="What went wrong?" />
          <CardContent className="space-y-4">
            <Field label="Summary" error={e.title?.message}><Input {...register("title")} placeholder="Checkout button does nothing on Safari" className="h-10" autoFocus /></Field>
            <Field label="Steps to reproduce" error={e.steps?.message}><Textarea rows={5} {...register("steps")} className="font-mono text-[13px]" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Expected behavior" error={e.expected?.message}><Textarea rows={4} {...register("expected")} placeholder="Order is submitted and a confirmation appears." /></Field>
              <Field label="Actual behavior" error={e.actual?.message}><Textarea rows={4} {...register("actual")} placeholder="Nothing happens; console shows a TypeError." /></Field>
            </div>
            <Field label="Additional context (optional)"><Textarea rows={3} {...register("description")} placeholder="Logs, frequency, affected customers…" /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Screenshots & files" description="PNG, JPG, GIF, WEBP or SVG screenshots, plus logs, PDFs, CSVs or ZIPs." />
          <CardContent>
            <Dropzone items={up.items} onFiles={up.add} onRetry={up.retry} onRemove={up.remove} pasteTarget="document" label="Drop screenshots here, click to browse, or paste from clipboard" />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Details" />
          <CardContent className="space-y-3">
            <Field label="Project" error={e.projectId?.message}><NativeSelect {...register("projectId")}>{editable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
            <Field label="Severity"><NativeSelect {...register("severity")}>{SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</NativeSelect></Field>
            <Field label="Priority"><NativeSelect {...register("priority")}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</NativeSelect></Field>
            <Field label="Assign to developer"><Controller control={control} name="assigneeId" render={({ field }) => <MemberSelect value={field.value} onChange={field.onChange} placeholder="Triage later" />} /></Field>
            <Field label="Environment"><Input {...register("environment")} placeholder="Browser, OS, app version" /></Field>
            <Field label="Fix by"><Input type="date" {...register("dueDate")} /></Field>
            <Field label="Labels"><Controller control={control} name="labelIds" render={({ field }) => <LabelPicker value={field.value} onChange={field.onChange} />} /></Field>
          </CardContent>
        </Card>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} disabled={up.busy}><Send /> Submit bug report</Button>
        <p className="text-center text-[11px] text-muted-foreground">{up.uploaded.length} file(s) attached</p>
      </div>
    </form>
  );
}
