"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { assignAllToMe } from "@/server/actions/tasks";
import { cn } from "@/lib/utils";

type Scope = "unassigned" | "open" | "all";

export function AssignAllButton({ projectId, projectName, counts }: { projectId: string; projectName: string; counts: Record<Scope, number> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("open");
  const [busy, setBusy] = useState(false);
  const options: { v: Scope; label: string; hint: string }[] = [
    { v: "unassigned", label: "Unassigned tasks only", hint: "Leaves tasks other people already have." },
    { v: "open", label: "All open tasks", hint: "Takes over open tasks from others too. Done and cancelled tasks keep their assignee." },
    { v: "all", label: "Every task, including done", hint: "Everything in the project ends up assigned to you." },
  ];
  async function run() {
    setBusy(true);
    const r = await assignAllToMe({ projectId, scope });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.data.updated ? `Assigned ${r.data.updated} task${r.data.updated === 1 ? "" : "s"} to you` : "Everything was already assigned to you");
    setOpen(false);
    router.refresh();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><UserCheck /> Assign all to me</Button>
      <DialogContent title="Assign tasks to me" description={`Make yourself the assignee on tasks in ${projectName}.`}>
        <div className="space-y-2">
          {options.map((o) => (
            <label key={o.v} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50", scope === o.v && "border-primary bg-accent/40")}>
              <input type="radio" name="scope" className="mt-0.5 accent-[hsl(var(--primary))]" checked={scope === o.v} onChange={() => setScope(o.v)} />
              <div className="flex-1">
                <p className="text-[13px] font-medium">{o.label} <span className="ml-1 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{counts[o.v]}</span></p>
                <p className="text-xs text-muted-foreground">{o.hint}</p>
              </div>
            </label>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">People who lose tasks get one notification each. You&apos;ll be added as a watcher.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={run} loading={busy} disabled={counts[scope] === 0}>{counts[scope] === 0 ? "Nothing to assign" : `Assign ${counts[scope]} task${counts[scope] === 1 ? "" : "s"} to me`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
