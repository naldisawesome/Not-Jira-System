# Tessera — project management & issue tracking

Original Jira/Linear-class work tracker: projects, issues, sprints, files, collaboration and reporting.

**Stack:** Next.js 14 (App Router, server actions) · TypeScript · Tailwind + Radix (shadcn-style) · Lucide · PostgreSQL + Drizzle ORM · NextAuth (credentials, JWT) · S3-compatible storage · Recharts · dnd-kit · React Hook Form + Zod.

## Quick start
```bash
cp .env.example .env          # set DATABASE_URL + NEXTAUTH_SECRET
npm install
npm run db:migrate            # applies ./drizzle migrations
npm run db:seed               # optional demo workspace
npm run dev
```
Demo logins (password `Password123!`): `admin@` (Super Admin), `pm@` (Project Manager), `dev@` (Member), `viewer@` (Viewer) — all `@tessera.dev`.

## Environment
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL (Supabase / Neon / RDS). `DATABASE_SSL=true` for hosted DBs |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Auth.js session signing / base URL |
| `STORAGE_DRIVER` | `s3` for production, `local` (./storage) for dev only |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | Any S3-compatible store (Supabase Storage S3, R2, AWS, MinIO) |
| `MAX_UPLOAD_MB`, `NEXT_PUBLIC_MAX_UPLOAD_MB` | Upload size limit (server / client hint) |
| `CRON_SECRET` | Protects `/api/cron/deadlines` (schedule hourly) |

**Vercel:** local disk storage won't persist — use `STORAGE_DRIVER=s3`. Vercel functions cap request bodies at ~4.5 MB; for larger files switch uploads to presigned URLs.

## Architecture
- `src/db/schema.ts` — relational schema (orgs, users, teams, projects, project_members, workflows/statuses, tasks w/ parent/subtasks, dependencies, checklists, labels, watchers, comments+replies, attachments metadata, time_logs, sprints, milestones, notifications, activity_logs, saved_filters, invitations, api_tokens, user_settings). FKs, indexes, org_id on every tenant table.
- `src/server/rbac.ts` — server-side authorization (org roles + per-project Lead/Member/Viewer). Every action and API route goes through it.
- `src/server/actions/*` — validated (Zod) server actions with audit logging + notifications.
- `src/app/api/uploads` / `api/files/[id]` — authenticated upload/download; extension + MIME + magic-byte checks, SVG script rejection + sandbox CSP, metadata in DB, binaries in object storage.
- REST API: `/api/v1/projects`, `/api/v1/tasks`, `/api/v1/tasks/:id` (Bearer token from Account settings).

## Not yet included
Email delivery (needs SMTP/Resend), webhooks, recurring tasks, custom fields, project templates, presigned large uploads, realtime websockets (uses polling/refresh).
