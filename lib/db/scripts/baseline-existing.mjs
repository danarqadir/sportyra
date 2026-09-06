import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const packageDir = path.resolve(import.meta.dirname, "..");
const migrationDir = path.join(packageDir, "drizzle");
const baselinePath = path.join(migrationDir, "0000_black_wraith.sql");
const journalPath = path.join(migrationDir, "meta", "_journal.json");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before adopting an existing database");
}

const expectedTables = [
  "analytics_events", "bookmarks", "comments", "entity_follows", "competitions", "fixtures", "teams",
  "audit_events", "detection_alerts", "publisher_risk_scores", "news", "newsletter_subscribers", "users",
  "user_sessions", "push_subscriptions", "password_resets", "notification_preferences", "notifications",
  "audit_log", "moderation_reports", "imported_articles", "sports_data_cache", "players", "match_events",
  "match_lineups", "match_statistics", "matches", "transfers", "leaderboard", "predictions", "team_pages",
  "creator_earnings_ledger", "partners", "payouts", "referral_clicks", "referral_events", "referral_links",
  "ad_events", "ad_placements", "campaigns", "content_labels", "monetization_events",
];

const baselineSql = fs.readFileSync(baselinePath);
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const baselineEntry = journal.entries.find((entry) => entry.tag === "0000_black_wraith");
if (!baselineEntry) throw new Error("Baseline migration entry is missing from the Drizzle journal");
const baselineHash = crypto.createHash("sha256").update(baselineSql).digest("hex");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const tableResult = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    [expectedTables],
  );
  const present = new Set(tableResult.rows.map((row) => row.tablename));
  const missing = expectedTables.filter((table) => !present.has(table));
  if (missing.length) {
    throw new Error(`Refusing to baseline a partial database. Missing tables: ${missing.join(", ")}`);
  }

  await client.query("BEGIN");
  await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const rows = await client.query('SELECT hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC');
  const existingBaseline = rows.rows.find((row) => row.hash === baselineHash && Number(row.created_at) === baselineEntry.when);
  if (existingBaseline) {
    await client.query("COMMIT");
    console.log("Existing database is already baselined.");
  } else if (rows.rowCount > 0) {
    throw new Error("Refusing to alter an existing Drizzle migration history. Inspect drizzle.__drizzle_migrations manually.");
  } else {
    await client.query(
      'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)',
      [baselineHash, baselineEntry.when],
    );
    await client.query("COMMIT");
    console.log("Existing database baselined safely. Run `pnpm db:migrate` to apply pending migrations.");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
