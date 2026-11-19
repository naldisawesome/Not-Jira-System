export { default } from "next-auth/middleware";

export const config = {
  // Everything except auth pages, NextAuth endpoints, the token-authenticated REST API, cron and static assets requires a session.
  matcher: ["/((?!login|signup|invite|api/auth|api/v1|api/cron|_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
