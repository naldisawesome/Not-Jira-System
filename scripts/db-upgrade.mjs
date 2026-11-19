// Applies drizzle/upgrades.sql (idempotent ALTER ... IF NOT EXISTS statements) before `next build`.
// Skips quietly when no database is configured, so builds without DATABASE_URL still work.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

// Local runs: read .env (Vercel provides env vars directly).
const envFile = path.join(process.cwd(), ".env");
if (!process.env.DATABASE_URL && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[db-upgrade] DATABASE_URL not set, skipping");
  process.exit(0);
}
const sql = fs.readFileSync(path.join(process.cwd(), "drizzle", "upgrades.sql"), "utf8");
const client = new pg.Client({ connectionString: url, ssl: process.env.DATABASE_SSL === "true" || /supabase|neon/.test(url) ? { rejectUnauthorized: false } : undefined });
try {
  await client.connect();
  const exists = await client.query("select to_regclass('public.projects') as t");
  if (!exists.rows[0].t) {
    console.log("[db-upgrade] tables not created yet (run drizzle/0000_init.sql first), skipping");
  } else {
    await client.query(sql);
    console.log("[db-upgrade] schema is up to date");
  }
} catch (e) {
  console.error("[db-upgrade] failed:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
