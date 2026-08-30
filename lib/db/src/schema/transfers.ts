import { integer, pgTable, serial, text, timestamp, index, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const transfersTable = pgTable("transfers", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  playerId: integer("player_id"),
  fromClub: text("from_club").notNull(),
  toClub: text("to_club").notNull(),
  fee: text("fee"),
  status: text("status").notNull().default("rumour"),
  transferType: text("transfer_type").default("permanent"),
  transferDate: timestamp("transfer_date", { withTimezone: true }),
  source: text("source"),
  confidence: integer("confidence").default(50),
  apiId: text("api_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("transfers_status_idx").on(table.status),
  playerIdx: index("transfers_player_idx").on(table.playerName),
  clubIdx: index("transfers_club_idx").on(table.toClub),
  apiIdIdx: uniqueIndex("transfers_api_id_idx").on(table.apiId),
}));

export type Transfer = typeof transfersTable.$inferSelect;
