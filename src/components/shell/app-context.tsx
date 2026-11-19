"use client";
import { createContext, useContext, useState, useCallback } from "react";
import type { Role } from "@/db/schema";

export type Member = { id: string; name: string; username: string; avatarColor: string; role: Role; title: string | null; email: string; isActive: boolean };
export type LabelT = { id: string; name: string; color: string };
export type StatusT = { id: string; name: string; color: string; category: string; position: number; workflowId: string };
export type ProjectLite = { id: string; name: string; key: string; color: string; workflowId: string; canEdit: boolean; canManage: boolean; archived: boolean };
export type SprintLite = { id: string; name: string; projectId: string; state: string };
export type MilestoneLite = { id: string; name: string; projectId: string };

export type AppData = {
  me: { id: string; name: string; username: string; email: string; role: Role; avatarColor: string; orgName: string };
  perms: { createProject: boolean; manageUsers: boolean; manageWorkflows: boolean; manageOrg: boolean; manageTeams: boolean; isViewer: boolean };
  projects: ProjectLite[];
  members: Member[];
  labels: LabelT[];
  statuses: StatusT[];
  sprints: SprintLite[];
  milestones: MilestoneLite[];
};

type QuickCreate = { open: boolean; defaults: Record<string, string | undefined> };
const Ctx = createContext<(AppData & { quick: QuickCreate; openQuickCreate: (d?: Record<string, string | undefined>) => void; closeQuickCreate: () => void }) | null>(null);

export function AppProvider({ data, children }: { data: AppData; children: React.ReactNode }) {
  const [quick, setQuick] = useState<QuickCreate>({ open: false, defaults: {} });
  const openQuickCreate = useCallback((d: Record<string, string | undefined> = {}) => {
    // Default to the project currently in view (project workspace URL or ?project= filter).
    if (!d.projectId && typeof window !== "undefined") {
      const fromPath = window.location.pathname.match(/^\/projects\/([0-9a-f-]{36})/i)?.[1];
      const fromQuery = new URLSearchParams(window.location.search).get("project");
      d = { ...d, projectId: fromPath ?? fromQuery ?? undefined };
    }
    setQuick({ open: true, defaults: d });
  }, []);
  const closeQuickCreate = useCallback(() => setQuick((q) => ({ ...q, open: false })), []);
  return <Ctx.Provider value={{ ...data, quick, openQuickCreate, closeQuickCreate }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

export function useLookups() {
  const app = useApp();
  return {
    member: (id?: string | null) => app.members.find((m) => m.id === id),
    status: (id?: string | null) => app.statuses.find((s) => s.id === id),
    project: (id?: string | null) => app.projects.find((p) => p.id === id),
    statusesFor: (projectId?: string | null) => {
      const p = app.projects.find((x) => x.id === projectId);
      return p ? app.statuses.filter((s) => s.workflowId === p.workflowId).sort((a, b) => a.position - b.position) : [];
    },
  };
}
