"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, UserPlus, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { useApp } from "@/components/shell/app-context";
import { setProjectMember, updateProject } from "@/server/actions/projects";
import { FileUploaderPanel } from "@/components/files/file-uploader-panel";
import { roleLabel } from "@/lib/constants";

type M = { id: string; name: string; avatarColor: string; role: "lead" | "member" | "viewer"; orgRole: string; title: string | null };

export function MembersManager({ projectId, ownerId, members }: { projectId: string; ownerId: string | null; members: M[] }) {
  const app = useApp();
  const router = useRouter();
  const [adding, setAdding] = useState("");
  const [role, setRole] = useState<"member" | "lead" | "viewer">("member");
  const candidates = app.members.filter((m) => m.isActive && !members.some((x) => x.id === m.id));

  async function set(userId: string, r: "lead" | "member" | "viewer" | null) {
    const res = await setProjectMember({ projectId, userId, role: r });
    if (!res.ok) return toast.error(res.error);
    toast.success(r ? "Member updated" : "Member removed");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <NativeSelect value={adding} onChange={(e) => setAdding(e.target.value)} className="h-9 w-60">
          <option value="">Add a person…</option>
          {candidates.map((m) => <option key={m.id} value={m.id}>{m.name} — {roleLabel(m.role)}</option>)}
        </NativeSelect>
        <NativeSelect value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="h-9 w-32">
          <option value="member">Member</option><option value="lead">Lead</option><option value="viewer">Viewer</option>
        </NativeSelect>
        <Button disabled={!adding} onClick={async () => { await set(adding, role); setAdding(""); }}><UserPlus /> Add</Button>
      </div>
      <ul className="divide-y rounded-lg border">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2">
            <Avatar name={m.name} color={m.avatarColor} size={28} />
            <div className="min-w-0 flex-1"><p className="text-[13px] font-medium">{m.name} {m.id === ownerId && <span className="ml-1 rounded bg-accent px-1 text-[10px] text-accent-foreground">Owner</span>}</p><p className="text-[11px] text-muted-foreground">{m.title ?? roleLabel(m.orgRole)}</p></div>
            <NativeSelect value={m.role} onChange={(e) => set(m.id, e.target.value as M["role"])} className="h-8 w-28 text-xs" aria-label="Project role">
              <option value="lead">Lead</option><option value="member">Member</option><option value="viewer">Viewer</option>
            </NativeSelect>
            <Button variant="ghost" size="icon" disabled={m.id === ownerId} onClick={() => confirm(`Remove ${m.name} from this project?`) && set(m.id, null)} aria-label="Remove"><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">Leads (who are Project Managers) can manage the project. Viewers get read-only access regardless of their org role.</p>
    </div>
  );
}

export function CoverPicker({ projectId, coverId }: { projectId: string; coverId: string | null }) {
  const router = useRouter();
  async function setCover(id: string | null) {
    const r = await updateProject({ id: projectId, data: { coverAttachmentId: id } });
    if (!r.ok) return toast.error(r.error);
    router.refresh();
  }
  return (
    <div className="space-y-3">
      {coverId ? (
        <div className="relative overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/files/${coverId}`} alt="Project cover" className="h-36 w-full object-cover" />
          <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => setCover(null)}><X /> Remove</Button>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground"><ImageIcon className="mr-1.5 size-4" /> No cover image</div>
      )}
      <FileUploaderPanel target={{ context: "cover", projectId }} imagesOnly compact label="Upload a logo or cover image" onUploaded={(id) => setCover(id)} />
    </div>
  );
}
