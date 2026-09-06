import { integer, pgTable, serial, text, timestamp, index, unique, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { matchesTable } from "./matches";

export const predictionsTable = pgTable("predictions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  prediction: text("prediction").notNull(),
  homeScorePred: integer("home_score_pred"),
  awayScorePred: integer("away_score_pred"),
  points: integer("points").default(0),
  result: text("result"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userMatchIdx: unique("predictions_user_match_idx").on(table.userId, table.matchId),
  userIdx: index("predictions_user_idx").on(table.userId),
  matchIdx: index("predictions_match_idx").on(table.matchId),
}));

export const leaderboardTable = pgTable("leaderboard", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  username: text("username").notNull(),
  totalPoints: integer("total_points").notNull().default(0),
  correctPredictions: integer("correct_predictions").notNull().default(0),
  totalPredictions: integer("total_predictions").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pointsIdx: index("leaderboard_points_idx").on(table.totalPoints),
}));

export type Prediction = typeof predictionsTable.$inferSelect;
export type LeaderboardEntry = typeof leaderboardTable.$inferSelect;
