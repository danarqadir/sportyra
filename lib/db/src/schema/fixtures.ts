import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const competitionsTable = pgTable("competitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country"),
  sport: text("sport").notNull().default("football"),
  logoUrl: text("logo_url"),
  apiId: text("api_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  shortName: text("short_name"),
  logoUrl: text("logo_url"),
  sport: text("sport").notNull().default("football"),
  apiId: text("api_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fixturesTable = pgTable("fixtures", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id").references(() => competitionsTable.id),
  homeTeamId: integer("home_team_id").references(() => teamsTable.id),
  awayTeamId: integer("away_team_id").references(() => teamsTable.id),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  status: text("status").notNull().default("scheduled"),
  matchDate: timestamp("match_date", { withTimezone: true }).notNull(),
  venue: text("venue"),
  stage: text("stage"),
  round: text("round"),
  apiId: text("api_id"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  matchDateIdx: index("fixtures_match_date_idx").on(table.matchDate),
  statusIdx: index("fixtures_status_idx").on(table.status),
  competitionIdx: index("fixtures_competition_idx").on(table.competitionId),
}));

export type Competition = typeof competitionsTable.$inferSelect;
export type Team = typeof teamsTable.$inferSelect;
export type Fixture = typeof fixturesTable.$inferSelect;
