import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const passwordResetsTable = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashIdx: index("password_resets_token_hash_idx").on(table.tokenHash),
  userIdx: index("password_resets_user_id_idx").on(table.userId),
}));

export type PasswordReset = typeof passwordResetsTable.$inferSelect;
