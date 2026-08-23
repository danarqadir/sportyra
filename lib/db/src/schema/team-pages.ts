import { boolean, integer, jsonb, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const teamPagesTable = pgTable("team_pages", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  shortName: text("short_name"),
  country: text("country").notNull(),
  league: text("league").notNull(),
  badge: text("badge"),
  description: text("description"),
  founded: integer("founded"),
  stadium: text("stadium"),
  capacity: integer("capacity"),
  leaguePosition: integer("league_position"),
  points: integer("points"),
  played: integer("played"),
  won: integer("won"),
  drawn: integer("drawn"),
  lost: integer("lost"),
  goalsFor: integer("goals_for"),
  goalsAgainst: integer("goals_against"),
  form: text("form").array(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("team_pages_slug_idx").on(table.slug),
  countryIdx: index("team_pages_country_idx").on(table.country),
}));

export type TeamPage = typeof teamPagesTable.$inferSelect;
export type InsertTeamPage = typeof teamPagesTable.$inferInsert;
