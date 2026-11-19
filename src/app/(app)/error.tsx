"use client";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-20 max-w-md rounded-xl border bg-card p-8 text-center shadow-soft">
      <AlertTriangle className="mx-auto mb-3 size-8 text-destructive" />
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted-foreground">We couldn&apos;t load this page. Your data is safe — try again.</p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-muted-foreground">Ref: {error.digest}</p>}
      <Button className="mt-5" onClick={reset}><RotateCw /> Try again</Button>
    </div>
  );
}
