"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, FolderKanban, MessageSquare, Plus, Bug, LayoutDashboard, CircleCheckBig, Inbox, BarChart3, Columns3, Moon, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { commandPalette } from "@/lib/store";
import { typeMeta } from "@/lib/constants";
import { Avatar, Dot } from "@/components/ui/misc";
import { useApp } from "./app-context";

type Results = {
  tasks: { id: string; title: string; key: string; type: string; statusName: string; statusColor: string }[];
  projects: { id: string; name: string; key: string; color: string }[];
  users: { id: string; name: string; username: string; avatarColor: string; title: string | null }[];
  comments: { id: string; body: string; taskId: string; key: string; author: string | null }[];
};

export function CommandPalette() {
  const open = commandPalette.useValue();
  const router = useRouter();
  const app = useApp();
  const { resolvedTheme, setTheme } = useTheme();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setQ(""); setRes(null); }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (r.ok) setRes(await r.json());
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const go = (href: string) => { commandPalette.set(false); router.push(href); };
  const item = "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] aria-selected:bg-muted";
  const group = "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";
  const canCreate = app.projects.some((p) => p.canEdit);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={commandPalette.set}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-2xl animate-in fade-in-0 zoom-in-[0.98]">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search or run a command</DialogPrimitive.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b px-3">
              {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Search className="size-4 text-muted-foreground" />}
              <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search or type a command… (try WEB-003)" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-1.5">
              {q && res && !res.tasks.length && !res.projects.length && !res.users.length && !res.comments.length && (
                <div className="py-10 text-center text-sm text-muted-foreground">No results for “{q}”.</div>
              )}
              {!q && (
                <>
                  <Command.Group heading="Quick actions" className={group}>
                    {canCreate && <Command.Item className={item} onSelect={() => { commandPalette.set(false); app.openQuickCreate(); }}><Plus className="size-4" /> Create task</Command.Item>}
                    {canCreate && <Command.Item className={item} onSelect={() => go("/bugs/new")}><Bug className="size-4" /> Report a bug</Command.Item>}
                    <Command.Item className={item} onSelect={() => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); commandPalette.set(false); }}><Moon className="size-4" /> Toggle dark mode</Command.Item>
                  </Command.Group>
                  <Command.Group heading="Go to" className={group}>
                    {[["/", "Overview", LayoutDashboard], ["/my-tasks", "My Tasks", CircleCheckBig], ["/inbox", "Inbox", Inbox], ["/board", "Board", Columns3], ["/projects", "Projects", FolderKanban], ["/reports", "Reports", BarChart3]].map(([h, l, I]) => {
                      const Icon = I as typeof Inbox;
                      return <Command.Item key={h as string} className={item} onSelect={() => go(h as string)}><Icon className="size-4" /> {l as string}</Command.Item>;
                    })}
                  </Command.Group>
                </>
              )}
              {res && res.tasks.length > 0 && (
                <Command.Group heading="Tasks & issues" className={group}>
                  {res.tasks.map((t) => (
                    <Command.Item key={t.id} value={`t-${t.id}`} className={item} onSelect={() => go(`/tasks/${t.id}`)}>
                      <Dot color={typeMeta(t.type).color} />
                      <span className="task-key w-16 shrink-0">{t.key}</span>
                      <span className="truncate">{t.title}</span>
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground"><Dot color={t.statusColor} />{t.statusName}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {res && res.projects.length > 0 && (
                <Command.Group heading="Projects" className={group}>
                  {res.projects.map((p) => (
                    <Command.Item key={p.id} value={`p-${p.id}`} className={item} onSelect={() => go(`/projects/${p.id}`)}>
                      <span className="flex size-5 items-center justify-center rounded text-[9px] font-bold text-white" style={{ background: p.color }}>{p.key[0]}</span>
                      {p.name} <span className="task-key">{p.key}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {res && res.users.length > 0 && (
                <Command.Group heading="People" className={group}>
                  {res.users.map((u) => (
                    <Command.Item key={u.id} value={`u-${u.id}`} className={item} onSelect={() => go(`/members/${u.id}`)}>
                      <Avatar name={u.name} color={u.avatarColor} size={20} /> {u.name} <span className="text-xs text-muted-foreground">@{u.username}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {res && res.comments.length > 0 && (
                <Command.Group heading="Comments" className={group}>
                  {res.comments.map((c) => (
                    <Command.Item key={c.id} value={`c-${c.id}`} className={item} onSelect={() => go(`/tasks/${c.taskId}#comment-${c.id}`)}>
                      <MessageSquare className="size-4 shrink-0" /> <span className="task-key">{c.key}</span>
                      <span className="truncate text-muted-foreground">{c.author}: {c.body}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {q && (
                <Command.Group heading="More" className={group}>
                  <Command.Item className={item} onSelect={() => go(`/search?q=${encodeURIComponent(q)}`)}><Search className="size-4" /> See all results for “{q}”</Command.Item>
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
