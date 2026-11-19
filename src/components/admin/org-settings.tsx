"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { updateOrganization } from "@/server/actions/admin";

export function OrgSettingsForm({ name, dueSoonDays, disabled }: { name: string; dueSoonDays: number; disabled: boolean }) {
  const router = useRouter();
  const [v, setV] = useState({ name, dueSoonDays: String(dueSoonDays) });
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const r = await updateOrganization({ name: v.name, dueSoonDays: Number(v.dueSoonDays) });
      setBusy(false);
      if (!r.ok) return toast.error(r.error);
      toast.success("Settings saved"); router.refresh();
    }}>
      <Field label="Organization name"><Input disabled={disabled} required minLength={2} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Deadline reminder window (days)" hint="Assignees are notified when a task is due within this many days."><Input disabled={disabled} type="number" min={1} max={14} value={v.dueSoonDays} onChange={(e) => setV({ ...v, dueSoonDays: e.target.value })} className="w-28" /></Field>
      {!disabled && <Button loading={busy}>Save changes</Button>}
    </form>
  );
}
