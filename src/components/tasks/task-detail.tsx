"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight, Copy, Eye, EyeOff, Link2, MoreHorizontal, Pencil, Plus, Trash2, Clock, ListChecks, ListTree, GitBranch, Paperclip,
  MessageSquare, History, Timer, Reply, X, Search, Bug, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Avatar, AvatarStack, Badge, Checkbox, Progress, Tip } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { useApp } from "@/components/shell/app-context";
import { MarkdownEditor } from "@/components/files/markdown-editor";
import { Markdown } from "@/components/files/markdown";
import { AttachmentGrid, type AttachmentT } from "@/components/files/attachment-list";
import { FileUploaderPanel } from "@/components/files/file-uploader-panel";
import { Dropzone } from "@/components/files/dropzone";
import { useUploader } from "@/components/files/use-uploader";
import { ActivityFeedClient, type HistoryItem } from "./history";
import { LabelPicker, MemberSelect } from "./pickers";
import { PriorityIcon, StatusIcon, TypeIcon, StatusPill } from "./badges";
import { PRIORITIES, TASK_TYPES, SEVERITIES } from "@/lib/constants";
import { addChecklistItem, addDependency, cloneTask, deleteTasks, deleteTimeLog, logTime, removeDependency, setTaskLabels, toggleWatch, updateChecklistItem, updateTask } from "@/server/actions/tasks";
import { addComment, deleteComment, editComment } from "@/server/actions/collab";
import { cn, fmtDate, isOverdue, taskKey, timeAgo, todayISO } from "@/lib/utils";
import type { TaskRow } from "@/server/queries";
import type { BugDetails } from "@/db/schema";

type Comment = { id: string; body: string; parentId: string | null; createdAt: Date; editedAt: Date | null; authorId: string | null; authorName: string | null; authorColor: string | null; authorUsername: string | null; files: AttachmentT[] };
type Props = {
  task: TaskRow & { description: string | null; bug: BugDetails | null; key: string };
  project: { id: string; name: string; key: string; color: string };
  statuses: { id: string; name: string; color: string; category: string }[];
  sprints: { id: string; name: string; state: string }[];
  milestones: { id: string; name: string }[];
  memberIds: string[];
  labelIds: string[];
  subtasks: TaskRow[];
  parent: TaskRow | null;
  blockedBy: TaskRow[];
  blocking: TaskRow[];
  checklist: { id: string; text: string; done: boolean }[];
  comments: Comment[];
  files: AttachmentT[];
  history: HistoryItem[];
  timeLogs: { id: string; hours: number; note: string | null; loggedOn: string; userId: string | null; userName: string | null; userColor: string | null }[];
  watchers: { id: string; name: string; avatarColor: string }[];
  perms: { canEdit: boolean; canManage: boolean; canDelete: boolean };
};

export function TaskDetail(props: Props) {
  const { task, project, perms } = props;
  const app = useApp();
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(task.description ?? "");
  const watching = props.watchers.some((w) => w.id === app.me.id);
  useEffect(() => { setTitle(task.title); setDesc(task.description ?? ""); }, [task.title, task.description]);

  async function patch(p: Record<string, unknown>, msg?: string) {
    const r = await updateTask({ id: task.id, patch: p });
    if (!r.ok) { toast.error(r.error); return false; }
    if (msg) toast.success(msg);
    router.refresh();
    return true;
  }
  const saveTitle = () => title.trim() && title.trim() !== task.title ? patch({ title: title.trim() }) : setTitle(task.title);
  const logged = props.timeLogs.reduce((a, l) => a + l.hours, 0);
  const images = props.files.filter((f) => f.mimeType.startsWith("image/"));

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in">
      <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground">Projects</Link><ChevronRight className="size-3" />
        <Link href={`/projects/${project.id}`} className="hover:text-foreground">{project.name}</Link><ChevronRight className="size-3" />
        {props.parent && <><Link href={`/tasks/${props.parent.id}`} className="hover:text-foreground">{taskKey(props.parent.projectKey, props.parent.number)}</Link><ChevronRight className="size-3" /></>}
        <span className="flex items-center gap-1 font-mono text-foreground"><TypeIcon type={task.type} />{task.key}</span>
        <div className="ml-auto flex items-center gap-1">
          <Tip content={watching ? "Stop watching" : "Watch for updates"}>
            <Button variant="ghost" size="sm" onClick={async () => { const r = await toggleWatch({ taskId: task.id }); if (!r.ok) toast.error(r.error); else { toast.success(r.data.watching ? "Watching this task" : "Stopped watching"); router.refresh(); } }}>
              {watching ? <EyeOff /> : <Eye />} {watching ? "Unwatch" : "Watch"} <span className="tabular-nums text-muted-foreground">{props.watchers.length}</span>
            </Button>
          </Tip>
          <Tip content="Copy link"><Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }}><Link2 /></Button></Tip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              {perms.canEdit && <DropdownMenuItem onSelect={async () => { const r = await cloneTask({ id: task.id }); if (!r.ok) toast.error(r.error); else { toast.success(`Cloned as ${r.data.key}`); router.push(`/tasks/${r.data.id}`); } }}><Copy /> Clone task</DropdownMenuItem>}
              {perms.canEdit && <DropdownMenuItem onSelect={() => app.openQuickCreate({ projectId: project.id, parentId: task.id })}><ListTree /> Add subtask</DropdownMenuItem>}
              {perms.canDelete && <><DropdownMenuSeparator /><DropdownMenuItem destructive onSelect={async () => {
                if (!confirm(`Delete ${task.key}? Subtasks, comments and files will be removed.`)) return;
                const r = await deleteTasks({ ids: [task.id] });
                if (!r.ok) return toast.error(r.error);
                toast.success(`${task.key} deleted`);
                router.push(`/projects/${project.id}/list`);
              }}><Trash2 /> Delete task</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <div>
            {perms.canEdit ? (
              <Textarea value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } if (e.key === "Escape") setTitle(task.title); }} rows={1} className="min-h-0 resize-none border-transparent bg-transparent px-0 py-1 text-2xl font-semibold leading-tight tracking-tight shadow-none hover:border-input hover:px-2 focus-visible:px-2" aria-label="Title" />
            ) : <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusPill name={task.statusName} color={task.statusColor} category={task.statusCategory} />
              <span suppressHydrationWarning>Created {timeAgo(task.createdAt)}</span>·<span suppressHydrationWarning>Updated {timeAgo(task.updatedAt)}</span>
            </div>
          </div>

          <section>
            <SectionTitle icon={Pencil} title="Description" action={perms.canEdit && !editingDesc && <Button variant="ghost" size="xs" onClick={() => setEditingDesc(true)}>Edit</Button>} />
            {editingDesc ? (
              <div className="space-y-2">
                <MarkdownEditor value={desc} onChange={setDesc} autoFocus minRows={8} upload={{ context: "description", taskId: task.id }} onSubmitShortcut={async () => { if (await patch({ description: desc || null }, "Description saved")) setEditingDesc(false); }} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setDesc(task.description ?? ""); setEditingDesc(false); }}>Cancel</Button>
                  <Button size="sm" onClick={async () => { if (await patch({ description: desc || null }, "Description saved")) setEditingDesc(false); }}>Save</Button>
                </div>
              </div>
            ) : task.description ? (
              <div className="rounded-lg border bg-card px-4 py-3" onDoubleClick={() => perms.canEdit && setEditingDesc(true)}><Markdown>{task.description}</Markdown></div>
            ) : (
              <button disabled={!perms.canEdit} onClick={() => setEditingDesc(true)} className="w-full rounded-lg border border-dashed px-4 py-6 text-left text-sm text-muted-foreground hover:bg-muted/40">{perms.canEdit ? "Add a description — paste screenshots directly into the editor…" : "No description."}</button>
            )}
          </section>

          {task.type === "bug" && <BugPanel bug={task.bug} canEdit={perms.canEdit} onSave={(b) => patch({ bug: b }, "Bug details saved")} />}

          <section>
            <SectionTitle icon={Paperclip} title={task.type === "bug" ? "Screenshots & attachments" : "Attachments"} count={props.files.length} />
            <div className="space-y-3">
              {images.length > 0 && task.type === "bug" && <p className="text-[11px] text-muted-foreground">Click a screenshot to open the full-screen viewer (zoom with scroll or +/−).</p>}
              <AttachmentGrid files={props.files} />
              {perms.canEdit && <FileUploaderPanel target={{ context: task.type === "bug" ? "bug" : "task", taskId: task.id }} compact={props.files.length > 0} />}
            </div>
          </section>

          <Subtasks {...props} />
          <Checklist {...props} />
          <Dependencies {...props} />

          <section>
            <Tabs defaultValue="comments">
              <TabsList>
                <TabsTrigger value="comments"><MessageSquare className="mr-1.5 inline size-3.5" />Comments <span className="ml-1 text-muted-foreground">{props.comments.length}</span></TabsTrigger>
                <TabsTrigger value="history"><History className="mr-1.5 inline size-3.5" />History</TabsTrigger>
                <TabsTrigger value="time"><Timer className="mr-1.5 inline size-3.5" />Time <span className="ml-1 text-muted-foreground">{logged}h</span></TabsTrigger>
              </TabsList>
              <TabsContent value="comments" className="pt-4"><Comments {...props} /></TabsContent>
              <TabsContent value="history" className="pt-4"><ActivityFeedClient items={props.history} /></TabsContent>
              <TabsContent value="time" className="pt-4"><TimeTab {...props} logged={logged} /></TabsContent>
            </Tabs>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <Card className="divide-y">
            <Prop label="Status">
              <SelectWithIcon disabled={!perms.canEdit} value={task.statusId} onChange={(v) => patch({ statusId: v })} icon={<StatusIcon category={task.statusCategory} color={task.statusColor} />}>
                {props.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </SelectWithIcon>
            </Prop>
            <Prop label="Priority">
              <SelectWithIcon disabled={!perms.canEdit} value={task.priority} onChange={(v) => patch({ priority: v })} icon={<PriorityIcon priority={task.priority} />}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </SelectWithIcon>
            </Prop>
            <Prop label="Type">
              <SelectWithIcon disabled={!perms.canEdit} value={task.type} onChange={(v) => patch({ type: v })} icon={<TypeIcon type={task.type} />}>
                {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </SelectWithIcon>
            </Prop>
            <Prop label="Assignee">
              <div className="flex items-center gap-2"><Avatar name={task.assignee?.name} color={task.assignee?.avatarColor} size={22} /><MemberSelect disabled={!perms.canEdit} value={task.assignee?.id} onChange={(v) => patch({ assigneeId: v })} memberIds={props.memberIds} className="h-8 border-transparent px-1.5 shadow-none hover:border-input" /></div>
              {perms.canEdit && task.assignee?.id !== app.me.id && props.memberIds.includes(app.me.id) && <button onClick={() => patch({ assigneeId: app.me.id }, "Assigned to you")} className="ml-8 text-[11px] text-primary hover:underline">Assign to me</button>}
            </Prop>
            <Prop label="Reporter">
              {perms.canManage ? (
                <div className="flex items-center gap-2"><Avatar name={app.members.find((m) => m.id === task.reporterId)?.name} color={app.members.find((m) => m.id === task.reporterId)?.avatarColor} size={22} /><MemberSelect value={task.reporterId} onChange={(v) => patch({ reporterId: v })} allowNone={false} className="h-8 border-transparent px-1.5 shadow-none hover:border-input" /></div>
              ) : <span className="flex items-center gap-2 text-[13px]"><Avatar name={app.members.find((m) => m.id === task.reporterId)?.name} color={app.members.find((m) => m.id === task.reporterId)?.avatarColor} size={22} />{app.members.find((m) => m.id === task.reporterId)?.name ?? "—"}</span>}
            </Prop>
            <Prop label="Labels"><LabelPicker disabled={!perms.canEdit} value={props.labelIds} onChange={async (ids) => { const r = await setTaskLabels({ taskId: task.id, labelIds: ids }); if (!r.ok) toast.error(r.error); else router.refresh(); }} /></Prop>
            <Prop label="Start date"><Input type="date" disabled={!perms.canEdit} value={task.startDate ?? ""} onChange={(e) => patch({ startDate: e.target.value || null })} className="h-8" /></Prop>
            <Prop label="Due date">
              <Input type="date" disabled={!perms.canEdit} value={task.dueDate ?? ""} onChange={(e) => patch({ dueDate: e.target.value || null })} className={cn("h-8", isOverdue(task.dueDate, task.statusCategory) && "border-destructive/50 text-destructive")} />
              {isOverdue(task.dueDate, task.statusCategory) && <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-destructive"><CalendarClock className="size-3" /> Overdue</p>}
            </Prop>
            <Prop label="Project"><Link href={`/projects/${project.id}`} className="flex items-center gap-2 text-[13px] hover:underline"><span className="size-2.5 rounded-sm" style={{ background: project.color }} />{project.name}</Link></Prop>
            <Prop label="Sprint">
              <NativeSelect disabled={!perms.canEdit} value={task.sprintId ?? ""} onChange={(e) => patch({ sprintId: e.target.value || null })} className="h-8">
                <option value="">Backlog</option>{props.sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state === "active" ? " (active)" : ""}</option>)}
              </NativeSelect>
            </Prop>
            <Prop label="Milestone">
              <NativeSelect disabled={!perms.canEdit} value={task.milestoneId ?? ""} onChange={(e) => patch({ milestoneId: e.target.value || null })} className="h-8">
                <option value="">None</option>{props.milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </NativeSelect>
            </Prop>
            <Prop label="Estimate">
              <EstimateInput value={task.estimateHours} disabled={!perms.canEdit} onSave={(v) => patch({ estimateHours: v })} />
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground"><span>Logged {logged}h</span><span>{task.estimateHours ? `${Math.max(0, task.estimateHours - logged)}h left` : ""}</span></div>
                {task.estimateHours ? <Progress value={(logged / task.estimateHours) * 100} color={logged > task.estimateHours ? "#dc2626" : undefined} /> : null}
              </div>
            </Prop>
            <Prop label="Watchers"><AvatarStack users={props.watchers} max={6} size={22} /></Prop>
          </Card>
          <p className="px-1 text-[11px] text-muted-foreground">Created {fmtDate(task.createdAt, "MMM d, yyyy 'at' h:mm a")}<br />Updated {fmtDate(task.updatedAt, "MMM d, yyyy 'at' h:mm a")}{task.completedAt && <><br />Completed {fmtDate(task.completedAt, "MMM d, yyyy")}</>}</p>
        </aside>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, count, action }: { icon: React.ComponentType<{ className?: string }>; title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
      {count !== undefined && <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{count}</span>}
      <div className="ml-auto">{action}</div>
    </div>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[88px_1fr] items-start gap-2 px-3 py-2"><span className="pt-1.5 text-xs text-muted-foreground">{label}</span><div className="min-w-0">{children}</div></div>;
}

function SelectWithIcon({ value, onChange, icon, children, disabled }: { value: string; onChange: (v: string) => void; icon: React.ReactNode; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-2">{icon}</span>
      <select disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full cursor-pointer appearance-none rounded-md border border-transparent bg-transparent pl-7 pr-2 text-[13px] hover:border-input focus:border-input focus:outline-none disabled:cursor-default">{children}</select>
    </div>
  );
}

function EstimateInput({ value, onSave, disabled }: { value: number | null; onSave: (v: number | null) => void; disabled?: boolean }) {
  const [v, setV] = useState(value?.toString() ?? "");
  useEffect(() => setV(value?.toString() ?? ""), [value]);
  return <div className="flex items-center gap-1.5"><Input type="number" min={0} step={0.5} disabled={disabled} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { const n = v === "" ? null : Number(v); if (n !== value && (n === null || n >= 0)) onSave(n); }} className="h-8 w-24" /><span className="text-xs text-muted-foreground">hours</span></div>;
}

function BugPanel({ bug, canEdit, onSave }: { bug: BugDetails | null; canEdit: boolean; onSave: (b: BugDetails) => Promise<boolean> }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState<BugDetails>(bug ?? { severity: "major" });
  const sev = SEVERITIES.find((s) => s.value === (bug?.severity ?? "major"))!;
  return (
    <section className="rounded-xl border border-destructive/20 bg-destructive/[0.025] p-4">
      <SectionTitle icon={Bug} title="Bug report" action={canEdit && !edit && <Button variant="ghost" size="xs" onClick={() => setEdit(true)}>Edit</Button>} />
      {edit ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Severity"><NativeSelect value={v.severity ?? "major"} onChange={(e) => setV({ ...v, severity: e.target.value as BugDetails["severity"] })}>{SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</NativeSelect></Field>
          <Field label="Environment"><Input value={v.environment ?? ""} onChange={(e) => setV({ ...v, environment: e.target.value })} placeholder="Browser / OS / device / version" /></Field>
          <Field label="Expected behavior"><Textarea rows={3} value={v.expected ?? ""} onChange={(e) => setV({ ...v, expected: e.target.value })} /></Field>
          <Field label="Actual behavior"><Textarea rows={3} value={v.actual ?? ""} onChange={(e) => setV({ ...v, actual: e.target.value })} /></Field>
          <Field label="Steps to reproduce" className="sm:col-span-2"><Textarea rows={4} value={v.steps ?? ""} onChange={(e) => setV({ ...v, steps: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" size="sm" onClick={() => setEdit(false)}>Cancel</Button><Button size="sm" onClick={async () => { if (await onSave(v)) setEdit(false); }}>Save</Button></div>
        </div>
      ) : (
        <div className="grid gap-4 text-[13px] sm:grid-cols-2">
          <div><p className="mb-1 text-xs text-muted-foreground">Severity</p><Badge color={sev.color} variant="solid">{sev.label}</Badge></div>
          <div><p className="mb-1 text-xs text-muted-foreground">Environment</p><p>{bug?.environment || "—"}</p></div>
          <div><p className="mb-1 text-xs text-muted-foreground">Expected behavior</p><p className="whitespace-pre-wrap">{bug?.expected || "—"}</p></div>
          <div><p className="mb-1 text-xs text-muted-foreground">Actual behavior</p><p className="whitespace-pre-wrap">{bug?.actual || "—"}</p></div>
          <div className="sm:col-span-2"><p className="mb-1 text-xs text-muted-foreground">Steps to reproduce</p><p className="whitespace-pre-wrap rounded-md bg-surface p-2.5 font-mono text-xs ring-1 ring-border">{bug?.steps || "—"}</p></div>
        </div>
      )}
    </section>
  );
}

function Subtasks({ task, subtasks, project, perms }: Props) {
  const app = useApp();
  const done = subtasks.filter((s) => s.statusCategory === "done").length;
  return (
    <section>
      <SectionTitle icon={ListTree} title="Subtasks" count={subtasks.length} action={perms.canEdit && <Button variant="ghost" size="xs" onClick={() => app.openQuickCreate({ projectId: project.id, parentId: task.id })}><Plus /> Add</Button>} />
      {subtasks.length > 0 && <div className="mb-2 flex items-center gap-2"><Progress value={(done / subtasks.length) * 100} /><span className="text-[11px] tabular-nums text-muted-foreground">{done}/{subtasks.length}</span></div>}
      <div className="rounded-lg border">
        {subtasks.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Break this work into smaller pieces.</p>}
        {subtasks.map((s) => (
          <Link key={s.id} href={`/tasks/${s.id}`} className="flex items-center gap-2.5 border-b px-3 py-2 text-[13px] last:border-0 hover:bg-muted/50">
            <StatusIcon category={s.statusCategory} color={s.statusColor} /><span className="task-key">{taskKey(s.projectKey, s.number)}</span>
            <span className={cn("flex-1 truncate", s.statusCategory === "done" && "text-muted-foreground line-through")}>{s.title}</span>
            <PriorityIcon priority={s.priority} /><Avatar name={s.assignee?.name} color={s.assignee?.avatarColor} size={20} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function Checklist({ task, checklist, perms }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const done = checklist.filter((c) => c.done).length;
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => { const r = await p; if (!r.ok) toast.error(r.error); router.refresh(); };
  return (
    <section>
      <SectionTitle icon={ListChecks} title="Checklist" count={checklist.length} />
      {checklist.length > 0 && <div className="mb-2 flex items-center gap-2"><Progress value={(done / checklist.length) * 100} color="#16a34a" /><span className="text-[11px] tabular-nums text-muted-foreground">{done}/{checklist.length}</span></div>}
      <ul className="space-y-0.5">
        {checklist.map((c) => (
          <li key={c.id} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50">
            <Checkbox checked={c.done} disabled={!perms.canEdit} onCheckedChange={(v) => run(updateChecklistItem({ id: c.id, done: !!v }))} />
            <span className={cn("flex-1 text-[13px]", c.done && "text-muted-foreground line-through")}>{c.text}</span>
            {perms.canEdit && <button onClick={() => run(updateChecklistItem({ id: c.id, remove: true }))} className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100" aria-label="Remove item"><X className="size-3.5 text-muted-foreground" /></button>}
          </li>
        ))}
      </ul>
      {perms.canEdit && (
        <form className="mt-1.5 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await run(addChecklistItem({ taskId: task.id, text })); setText(""); }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item…" className="h-8" />
          <Button size="sm" variant="outline" disabled={!text.trim()}>Add</Button>
        </form>
      )}
    </section>
  );
}

function Dependencies({ task, blockedBy, blocking, perms }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; key: string; title: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) setResults(((await r.json()).tasks as { id: string; key: string; title: string }[]).filter((x) => x.id !== task.id));
    }, 200);
    return () => clearTimeout(t);
  }, [q, task.id]);
  const add = async (id: string, dir: "blockedBy" | "blocks") => {
    const r = dir === "blockedBy" ? await addDependency({ taskId: task.id, dependsOnId: id }) : await addDependency({ taskId: id, dependsOnId: task.id });
    if (!r.ok) return toast.error(r.error);
    toast.success("Dependency added");
    setOpen(false); setQ("");
    router.refresh();
  };
  const remove = async (taskId: string, dependsOnId: string) => { const r = await removeDependency({ taskId, dependsOnId }); if (!r.ok) toast.error(r.error); router.refresh(); };
  const Row = ({ t, onRemove }: { t: TaskRow; onRemove: () => void }) => (
    <div className="group flex items-center gap-2.5 px-3 py-2 text-[13px]">
      <StatusIcon category={t.statusCategory} color={t.statusColor} />
      <Link href={`/tasks/${t.id}`} className="task-key hover:underline">{taskKey(t.projectKey, t.number)}</Link>
      <Link href={`/tasks/${t.id}`} className={cn("flex-1 truncate hover:underline", t.statusCategory === "done" && "text-muted-foreground line-through")}>{t.title}</Link>
      {perms.canEdit && <button onClick={onRemove} className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100" aria-label="Remove link"><X className="size-3.5" /></button>}
    </div>
  );
  const unresolved = blockedBy.filter((b) => b.statusCategory !== "done" && b.statusCategory !== "cancelled").length;
  return (
    <section>
      <SectionTitle icon={GitBranch} title="Dependencies & linked tasks" count={blockedBy.length + blocking.length} action={perms.canEdit && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild><Button variant="ghost" size="xs"><Plus /> Link</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks or type a key…" className="h-8 pl-8" /></div>
            <ul className="mt-1.5 max-h-60 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id} className="rounded px-2 py-1.5 hover:bg-muted">
                  <p className="truncate text-[13px]"><span className="task-key mr-1.5">{r.key}</span>{r.title}</p>
                  <div className="mt-1 flex gap-1.5"><Button size="xs" variant="outline" onClick={() => add(r.id, "blockedBy")}>Blocked by this</Button><Button size="xs" variant="outline" onClick={() => add(r.id, "blocks")}>Blocks this</Button></div>
                </li>
              ))}
              {q && !results.length && <li className="px-2 py-3 text-center text-xs text-muted-foreground">No matching tasks</li>}
            </ul>
          </PopoverContent>
        </Popover>
      )} />
      {unresolved > 0 && <p className="mb-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">Blocked by {unresolved} unfinished task{unresolved > 1 ? "s" : ""}.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border"><p className="border-b px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Blocked by</p>{blockedBy.length ? blockedBy.map((t) => <Row key={t.id} t={t} onRemove={() => remove(task.id, t.id)} />) : <p className="px-3 py-2.5 text-xs text-muted-foreground">Nothing</p>}</div>
        <div className="rounded-lg border"><p className="border-b px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Blocks</p>{blocking.length ? blocking.map((t) => <Row key={t.id} t={t} onRemove={() => remove(t.id, task.id)} />) : <p className="px-3 py-2.5 text-xs text-muted-foreground">Nothing</p>}</div>
      </div>
    </section>
  );
}

function CommentComposer({ taskId, parentId, onDone, autoFocus, projectId }: { taskId: string; parentId?: string; onDone?: () => void; autoFocus?: boolean; projectId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const up = useUploader({ context: "comment", taskId, projectId });
  async function submit() {
    if (!body.trim() && !up.uploaded.length) return;
    if (up.busy) return toast.error("Wait for uploads to finish.");
    setBusy(true);
    const r = await addComment({ taskId, body: body.trim() || "(attachment)", parentId: parentId ?? null, attachmentIds: up.uploaded.map((u) => u.id) });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setBody(""); up.clear(); setShowFiles(false);
    router.refresh();
    onDone?.();
  }
  return (
    <div className="space-y-2" onPaste={(e) => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); e.stopPropagation(); setShowFiles(true); up.add(f); } }}>
      <MarkdownEditor value={body} onChange={setBody} minRows={parentId ? 2 : 3} autoFocus={autoFocus} placeholder={parentId ? "Write a reply…" : "Leave a comment. Use @ to mention someone, paste screenshots to attach them."} onSubmitShortcut={submit} />
      {(showFiles || up.items.length > 0) && <Dropzone items={up.items} onFiles={up.add} onRetry={up.retry} onRemove={up.remove} compact />}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowFiles((v) => !v)}><Paperclip /> Attach</Button>
        <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to send</span>
        <div className="ml-auto flex gap-2">
          {onDone && <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
          <Button size="sm" loading={busy} disabled={up.busy || (!body.trim() && !up.uploaded.length)} onClick={submit}>{parentId ? "Reply" : "Comment"}</Button>
        </div>
      </div>
    </div>
  );
}

function Comments({ task, comments, perms, project }: Props) {
  const roots = comments.filter((c) => !c.parentId);
  return (
    <div className="space-y-5">
      {perms.canEdit && <CommentComposer taskId={task.id} projectId={project.id} />}
      {roots.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No comments yet. Start the conversation.</p>}
      {roots.map((c) => <CommentItem key={c.id} c={c} replies={comments.filter((r) => r.parentId === c.id)} taskId={task.id} projectId={project.id} perms={perms} />)}
    </div>
  );
}

function CommentItem({ c, replies, taskId, projectId, perms, isReply }: { c: Comment; replies: Comment[]; taskId: string; projectId: string; perms: Props["perms"]; isReply?: boolean }) {
  const app = useApp();
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(c.body);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (typeof window !== "undefined" && window.location.hash === `#comment-${c.id}`) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [c.id]);
  const mine = c.authorId === app.me.id;
  return (
    <div ref={ref} id={`comment-${c.id}`} className="flex gap-3 target:rounded-lg target:bg-accent/40">
      <Avatar name={c.authorName ?? "Deleted user"} color={c.authorColor} size={isReply ? 24 : 30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-medium">{c.authorName ?? "Deleted user"}</span>
          <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>{timeAgo(c.createdAt)}{c.editedAt && " · edited"}</span>
        </div>
        {editing ? (
          <div className="mt-1.5 space-y-2">
            <MarkdownEditor value={body} onChange={setBody} minRows={3} autoFocus />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setBody(c.body); setEditing(false); }}>Cancel</Button>
              <Button size="sm" onClick={async () => { const r = await editComment({ id: c.id, body }); if (!r.ok) return toast.error(r.error); setEditing(false); router.refresh(); }}>Save</Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 rounded-lg rounded-tl-sm bg-muted/50 px-3 py-2"><Markdown className="prose-p:my-1">{c.body}</Markdown></div>
        )}
        {c.files.length > 0 && <div className="mt-2"><AttachmentGrid files={c.files} /></div>}
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          {!isReply && perms.canEdit && <button onClick={() => setReplying(true)} className="flex items-center gap-1 hover:text-foreground"><Reply className="size-3" /> Reply</button>}
          {mine && perms.canEdit && !editing && <button onClick={() => setEditing(true)} className="hover:text-foreground">Edit</button>}
          {(mine || perms.canManage) && <button onClick={async () => { if (!confirm("Delete this comment?")) return; const r = await deleteComment({ id: c.id }); if (!r.ok) toast.error(r.error); else router.refresh(); }} className="hover:text-destructive">Delete</button>}
        </div>
        {(replies.length > 0 || replying) && (
          <div className="mt-3 space-y-3 border-l-2 pl-4">
            {replies.map((r) => <CommentItem key={r.id} c={r} replies={[]} taskId={taskId} projectId={projectId} perms={perms} isReply />)}
            {replying && <CommentComposer taskId={taskId} projectId={projectId} parentId={c.id} autoFocus onDone={() => setReplying(false)} />}
          </div>
        )}
      </div>
    </div>
  );
}

function TimeTab({ task, timeLogs, perms, logged }: Props & { logged: number }) {
  const app = useApp();
  const router = useRouter();
  const [v, setV] = useState({ hours: "", note: "", loggedOn: todayISO() });
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      {perms.canEdit && (
        <form className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await logTime({ taskId: task.id, hours: Number(v.hours), note: v.note || undefined, loggedOn: v.loggedOn });
          setBusy(false);
          if (!r.ok) return toast.error(r.error);
          toast.success(`Logged ${v.hours}h`);
          setV({ ...v, hours: "", note: "" });
          router.refresh();
        }}>
          <Field label="Hours" className="w-24"><Input type="number" step="0.25" min="0.25" max="24" required value={v.hours} onChange={(e) => setV({ ...v, hours: e.target.value })} /></Field>
          <Field label="Date" className="w-40"><Input type="date" required value={v.loggedOn} onChange={(e) => setV({ ...v, loggedOn: e.target.value })} /></Field>
          <Field label="Note" className="min-w-[160px] flex-1"><Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="What did you work on?" /></Field>
          <Button loading={busy}><Clock /> Log time</Button>
        </form>
      )}
      <p className="text-xs text-muted-foreground">Total logged: <b className="text-foreground">{logged}h</b>{task.estimateHours ? ` of ${task.estimateHours}h estimated` : ""}</p>
      <ul className="divide-y rounded-lg border">
        {timeLogs.length === 0 && <li className="px-3 py-4 text-center text-xs text-muted-foreground">No time logged yet.</li>}
        {timeLogs.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
            <Avatar name={l.userName} color={l.userColor} size={22} />
            <span className="w-14 font-medium tabular-nums">{l.hours}h</span>
            <span className="flex-1 truncate text-muted-foreground">{l.note ?? "—"}</span>
            <span className="text-xs text-muted-foreground">{fmtDate(l.loggedOn, "MMM d")}</span>
            {(l.userId === app.me.id || perms.canManage) && perms.canEdit && <button onClick={async () => { const r = await deleteTimeLog({ id: l.id }); if (!r.ok) toast.error(r.error); else router.refresh(); }} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Delete entry"><Trash2 className="size-3.5" /></button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
