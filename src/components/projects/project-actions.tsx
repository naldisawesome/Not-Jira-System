"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Archive, ArchiveRestore, Trash2, Settings, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteProject, setProjectArchived } from "@/server/actions/projects";

export function ProjectActions({ id, projectKey, name, archived, canManage }: { id: string; projectKey: string; name: string; archived: boolean; canManage: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function archive() {
    const r = await setProjectArchived({ id, archived: !archived });
    if (!r.ok) return toast.error(r.error);
    toast.success(archived ? `${name} restored` : `${name} archived`);
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    const r = await deleteProject({ id, confirmKey: typed });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${name} deleted`);
    setConfirm(false);
    router.push("/projects");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Project actions" onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild><Link href={`/projects/${id}`}><ExternalLink /> Open workspace</Link></DropdownMenuItem>
          {canManage && <DropdownMenuItem asChild><Link href={`/projects/${id}/settings`}><Settings /> Settings & members</Link></DropdownMenuItem>}
          {canManage && <DropdownMenuItem onSelect={archive}>{archived ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}</DropdownMenuItem>}
          {canManage && <><DropdownMenuSeparator /><DropdownMenuItem destructive onSelect={() => setConfirm(true)}><Trash2 /> Delete project</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title={`Delete ${name}?`} description="This permanently deletes the project, its tasks, comments and files.">
          <p className="mb-2 text-sm">Type <code className="rounded bg-muted px-1 font-mono">{projectKey}</code> to confirm.</p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="font-mono" autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="destructive" disabled={typed.trim().toUpperCase() !== projectKey} loading={busy} onClick={remove}>Delete forever</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
