import { boolean, integer, pgTable, serial, text, timestamp, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const followEntityTypeEnum = pgEnum("follow_entity_type", ["player", "team", "league", "competition", "partner"]);

export const entityFollowsTable = pgTable("entity_follows", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  entityType: followEntityTypeEnum("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("entity_follows_user_id_idx").on(table.userId),
  entityIdx: index("entity_follows_entity_idx").on(table.entityType, table.entityId),
  uniqueFollow: uniqueIndex("entity_follows_unique").on(table.userId, table.entityType, table.entityId),
}));
