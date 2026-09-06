import { integer, jsonb, pgTable, serial, text, timestamp, index, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { competitionsTable, teamsTable } from "./fixtures";

export const matchEventsTable = pgTable("match_events", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  minute: integer("minute"),
  playerId: integer("player_id"),
  playerName: text("player_name"),
  relatedPlayerId: integer("related_player_id"),
  relatedPlayerName: text("related_player_name"),
  teamSide: text("team_side"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  matchIdx: index("match_events_match_idx").on(table.matchId),
}));

export const matchStatsTable = pgTable("match_statistics", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().unique().references(() => matchesTable.id, { onDelete: "cascade" }),
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
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  teamSide: text("team_side").notNull(),
  formation: text("formation"),
  lineup: jsonb("lineup"),
}, (table) => ({
  matchIdx: index("match_lineups_match_idx").on(table.matchId),
}));

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id").references(() => competitionsTable.id, { onDelete: "set null" }),
  homeTeamId: integer("home_team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  awayTeamId: integer("away_team_id").references(() => teamsTable.id, { onDelete: "set null" }),
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
  apiId: text("api_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("matches_status_idx").on(table.status),
  dateIdx: index("matches_date_idx").on(table.matchDate),
  competitionIdx: index("matches_competition_idx").on(table.competitionId),
  homeTeamIdx: index("matches_home_team_idx").on(table.homeTeamId),
  awayTeamIdx: index("matches_away_team_idx").on(table.awayTeamId),
  apiIdIdx: uniqueIndex("matches_api_id_idx").on(table.apiId),
}));

export type Match = typeof matchesTable.$inferSelect;
export type MatchEvent = typeof matchEventsTable.$inferSelect;
