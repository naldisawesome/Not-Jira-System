"use client";
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ProjectForm } from "./project-form";

export function NewProjectButton({ workflows }: { workflows: { id: string; name: string; isDefault: boolean }[] }) {
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (sp.get("new") === "1") setOpen(true); }, [sp]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}><Plus /> New project</Button>
      {open && (
        <DialogContent title="Create project" description="Projects get their own workspace, board, sprints and files." wide>
          <ProjectForm workflows={workflows} onDone={() => setOpen(false)} />
        </DialogContent>
      )}
    </Dialog>
  );
}
