import type { TaskFilters } from "@/server/queries";
type SP = Record<string, string | undefined>;
export function filtersFrom(sp: SP): TaskFilters {
  return { q: sp.q, assignee: sp.assignee, reporter: sp.reporter, priority: sp.priority, type: sp.type, label: sp.label, status: sp.status, category: sp.category, due: sp.due, sprint: sp.sprint, milestone: sp.milestone };
}
