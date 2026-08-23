import { integer, jsonb, pgTable, serial, text, timestamp, index, boolean } from "drizzle-orm/pg-core";

export const matchEventsTable = pgTable("match_events", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  eventType: text("event_type").notNull(),
  minute: integer("minute"),
  playerId: integer("player_id"),
  playerName: text("player_name"),
  teamSide: text("team_side"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  matchIdx: index("match_events_match_idx").on(table.matchId),
}));

export const matchStatsTable = pgTable("match_statistics", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().unique(),
  possession: jsonb("possession"),
  shots: jsonb("shots"),
  shotsOnTarget: jsonb("shots_on_target"),
  corners: jsonb("corners"),
  fouls: jsonb("fouls"),
  offsides: jsonb("offsides"),
  yellowCards: jsonb("yellow_cards"),
  redCards: jsonb("red_cards"),
  saves: jsonb("saves"),
});

export const matchLineupsTable = pgTable("match_lineups", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  teamSide: text("team_side").notNull(),
  formation: text("formation"),
  lineup: jsonb("lineup"),
}, (table) => ({
  matchIdx: index("match_lineups_match_idx").on(table.matchId),
}));

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id"),
  homeTeamId: integer("home_team_id"),
  awayTeamId: integer("away_team_id"),
  homeTeamName: text("home_team_name").notNull(),
  awayTeamName: text("away_team_name").notNull(),
  homeTeamLogo: text("home_team_logo"),
  awayTeamLogo: text("away_team_logo"),
  homeScore: integer("home_score").default(0),
  awayScore: integer("away_score").default(0),
  status: text("status").notNull().default("scheduled"),
  minute: integer("minute"),
  matchDate: timestamp("match_date", { withTimezone: true }).notNull(),
  venue: text("venue"),
  competitionName: text("competition_name"),
  competitionLogo: text("competition_logo"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("matches_status_idx").on(table.status),
  dateIdx: index("matches_date_idx").on(table.matchDate),
}));

export type Match = typeof matchesTable.$inferSelect;
export type MatchEvent = typeof matchEventsTable.$inferSelect;
