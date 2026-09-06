import { integer, pgTable, serial, text, timestamp, index, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { teamsTable } from "./fixtures";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  nationality: text("nationality"),
  dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
  position: text("position"),
  club: text("club"),
  clubId: integer("club_id").references(() => teamsTable.id, { onDelete: "set null" }),
  shirtNumber: integer("shirt_number"),
  photoUrl: text("photo_url"),
  biography: text("biography"),
  goals: integer("goals").notNull().default(0),
  assists: integer("assists").notNull().default(0),
  appearances: integer("appearances").notNull().default(0),
  minutes: integer("minutes").notNull().default(0),
  yellowCards: integer("yellow_cards").notNull().default(0),
  redCards: integer("red_cards").notNull().default(0),
  trophies: text("trophies").array().notNull().default([]),
  apiId: text("api_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("players_slug_idx").on(table.slug),
  clubIdx: index("players_club_idx").on(table.club),
  clubIdIdx: index("players_club_id_idx").on(table.clubId),
  nameIdx: index("players_name_idx").on(table.name),
  apiIdIdx: uniqueIndex("players_api_id_idx").on(table.apiId),
}));

export type Player = typeof playersTable.$inferSelect;
