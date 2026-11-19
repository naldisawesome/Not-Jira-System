import { cn } from "@/lib/utils";
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <rect x="7" y="7" width="8" height="8" rx="2" fill="#fff" />
      <rect x="17" y="7" width="8" height="8" rx="2" fill="#fff" opacity=".55" />
      <rect x="7" y="17" width="8" height="8" rx="2" fill="#fff" opacity=".55" />
      <rect x="17" y="17" width="8" height="8" rx="2" fill="#5eead4" />
    </svg>
  );
}
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">Tessera</span>
    </span>
  );
}
