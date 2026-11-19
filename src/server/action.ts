import "server-only";
import { z } from "zod";
import { getCurrentUser, type SessionUser } from "./session";
import { AuthzError, NotFoundError } from "./rbac";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; status?: number; fieldErrors?: Record<string, string[]> };

/**
 * Wraps a server action with authentication, Zod input validation and uniform error handling.
 * Never reports success unless the handler actually completed.
 */
export function action<S extends z.ZodTypeAny, T>(schema: S, handler: (input: z.infer<S>, user: SessionUser) => Promise<T>) {
  return async (input: z.input<S>): Promise<ActionResult<T>> => {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Your session has expired. Please sign in again.", status: 401 };
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const first = parsed.error.issues[0];
      return { ok: false, status: 400, error: first ? `${first.path.join(".") || "Input"}: ${first.message}` : "Invalid input.", fieldErrors: flat.fieldErrors as Record<string, string[]> };
    }
    try {
      return { ok: true, data: await handler(parsed.data, user) };
    } catch (e) {
      if (e instanceof AuthzError || e instanceof NotFoundError) return { ok: false, error: e.message, status: e.status };
      if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23505") return { ok: false, error: "That value is already in use." };
      console.error("[action]", e);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
