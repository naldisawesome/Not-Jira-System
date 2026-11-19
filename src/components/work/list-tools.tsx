"use client";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/menu";

export function ListTools({ projectId, canImport }: { projectId?: string; canImport: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const qs = new URLSearchParams(sp.toString());
  if (projectId) qs.set("project", projectId);

  async function importCsv(f: File) {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("projectId", projectId!);
    try {
      const r = await fetch("/api/import/tasks", { method: "POST", body: fd });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Import failed");
      toast.success(`Imported ${body.created} task(s)${body.skipped ? ` · ${body.skipped} row(s) skipped` : ""}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" size="sm">{busy ? <Loader2 className="animate-spin" /> : <Download />} Import / Export</Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild><a href={`/api/export/tasks?${qs}`}><Download /> Export filtered tasks (CSV)</a></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canImport || !projectId} onSelect={() => file.current?.click()}><Upload /> Import tasks from CSV{!projectId && " (pick a project)"}</DropdownMenuItem>
          <DropdownMenuItem asChild><a href="data:text/csv;charset=utf-8,title,type,priority,description,start_date,due_date,estimate_hours,assignee_email,labels%0ASet up CI pipeline,task,high,Automate builds,,2026-12-01,6,,devops" download="tessera-import-template.csv"><Download /> Download import template</a></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
    </>
  );
}
