import { boolean, decimal, index, integer, pgTable, serial, text, timestamp, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const partnerStatusEnum = pgEnum("partner_status", ["pending", "approved", "rejected", "suspended", "active"]);

export const partnersTable = pgTable(
  "partners",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    referralCode: text("referral_code").notNull(),
    website: text("website"),
    socialHandle: text("social_handle"),
    status: partnerStatusEnum("status").notNull().default("pending"),
    commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
    totalClicks: integer("total_clicks").notNull().default(0),
    totalEarnings: decimal("total_earnings", { precision: 12, scale: 2 }).notNull().default("0.00"),
    paidEarnings: decimal("paid_earnings", { precision: 12, scale: 2 }).notNull().default("0.00"),
    bio: text("bio"),
    avatar: text("avatar"),
    facebook: text("facebook"),
    instagram: text("instagram"),
    tiktok: text("tiktok"),
    youtube: text("youtube"),
    phone: text("phone"),
    address: text("address"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: integer("approved_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedBy: integer("rejected_by"),
    rejectedReason: text("rejected_reason"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedBy: integer("suspended_by"),
    suspendedReason: text("suspended_reason"),
    secretHash: text("secret_hash"),
    secretPrefix: text("secret_prefix"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("partners_referral_code_unique").on(table.referralCode),
    emailIdx: uniqueIndex("partners_email_unique").on(table.email),
    userIdx: index("partners_user_idx").on(table.userId),
    statusIdx: index("partners_status_idx").on(table.status),
  }),
);

export const referralLinksTable = pgTable(
  "referral_links",
  {
    id: serial("id").primaryKey(),
    partnerId: integer("partner_id").notNull(),
    code: text("code").notNull(),
    targetUrl: text("target_url").notNull(),
    label: text("label"),
    active: boolean("active").notNull().default(true),
    clickCount: integer("click_count").notNull().default(0),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnerIdx: index("referral_links_partner_idx").on(table.partnerId),
    codeIdx: index("referral_links_code_idx").on(table.code),
  }),
);

export const referralEventsTable = pgTable(
  "referral_events",
  {
    id: serial("id").primaryKey(),
    partnerId: integer("partner_id").notNull(),
    linkId: integer("link_id"),
    eventType: text("event_type").notNull().default("click"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    referer: text("referer"),
    targetUrl: text("target_url"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnerIdx: index("referral_events_partner_idx").on(table.partnerId),
    linkIdx: index("referral_events_link_idx").on(table.linkId),
    typeIdx: index("referral_events_type_idx").on(table.eventType),
    dateIdx: index("referral_events_date_idx").on(table.createdAt),
  }),
);

export const referralClicksTable = pgTable(
  "referral_clicks",
  {
    id: serial("id").primaryKey(),
    partnerId: integer("partner_id").notNull(),
    linkId: integer("link_id"),
    code: text("code").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    referer: text("referer"),
    fingerprint: text("fingerprint"),
    targetUrl: text("target_url"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnerIdx: index("referral_clicks_partner_idx").on(table.partnerId),
    codeIdx: index("referral_clicks_code_idx").on(table.code),
    dateIdx: index("referral_clicks_date_idx").on(table.createdAt),
    fpIdx: index("referral_clicks_fp_idx").on(table.fingerprint),
  }),
);

export const payoutsTable = pgTable(
  "payouts",
  {
    id: serial("id").primaryKey(),
    partnerId: integer("partner_id").notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    method: text("method").notNull().default("manual"),
    reference: text("reference"),
    notes: text("notes"),
    status: text("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnerIdx: index("payouts_partner_idx").on(table.partnerId),
    idempotencyKeyIdx: index("payouts_idempotency_key_idx").on(table.idempotencyKey),
  }),
);

export const creatorEarningsLedgerTable = pgTable(
  "creator_earnings_ledger",
  {
    id: serial("id").primaryKey(),
    partnerId: integer("partner_id").notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    type: text("type").notNull().default("click"),
    description: text("description"),
    referenceId: integer("reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnerIdx: index("earnings_ledger_partner_idx").on(table.partnerId),
  }),
);

export type Partner = typeof partnersTable.$inferSelect;
export type ReferralLink = typeof referralLinksTable.$inferSelect;
export type ReferralEvent = typeof referralEventsTable.$inferSelect;
export type ReferralClick = typeof referralClicksTable.$inferSelect;
export type Payout = typeof payoutsTable.$inferSelect;
export type CreatorEarningsLedger = typeof creatorEarningsLedgerTable.$inferSelect;
