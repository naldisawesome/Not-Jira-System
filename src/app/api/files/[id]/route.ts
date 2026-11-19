import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { getCurrentUser } from "@/server/session";
import { getProjectAccess } from "@/server/rbac";
import { storage } from "@/server/storage";

export const runtime = "nodejs";

/** Authenticated download. Access requires view permission on the owning project. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new NextResponse("Not found", { status: 404 });

  const [file] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, params.id), eq(attachments.orgId, user.orgId)))
    .limit(1);
  if (!file) return new NextResponse("Not found", { status: 404 });
  if (file.projectId) {
    try {
      await getProjectAccess(user, file.projectId);
    } catch {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  let body: Buffer;
  try {
    body = await storage().get(file.storageKey);
  } catch {
    return new NextResponse("File is missing from storage", { status: 410 });
  }
  const download = new URL(req.url).searchParams.get("download") === "1";
  const inlineOk = file.mimeType.startsWith("image/") || file.mimeType === "application/pdf" || file.mimeType === "text/plain";
  const disposition = download || !inlineOk ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(body.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Neutralise any active content in SVG/text (defence-in-depth on top of upload validation).
      ...(file.mimeType === "image/svg+xml" || file.mimeType.startsWith("text/") ? { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" } : {}),
    },
  });
}
