import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const moderationReportsTable = pgTable("moderation_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").references(() => usersTable.id),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("moderation_status_idx").on(table.status),
  targetTypeIdx: index("moderation_target_type_idx").on(table.targetType),
  targetIdx: index("moderation_target_idx").on(table.targetType, table.targetId),
  reporterIdx: index("moderation_reporter_idx").on(table.reporterId),
}));

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("audit_user_idx").on(table.userId),
  actionIdx: index("audit_action_idx").on(table.action),
}));

export type ModerationReport = typeof moderationReportsTable.$inferSelect;
export type AuditLog = typeof auditLogTable.$inferSelect;
