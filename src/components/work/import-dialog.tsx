"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/ui/input";
import { useApp } from "@/components/shell/app-context";
import { cn } from "@/lib/utils";

type Plan = { rows: number; toImport: number; skipped: number; newProjects: { key: string; name: string }[]; byProject: { key: string; name: string; count: number }[]; skippedRows: { row: number; title: string; skip?: string }[] };
type Result = { created: number; skipped: number; errors: string[]; newProjects: { key: string; name: string }[]; byProject: { key: string; name: string; count: number }[] };

const TEMPLATE =
  "project_key,project_name,title,type,status,priority,labels,date,due_date,assignee_email,description\n" +
  "FRM,Formworks,Line-item table field,feature,Done,medium,Change,2026-11-13,,,Line items with sub-items and a value column\n" +
  "FRM,Formworks,Fix loading bar stuck after load,bug,Done,high,Fix,2026-11-18,,,\n" +
  "RNS,Renewal System,Turn off password sign-in,task,To Do,medium,Admin action,,2026-12-15,,Once everyone signs in with Google\n";

/** Upload a CSV log (changes, fixes, future work…) and turn every row into a task. Previews before importing. */
export function ImportDialog({ projectId, children, ...btn }: ButtonProps & { projectId?: string }) {
  const app = useApp();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState(projectId ?? "");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const editable = app.projects.filter((p) => p.canEdit && !p.archived);

  const send = async (f: File, dryRun: boolean, proj = target) => {
    const fd = new FormData();
    fd.append("file", f);
    if (proj) fd.append("projectId", proj);
    if (dryRun) fd.append("dryRun", "1");
    const r = await fetch("/api/import/tasks", { method: "POST", body: fd });
    const body = await r.json().catch(() => ({ error: "The server returned an unexpected response." }));
    if (!r.ok) throw new Error(body.error ?? `Import failed (${r.status})`);
    return body;
  };
  async function choose(f: File) {
    setFile(f); setPlan(null); setResult(null); setBusy(true);
    try { setPlan(await send(f, true)); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function retarget(id: string) {
    setTarget(id);
    if (file) { setBusy(true); try { setPlan(await send(file, true, id)); } catch (e) { toast.error((e as Error).message); setPlan(null); } finally { setBusy(false); } }
  }
  async function run() {
    if (!file) return;
    setBusy(true);
    try {
      const r: Result = await send(file, false);
      setResult(r); setPlan(null);
      toast.success(`Imported ${r.created} task${r.created === 1 ? "" : "s"}`);
      router.refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const reset = () => { setFile(null); setPlan(null); setResult(null); };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Button variant="outline" size="sm" {...btn} onClick={() => setOpen(true)}>{children ?? <><Upload /> Import log</>}</Button>
      <DialogContent title="Import tasks from a log" description="Upload a CSV — each row becomes a task. Rows already in the project (same title) are skipped, so re-uploading an updated log is safe." wide>
        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="size-4" /> Imported {result.created} task(s){result.skipped ? `, skipped ${result.skipped}` : ""}.</div>
            {result.newProjects.length > 0 && <p className="text-[13px]">New projects created: {result.newProjects.map((p) => `${p.name} (${p.key})`).join(", ")}</p>}
            <ul className="text-[13px]">{result.byProject.map((p) => <li key={p.key}>• {p.name}: {p.count}</li>)}</ul>
            {result.errors.length > 0 && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs"><p className="mb-1 font-medium">Rows not imported</p>{result.errors.map((e) => <p key={e}>{e}</p>)}</div>}
            <DialogFooter><Button variant="ghost" onClick={reset}>Import another</Button><Button onClick={() => setOpen(false)}>Done</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              role="button" tabIndex={0}
              onClick={() => input.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) choose(f); }}
              className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center hover:border-primary/50 hover:bg-accent/40", over && "border-primary bg-accent/60")}
            >
              <FileSpreadsheet className="size-6 text-muted-foreground" />
              <p className="text-[13px] font-medium">{file ? file.name : "Drop a .csv log here or click to browse"}</p>
              <p className="text-[11px] text-muted-foreground">Columns: title (required), type, status, priority, labels, date, due_date, assignee_email, description, project_key, project_name</p>
              <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }} />
            </div>
            <Field label="Import into" hint="Used for rows without a project_key. Rows with a project_key go to that project (created if it doesn't exist).">
              <NativeSelect value={target} onChange={(e) => retarget(e.target.value)}>
                <option value="">Use project_key column</option>
                {editable.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
              </NativeSelect>
            </Field>
            {busy && !plan && <p className="text-xs text-muted-foreground">Reading file…</p>}
            {plan && (
              <div className="space-y-2 rounded-lg border bg-card p-3 text-[13px]">
                <p className="font-medium">{plan.toImport} of {plan.rows} rows will be imported{plan.skipped ? ` · ${plan.skipped} skipped` : ""}</p>
                <ul className="space-y-0.5">{plan.byProject.map((p) => <li key={p.key}>• <b>{p.name}</b> <span className="task-key">{p.key}</span>: {p.count} task(s)</li>)}</ul>
                {plan.newProjects.length > 0 && <p className="flex items-center gap-1.5 text-primary"><FolderPlus className="size-3.5" /> Will create: {plan.newProjects.map((p) => `${p.name} (${p.key})`).join(", ")}</p>}
                {plan.skippedRows.length > 0 && (
                  <details className="text-xs text-muted-foreground"><summary className="cursor-pointer"><AlertTriangle className="mr-1 inline size-3" />Skipped rows</summary>{plan.skippedRows.map((s) => <p key={s.row}>Row {s.row}: {s.title || "(no title)"} — {s.skip}</p>)}</details>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" asChild className="mr-auto"><a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="task-log-template.csv"><Download /> Template</a></Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button loading={busy && !!plan} disabled={!plan || plan.toImport === 0} onClick={run}>Import {plan?.toImport ?? ""} tasks</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
