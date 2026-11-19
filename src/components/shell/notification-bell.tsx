"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/misc";
import { markNotificationsRead } from "@/server/actions/collab";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

type N = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; actorName: string | null; actorColor: string | null };

export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<{ items: N[]; unread: number }>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* offline — keep last known state */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function markAll() {
    const r = await markNotificationsRead({ all: true });
    if (!r.ok) return toast.error(r.error);
    await load();
    router.refresh();
  }
  async function openItem(n: N) {
    setOpen(false);
    if (!n.readAt) await markNotificationsRead({ ids: [n.id] });
    load();
    if (n.link) router.push(n.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications (${data.unread} unread)`} className="relative">
          <Bell />
          {data.unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-background">{data.unread > 99 ? "99+" : data.unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="xs" onClick={markAll} disabled={!data.unread}><CheckCheck /> Mark all read</Button>
        </div>
        <ul className="scrollbar-thin max-h-[420px] overflow-y-auto">
          {data.items.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {data.items.map((n) => (
            <li key={n.id}>
              <button onClick={() => openItem(n)} className={cn("flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted", !n.readAt && "bg-accent/40")}>
                <Avatar name={n.actorName ?? "Tessera"} color={n.actorColor ?? "#0f766e"} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug">{n.title}</p>
                  {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            </li>
          ))}
        </ul>
        <Link href="/inbox" onClick={() => setOpen(false)} className="block border-t px-3 py-2 text-center text-xs font-medium text-primary hover:bg-muted">View all in Inbox</Link>
      </PopoverContent>
    </Popover>
  );
}
