import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { getCurrentUser, loadUser, runAsUser, type SessionUser } from "./session";

/** Authenticates REST API calls via `Authorization: Bearer tsk_…` (or the browser session) and runs the handler as that user. */
export async function withApiUser(req: Request, handler: (user: SessionUser) => Promise<Response>) {
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    const hash = createHash("sha256").update(header.slice(7).trim()).digest("hex");
    const [tok] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).limit(1);
    const user = tok ? await loadUser(tok.userId) : null;
    if (!user) return NextResponse.json({ error: "Invalid or revoked API token" }, { status: 401 });
    db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, tok!.id)).catch(() => undefined);
    return runAsUser(user, () => handler(user));
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized. Send Authorization: Bearer <token>." }, { status: 401 });
  return handler(user);
}

export const apiError = (r: { error: string; status?: number }) => NextResponse.json({ error: r.error }, { status: r.status ?? 500 });
