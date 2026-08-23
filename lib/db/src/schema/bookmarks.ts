import { integer, pgTable, serial, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { newsTable } from "./news";

export const bookmarksTable = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  newsId: integer("news_id").notNull().references(() => newsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userNewsIdx: uniqueIndex("bookmarks_user_news_idx").on(table.userId, table.newsId),
  userIdIdx: index("bookmarks_user_id_idx").on(table.userId),
}));

export type Bookmark = typeof bookmarksTable.$inferSelect;
export type InsertBookmark = typeof bookmarksTable.$inferInsert;
