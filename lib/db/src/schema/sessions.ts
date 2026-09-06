import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const sessionsTable = pgTable(
  "user_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull().default("login"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: index("user_sessions_token_hash_idx").on(table.tokenHash),
    userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
  }),
);

export type UserSession = typeof sessionsTable.$inferSelect;
