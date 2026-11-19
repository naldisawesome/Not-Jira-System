"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard, CircleCheckBig, Inbox, FolderKanban, FolderOpen, Archive, Columns3, List, CalendarDays, GanttChart,
  Layers, Zap, Users, UserRound, Activity, BarChart3, LineChart, ShieldCheck, KeyRound, Workflow, Settings, Bug, X, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mobileNav } from "@/lib/store";
import { useApp } from "./app-context";
import { Logo } from "./logo";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; show?: boolean };

export function Sidebar() {
  const app = useApp();
  const path = usePathname();
  const open = mobileNav.useValue();
  useEffect(() => mobileNav.set(false), [path]);

  const sections: { title: string; items: Item[] }[] = [
    { title: "Workspace", items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/my-tasks", label: "My Tasks", icon: CircleCheckBig },
      { href: "/inbox", label: "Inbox", icon: Inbox },
    ] },
    { title: "Projects", items: [
      { href: "/projects", label: "All Projects", icon: FolderKanban },
      { href: "/projects?view=active", label: "Active Projects", icon: FolderOpen },
      { href: "/projects?view=archived", label: "Archived Projects", icon: Archive },
    ] },
    { title: "Work tracking", items: [
      { href: "/board", label: "Board", icon: Columns3 },
      { href: "/list", label: "List", icon: List },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/timeline", label: "Timeline", icon: GanttChart },
      { href: "/backlog", label: "Backlog", icon: Layers },
      { href: "/sprints", label: "Sprints", icon: Zap },
      { href: "/bugs/new", label: "Report a Bug", icon: Bug, show: !app.perms.isViewer },
    ] },
    { title: "Collaboration", items: [
      { href: "/teams", label: "Teams", icon: Users },
      { href: "/members", label: "Members", icon: UserRound },
      { href: "/activity", label: "Activity", icon: Activity },
    ] },
    { title: "Reporting", items: [
      { href: "/reports", label: "Reports", icon: BarChart3, show: !app.perms.isViewer },
      { href: "/analytics", label: "Analytics", icon: LineChart, show: !app.perms.isViewer },
    ] },
    { title: "Administration", items: [
      { href: "/admin/users", label: "User Management", icon: ShieldCheck, show: app.perms.manageUsers },
      { href: "/admin/roles", label: "Roles & Permissions", icon: KeyRound, show: app.perms.manageUsers },
      { href: "/admin/workflows", label: "Workflow Settings", icon: Workflow, show: app.perms.manageWorkflows },
      { href: "/admin/settings", label: "General Settings", icon: Settings, show: app.perms.manageUsers },
    ] },
  ];

  const isActive = (href: string) => {
    const [p, q] = href.split("?");
    if (q) return false;
    return p === "/" ? path === "/" : path === p || path.startsWith(p + "/");
  };

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/"><Logo /></Link>
        <button className="rounded-md p-1 hover:bg-muted lg:hidden" onClick={() => mobileNav.set(false)} aria-label="Close menu"><X className="size-4" /></button>
      </div>
      <div className="mx-3 mb-2 truncate rounded-lg border bg-surface px-3 py-2 text-xs">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Workspace</p>
        <p className="truncate font-medium">{app.me.orgName}</p>
      </div>
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-3 pb-6 pt-2">
        {sections.map((s) => {
          const items = s.items.filter((i) => i.show !== false);
          if (!items.length) return null;
          return (
            <div key={s.title}>
              <p className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">{s.title}</p>
              <ul className="space-y-px">
                {items.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className={cn("group flex items-center gap-2.5 rounded-md px-2 py-[6px] text-[13px] text-foreground/75 transition-colors hover:bg-foreground/[0.04] hover:text-foreground", isActive(i.href) && "bg-surface font-medium text-foreground shadow-soft ring-1 ring-border")}>
                      <i.icon className={cn("size-[15px] text-muted-foreground group-hover:text-foreground", isActive(i.href) && "text-primary")} />
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {app.projects.filter((p) => !p.archived).length > 0 && (
          <div>
            <p className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Your projects</p>
            <ul className="space-y-px">
              {app.projects.filter((p) => !p.archived).slice(0, 8).map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className={cn("group flex items-center gap-2.5 rounded-md px-2 py-[6px] text-[13px] text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground", path.startsWith(`/projects/${p.id}`) && "bg-surface font-medium text-foreground ring-1 ring-border")}>
                    <span className="flex size-[15px] items-center justify-center rounded text-[8px] font-bold text-white" style={{ background: p.color }}>{p.key[0]}</span>
                    <span className="truncate">{p.name}</span>
                    <ChevronRight className="ml-auto size-3 opacity-0 group-hover:opacity-60" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </nav>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r bg-sidebar lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => mobileNav.set(false)} />
          <aside className="absolute inset-y-0 left-0 w-[264px] animate-in slide-in-from-left border-r bg-sidebar shadow-2xl">{nav}</aside>
        </div>
      )}
    </>
  );
}
