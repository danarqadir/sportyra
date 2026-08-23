import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const newsTable = pgTable("news", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  body: text("body"),
  image: text("image").notNull(),
  category: text("category").notNull(),
  language: text("language").notNull(),
  source: text("source").notNull(),
  author: text("author").notNull(),
  tags: text("tags").array().notNull().default([]),
  slug: text("slug"),
  readingTime: integer("reading_time"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  publicationDate: timestamp("publication_date", { withTimezone: true }).notNull(),
  featured: boolean("featured").notNull().default(false),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  slugIdx: index("news_slug_idx").on(table.slug),
  categoryIdx: index("news_category_idx").on(table.category),
  publishedIdx: index("news_published_idx").on(table.published),
}));

export const insertNewsSchema = createInsertSchema(newsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNews = typeof newsTable.$inferInsert;
export type News = typeof newsTable.$inferSelect;
