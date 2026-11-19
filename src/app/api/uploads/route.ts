import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, comments } from "@/db/schema";
import { getCurrentUser } from "@/server/session";
import { requireProject, requireTask, AuthzError, NotFoundError } from "@/server/rbac";
import { validateUpload, imageSize, UploadError } from "@/server/file-validation";
import { storage } from "@/server/storage";
import { logActivity } from "@/server/activity";

export const runtime = "nodejs";
const CONTEXTS = ["task", "comment", "description", "project", "cover", "bug"] as const;
type Ctx = (typeof CONTEXTS)[number];

/** Authenticated multipart upload. One file per request so the client can report per-file progress. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
  }
  const file = form.get("file");
  const context = String(form.get("context") ?? "task") as Ctx;
  const taskId = (form.get("taskId") as string) || null;
  let projectId = (form.get("projectId") as string) || null;
  const commentId = (form.get("commentId") as string) || null;

  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!CONTEXTS.includes(context)) return NextResponse.json({ error: "Invalid upload context." }, { status: 400 });

  try {
    if (taskId) {
      const { task } = await requireTask(user, taskId, "edit");
      projectId = task.projectId;
    } else if (projectId) {
      await requireProject(user, projectId, context === "cover" || context === "project" ? "edit" : "edit");
    } else {
      return NextResponse.json({ error: "Uploads must belong to a project or task." }, { status: 400 });
    }
    if (commentId) {
      const [c] = await db.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.orgId, user.orgId))).limit(1);
      if (!c || c.taskId !== taskId || c.authorId !== user.id) throw new AuthzError();
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const v = validateUpload(file.name, file.type, buf, context === "cover");
    const dims = v.mime.startsWith("image/") ? imageSize(v.ext, buf) : null;
    const key = `${user.orgId}/${projectId}/${randomUUID()}.${v.ext}`;
    await storage().put(key, buf, v.mime);

    const [row] = await db
      .insert(attachments)
      .values({
        orgId: user.orgId,
        projectId,
        taskId,
        commentId,
        context,
        uploadedById: user.id,
        fileName: v.name,
        mimeType: v.mime,
        sizeBytes: buf.length,
        storageKey: key,
        width: dims?.width,
        height: dims?.height,
      })
      .returning();

    if (taskId && context !== "comment")
      await logActivity(db, { orgId: user.orgId, actorId: user.id, entity: "attachment", action: "uploaded", projectId, taskId, meta: { fileName: v.name } });

    return NextResponse.json({
      attachment: { ...row, url: `/api/files/${row!.id}`, uploadedByName: user.name },
    });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof AuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error("[upload]", e);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
