import { pgTable, serial, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (table) => ({
  endpointIdx: index("push_subscriptions_endpoint_idx").on(table.endpoint),
  userIdx: index("push_subscriptions_user_id_idx").on(table.userId),
  endpointUnique: uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
}));

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
