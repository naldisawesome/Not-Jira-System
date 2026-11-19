"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useApp } from "@/components/shell/app-context";
import { createTeam, deleteTeam, setTeamMember } from "@/server/actions/admin";
import { PROJECT_COLORS } from "@/lib/constants";

type T = { id: string; name: string; description: string | null; color: string; members: { id: string; name: string; avatarColor: string; title: string | null; open: number; done: number }[] };

export function TeamsManager({ teams, canManage }: { teams: T[]; canManage: boolean }) {
  const app = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", description: "", color: PROJECT_COLORS[1]! });
  const run = async (p: Promise<{ ok: boolean; error?: string }>, msg?: string) => { const r = await p; if (!r.ok) return toast.error(r.error); if (msg) toast.success(msg); router.refresh(); };
  return (
    <>
      {canManage && <div className="mb-4 flex justify-end"><Button onClick={() => setOpen(true)}><Plus /> New team</Button></div>}
      {teams.length === 0 && <EmptyState icon={Users} title="No teams yet" description="Create teams like Engineering, Design or Support." />}
      <div className="grid gap-5 lg:grid-cols-2">
        {teams.map((t) => {
          const open = t.members.reduce((a, m) => a + m.open, 0);
          const done = t.members.reduce((a, m) => a + m.done, 0);
          return (
            <Card key={t.id}>
              <CardHeader title={<span className="flex items-center gap-2"><span className="size-3 rounded" style={{ background: t.color }} />{t.name}</span>} description={t.description ?? undefined} action={canManage && <Button variant="ghost" size="icon" onClick={() => confirm(`Delete team ${t.name}?`) && run(deleteTeam({ id: t.id }), "Team deleted")} aria-label="Delete team"><Trash2 /></Button>} />
              <CardContent>
                <div className="mb-3 flex gap-6 text-sm"><span><b className="tabular-nums">{t.members.length}</b> <span className="text-muted-foreground">members</span></span><span><b className="tabular-nums">{open}</b> <span className="text-muted-foreground">open tasks</span></span><span><b className="tabular-nums">{done}</b> <span className="text-muted-foreground">completed</span></span></div>
                <ul className="divide-y rounded-lg border">
                  {t.members.map((m) => (
                    <li key={m.id} className="group flex items-center gap-3 px-3 py-2">
                      <Avatar name={m.name} color={m.avatarColor} size={26} />
                      <Link href={`/members/${m.id}`} className="min-w-0 flex-1 hover:underline"><p className="truncate text-[13px] font-medium">{m.name}</p><p className="truncate text-[11px] text-muted-foreground">{m.title}</p></Link>
                      <span className="text-xs tabular-nums text-muted-foreground">{m.open} open</span>
                      {canManage && <button onClick={() => run(setTeamMember({ teamId: t.id, userId: m.id, member: false }))} className="rounded p-1 opacity-0 hover:bg-muted group-hover:opacity-100" aria-label="Remove from team"><X className="size-3.5" /></button>}
                    </li>
                  ))}
                  {!t.members.length && <li className="px-3 py-3 text-xs text-muted-foreground">No members.</li>}
                </ul>
                {canManage && (
                  <NativeSelect className="mt-3 h-8 text-xs" value="" onChange={(e) => e.target.value && run(setTeamMember({ teamId: t.id, userId: e.target.value, member: true }), "Added to team")}>
                    <option value="">+ Add member…</option>
                    {app.members.filter((m) => m.isActive && !t.members.some((x) => x.id === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </NativeSelect>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New team">
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await run(createTeam(v), "Team created"); setOpen(false); setV({ ...v, name: "", description: "" }); }}>
            <Field label="Name"><Input required minLength={2} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="Description"><Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
            <Field label="Color"><div className="flex gap-1.5">{PROJECT_COLORS.map((c) => <button key={c} type="button" onClick={() => setV({ ...v, color: c })} className={`size-6 rounded-full ${v.color === c ? "ring-2 ring-foreground/40 ring-offset-2" : ""}`} style={{ background: c }} aria-label={c} />)}</div></Field>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button>Create team</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
