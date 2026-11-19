import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

// Simple in-memory login throttle (per instance). Use a shared store (Redis) for multi-instance deployments.
const attempts = new Map<string, { count: number; until: number }>();
function throttled(key: string) {
  const a = attempts.get(key);
  return a && a.count >= 8 && a.until > Date.now();
}
function recordFailure(key: string) {
  const a = attempts.get(key);
  const until = Date.now() + 10 * 60_000;
  attempts.set(key, { count: (a && a.until > Date.now() ? a.count : 0) + 1, until });
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        if (throttled(email)) throw new Error("Too many attempts. Try again in a few minutes.");
        const [user] = await db
          .select()
          .from(users)
          .where(and(sql`lower(${users.email}) = ${email}`, eq(users.isActive, true)))
          .limit(1);
        if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
          recordFailure(email);
          return null;
        }
        attempts.delete(email);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
};
