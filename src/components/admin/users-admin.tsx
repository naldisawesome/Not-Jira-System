"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Mail, Copy, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, Badge } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLES, roleLabel } from "@/lib/constants";
import { createUser, inviteUser, revokeInvite, updateUser } from "@/server/actions/admin";
import { fmtDate } from "@/lib/utils";
import type { Role } from "@/db/schema";

type U = { id: string; name: string; email: string; username: string; role: Role; title: string | null; isActive: boolean; avatarColor: string; createdAt: Date };
type I = { id: string; email: string; role: Role; token: string; expiresAt: Date };

export function UsersAdmin({ users, invites, myRole, myId }: { users: U[]; invites: I[]; myRole: Role; myId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [inv, setInv] = useState({ email: "", role: "member" as Role });
  const [nu, setNu] = useState({ name: "", email: "", role: "member" as Role, title: "", password: "" });
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roles = ROLES.filter((r) => r.value !== "super_admin" || myRole === "super_admin");
  const run = async (p: Promise<{ ok: boolean; error?: string }>, msg: string) => { const r = await p; if (!r.ok) return toast.error(r.error), false; toast.success(msg); router.refresh(); return true; };
  const shown = users.filter((u) => !q || `${u.name} ${u.email} ${u.username}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="h-8 pl-8" /></div>
        <Button className="ml-auto" onClick={() => { setOpen(true); setLink(null); }}><UserPlus /> Add people</Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2.5">Person</th><th className="px-3">Title</th><th className="px-3">Role</th><th className="px-3">Status</th><th className="px-3">Joined</th><th /></tr></thead>
          <tbody>
            {shown.map((u) => {
              const locked = u.id === myId || (u.role === "super_admin" && myRole !== "super_admin");
              return (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2"><div className="flex items-center gap-2.5"><Avatar name={u.name} color={u.avatarColor} size={30} /><div><p className="font-medium">{u.name}{u.id === myId && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div></td>
                  <td className="px-3 text-muted-foreground">{u.title ?? "—"}</td>
                  <td className="px-3">
                    {locked ? <Badge>{roleLabel(u.role)}</Badge> : (
                      <NativeSelect value={u.role} className="h-8 w-40 text-xs" onChange={(e) => run(updateUser({ id: u.id, data: { role: e.target.value as Role } }), `${u.name} is now ${roleLabel(e.target.value)}`)}>
                        {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </NativeSelect>
                    )}
                  </td>
                  <td className="px-3">{u.isActive ? <Badge color="#16a34a">Active</Badge> : <Badge color="#dc2626">Deactivated</Badge>}</td>
                  <td className="px-3 text-xs text-muted-foreground">{fmtDate(u.createdAt, "MMM d, yyyy")}</td>
                  <td className="px-3 text-right">{!locked && <Button variant="ghost" size="sm" onClick={() => confirm(`${u.isActive ? "Deactivate" : "Reactivate"} ${u.name}?`) && run(updateUser({ id: u.id, data: { isActive: !u.isActive } }), u.isActive ? "User deactivated" : "User reactivated")}>{u.isActive ? "Deactivate" : "Reactivate"}</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {invites.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Pending invitations</h2>
          <Card className="divide-y">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <Mail className="size-4 text-muted-foreground" /><span className="flex-1">{i.email}</span><Badge>{roleLabel(i.role)}</Badge>
                <span className="text-xs text-muted-foreground">expires {fmtDate(i.expiresAt, "MMM d")}</span>
                <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/invite/${i.token}`); toast.success("Invite link copied"); }} aria-label="Copy link"><Copy /></Button>
                <Button variant="ghost" size="icon" onClick={() => run(revokeInvite({ id: i.id }), "Invitation revoked")} aria-label="Revoke"><Trash2 /></Button>
              </div>
            ))}
          </Card>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add people">
          <Tabs defaultValue="invite">
            <TabsList className="mb-4"><TabsTrigger value="invite">Invite by link</TabsTrigger><TabsTrigger value="create">Create account</TabsTrigger></TabsList>
            <TabsContent value="invite">
              {link ? (
                <div className="space-y-3">
                  <p className="text-sm">Invitation created. Share this link — it expires in 7 days.</p>
                  <div className="flex gap-2"><Input readOnly value={link} className="font-mono text-xs" /><Button onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }}><Copy /></Button></div>
                  <p className="text-[11px] text-muted-foreground">Email delivery isn&apos;t configured yet (needs an SMTP/Resend key), so links are shared manually.</p>
                </div>
              ) : (
                <form className="space-y-3" onSubmit={async (e) => {
                  e.preventDefault(); setBusy(true);
                  const r = await inviteUser(inv); setBusy(false);
                  if (!r.ok) return toast.error(r.error);
                  setLink(`${window.location.origin}${r.data.link}`); router.refresh();
                }}>
                  <Field label="Email"><Input type="email" required value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
                  <Field label="Role"><NativeSelect value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })}>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</NativeSelect></Field>
                  <DialogFooter><Button loading={busy}>Create invitation</Button></DialogFooter>
                </form>
              )}
            </TabsContent>
            <TabsContent value="create">
              <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const ok = await run(createUser({ ...nu, title: nu.title || undefined }), `${nu.name} added`); setBusy(false); if (ok) { setOpen(false); setNu({ name: "", email: "", role: "member", title: "", password: "" }); } }}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Full name"><Input required value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></Field>
                  <Field label="Title"><Input value={nu.title} onChange={(e) => setNu({ ...nu, title: e.target.value })} /></Field>
                </div>
                <Field label="Email"><Input type="email" required value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Role"><NativeSelect value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</NativeSelect></Field>
                  <Field label="Temporary password" hint="Min. 8 characters"><Input type="text" required minLength={8} value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></Field>
                </div>
                <DialogFooter><Button loading={busy}>Create account</Button></DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
