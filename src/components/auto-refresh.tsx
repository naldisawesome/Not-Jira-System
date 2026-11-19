"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keeps server-rendered data fresh: refreshes on an interval and when the tab regains focus. */
export function AutoRefresh({ every = 45 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), every * 1000);
    const f = () => router.refresh();
    window.addEventListener("focus", f);
    return () => { clearInterval(t); window.removeEventListener("focus", f); };
  }, [router, every]);
  return null;
}
