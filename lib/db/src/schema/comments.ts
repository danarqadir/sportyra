import { integer, pgTable, serial, text, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { newsTable } from "./news";

export const commentsTable = pgTable("comments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  newsId: integer("news_id").notNull().references(() => newsTable.id),
  parentId: integer("parent_id"),
  body: text("body").notNull(),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email").notNull(),
  reported: boolean("reported").notNull().default(false),
  reportReason: text("report_reason"),
  approved: boolean("approved").notNull().default(true),
  removed: boolean("removed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  newsIdIdx: index("comments_news_id_idx").on(table.newsId),
  userIdIdx: index("comments_user_id_idx").on(table.userId),
  approvedIdx: index("comments_approved_idx").on(table.approved),
  reportedIdx: index("comments_reported_idx").on(table.reported),
}));

export type Comment = typeof commentsTable.$inferSelect;
export type InsertComment = typeof commentsTable.$inferInsert;
