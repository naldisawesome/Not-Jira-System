import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { buildReports, type ReportKey } from "@/server/reports";
import { toCSV } from "@/lib/utils";

const KEYS: ReportKey[] = ["projects", "completion", "bugs", "productivity", "workload", "overdue", "sprints"];

export async function GET(req: Request, { params }: { params: { key: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!KEYS.includes(params.key as ReportKey)) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  const project = new URL(req.url).searchParams.get("project") ?? undefined;
  const data = await buildReports(user, project);
  const rows = (data?.[params.key as ReportKey] ?? []) as Record<string, unknown>[];
  return new NextResponse("﻿" + toCSV(rows.map(({ id: _id, ...r }) => r)), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${params.key}-report-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
