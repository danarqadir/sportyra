import { boolean, decimal, index, integer, json, pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { partnersTable } from "./partners";
import { newsTable } from "./news";

export const contentLabelTypeEnum = pgEnum("content_label_type", ["sponsored", "promoted", "premium", "campaign", "partner_promo", "house_ad", "affiliate", "featured_sponsor"]);

export const contentLabelsTable = pgTable("content_labels", {
  id: serial("id").primaryKey(),
  newsId: integer("news_id").references(() => newsTable.id, { onDelete: "cascade" }),
  labelType: contentLabelTypeEnum("label_type").notNull(),
  label: text("label"),
  url: text("url"),
  metadata: json("metadata"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  partnerId: integer("partner_id").references(() => partnersTable.id),
  campaignId: integer("campaign_id"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  newsIdx: index("content_labels_news_idx").on(table.newsId),
  labelTypeIdx: index("content_labels_type_idx").on(table.labelType),
  partnerIdx: index("content_labels_partner_idx").on(table.partnerId),
  campaignIdx: index("content_labels_campaign_idx").on(table.campaignId),
  activeIdx: index("content_labels_active_idx").on(table.active),
}));

export const adPlacementsTable = pgTable("ad_placements", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slot: text("slot"),
  location: text("location").notNull(),
  adType: text("ad_type").notNull().default("display"),
  priority: integer("priority").notNull().default(0),
  active: boolean("active").notNull().default(true),
  width: integer("width"),
  height: integer("height"),
  targetUrl: text("target_url"),
  imageUrl: text("image_url"),
  altText: text("alt_text"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  partnerId: integer("partner_id").references(() => partnersTable.id),
  campaignId: integer("campaign_id"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  locationIdx: index("ad_placements_location_idx").on(table.location),
  activeIdx: index("ad_placements_active_idx").on(table.active),
  partnerIdx: index("ad_placements_partner_idx").on(table.partnerId),
  campaignIdx: index("ad_placements_campaign_idx").on(table.campaignId),
}));

export const adEventsTable = pgTable("ad_events", {
  id: serial("id").primaryKey(),
  adId: integer("ad_id").references(() => adPlacementsTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  sessionId: text("session_id"),
  partnerId: integer("partner_id"),
  campaignId: integer("campaign_id"),
  articleId: integer("article_id"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  adIdx: index("ad_events_ad_idx").on(table.adId),
  typeIdx: index("ad_events_type_idx").on(table.eventType),
  dateIdx: index("ad_events_date_idx").on(table.createdAt),
  campaignIdx: index("ad_events_campaign_idx").on(table.campaignId),
}));

export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "active", "paused", "completed", "archived"]);

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("partner"),
  status: campaignStatusEnum("status").notNull().default("draft"),
  partnerId: integer("partner_id").references(() => partnersTable.id),
  budget: decimal("budget", { precision: 12, scale: 2 }),
  spend: decimal("spend", { precision: 12, scale: 2 }).notNull().default("0.00"),
  targetImpressions: integer("target_impressions"),
  actualImpressions: integer("actual_impressions").notNull().default(0),
  targetClicks: integer("target_clicks"),
  actualClicks: integer("actual_clicks").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  metadata: json("metadata"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("campaigns_status_idx").on(table.status),
  partnerIdx: index("campaigns_partner_idx").on(table.partnerId),
  typeIdx: index("campaigns_type_idx").on(table.type),
}));

export const monetizationEventsTable = pgTable("monetization_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  articleId: integer("article_id"),
  adId: integer("ad_id"),
  partnerId: integer("partner_id"),
  campaignId: integer("campaign_id"),
  sessionId: text("session_id"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  typeIdx: index("monetization_events_type_idx").on(table.eventType),
  articleIdx: index("monetization_events_article_idx").on(table.articleId),
  partnerIdx: index("monetization_events_partner_idx").on(table.partnerId),
  campaignIdx: index("monetization_events_campaign_idx").on(table.campaignId),
  dateIdx: index("monetization_events_date_idx").on(table.createdAt),
}));

export type ContentLabel = typeof contentLabelsTable.$inferSelect;
export type AdPlacement = typeof adPlacementsTable.$inferSelect;
export type AdEvent = typeof adEventsTable.$inferSelect;
export type Campaign = typeof campaignsTable.$inferSelect;
export type MonetizationEvent = typeof monetizationEventsTable.$inferSelect;
