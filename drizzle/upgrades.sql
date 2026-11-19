-- Idempotent schema upgrades, applied automatically before every build (scripts/db-upgrade.mjs).
-- Safe to run any number of times. Never drops or rewrites data.
-- Lets databases created by pasting drizzle/0000_init.sql into Supabase stay up to date without a command line.

-- 2026-11-19: project phase / environment tag
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "phase" varchar(20) DEFAULT 'development' NOT NULL;
