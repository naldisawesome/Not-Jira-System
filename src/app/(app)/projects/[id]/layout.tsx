import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ChevronRight, Plus } from "lucide-react";
import { requireUser } from "@/server/session";
import { getProjectAccess } from "@/server/rbac";
import { getProjectContext } from "@/server/queries";
import { AvatarStack, Badge } from "@/components/ui/misc";
import { PriorityBadge } from "@/components/tasks/badges";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { PhaseBadge } from "@/components/projects/phase-badge";
import { ProjectActions } from "@/components/projects/project-actions";
import { QuickAddButton } from "@/components/tasks/quick-add-button";
import { ImportDialog } from "@/components/work/import-dialog";
import { PROJECT_STATUSES } from "@/lib/constants";
import { fmtDate } from "@/lib/utils";

export default async function ProjectLayout({ params, children }: { params: { id: string }; children: React.ReactNode }) {
  const user = await requireUser();
  let access;
  try { access = await getProjectAccess(user, params.id); } catch { notFound(); }
  const p = access.project;
  const ctx = await getProjectContext(p.id, p.workflowId);
  const st = PROJECT_STATUSES.find((s) => s.value === p.status)!;
  return (
    <div className="mx-auto max-w-[1600px] animate-fade-in">
      <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Link href="/projects" className="hover:text-foreground">Projects</Link><ChevronRight className="size-3" /><span>{p.name}</span></div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-soft" style={p.coverAttachmentId ? { backgroundImage: `url(/api/files/${p.coverAttachmentId})`, backgroundSize: "cover" } : { background: p.color }}>{p.coverAttachmentId ? "" : p.key.slice(0, 2)}</span>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">{p.name} <span className="task-key text-xs">{p.key}</span> <PhaseBadge phase={p.phase} /></h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge color={st.color}>{st.label}</Badge>
            <PriorityBadge priority={p.priority} />
            {p.category && <Badge>{p.category}</Badge>}
            <span>{fmtDate(p.startDate, "MMM d")} → {fmtDate(p.dueDate, "MMM d, yyyy")}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <AvatarStack users={ctx.members} max={5} size={26} />
          {access.canEdit && <ImportDialog projectId={p.id} />}
          {access.canEdit && <QuickAddButton projectId={p.id}><Plus /> Add task</QuickAddButton>}
          <ProjectActions id={p.id} projectKey={p.key} name={p.name} archived={!!p.archivedAt} canManage={access.canManage} />
        </div>
      </div>
      {p.archivedAt && <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"><Archive className="size-3.5" /> This project is archived and read-only.</div>}
      <ProjectTabs id={p.id} canManage={access.canManage} />
      <div className="pt-5">{children}</div>
    </div>
  );
}
