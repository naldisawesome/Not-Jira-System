"use client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useApp } from "@/components/shell/app-context";

export function QuickAddButton({ projectId, defaults, children, ...props }: ButtonProps & { projectId?: string; defaults?: Record<string, string> }) {
  const app = useApp();
  return <Button size="sm" {...props} onClick={() => app.openQuickCreate({ projectId, ...defaults })}>{children}</Button>;
}
