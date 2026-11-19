import "server-only";
import { cache } from "react";
import { AsyncLocalStorage } from "node:async_hooks";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";
import { authOptions } from "./auth";

export type SessionUser = typeof users.$inferSelect & { org: typeof organizations.$inferSelect };

const apiUser = new AsyncLocalStorage<SessionUser>();
/** Runs `fn` as an API-token-authenticated user (REST API); server actions then authorize as that user. */
export function runAsUser<T>(user: SessionUser, fn: () => Promise<T>) {
  return apiUser.run(user, fn);
}

/** Loads the signed-in user fresh from the DB on every request so role changes and deactivation apply immediately. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return apiUser.getStore() ?? sessionUser();
}

const sessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return null;
  return loadUser(uid);
});

export async function loadUser(uid: string): Promise<SessionUser | null> {
  const rows = await db
    .select({ user: users, org: organizations })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(and(eq(users.id, uid), eq(users.isActive, true)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row.user, org: row.org };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
