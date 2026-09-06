import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Resolve prod deps from the @workspace/db package (drizzle-orm, pg are production
// dependencies, so this works in the minimal runtime image without drizzle-kit).
const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const migrationDir = path.resolve(here, "..", "drizzle");
const baselinePath = path.join(migrationDir, "0000_black_wraith.sql");
const journalPath = path.join(migrationDir, "meta", "_journal.json");

const EXPECTED_TABLES = [
  "analytics_events", "bookmarks", "comments", "entity_follows", "competitions", "fixtures", "teams",
  "audit_events", "detection_alerts", "publisher_risk_scores", "news", "newsletter_subscribers", "users",
  "user_sessions", "push_subscriptions", "password_resets", "notification_preferences", "notifications",
  "audit_log", "moderation_reports", "imported_articles", "sports_data_cache", "players", "match_events",
  "match_lineups", "match_statistics", "matches", "transfers", "leaderboard", "predictions", "team_pages",
  "creator_earnings_ledger", "partners", "payouts", "referral_clicks", "referral_events", "referral_links",
  "ad_events", "ad_placements", "campaigns", "content_labels", "monetization_events",
];

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before running migrations");
}

const baselineSql = fs.readFileSync(baselinePath, "utf8");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const baselineEntry = journal.entries.find((entry) => entry.tag === "0000_black_wraith");
if (!baselineEntry) throw new Error("Baseline migration entry is missing from the Drizzle journal");
const baselineHash = crypto.createHash("sha256").update(baselineSql).digest("hex");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const history = await pool.query('SELECT hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at');
  const rows = history.rows;

  if (rows.length === 0) {
    const present = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])",
      [EXPECTED_TABLES],
    );
    const presentSet = new Set(present.rows.map((r) => r.tablename));
    const presentCount = EXPECTED_TABLES.filter((t) => presentSet.has(t)).length;

    if (presentCount === EXPECTED_TABLES.length) {
      // Existing populated database with no migration history yet: record the
      // baseline as applied without re-running it, then apply pending migrations.
      await pool.query(
        'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)',
        [baselineHash, baselineEntry.when],
      );
      console.log(`[migrate] Existing populated database detected (${presentCount} tables). Recorded baseline; applying pending migrations.`);
    } else if (presentCount === 0) {
      console.log("[migrate] Fresh database detected. Applying full baseline schema.");
    } else {
      throw new Error(`[migrate] Partial database detected (${presentCount}/${EXPECTED_TABLES.length} tables). Refusing to migrate without human review.`);
    }
  } else {
    console.log(`[migrate] Migration history exists (${rows.length} row(s)). Applying pending migrations if any.`);
  }

  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: migrationDir });
  console.log("[migrate] Migrations up to date.");
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[migrate] FAILED:", err.message);
    pool.end().then(() => process.exit(1));
  });