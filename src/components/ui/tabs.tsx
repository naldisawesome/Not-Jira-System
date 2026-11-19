"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-all data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-soft", className)} {...p} />;
}
export const TabsContent = TabsPrimitive.Content;
