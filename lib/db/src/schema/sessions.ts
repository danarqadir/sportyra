import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable(
  "user_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: index("user_sessions_token_hash_idx").on(table.tokenHash),
    userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
  }),
);

export type UserSession = typeof sessionsTable.$inferSelect;
