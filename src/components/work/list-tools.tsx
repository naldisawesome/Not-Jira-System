"use client";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "./import-dialog";

export function ListTools({ projectId, canImport }: { projectId?: string; canImport: boolean }) {
  const sp = useSearchParams();
  const qs = new URLSearchParams(sp.toString());
  if (projectId) qs.set("project", projectId);
  return (
    <>
      <Button variant="outline" size="sm" asChild><a href={`/api/export/tasks?${qs}`}><Download /> Export CSV</a></Button>
      {canImport && <ImportDialog projectId={projectId} />}
    </>
  );
}
