import { phaseMeta } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Development-phase tag (Staging, Production, …) shown on project cards and headers. */
export function PhaseBadge({ phase, className, solid }: { phase: string; className?: string; solid?: boolean }) {
  const m = phaseMeta(phase);
  return (
    <span
      title={`${m.label}: ${m.description}`}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", className)}
      style={solid ? { background: m.color, borderColor: m.color, color: "#fff" } : { background: m.color + "14", borderColor: m.color + "55", color: m.color }}
    >
      <span className={cn("size-1.5 rounded-full", m.value === "production" && "animate-pulse")} style={{ background: solid ? "#fff" : m.color }} />
      {m.label}
    </span>
  );
}
