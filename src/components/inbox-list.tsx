"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Mail, MailOpen, AtSign, UserPlus, MessageSquare, AlarmClock, CalendarClock, FolderPlus, RefreshCw, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { markNotificationsRead, markNotificationUnread } from "@/server/actions/collab";
import { cn, timeAgo } from "@/lib/utils";

type N = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: Date | null; createdAt: Date; actorName: string | null; actorColor: string | null };
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { mention: AtSign, assigned: UserPlus, comment: MessageSquare, overdue: AlarmClock, deadline: CalendarClock, project_created: FolderPlus, project_added: FolderPlus, updated: RefreshCw };

export function InboxList({ items, filter, page, pages, unread }: { items: N[]; filter: string; page: number; pages: number; unread: number }) {
  const router = useRouter();
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => { const r = await p; if (!r.ok) toast.error(r.error); router.refresh(); };
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
          {["all", "unread", "read"].map((f) => <Link key={f} href={`/inbox?filter=${f}`} className={cn("rounded-md px-3 py-1 text-[13px] font-medium capitalize text-muted-foreground", filter === f && "bg-surface text-foreground shadow-soft")}>{f}</Link>)}
        </div>
        <Button variant="outline" size="sm" className="ml-auto" disabled={!unread} onClick={() => run(markNotificationsRead({ all: true }))}><CheckCheck /> Mark all as read</Button>
      </div>
      {items.length === 0 ? <EmptyState icon={Inbox} title="No notifications" description="You'll be notified about assignments, mentions, comments and deadlines." /> : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
          {items.map((n) => {
            const Icon = ICONS[n.type] ?? RefreshCw;
            return (
              <li key={n.id} className={cn("group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40", !n.readAt && "bg-accent/30")}>
                <div className="relative">
                  <Avatar name={n.actorName ?? "Tessera"} color={n.actorColor ?? "#0f766e"} size={32} />
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-card p-0.5"><Icon className="size-3 text-primary" /></span>
                </div>
                <button className="min-w-0 flex-1 text-left" onClick={async () => { if (!n.readAt) await markNotificationsRead({ ids: [n.id] }); if (n.link) router.push(n.link); else router.refresh(); }}>
                  <p className={cn("text-[13px]", !n.readAt && "font-medium")}>{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground" suppressHydrationWarning>{timeAgo(n.createdAt)}</p>
                </button>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100" aria-label={n.readAt ? "Mark unread" : "Mark read"} onClick={() => run(n.readAt ? markNotificationUnread({ id: n.id }) : markNotificationsRead({ ids: [n.id] }))}>{n.readAt ? <Mail /> : <MailOpen />}</Button>
                {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>{page > 1 ? <Link href={`/inbox?filter=${filter}&page=${page - 1}`}>Newer</Link> : <span>Newer</span>}</Button>
          <span className="self-center text-xs text-muted-foreground">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} asChild={page < pages}>{page < pages ? <Link href={`/inbox?filter=${filter}&page=${page + 1}`}>Older</Link> : <span>Older</span>}</Button>
        </div>
      )}
    </div>
  );
}
