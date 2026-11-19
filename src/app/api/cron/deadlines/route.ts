import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { scanDeadlines } from "@/server/activity";

/** Schedule (e.g. Vercel Cron, hourly) with header `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  for (const o of orgs) await scanDeadlines(o.id);
  return NextResponse.json({ ok: true, organizations: orgs.length });
}
