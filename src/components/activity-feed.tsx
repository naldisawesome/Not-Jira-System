import Link from "next/link";
import { Avatar } from "@/components/ui/misc";
import { taskKey, timeAgo } from "@/lib/utils";
import type { ActivityRow } from "@/server/stats";

function describe(a: ActivityRow) {
  const m = a.meta as Record<string, string | number | undefined>;
  const key = a.projectKey && a.taskNumber ? taskKey(a.projectKey, a.taskNumber) : null;
  const t = key ? <Link href={`/tasks/${a.taskId}`} className="font-medium text-foreground hover:underline">{key}</Link> : <span className="font-medium">a task</span>;
  switch (`${a.entity}.${a.action}`) {
    case "task.created": return <>created {t} <span className="text-muted-foreground">{a.taskTitle}</span></>;
    case "task.status_changed": return <>moved {t} {m.from ? <>from <b className="font-medium">{m.from}</b> </> : null}to <b className="font-medium">{m.to}</b></>;
    case "task.updated": return <>changed {m.field} on {t}{m.to !== undefined && m.to !== null && typeof m.to !== "object" ? <> to <b className="font-medium">{String(m.to)}</b></> : null}</>;
    case "task.deleted": return <>deleted task <b className="font-medium">{m.title}</b></>;
    case "task.dependency_added": return <>linked a dependency on {t}</>;
    case "comment.commented": return <>commented on {t}: <span className="text-muted-foreground">“{String(m.excerpt ?? "").slice(0, 80)}”</span></>;
    case "comment.replied": return <>replied on {t}</>;
    case "attachment.uploaded": return <>attached <b className="font-medium">{m.fileName}</b> to {t}</>;
    case "attachment.deleted": return <>removed <b className="font-medium">{m.fileName}</b> from {t}</>;
    case "time.logged": return <>logged {m.hours}h on {t}</>;
    case "project.created": return <>created project <Link href={`/projects/${a.projectId}`} className="font-medium text-foreground hover:underline">{a.projectName ?? m.name}</Link></>;
    case "project.updated": return <>updated project <b className="font-medium">{a.projectName}</b></>;
    case "project.archived": return <>archived <b className="font-medium">{a.projectName}</b></>;
    case "project.restored": return <>restored <b className="font-medium">{a.projectName}</b></>;
    case "project.deleted": return <>deleted project <b className="font-medium">{m.name}</b></>;
    case "project.member_set": return <>updated members of <b className="font-medium">{a.projectName}</b></>;
    case "project.member_removed": return <>removed a member from <b className="font-medium">{a.projectName}</b></>;
    case "sprint.created": return <>created sprint <b className="font-medium">{m.name}</b></>;
    case "sprint.sprint_active": return <>started sprint <b className="font-medium">{m.name}</b></>;
    case "sprint.sprint_completed": return <>completed sprint <b className="font-medium">{m.name}</b></>;
    case "user.invited": return <>invited <b className="font-medium">{m.email}</b></>;
    case "user.joined": return <>joined the workspace</>;
    case "user.created": return <>added <b className="font-medium">{m.name}</b> to the workspace</>;
    case "user.updated": return <>updated <b className="font-medium">{m.name}</b>&apos;s account</>;
    default: return <>{a.action.replace(/_/g, " ")} {a.entity}</>;
  }
}

export function ActivityFeed({ items, compact }: { items: ActivityRow[]; compact?: boolean }) {
  if (!items.length) return <p className="py-6 text-center text-xs text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-3.5 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-border">
      {items.map((a) => (
        <li key={a.id} className="relative flex gap-3">
          <Avatar name={a.actorName ?? "System"} color={a.actorColor ?? "#64748b"} size={compact ? 22 : 24} />
          <div className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/80">
            <span className="font-medium text-foreground">{a.actorName ?? "System"}</span> {describe(a)}
            <p className="mt-0.5 text-[11px] text-muted-foreground" suppressHydrationWarning>{timeAgo(a.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
