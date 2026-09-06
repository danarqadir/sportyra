import { integer, pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { newsTable } from "./news";

export const sportsDataCacheTable = pgTable("sports_data_cache", {
  id: serial("id").primaryKey(),
  cacheKey: text("cache_key").notNull().unique(),
  data: jsonb("data").notNull(),
  provider: text("provider").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  cacheKeyIdx: index("sports_cache_key_idx").on(table.cacheKey),
  expiresAtIdx: index("sports_cache_expires_idx").on(table.expiresAt),
}));

export const importedArticlesTable = pgTable("imported_articles", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull(),
  originalUrl: text("original_url").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary"),
  originalContent: text("original_content"),
  author: text("author"),
  category: text("category"),
  tags: text("tags").array().default([]),
  imageUrl: text("image_url"),
  publicationDate: timestamp("publication_date", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  newsId: integer("news_id").references(() => newsTable.id, { onDelete: "set null" }),
  importedBy: text("imported_by"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("imported_articles_status_idx").on(table.status),
  sourceIdx: index("imported_articles_source_idx").on(table.sourceName),
  originalUrlIdx: index("imported_articles_url_idx").on(table.originalUrl),
  newsIdIdx: index("imported_articles_news_id_idx").on(table.newsId),
}));

export type SportsDataCache = typeof sportsDataCacheTable.$inferSelect;
export type ImportedArticle = typeof importedArticlesTable.$inferSelect;
