import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const analyticsEventsTable = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    path: text("path").notNull(),
    articleId: integer("article_id"),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    sessionId: text("session_id"),
    partnerId: integer("partner_id"),
    referralCode: text("referral_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("analytics_events_created_at_idx").on(table.createdAt),
    eventTypeIdx: index("analytics_events_event_type_idx").on(table.eventType),
    articleIdIdx: index("analytics_events_article_id_idx").on(table.articleId),
    partnerIdIdx: index("analytics_events_partner_id_idx").on(table.partnerId),
  }),
);

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
