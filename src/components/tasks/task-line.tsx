import Link from "next/link";
import { CalendarClock, MessageSquare, Paperclip } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { cn, fmtDate, isOverdue, taskKey } from "@/lib/utils";
import type { TaskRow } from "@/server/queries";
import { PriorityIcon, StatusIcon, TypeIcon } from "./badges";

export function TaskLine({ t, showProject = true, showDue = true, compact }: { t: TaskRow; showProject?: boolean; showDue?: boolean; compact?: boolean }) {
  const overdue = isOverdue(t.dueDate, t.statusCategory);
  return (
    <Link href={`/tasks/${t.id}`} className="group flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/70">
      <StatusIcon category={t.statusCategory} color={t.statusColor} />
      {!compact && <TypeIcon type={t.type} />}
      <span className="task-key w-[56px] shrink-0">{taskKey(t.projectKey, t.number)}</span>
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", t.statusCategory === "done" && "text-muted-foreground line-through decoration-muted-foreground/40")}>{t.title}</span>
      {showProject && <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground md:flex"><span className="size-1.5 rounded-full" style={{ background: t.projectColor }} />{t.projectName}</span>}
      {!compact && t.attachmentCount > 0 && <span className="hidden items-center gap-0.5 text-[11px] text-muted-foreground sm:flex"><Paperclip className="size-3" />{t.attachmentCount}</span>}
      {!compact && t.commentCount > 0 && <span className="hidden items-center gap-0.5 text-[11px] text-muted-foreground sm:flex"><MessageSquare className="size-3" />{t.commentCount}</span>}
      <PriorityIcon priority={t.priority} />
      {showDue && t.dueDate && <span className={cn("flex w-[64px] shrink-0 items-center justify-end gap-1 text-[11px] tabular-nums text-muted-foreground", overdue && "font-medium text-destructive")}><CalendarClock className="size-3" />{fmtDate(t.dueDate, "MMM d")}</span>}
      <Avatar name={t.assignee?.name} color={t.assignee?.avatarColor} size={20} />
    </Link>
  );
}
