"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { Menu, Search, Plus, Moon, Sun, LogOut, Settings, UserRound, Keyboard, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Tip } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { commandPalette, mobileNav } from "@/lib/store";
import { roleLabel } from "@/lib/constants";
import { useApp } from "./app-context";
import { NotificationBell } from "./notification-bell";
import { CommandPalette } from "./command-palette";
import { useRouter } from "next/navigation";

const SHORTCUTS: [string, string][] = [
  ["⌘ K  /  Ctrl K", "Open command palette & search"],
  ["/", "Search"],
  ["C", "Create a task"],
  ["B", "Report a bug"],
  ["G then H", "Go to Overview"],
  ["G then M", "Go to My Tasks"],
  ["G then I", "Go to Inbox"],
  ["G then P", "Go to Projects"],
  ["?", "Show keyboard shortcuts"],
];

export function Topbar() {
  const app = useApp();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [help, setHelp] = useState(false);
  const canCreate = app.projects.some((p) => p.canEdit);

  useEffect(() => {
    let g = false;
    let gTimer: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        commandPalette.set((v) => !v);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      if (g) {
        g = false;
        const map: Record<string, string> = { h: "/", m: "/my-tasks", i: "/inbox", p: "/projects" };
        if (map[e.key]) router.push(map[e.key]!);
        return;
      }
      if (e.key === "g") { g = true; gTimer = setTimeout(() => (g = false), 900); }
      else if (e.key === "/") { e.preventDefault(); commandPalette.set(true); }
      else if (e.key === "c" && canCreate) { e.preventDefault(); app.openQuickCreate(); }
      else if (e.key === "b" && canCreate) router.push("/bugs/new");
      else if (e.key === "?") setHelp(true);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(gTimer); };
  }, [app, canCreate, router]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => mobileNav.set(true)} aria-label="Open menu"><Menu /></Button>
      <button onClick={() => commandPalette.set(true)} className="group flex h-9 w-full max-w-md items-center gap-2 rounded-lg border bg-surface px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:border-foreground/20">
        <Search className="size-4" />
        <span className="flex-1 truncate text-left"><span className="sm:hidden">Search…</span><span className="hidden sm:inline">Search tasks, projects, people…</span></span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        {canCreate && (
          <Button size="sm" onClick={() => app.openQuickCreate()} className="hidden sm:inline-flex"><Plus /> New task</Button>
        )}
        {canCreate && <Button size="icon" onClick={() => app.openQuickCreate()} className="sm:hidden" aria-label="New task"><Plus /></Button>}
        <Tip content="Toggle theme">
          <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            <Sun className="hidden dark:block" /><Moon className="dark:hidden" />
          </Button>
        </Tip>
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-1 rounded-full outline-none ring-ring focus-visible:ring-2"><Avatar name={app.me.name} color={app.me.avatarColor} size={30} /></DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <div className="px-2 py-2">
              <p className="text-sm font-medium">{app.me.name}</p>
              <p className="truncate text-xs text-muted-foreground">{app.me.email}</p>
              <p className="mt-1 text-[11px] text-primary">{roleLabel(app.me.role)}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href={`/members/${app.me.id}`}><UserRound /> My profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings"><Settings /> Account settings</Link></DropdownMenuItem>
            {canCreate && <DropdownMenuItem asChild><Link href="/bugs/new"><Bug /> Report a bug</Link></DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => setHelp(true)}><Keyboard /> Keyboard shortcuts</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Session</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}><LogOut /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommandPalette />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent title="Keyboard shortcuts">
          <ul className="divide-y text-sm">
            {SHORTCUTS.map(([k, d]) => (
              <li key={k} className="flex items-center justify-between py-2"><span className="text-muted-foreground">{d}</span><kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">{k}</kbd></li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </header>
  );
}
