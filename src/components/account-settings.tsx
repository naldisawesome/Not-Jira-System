"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { changePassword, createApiToken, revokeApiToken, updateMySettings, updateUser } from "@/server/actions/admin";
import { fmtDate, timeAgo } from "@/lib/utils";

export function AccountSettings({ me, emailNotifications, tokens }: { me: { id: string; name: string; title: string | null; email: string; username: string; role: string }; emailNotifications: boolean; tokens: { id: string; name: string; prefix: string; lastUsedAt: Date | null; createdAt: Date }[] }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState({ name: me.name, title: me.title ?? "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [tokenName, setTokenName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [emails, setEmails] = useState(emailNotifications);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Profile" description={`${me.email} · @${me.username}`} />
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); const r = await updateUser({ id: me.id, data: { name: profile.name, title: profile.title || null } }); if (!r.ok) return toast.error(r.error); toast.success("Profile saved"); router.refresh(); }}>
            <Field label="Full name"><Input required minLength={2} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
            <Field label="Job title"><Input value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Button>Save profile</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Preferences" />
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between"><div><p className="text-[13px] font-medium">Theme</p><p className="text-xs text-muted-foreground">Light, dark or follow your system.</p></div>
            <Tabs value={theme ?? "system"} onValueChange={(v) => { setTheme(v); updateMySettings({ theme: v as "light" | "dark" | "system" }); }}><TabsList><TabsTrigger value="light">Light</TabsTrigger><TabsTrigger value="dark">Dark</TabsTrigger><TabsTrigger value="system">System</TabsTrigger></TabsList></Tabs>
          </div>
          <div className="flex items-center justify-between"><div><p className="text-[13px] font-medium">Email notifications</p><p className="text-xs text-muted-foreground">Saved preference. Delivery starts once an email provider is configured by your admin.</p></div>
            <Switch checked={emails} onCheckedChange={async (v) => { setEmails(v); const r = await updateMySettings({ emailNotifications: v }); if (!r.ok) { setEmails(!v); toast.error(r.error); } }} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Password" />
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={async (e) => {
            e.preventDefault();
            if (pw.next !== pw.confirm) return toast.error("New passwords don't match.");
            const r = await changePassword({ current: pw.current, next: pw.next });
            if (!r.ok) return toast.error(r.error);
            toast.success("Password changed"); setPw({ current: "", next: "", confirm: "" });
          }}>
            <Field label="Current"><Input type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="New"><Input type="password" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Confirm"><Input type="password" required minLength={8} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
            <div className="sm:col-span-3"><Button>Change password</Button></div>
          </form>
        </CardContent>
      </Card>
      {me.role !== "viewer" && (
        <Card>
          <CardHeader title="API tokens" description="Use with the REST API: Authorization: Bearer <token>. Tokens act with your permissions." />
          <CardContent className="space-y-3">
            {newToken && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="mb-1.5 font-medium">Copy this token now — it won&apos;t be shown again.</p>
                <div className="flex gap-2"><Input readOnly value={newToken} className="h-8 font-mono text-xs" /><Button size="sm" onClick={() => { navigator.clipboard.writeText(newToken); toast.success("Copied"); }}><Copy /></Button></div>
              </div>
            )}
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await createApiToken({ name: tokenName }); if (!r.ok) return toast.error(r.error); setNewToken(r.data.token); setTokenName(""); router.refresh(); }}>
              <Input required value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Token name, e.g. CI pipeline" className="max-w-xs" />
              <Button><KeyRound /> Generate token</Button>
            </form>
            <ul className="divide-y rounded-lg border">
              {tokens.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">No tokens.</li>}
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <KeyRound className="size-4 text-muted-foreground" /><span className="font-medium">{t.name}</span><code className="text-xs text-muted-foreground">{t.prefix}…</code>
                  <span className="ml-auto text-xs text-muted-foreground">{t.lastUsedAt ? `used ${timeAgo(t.lastUsedAt)}` : `created ${fmtDate(t.createdAt, "MMM d")}`}</span>
                  <Button variant="ghost" size="icon" onClick={async () => { const r = await revokeApiToken({ id: t.id }); if (!r.ok) toast.error(r.error); else { toast.success("Token revoked"); router.refresh(); } }} aria-label="Revoke"><Trash2 /></Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
