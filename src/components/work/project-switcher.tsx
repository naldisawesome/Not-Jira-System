"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/input";

export function ProjectSwitcher({ projects, value, allowAll }: { projects: { id: string; name: string; key: string; color: string }[]; value: string; allowAll: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <NativeSelect
      aria-label="Project"
      className="h-8 w-auto min-w-[180px] text-[13px] font-medium"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams();
        ["q", "assignee", "priority", "type", "label", "due", "mode", "date"].forEach((k) => sp.get(k) && next.set(k, sp.get(k)!));
        if (e.target.value) next.set("project", e.target.value);
        router.replace(`${pathname}?${next}`);
      }}
    >
      {allowAll && <option value="">All projects</option>}
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.key}</option>)}
    </NativeSelect>
  );
}
