import { NextResponse } from "next/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { getCurrentUser } from "@/server/session";
import { scanDeadlines } from "@/server/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await scanDeadlines(user.orgId).catch((e) => console.error("[deadlines]", e));
  const [items, [unread]] = await Promise.all([
    db
      .select({ id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body, link: notifications.link, readAt: notifications.readAt, createdAt: notifications.createdAt, actorName: users.name, actorColor: users.avatarColor })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(12),
    db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
  ]);
  return NextResponse.json({ items, unread: unread?.n ?? 0 });
}
