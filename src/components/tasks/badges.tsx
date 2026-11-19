import { Bug, Sparkles, CheckSquare, TrendingUp, BookOpen, Mountain, LifeBuoy, ChevronsUp, ChevronUp, Equal, ChevronDown, CircleDashed, Circle, CircleDot, CircleCheck, CircleSlash } from "lucide-react";
import { priorityMeta, typeMeta } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TYPE_ICONS = { task: CheckSquare, bug: Bug, feature: Sparkles, improvement: TrendingUp, story: BookOpen, epic: Mountain, support: LifeBuoy } as const;
export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = TYPE_ICONS[type as keyof typeof TYPE_ICONS] ?? CheckSquare;
  return <Icon className={cn("size-3.5 shrink-0", className)} style={{ color: typeMeta(type).color }} aria-label={typeMeta(type).label} />;
}

const PRIO_ICONS = { critical: ChevronsUp, high: ChevronUp, medium: Equal, low: ChevronDown } as const;
export function PriorityIcon({ priority, className }: { priority: string; className?: string }) {
  const Icon = PRIO_ICONS[priority as keyof typeof PRIO_ICONS] ?? Equal;
  return <Icon className={cn("size-3.5 shrink-0", className)} strokeWidth={2.5} style={{ color: priorityMeta(priority).color }} aria-label={`${priorityMeta(priority).label} priority`} />;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const m = priorityMeta(priority);
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ background: m.color + "14", color: m.color }}>
      <PriorityIcon priority={priority} className="size-3" />
      {m.label}
    </span>
  );
}

const CAT_ICONS = { backlog: CircleDashed, todo: Circle, in_progress: CircleDot, done: CircleCheck, cancelled: CircleSlash } as const;
export function StatusIcon({ category, color, className }: { category: string; color: string; className?: string }) {
  const Icon = CAT_ICONS[category as keyof typeof CAT_ICONS] ?? Circle;
  return <Icon className={cn("size-3.5 shrink-0", className)} style={{ color }} strokeWidth={2.25} />;
}

export function StatusPill({ name, color, category, className }: { name: string; color: string; category: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium", className)} style={{ borderColor: color + "40", background: color + "10" }}>
      <StatusIcon category={category} color={color} className="size-3" />
      {name}
    </span>
  );
}
