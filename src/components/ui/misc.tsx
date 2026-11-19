import * as React from "react";
import { cn, initials } from "@/lib/utils";
export { TooltipProvider, Tip, Checkbox, Switch } from "./primitives";

export function Badge({ className, color, children, variant = "soft" }: { className?: string; color?: string; children: React.ReactNode; variant?: "soft" | "outline" | "solid" }) {
  const style = color
    ? variant === "solid"
      ? { background: color, color: "#fff" }
      : variant === "outline"
        ? { borderColor: color + "66", color }
        : { background: color + "1a", color }
    : undefined;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4", variant === "outline" && "border", !color && "bg-muted text-muted-foreground", className)} style={style}>
      {children}
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function Avatar({ name, color, size = 24, className }: { name?: string | null; color?: string | null; size?: number; className?: string }) {
  return (
    <span
      title={name ?? "Unassigned"}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ring-2 ring-background", !name && "border border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground ring-0", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38), background: name ? (color ?? "#64748b") : undefined }}
    >
      {name ? initials(name) : "?"}
    </span>
  );
}

export function AvatarStack({ users, max = 4, size = 24 }: { users: { name: string; avatarColor: string }[]; max?: number; size?: number }) {
  return (
    <div className="flex -space-x-1.5">
      {users.slice(0, max).map((u, i) => <Avatar key={i} name={u.name} color={u.avatarColor} size={size} />)}
      {users.length > max && <span className="inline-flex items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-background" style={{ width: size, height: size }}>+{users.length - max}</span>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      {Icon && <div className="mb-3 rounded-xl bg-muted p-3"><Icon className="size-5 text-muted-foreground" /></div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Progress({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}
