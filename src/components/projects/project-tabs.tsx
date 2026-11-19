"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Columns3, List, CalendarDays, GanttChart, Layers, Zap, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectTabs({ id, canManage }: { id: string; canManage: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: `/projects/${id}`, label: "Overview", icon: LayoutGrid, exact: true },
    { href: `/projects/${id}/board`, label: "Board", icon: Columns3 },
    { href: `/projects/${id}/list`, label: "List", icon: List },
    { href: `/projects/${id}/calendar`, label: "Calendar", icon: CalendarDays },
    { href: `/projects/${id}/timeline`, label: "Timeline", icon: GanttChart },
    { href: `/projects/${id}/backlog`, label: "Backlog", icon: Layers },
    { href: `/projects/${id}/sprints`, label: "Sprints", icon: Zap },
    ...(canManage ? [{ href: `/projects/${id}/settings`, label: "Settings", icon: Settings }] : []),
  ];
  return (
    <nav className="scrollbar-thin -mx-1 flex gap-0.5 overflow-x-auto border-b px-1">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={cn("relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground", active && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary")}>
            <t.icon className={cn("size-4", active && "text-primary")} />{t.label}
          </Link>
        );
      })}
    </nav>
  );
}
