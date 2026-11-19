import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card text-card-foreground shadow-soft", className)} {...props} />;
}
export function CardHeader({ className, title, description, action, children }: { className?: string; title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        {title && <h3 className="text-sm font-semibold tracking-tight">{title}</h3>}
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        {children}
      </div>
      {action}
    </div>
  );
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}
