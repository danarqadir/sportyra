import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { partnersTable } from "./partners";

export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    eventId: uuid("event_id").notNull().unique(),
    correlationId: uuid("correlation_id").notNull(),
    eventType: text("event_type").notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    serverTimestamp: timestamp("server_timestamp", { withTimezone: true }).notNull(),
    actorType: text("actor_type").notNull().default("anonymous"),
    actorId: integer("actor_id"),
    actorIdType: text("actor_id_type"),
    sessionId: text("session_id"),
    httpMethod: text("http_method"),
    httpPath: text("http_path"),
    httpStatus: integer("http_status"),
    clientIpHash: text("client_ip_hash").notNull(),
    clientIpCountry: text("client_ip_country"),
    clientIpAsn: integer("client_ip_asn"),
    clientIpIsDc: boolean("client_ip_is_dc").default(false),
    userAgentHash: text("user_agent_hash"),
    userAgentEngine: text("user_agent_engine"),
    userAgentOs: text("user_agent_os"),
    userAgentIsBot: boolean("user_agent_is_bot").default(false),
    ja3Hash: text("ja3_hash"),
    headerOrderHash: text("header_order_hash"),
    h2SettingsHash: text("h2_settings_hash"),
    fraudScore: integer("fraud_score").notNull().default(0),
    fraudVerdict: text("fraud_verdict").notNull().default("clean"),
    fraudReasons: jsonb("fraud_reasons").notNull().default("[]"),
    previousHash: text("previous_hash").notNull(),
    rowHash: text("row_hash").notNull(),
    payload: jsonb("payload").notNull().default("{}"),
    createdDate: date("created_date").notNull(),
  },
  (table) => ({
    timestampIdx: index("audit_events_timestamp_idx").on(table.timestamp),
    eventTypeIdx: index("audit_events_event_type_idx").on(table.eventType),
    correlationIdIdx: index("audit_events_correlation_id_idx").on(table.correlationId),
    actorIdx: index("audit_events_actor_idx").on(table.actorIdType, table.actorId),
    clientIpHashIdx: index("audit_events_client_ip_hash_idx").on(table.clientIpHash),
    fraudVerdictIdx: index("audit_events_fraud_verdict_idx")
      .on(table.fraudVerdict)
      .where(sql`${table.fraudVerdict} != 'clean'`),
    createdDateIdx: index("audit_events_created_date_idx").on(table.createdDate),
  }),
);

export const publisherRiskScoresTable = pgTable(
  "publisher_risk_scores",
  {
    partnerId: integer("partner_id")
      .primaryKey()
      .references(() => partnersTable.id),
    riskScore: integer("risk_score").notNull().default(0),
    clickVelocityScore: integer("click_velocity_score").notNull().default(0),
    botSignalScore: integer("bot_signal_score").notNull().default(0),
    conversionAnomalyScore: integer("conversion_anomaly_score").notNull().default(0),
    geoAnomalyScore: integer("geo_anomaly_score").notNull().default(0),
    behavioralScore: integer("behavioral_score").notNull().default(0),
    clicks24h: integer("clicks_24h").notNull().default(0),
    clicks7d: integer("clicks_7d").notNull().default(0),
    uniqueIps24h: integer("unique_ips_24h").notNull().default(0),
    uniqueFingerprints24h: integer("unique_fingerprints_24h").notNull().default(0),
    flaggedClickPct24h: numeric("flagged_click_pct_24h", { precision: 5, scale: 2 }).notNull().default("0"),
    conversionRate7d: numeric("conversion_rate_7d", { precision: 5, scale: 4 }).notNull().default("0"),
    meanClicksPerHour30d: numeric("mean_clicks_per_hour_30d", { precision: 10, scale: 2 }),
    stddevClicksPerHour30d: numeric("stddev_clicks_per_hour_30d", { precision: 10, scale: 2 }),
    meanUniqueIpsPerHour30d: numeric("mean_unique_ips_per_hour_30d", { precision: 10, scale: 2 }),
    status: text("status").notNull().default("normal"),
    watchlistReason: text("watchlist_reason"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedBy: text("suspended_by"),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("publisher_risk_scores_status_idx").on(table.status),
    riskScoreIdx: index("publisher_risk_scores_risk_score_idx").on(table.riskScore.desc()),
  }),
);

export const detectionAlertsTable = pgTable(
  "detection_alerts",
  {
    id: serial("id").primaryKey(),
    alertId: uuid("alert_id").notNull().unique(),
    tier: text("tier").notNull(),
    status: text("status").notNull().default("pending_review"),
    ruleIds: jsonb("rule_ids").notNull(),
    partnerId: integer("partner_id").references(() => partnersTable.id),
    summary: text("summary").notNull(),
    evidence: jsonb("evidence").notNull(),
    fraudScoreAvg: integer("fraud_score_avg"),
    affectedEvents: integer("affected_events"),
    assignedTo: text("assigned_to"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    resolution: text("resolution"),
    resolutionNotes: text("resolution_notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("detection_alerts_status_idx").on(table.status),
    tierIdx: index("detection_alerts_tier_idx").on(table.tier),
    partnerIdIdx: index("detection_alerts_partner_id_idx").on(table.partnerId),
    createdAtIdx: index("detection_alerts_created_at_idx").on(table.createdAt),
  }),
);

export type AuditEvent = typeof auditEventsTable.$inferSelect;
export type PublisherRiskScore = typeof publisherRiskScoresTable.$inferSelect;
export type DetectionAlert = typeof detectionAlertsTable.$inferSelect;
