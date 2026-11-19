"use client";
import * as React from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export function DropdownMenuContent({ className, align = "end", ...props }: React.ComponentPropsWithoutRef<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn("z-50 min-w-[11rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lift data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", className)} {...props} />
    </DM.Portal>
  );
}
export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentPropsWithoutRef<typeof DM.Item> & { destructive?: boolean }) {
  return <DM.Item className={cn("relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none transition-colors focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground", destructive && "text-destructive focus:bg-destructive/10 [&_svg]:text-destructive", className)} {...props} />;
}
export const DropdownMenuSeparator = ({ className }: { className?: string }) => <DM.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} />;
export const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => <DM.Label className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</DM.Label>;

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
export function PopoverContent({ className, align = "start", ...props }: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={6} className={cn("z-50 w-72 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lift outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}
