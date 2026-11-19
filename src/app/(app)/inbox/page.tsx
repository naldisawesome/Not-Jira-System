import { and, count, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { requireUser } from "@/server/session";
import { scanDeadlines } from "@/server/activity";
import { PageHeader } from "@/components/page-header";
import { InboxList } from "@/components/inbox-list";

export const metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: { filter?: string; page?: string } }) {
  const user = await requireUser();
  await scanDeadlines(user.orgId).catch(() => undefined);
  const filter = searchParams.filter === "unread" ? "unread" : searchParams.filter === "read" ? "read" : "all";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const where = and(eq(notifications.userId, user.id), filter === "unread" ? isNull(notifications.readAt) : filter === "read" ? isNotNull(notifications.readAt) : undefined);
  const [items, totalRows, unreadRows] = await Promise.all([
    db
      .select({ id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body, link: notifications.link, readAt: notifications.readAt, createdAt: notifications.createdAt, actorName: users.name, actorColor: users.avatarColor })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(30)
      .offset((page - 1) * 30),
    db.select({ n: count() }).from(notifications).where(where),
    db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
  ]);
  const total = totalRows[0]?.n ?? 0;
  const unread = unreadRows[0]?.n ?? 0;
  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <PageHeader title="Inbox" description={`${unread} unread notification${unread === 1 ? "" : "s"}`} />
      <InboxList items={items} filter={filter} page={page} pages={Math.max(1, Math.ceil(total / 30))} unread={unread} />
    </div>
  );
}
